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
 * ## Two objects, drawn along one line
 *
 * ```jsonc
 * "properties": {
 *   "tacticalGraphic": { "name": …, amplifiers…, "size": …, "rotation": … },
 *   "renderer":        { "drawingResolution": 1200, "scale": 1.7 },
 *   "role": "base", "symbolId": "…", "graphicName": "…"
 * }
 * ```
 *
 * `tacticalGraphic` is the **portable description of the symbol** — the same object the
 * map-agnostic `renderTacticalGraphic` consumes. Everything in it is metres, degrees or
 * text: meaningful to any renderer, in any language, forever.
 *
 * `renderer` is **this renderer's bookkeeping**. Both members are viewport quantities
 * that a different renderer could not act on:
 *
 * - `drawingResolution` — metres per *screen pixel* when the graphic was drawn.
 * - `scale` — a multiplier applied to screen-pixel arrow lengths by the security
 *   operation holders. It has no meaning except multiplied by the resolution, which is
 *   precisely why it belongs beside it rather than in the doctrinal bag.
 *
 * The line is: *would this still mean something to a Cesium view, or to a consumer
 * reading the file in Python?* If yes it is a graphic property; if it only means
 * something to an OpenLayers session, it is renderer state.
 *
 * Grouping them also makes the failure mode honest. As a loose sibling field,
 * `drawingResolution` was easy to drop while transforming the GeoJSON on the way to a
 * database, and dropping it does not fail loudly — it silently rebuilds every graphic at
 * the wrong proportions. One object is one obvious thing to keep, and restore refuses a
 * record without it rather than guessing.
 *
 * Pass `includeDerived` to additionally emit the rendered `graphic` and `label`
 * features. Restore ignores them; they are there for consumers that only want to draw
 * the shape without this library.
 *
 * ## Why the drawing resolution matters at all
 *
 * `getController(name, resolution)` bakes that resolution into decoration sizes —
 * `20 * res` arrowheads, `res * 20` block widths, `CENTER_PADDING_PX * res` gaps.
 * Rebuilding with the *current* view resolution instead of the saved one produces a
 * graphic of visibly the wrong proportions, and nothing about it looks like a bug in
 * the loader.
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
import {clampTurnBend, TacticalGraphicName} from '@zaes/tactical-graphics';
import type {GraphicLabels, GraphicObject} from '../../utils/graphicLinkRegistry';
import {GraphicLinkRegistry} from '../../utils/graphicLinkRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {MissionTaskController} from './controllers/MissionTaskController';
import {PolygonGraphicController} from './controllers/PolygonGraphicController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import {TurnGraphicBase} from './graphics/MissionTaskGraphicBase';
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

/**
 * Renderer bookkeeping that sits *beside* a graphic rather than inside it, because none
 * of it would mean anything to a different renderer. See the note at the top of the file.
 */
export interface TacticalGraphicRendererState {
    /**
     * Metres per screen pixel when the graphic was drawn. Required: decoration sizes are
     * derived from it at construction, so rebuilding without it gets the proportions
     * wrong rather than failing.
     */
    drawingResolution: number;
    /**
     * Security operations only (Cover / Guard / Screen). Multiplies screen-pixel arrow
     * lengths, so it is only interpretable together with `drawingResolution`.
     */
    scale?: number;
}

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
const GEOMETRY_KEYS = ['size', 'radius', 'rotation', 'bend'] as const;

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

    const renderer: Partial<TacticalGraphicRendererState> = {
        drawingResolution: findProp<number>(handler, 'drawingResolution'),
    };
    // Read live off the holder rather than from a feature: `scale` is renderer state, so
    // it is deliberately not stamped into the doctrinal bag, and nothing else needs it.
    if (handler instanceof SecurityOperationsController) {
        renderer.scale = handler.graphic.getScale();
    }

    return {
        tacticalGraphic: {...bag, name},
        renderer,
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
 * Point-anchored graphics go through `updateGeom`, not `setBaseFeature`: their centre,
 * size and rotation are cached on the holder and `updateGeom` is the only entry that
 * sets all three together. Shared with the demo's sample gallery, which needs the same
 * dispatch to build graphics without a draw interaction.
 */
export function applyRestoredGeometry(
    handler: TacticalGraphicHandler,
    base: Feature,
    state: GraphicGeometryState,
    renderer?: Partial<TacticalGraphicRendererState>,
): void {
    if (handler instanceof MissionTaskController) {
        const coords = (base.getGeometry() as Point | undefined)?.getCoordinates();
        if (!coords || coords.length < 2) throw new Error('point-based graphic has no centre coordinate');
        // `bend` before `updateGeom`: the holder reads it back out when it
        // regenerates, so setting it afterwards would leave the restored
        // graphic drawn at the default sharpness until the next edit.
        if (state.bend !== undefined && handler.graphic instanceof TurnGraphicBase) {
            handler.graphic.bend = clampTurnBend(state.bend);
        }
        handler.graphic.updateGeom({
            center: coords as Coordinate,
            size: state.size,
            rotation: state.rotation,
        });
        return;
    }

    if (handler instanceof SecurityOperationsController) {
        handler.setBaseFeature(base as Feature<Point>);
        if (state.rotation !== undefined) handler.graphic.setRotation(state.rotation);
        if (renderer?.scale !== undefined) handler.graphic.setScale(renderer.scale);
        const coords = (base.getGeometry() as Point | undefined)?.getCoordinates();
        if (coords) handler.milSymbolFeature.setGeometry(new Point(coords));
        // Only `onDrawEndFunc` builds the 2525E symbol, and a restore never draws. It
        // rasterises through milsymbol, so it needs a real canvas — absent in Node and in
        // a jsdom test. Losing the centre glyph is a blemish; losing the graphic because
        // of it is not acceptable, so this failure stays local.
        try {
            handler.setMilSymStyle();
        } catch {
            // no-op: the fan, its labels and every interaction are already in place.
        }
        return;
    }

    if (handler instanceof PolygonGraphicController) {
        handler.setBaseFeature(base as Feature<Polygon>);
        return;
    }

    if (handler instanceof LineGraphicController) {
        handler.setBaseFeature(base as Feature<LineString>);
        // The width drag, for the graphics that have one. After the geometry: `setOffset`
        // regenerates, and there is nothing to regenerate from until the base is set.
        if (state.radius !== undefined) handler.setOffset?.(state.radius);
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
            const renderer = (props.renderer ?? {}) as Partial<TacticalGraphicRendererState>;
            const drawingResolution = renderer.drawingResolution;
            if (!drawingResolution || drawingResolution <= 0) {
                throw new Error(
                    'missing renderer.drawingResolution — the graphic would rebuild at the wrong scale',
                );
            }

            handler = getController(name, drawingResolution);
            handler.setSymbolId(symbolId);
            handler.getFeatures().forEach(f => {
                f.set('graphicName', name);
                f.set('symbolId', symbolId);
            });

            const state: GraphicGeometryState = {
                size: bag.size as number | undefined,
                radius: bag.radius as number | undefined,
                rotation: bag.rotation as number | undefined,
                bend: bag.bend as number | undefined,
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
            handler.graphic.base.setGeometry(geometry);

            const labels = toLabels(bag);
            const holder = handler.graphic as {setLabel?: (l: GraphicLabels) => void};
            if (holder.setLabel) holder.setLabel(labels);
            else writeGraphicProperties(handler.getFeatures(), name, labels, state);

            applyRestoredGeometry(handler, handler.graphic.base, state, renderer);

            // Re-read: the offset handle only exists once there is geometry.
            added = handler.getFeatures();
            manager.renderingVectorSource.addFeatures(added);
            manager.graphicControllers.push(handler);
            // Without this a restored graphic never reacts to zoom — the security
            // operation fans in particular resize on every resolution change.
            manager.map.getView().on('change:resolution', handler.onResolutionChangeFunc);
            // The holder satisfies one arm of the GraphicObject union; which arm depends on
            // the controller, and the handler interface is deliberately narrower than all of them.
            GraphicLinkRegistry.registerAll(added, handler.graphic as GraphicObject, symbolId);

            report.restored += 1;
        } catch (e) {
            if (handler) {
                const index = manager.graphicControllers.indexOf(handler);
                if (index >= 0) manager.graphicControllers.splice(index, 1);
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
