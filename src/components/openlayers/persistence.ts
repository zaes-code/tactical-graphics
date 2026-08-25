/**
 * Save a map full of tactical graphics to GeoJSON, and rebuild it — still
 * **editable** — from that GeoJSON.
 *
 * ## Why one feature per graphic
 *
 * A graphic's rendered line work is derived: the generator produces it from a base
 * geometry plus a handful of inputs. Persisting the derivation rather than the result
 * means a restored graphic is the same object the user drew, not a picture of it —
 * it rotates, resizes and modifies exactly as before. So a snapshot holds **only the
 * base feature**.
 *
 * ## One object: the graphic describes itself
 *
 * ```jsonc
 * "properties": {
 *   "tacticalGraphic": { "name": …, amplifiers…, "size": …, "rotation": … },
 *   "role": "base", "symbolId": "…", "graphicName": "…"
 * }
 * ```
 *
 * `tacticalGraphic` is the **portable description of the symbol** — the same object the
 * map-agnostic `renderTacticalGraphic` consumes. Everything in it is meters, degrees or
 * text: meaningful to any renderer, in any language, forever. There is nothing else,
 * and that is the contract: a record carrying only this bag rebuilds exactly.
 *
 * ## Why there is no viewport state in the file
 *
 * `getController(name, res)` derives decoration sizes from the map resolution —
 * `20 * res` arrowheads, `res * 20` block widths, `CENTER_PADDING_PX * res` gaps. By the
 * time the generator sees one it is a distance in **meters**, and a distance is portable;
 * the meters-per-pixel it came from is not. So holders stamp the derived value into
 * `tacticalGraphic` on every rebuild, and a restore replays the distance rather than
 * re-deriving one from whatever zoom the loading session happens to be at.
 *
 * The other half is the minimum-length floors (`LineGraphicBase`, `Block`), which
 * *modify base geometry* against a screen-pixel constant. Right on a draw, wrong on a
 * restore — suspended for the rebuild, see `suspendMinimumLength`.
 *
 * Security operations are the deliberate exception: they hold a constant on-screen size,
 * so restore re-anchors them to the **live** view resolution.
 *
 * Pass `includeDerived` to additionally emit the rendered `graphic` and `label`
 * features. Restore ignores them; they are there for consumers that only want to draw
 * the shape without this library.
 *
 * ## Order matters when restoring
 *
 * Three steps, and the middle one is squeezed from both sides:
 *
 * 1. **Seed the base geometry.** Some `setLabel`s regenerate the shape, and they
 *    regenerate *from the base* — with an empty base they throw deep inside turf.
 * 2. **Apply amplifiers.** `AreaGraphicBase.setLabel` regenerates when Encirclement's
 *    hostility flips, and `RangeFanGraphicBase.setLabel` always does, because bands
 *    change the vertex count. Applied after step 3, both are silently discarded.
 * 3. **Apply the geometry inputs** — the authoritative rebuild, with size and rotation.
 *
 * Then `getFeatures()` is re-read: `MovementGraphicBase` adds or drops its offset handle
 * depending on how many handle points the generator emitted, so the set is only correct
 * once there is geometry to generate from.
 */

import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import {LineString, Point, Polygon} from 'ol/geom';
import type {Coordinate} from 'ol/coordinate';
import type {Feature as GeoJSONFeature, FeatureCollection} from 'geojson';
import {normalizeDrawnBase, TacticalGraphicName, usesDrawnAnchors} from '@zaes/tactical-graphics';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import type {GraphicLabels, GraphicObject} from '../../utils/graphicLinkRegistry';
import {GraphicLinkRegistry} from '../../utils/graphicLinkRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {MissionTaskController} from './controllers/MissionTaskController';
import {PolygonGraphicController} from './controllers/PolygonGraphicController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import {
    GraphicGeometryState,
    readGraphicGeometryState,
    readGraphicLabels,
    readRole,
    writeGraphicProperties,
} from './graphicProperties';

/** Bumped when the snapshot shape changes in a way a reader must notice. */
export const SNAPSHOT_VERSION = 1;

/** Map projection the OL features live in. Snapshots are written in 4326. */
const MAP_PROJECTION = 'EPSG:3857';
const GEOJSON_PROJECTION = 'EPSG:4326';

/** A GeoJSON FeatureCollection plus the version of the layout its properties use. */
export interface TacticalGraphicsSnapshot extends FeatureCollection {
    tacticalGraphicsVersion: number;
}

/** One graphic that could not be restored, and why. */
export interface RestoreFailure {
    symbolId?: string;
    name?: string;
    error: string;
}

export interface RestoreReport {
    restored: number;
    failed: RestoreFailure[];
}

export interface SerializeOptions {
    /**
     * Also emit the rendered `graphic` and `label` features. Restore ignores them —
     * they exist so a consumer can draw the symbol without this library. Off by
     * default: they are derived state, and a snapshot that carries two copies of the
     * same shape can disagree with itself.
     */
    includeDerived?: boolean;
}

const format = new GeoJSON();

/** Keys `writeGraphicProperties` merges in that are not amplifiers. */
const GEOMETRY_KEYS = ['radius', 'decorationSize', 'width', 'rotation', 'bend', 'mirrored'] as const;

/**
 * Splits a stamped bag back into the amplifiers a `setLabel` expects. `name` and the
 * geometry inputs are handled separately, and passing them through as "labels" would
 * put them straight back into the bag on the next write.
 */
function toLabels(bag: Record<string, unknown>): GraphicLabels {
    const labels: Record<string, unknown> = {...bag};
    delete labels.name;
    for (const key of GEOMETRY_KEYS) delete labels[key];
    return {label: '', ...labels} as GraphicLabels;
}

/** First value of `prop` found across a handler's features, if any. */
function findProp<T>(handler: TacticalGraphicHandler, prop: string): T | undefined {
    for (const feature of handler.getFeatures()) {
        const value = feature.get(prop);
        if (value !== undefined && value !== null) return value as T;
    }
    return undefined;
}

/**
 * Reads back the properties a graphic needs to be rebuilt.
 *
 * Assembled from the handler rather than trusted off the base feature, because not
 * every holder stamps everything everywhere: `drawingResolution` in particular lives
 * on whichever feature its holder happened to choose, and the block and exfiltrate
 * families never write a `tacticalGraphic` bag at all unless the user opens the
 * properties dialog.
 */
function collectProperties(handler: TacticalGraphicHandler): Record<string, unknown> | undefined {
    const base = handler.graphic.base;
    const name = (findProp<TacticalGraphicName>(handler, 'graphicName')
        ?? (readGraphicLabels(base) as GraphicLabels & {name?: TacticalGraphicName}).name);
    if (!name) return undefined;

    const bag = {...readGraphicLabels(base), ...readGraphicGeometryState(base)} as Record<string, unknown>;
    // A holder that never stamped anything still has state worth saving.
    if (Object.keys(bag).length <= 1) {
        for (const feature of handler.getFeatures()) {
            Object.assign(bag, readGraphicLabels(feature), readGraphicGeometryState(feature));
        }
    }

    return {
        tacticalGraphic: {...bag, name},
        role: 'base',
        // Mirrors `tacticalGraphic.name` for the OL-side dialog, which reads this
        // property directly. Restore prefers `tacticalGraphic.name`; this is a fallback
        // that also makes hand-written records easier.
        graphicName: name,
        symbolId: handler.getSymbolId(),
    };
}

/** Writes one OL feature out as GeoJSON in 4326, with `properties` replaced wholesale. */
function toGeoJSON(feature: Feature, properties: Record<string, unknown>): GeoJSONFeature {
    const written = format.writeFeatureObject(feature, {
        dataProjection: GEOJSON_PROJECTION,
        featureProjection: MAP_PROJECTION,
    }) as GeoJSONFeature;
    written.properties = properties;
    return written;
}

/**
 * One graphic as the portable base feature — what `snapshot()` would write for it.
 *
 * Exported because the selection needs exactly this: a host reading `getSelection()`
 * gets the same `properties.tacticalGraphic` bag it would get from a save, rather than
 * a second, subtly different description of the same symbol. @see SelectedGraphic
 */
export function serializeOneGraphic(handler: TacticalGraphicHandler): GeoJSONFeature {
    return toGeoJSON(handler.graphic.base, collectProperties(handler) ?? {});
}

/**
 * Snapshots every graphic the manager is holding.
 *
 * Walks `graphicControllers` rather than the vector source: the source is a flat bag of
 * features with no notion of which belong together, whereas each controller knows its
 * own base. A graphic drawn but never registered with the manager is not saved, which
 * matches what the rest of the manager already considers to exist.
 */
export function serializeTacticalGraphics(
    manager: TacticalGraphicsManager,
    opts: SerializeOptions = {},
): TacticalGraphicsSnapshot {
    const features: GeoJSONFeature[] = [];

    for (const handler of manager.graphicControllers) {
        const properties = collectProperties(handler);
        if (!properties) continue;

        const base = handler.graphic.base;
        if (!base.getGeometry()) continue;
        features.push(toGeoJSON(base, properties));

        if (!opts.includeDerived) continue;
        for (const feature of handler.getFeatures()) {
            const role = readRole(feature);
            if (role !== 'graphic' && role !== 'label') continue;
            if (!feature.getGeometry()) continue;
            features.push(toGeoJSON(feature, {...properties, role}));
        }
    }

    return {type: 'FeatureCollection', features, tacticalGraphicsVersion: SNAPSHOT_VERSION};
}

/**
 * Gives a freshly built handler its base geometry.
 *
 * Point-anchored graphics go through `updateGeom`, not `setBaseFeature`: their center,
 * size and rotation are cached on the holder and `updateGeom` is the only entry that
 * sets all three together. Shared with the demo's sample gallery, which needs the same
 * dispatch to build graphics without a draw interaction.
 */
export function applyRestoredGeometry(
    handler: TacticalGraphicHandler,
    base: Feature,
    state: GraphicGeometryState,
): void {
    if (handler instanceof MissionTaskController) {
        // **The shim.** A graphic converted to APP-06's drawn anchor points saves a
        // LineString base, and one saved before the conversion saves a Point. Both have
        // to restore: the anchored form is handed straight to `setBaseFeature`, which
        // reads the frame back out of the points; the old form keeps going through
        // `updateGeom` with the center, radius and rotation it was saved with, and the
        // holder writes the anchor points out on the next update. Nothing a user saved
        // stops loading, and it upgrades in place. @see core/anchors.ts
        const geometry = base.getGeometry();
        if (geometry instanceof LineString && usesDrawnAnchors(handler.graphic.name)) {
            if (state.decorationSize !== undefined) {
                const withHead = handler.graphic as {headSize?: number};
                if (typeof withHead.headSize === 'number') withHead.headSize = state.decorationSize;
            }
            // The minimum-size floor is suspended here for the same reason the branch
            // below suspends it: `RATIO_LOCKED_MIN_RADIUS_PX * drawingResolution` is a
            // draw-time affordance measured against *this* session's zoom, and the
            // restored size is already final. Without it an envelopment saved zoomed in
            // came back exactly 4x too large in a 4x-resolution session — the anchor
            // points were right and `updateGeom` grew them anyway.
            const anchored = handler.graphic as {suspendMinimumSize?: boolean};
            const floorGuarded = typeof anchored.suspendMinimumSize === 'boolean';
            if (floorGuarded) anchored.suspendMinimumSize = true;
            try {
                handler.setBaseFeature(base as Feature<LineString>);
            } finally {
                if (floorGuarded) anchored.suspendMinimumSize = false;
            }
            if (state.mirrored !== undefined) handler.setMirrored?.(state.mirrored);
            return;
        }

        const coords = (geometry as Point | undefined)?.getCoordinates();
        if (!coords || coords.length < 2) throw new Error('point-based graphic has no center coordinate');
        // `bend` before `updateGeom`: the holder reads it back out when it
        // regenerates, so setting it afterwards would leave the restored graphic drawn
        // at the default sharpness until the next edit. It also has to be before the
        // holder writes its anchor points out, since the reach is derived from it.
        //
        // Routed through the holder's own `setBend` rather than an `instanceof
        // TurnGraphicBase` test: envelopment is a sibling of that class, not a subclass,
        // so the old check skipped it and every saved envelopment restored at the
        // default bend. @see TurnGraphicBase.setBend
        const bendable = handler.graphic as {setBend?: (value: number) => void};
        if (state.bend !== undefined) bendable.setBend?.(state.bend);
        // Arrowhead size, for the holders that carry one. Seeded from the drawing
        // resolution when the graphic was made and stamped since, because a restore has
        // no drawing resolution to re-derive it from. Before `updateGeom`, which reads it.
        const withHead = handler.graphic as {headSize?: number};
        if (state.decorationSize !== undefined && typeof withHead.headSize === 'number') {
            withHead.headSize = state.decorationSize;
        }
        // Same reasoning as the line families: a minimum-size floor is a draw-time
        // affordance, and re-applying it here scales the restored graphic by the ratio
        // between the drawing resolution and this session's.
        if (state.mirrored !== undefined) handler.setMirrored?.(state.mirrored);
        const holder = handler.graphic as {suspendMinimumSize?: boolean};
        const guarded = typeof holder.suspendMinimumSize === 'boolean';
        if (guarded) holder.suspendMinimumSize = true;
        try {
            handler.graphic.updateGeom({
                center: coords as Coordinate,
                size: state.radius,
                rotation: state.rotation,
            });
        } finally {
            if (guarded) holder.suspendMinimumSize = false;
        }
        return;
    }

    if (handler instanceof SecurityOperationsController) {
        handler.setBaseFeature(base as Feature<Point>);
        if (state.rotation !== undefined) handler.graphic.setRotation(state.rotation);
        // The center symbol needs nothing here any more. `setBaseFeature` positions
        // it, and its style is a StyleFunction installed in the controller's
        // constructor. This used to place the icon by hand and rebuild the symbol
        // inside a try/catch, because the symbol was built at `drawend` only — a
        // restore never draws — and milsymbol's canvas path needs a DOM that Node
        // and jsdom do not have. A provider that fails now costs the glyph, not the
        // graphic, so the guard has nothing left to guard.
        return;
    }

    if (handler instanceof PolygonGraphicController) {
        handler.setBaseFeature(base as Feature<Polygon>);
        // Encirclement's triangles are sized from a stamped distance. Without this the
        // area families re-derive it from the loading session's resolution.
        const holder = handler.graphic as {setOffset?: (n: number) => void};
        if (state.decorationSize !== undefined) holder.setOffset?.(state.decorationSize);
        return;
    }

    if (handler instanceof LineGraphicController) {
        // Minimum-length floors modify base geometry against a screen-pixel constant.
        // Correct while drawing, wrong here: this geometry is already final, so
        // re-applying a larger floor lengthens the line the user drew. Suspended for the
        // rebuild only, so draw and modify keep the protection.
        //
        // Duck-typed rather than instanceof: `LineGraphicBase` and `Block` both carry
        // the flag and neither shares a base class with the other, so a name check here
        // would silently miss whichever one a future holder copies.
        const holder = handler.graphic as {suspendMinimumLength?: boolean};
        const guarded = typeof holder.suspendMinimumLength === 'boolean';
        if (guarded) holder.suspendMinimumLength = true;
        try {
            handler.setBaseFeature(base as Feature<LineString>);
        } finally {
            if (guarded) holder.suspendMinimumLength = false;
        }
        // The holder's own scalar, replayed. A line holder stamps whichever of the two it
        // owns and never both: `width` for the families whose number is a perpendicular
        // half-width (movement, air corridor), `radius` for the ones whose number is a
        // reach or a decoration size. After the geometry — `setOffset` regenerates, and
        // there is nothing to regenerate from until the base is set.
        // `setOffset` takes the holder's own number, and a holder owns exactly one of the
        // three: a half-width for the width family (stored full, so halve it back), a
        // decoration size for the line families, a radius for anything with a center.
        const scalar = state.width !== undefined ? state.width / 2 : (state.decorationSize ?? state.radius);
        if (scalar !== undefined) handler.setOffset?.(scalar);
        // Which side the hook hangs on — user intent, so it has to come back.
        if (state.mirrored !== undefined) handler.setMirrored?.(state.mirrored);
        return;
    }

    throw new Error(`unclassified controller for restore: ${handler.constructor.name}`);
}

/**
 * Rebuilds every graphic in a snapshot onto the manager.
 *
 * Additive — it does not clear what is already on the map. Call
 * `clearAllGraphics(manager)` first for a load-over-the-top.
 *
 * A graphic that fails is rolled back feature-by-feature and reported rather than
 * aborting the load, so one unreadable record cannot cost the user the other fifty.
 */
export function restoreTacticalGraphics(
    manager: TacticalGraphicsManager,
    snapshot: FeatureCollection,
): RestoreReport {
    const report: RestoreReport = {restored: 0, failed: []};
    if (!snapshot || !Array.isArray(snapshot.features)) {
        report.failed.push({error: 'not a GeoJSON FeatureCollection'});
        return report;
    }

    for (const raw of snapshot.features) {
        const props = (raw.properties ?? {}) as Record<string, unknown>;
        // Derived features carry the same properties as their base; only bases rebuild.
        if (props.role !== undefined && props.role !== 'base') continue;

        const bag = (props.tacticalGraphic ?? {}) as Record<string, unknown>;
        const name = (bag.name ?? props.graphicName) as TacticalGraphicName | undefined;
        const symbolId = (props.symbolId as string) || crypto.randomUUID();

        if (!name) {
            report.failed.push({symbolId, error: 'feature has no graphic name'});
            continue;
        }

        let handler: TacticalGraphicHandler | undefined;
        let added: Feature[] = [];
        try {
            // The current view resolution, and nothing from the file. Holders seed their
            // decoration sizes from it, then the stamped meter values in `tacticalGraphic`
            // overwrite them — so which resolution this is does not affect the result.
            const resolution = manager.map.getView().getResolution();
            if (!resolution || resolution <= 0) {
                throw new Error('no resolution available to build the controller with');
            }

            handler = getController(name, resolution);
            handler.setSymbolId(symbolId);
            handler.getFeatures().forEach(f => {
                f.set('graphicName', name);
                f.set('symbolId', symbolId);
            });

            const state: GraphicGeometryState = {
                radius: bag.radius as number | undefined,
                decorationSize: bag.decorationSize as number | undefined,
                width: bag.width as number | undefined,
                rotation: bag.rotation as number | undefined,
                bend: bag.bend as number | undefined,
                mirrored: bag.mirrored as boolean | undefined,
            };

            // Seed the base geometry onto the holder's *own* base feature before anything
            // else. Two reasons, and they pull in opposite directions:
            //
            //  - Amplifiers must go on before the authoritative rebuild, because
            //    `AreaGraphicBase.setLabel` regenerates when Encirclement's hostility
            //    flips and `RangeFanGraphicBase.setLabel` always regenerates (bands change
            //    the vertex count). Applied after, both are silently discarded.
            //  - But those same `setLabel`s regenerate *from the base*, so a base with no
            //    geometry throws deep inside turf.
            //
            // Seeding first satisfies both. Writing into the holder's existing feature
            // rather than swapping in the one just parsed also keeps the flags the holder
            // put there — `role`, the deliberately-false `base`, `drawingResolution`.
            const incoming = format.readFeature(raw, {
                dataProjection: GEOJSON_PROJECTION,
                featureProjection: MAP_PROJECTION,
            }) as Feature;
            const geometry = incoming.getGeometry();
            if (!geometry) throw new Error('base feature has no geometry');
            // **Tidied on the way in, exactly as a drawn base is.** A saved base can be
            // short of what its graphic needs — the sample sweep hands a fields-of-fire
            // two points, and every snapshot written before the draw path started
            // normalizing has the same shape. Left alone, the generator synthesizes the
            // missing leg on every render and the V cannot be reshaped, because there is
            // no vertex there to drag. MapLibre normalizes inside `buildTacticalGraphic`,
            // which every one of its paths goes through; this is the same door on this
            // side. @see normalizeDrawnBase
            if (geometry instanceof LineString) {
                const tidied = normalizeDrawnBase(name, geometry.getCoordinates().map(c => toLonLat(c)));
                if (tidied.length !== geometry.getCoordinates().length) {
                    geometry.setCoordinates(tidied.map(c => fromLonLat(c as Coordinate)));
                }
            }
            handler.graphic.base.setGeometry(geometry);

            const labels = toLabels(bag);
            const holder = handler.graphic as {setLabel?: (l: GraphicLabels) => void};
            if (holder.setLabel) holder.setLabel(labels);
            else writeGraphicProperties(handler.getFeatures(), name, labels, state);

            applyRestoredGeometry(handler, handler.graphic.base, state);

            // Re-anchor a security operation to the *current* zoom.
            //
            // Every size in that holder is a screen-pixel constant times the live map
            // resolution, and `updateResolution` recomputes all of them together — which
            // is why it holds a constant on-screen size while you zoom. The resolution it
            // was drawn at therefore means nothing to it, and seeding the controller with
            // the saved one leaves the graphic at the wrong on-screen size until the user
            // happens to zoom and a `change:resolution` fires. Restoring at a different
            // zoom than the graphic was drawn at is the normal case, not the exception.
            //
            // After `applyRestoredGeometry`, not before: `updateResolution` rebuilds from
            // the base geometry and the scale, and neither is on the holder until then.
            if (handler instanceof SecurityOperationsController) {
                const current = manager.map.getView().getResolution();
                if (current && current > 0) handler.graphic.updateResolution(current);
            }

            // Re-read: the offset handle only exists once there is geometry.
            added = handler.getFeatures();
            manager.renderingVectorSource.addFeatures(added);
            manager.graphicControllers.push(handler);
            // Without this a restored graphic never reacts to zoom — the security
            // operation fans in particular resize on every resolution change.
            manager.watchResolution(handler);
            // The holder satisfies one arm of the GraphicObject union; which arm depends on
            // the controller, and the handler interface is deliberately narrower than all of them.
            GraphicLinkRegistry.registerAll(added, handler.graphic as GraphicObject, symbolId);

            report.restored += 1;
        } catch (e) {
            if (handler) {
                const index = manager.graphicControllers.indexOf(handler);
                if (index >= 0) manager.graphicControllers.splice(index, 1);
                // Roll the zoom subscription back with the features — a record that
                // failed halfway may already have been watched.
                manager.unwatchResolution(handler);
                for (const feature of added) {
                    if (manager.renderingVectorSource.hasFeature(feature)) {
                        manager.renderingVectorSource.removeFeature(feature);
                    }
                }
            }
            report.failed.push({symbolId, name, error: e instanceof Error ? e.message : String(e)});
        }
    }

    return report;
}

/**
 * Removes every rendered graphic and its controllers.
 *
 * **Not a bare `renderingVectorSource.clear()`.** The source holds the features; the
 * manager also holds a controller per graphic and a zoom subscription per controller.
 * Clearing only the source empties the screen and leaves all of that behind — a
 * snapshot then still reports graphics nobody can see, an export carries them, and
 * every orphaned listener goes on re-deriving geometry for features that are gone.
 *
 * It lived in `sampleGallery.ts`, which is demo-only and stripped from the published
 * build — so the one correct way to empty a map was the one thing a consumer could not
 * import. Restoring a snapshot has to clear first, which makes this part of the
 * save/restore story rather than part of the gallery's.
 */
export function clearAllGraphics(manager: TacticalGraphicsManager): void {
    // Before the controllers go: the selection holds one of them, and a selection
    // pointing at a graphic that is no longer on the map keeps a host drawing edit
    // chrome around empty space.
    manager.setSelection(undefined);
    manager.renderingVectorSource.clear();
    manager.graphicControllers.length = 0;
    manager.releaseAllGraphics();
}
