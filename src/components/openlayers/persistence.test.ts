/**
 * Round-trip guards for save / restore.
 *
 * The property under test is not "the file looks right" but "the restored graphic is
 * the same object" — same base geometry, same amplifiers, same geometry inputs, same
 * feature set. A graphic can serialize perfectly and still come back un-editable, so
 * every case asserts the holder's own state, not just the picture.
 */
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import {LineString, MultiLineString, Point} from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import {toLonLat} from 'ol/proj';
import {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';

import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {MissionTaskController} from './controllers/MissionTaskController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import {LineGraphicController} from './controllers/LineGraphicController';
import {applyBaseGeometry} from './sampleGallery';
import {readGraphicLabels} from './graphicProperties';
import {restoreTacticalGraphics, serializeTacticalGraphics, SNAPSHOT_VERSION} from './persistence';

/** The resolution graphics are "drawn" at. Baked into every decoration size. */
const RES = 1200;
/**
 * The resolution the map is showing when a snapshot is *restored* — deliberately not
 * `RES`, because restoring at the zoom you drew at is the exceptional case, not the
 * normal one.
 *
 * Deliberately **larger** than `RES` (restoring zoomed out). The minimum-length guards
 * only extend a line when the restore-time floor exceeds the drawn length, so a smaller
 * value would let those tests pass whether or not the guard is suspended.
 */
const VIEW_RES = RES * 4;
const CX = 500_000;
const CY = 2_000_000;

/**
 * A manager stand-in. `restoreTacticalGraphics` needs a source, a controller list and a
 * view to subscribe to; building a real OL Map in jsdom buys nothing and costs a lot.
 * `resolutionListeners` is asserted on — a restored graphic that never subscribes stops
 * reacting to zoom, which no geometry comparison would catch.
 */
function fakeManager() {
    const resolutionListeners: string[] = [];
    const watched: TacticalGraphicHandler[] = [];
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        // `getResolution` is the *current* view resolution, deliberately different from
        // the RES graphics were drawn at: restore re-anchors a security operation to the
        // live zoom, and the two being equal would let that pass without doing anything.
        map: {
            getView: () => ({
                on: (event: string) => resolutionListeners.push(event),
                getResolution: () => VIEW_RES,
            }),
        },
        // Restore subscribes through the manager now rather than reaching for the view
        // itself, so the stand-in has to offer the same three methods. They record
        // instead of subscribing — `resolutionListeners` is what the assertions read.
        watchResolution: (handler: TacticalGraphicHandler) => {
            if (watched.includes(handler)) return;
            watched.push(handler);
            resolutionListeners.push('change:resolution');
        },
        unwatchResolution: (handler: TacticalGraphicHandler) => {
            const i = watched.indexOf(handler);
            if (i < 0) return;
            watched.splice(i, 1);
            resolutionListeners.splice(resolutionListeners.indexOf('change:resolution'), 1);
        },
        releaseAllGraphics: () => {
            watched.length = 0;
            resolutionListeners.length = 0;
        },
        resolutionListeners,
    } as unknown as TacticalGraphicsManager & {resolutionListeners: string[]};
}

/** Builds a graphic the way the sample gallery does and registers it with `manager`. */
function build(
    manager: TacticalGraphicsManager,
    name: TacticalGraphicName,
    symbolId = `id-${name}`,
): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(symbolId);
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', symbolId);
    });
    applyBaseGeometry(handler, name, CX, CY, symbolId);
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    return handler;
}

/** Base coordinates flattened, whatever the geometry type nests them in. */
function baseCoords(handler: TacticalGraphicHandler): number[] {
    const coords = (handler.graphic.base.getGeometry() as unknown as {getCoordinates(): unknown})
        .getCoordinates();
    return flatten(coords);
}

function flatten(value: unknown): number[] {
    if (typeof value === 'number') return [value];
    if (!Array.isArray(value)) return [];
    return value.flatMap(flatten);
}

/**
 * Compares meter coordinates with a 1 mm tolerance.
 *
 * A snapshot is written in EPSG:4326 and read back into EPSG:3857, and that round trip
 * is not bit-exact — it lands about 2e-7 meters out. Asserting equality would make these
 * tests fail on arithmetic rather than on behavior.
 */
function expectMetersClose(actual: number[], expected: number[]): void {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
}

/** Serializes `from` and restores it onto a fresh manager. */
function roundTrip(from: TacticalGraphicsManager) {
    const snapshot = serializeTacticalGraphics(from);
    const to = fakeManager();
    const report = restoreTacticalGraphics(to, snapshot);
    return {snapshot, to, report};
}

/** One graphic per holder family — the families are what differ, not the 198 names. */
/** Cover / Guard / Screen — the fixed-on-screen family, which restores differently. */
const handlerIsSecurityOperation = (name: TacticalGraphicName): boolean =>
    name === TacticalGraphicName.Cover ||
    name === TacticalGraphicName.Guard ||
    name === TacticalGraphicName.Screen;

const FAMILIES: [label: string, name: TacticalGraphicName][] = [
    ['line', TacticalGraphicName.PhaseLine],
    ['polygon', TacticalGraphicName.ObjectiveArea],
    ['rectangular area', TacticalGraphicName.FreeFireAreaRectangular],
    ['mission task', TacticalGraphicName.BaseDefenseZone],
    ['circular area', TacticalGraphicName.FreeFireAreaCircular],
    ['range fan', TacticalGraphicName.WeaponSensorRangeFanCircular],
    ['movement', TacticalGraphicName.AttackHelicopterAxisOfAdvance],
    ['mobile defense', TacticalGraphicName.MobileDefense],
    ['air corridor', TacticalGraphicName.AirCorridor],
    ['block', TacticalGraphicName.TacticalBlock],
    ['boundary', TacticalGraphicName.Boundary],
    ['exfiltrate', TacticalGraphicName.Exfiltrate],
    ['relief in place', TacticalGraphicName.ReliefInPlace],
    ['retrograde', TacticalGraphicName.Delay],
    ['security operation', TacticalGraphicName.Cover],
    // Dropped on one click and then sized and turned: the whole graphic is derived
    // from the anchor, so `size` and `rotation` are the only things a snapshot can
    // carry and everything else has to be rebuilt from them. @see Demonstration
    ['dropped', TacticalGraphicName.Demonstration],
];

describe('every holder family round-trips', () => {
    it.each(FAMILIES)('%s restores its base geometry and feature set', (_label, name) => {
        const from = fakeManager();
        const original = build(from, name);

        const {to, report} = roundTrip(from);

        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);

        const restored = to.graphicControllers[0];
        expect(restored).toBeDefined();
        expect(restored.getSymbolId()).toBe(original.getSymbolId());
        expectMetersClose(baseCoords(restored), baseCoords(original));
        // Catches the MovementGraphicBase offset handle, which only exists once the
        // generator has produced enough handle points to justify it.
        expect(restored.getFeatures().length).toBe(original.getFeatures().length);
    });

    it.each(FAMILIES)('%s restores the graphic geometry itself, not just the base', (_label, name) => {
        const from = fakeManager();
        const original = build(from, name);
        const {to} = roundTrip(from);

        const before = original.graphic.getFeatures().find(f => f.get('role') === 'graphic')?.getGeometry();
        const after = to.graphicControllers[0].graphic.getFeatures()
            .find(f => f.get('role') === 'graphic')?.getGeometry();

        expect(after?.getType()).toBe(before?.getType());

        if (handlerIsSecurityOperation(name)) {
            // A security operation is sized in screen pixels x the *live* map
            // resolution, so restoring it at a different zoom must come back a
            // different size in meters — that is exactly what holding a constant
            // on-screen size means. Assert the relationship rather than equality:
            // same center, width scaled by precisely the resolution ratio.
            const width = (g?: Geometry) => {
                const e = g?.getExtent() ?? [0, 0, 0, 0];
                return e[2] - e[0];
            };
            const center = (g?: Geometry) => {
                const e = g?.getExtent() ?? [0, 0, 0, 0];
                return (e[0] + e[2]) / 2;
            };
            expect(width(after) / width(before)).toBeCloseTo(VIEW_RES / RES, 6);
            expect(center(after)).toBeCloseTo(center(before), 3);
            return;
        }

        expectMetersClose([...(after?.getExtent() ?? [])], [...(before?.getExtent() ?? [])]);
    });
});

describe('the snapshot', () => {
    it('is one feature per graphic by default', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine, 'a');
        build(from, TacticalGraphicName.BaseDefenseZone, 'b');

        const snapshot = serializeTacticalGraphics(from);
        expect(snapshot.features).toHaveLength(2);
        expect(snapshot.features.every(f => f.properties?.role === 'base')).toBe(true);
        expect(snapshot.tacticalGraphicsVersion).toBe(SNAPSHOT_VERSION);
    });

    it('carries no renderer bag — the graphic is described by `tacticalGraphic` alone', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.TacticalBlock);
        const [feature] = serializeTacticalGraphics(from).features;

        // The whole point: a reader needs nothing but the portable bag.
        expect(feature.properties).not.toHaveProperty('renderer');
        expect(feature.properties?.tacticalGraphic).not.toHaveProperty('drawingResolution');
        expect(feature.properties?.tacticalGraphic).not.toHaveProperty('scale');
    });

    it('writes no viewport quantity for a security operation either', () => {
        const from = fakeManager();
        const handler = build(from, TacticalGraphicName.Cover) as SecurityOperationsController;
        handler.graphic.setScale(1.9);

        const [feature] = serializeTacticalGraphics(from).features;
        expect(feature.properties).not.toHaveProperty('renderer');
        expect(feature.properties?.tacticalGraphic).not.toHaveProperty('scale');
    });

    it('writes geographic coordinates, not map meters', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine);
        const [feature] = serializeTacticalGraphics(from).features;
        const coords = (feature.geometry as {coordinates: number[][]}).coordinates;
        // 3857 meters would be in the hundreds of thousands.
        expect(Math.abs(coords[0][0])).toBeLessThanOrEqual(180);
        expect(Math.abs(coords[0][1])).toBeLessThanOrEqual(90);
    });

    it('adds the rendered features only when asked', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine);

        expect(serializeTacticalGraphics(from).features).toHaveLength(1);
        const withDerived = serializeTacticalGraphics(from, {includeDerived: true});
        expect(withDerived.features.length).toBeGreaterThan(1);
        expect(withDerived.features.some(f => f.properties?.role === 'graphic')).toBe(true);
    });

    it('ignores derived features when restoring, so they cannot double up', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine);

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, serializeTacticalGraphics(from, {includeDerived: true}));
        expect(report.restored).toBe(1);
        expect(to.graphicControllers).toHaveLength(1);
    });
});

describe('editable state survives', () => {
    it('keeps a mission task’s size and rotation', () => {
        const from = fakeManager();
        const handler = build(from, TacticalGraphicName.BaseDefenseZone) as MissionTaskController;
        handler.graphic.updateGeom({size: 44_000, rotation: 1.1, center: [CX, CY]});

        const {to, report} = roundTrip(from);
        expect(report.failed).toEqual([]);

        const restored = to.graphicControllers[0] as MissionTaskController;
        expect(restored.graphic.size).toBeCloseTo(44_000, 6);
        expect(restored.graphic.rotation).toBeCloseTo(1.1, 6);
        expectMetersClose(restored.graphic.center, [CX, CY]);
    });

    it('keeps a security operation’s rotation — but no longer its scale', () => {
        const from = fakeManager();
        const handler = build(from, TacticalGraphicName.Cover) as SecurityOperationsController;
        handler.graphic.setRotation(0.7);
        handler.graphic.setScale(1.8);

        const {to, report} = roundTrip(from);
        expect(report.failed).toEqual([]);

        const restored = to.graphicControllers[0] as SecurityOperationsController;
        // Rotation is degrees — portable, and it lives in the doctrinal bag.
        expect(restored.graphic.getRotation()).toBeCloseTo(0.7, 6);
        // `scale` does not survive any more, and that is deliberate: it lived in the
        // `renderer` bag an earlier design carried. Nothing in the app sets it
        // (SecurityOperationsController.handleResize is a no-op), so this only costs a
        // host that called setScale programmatically. Asserted rather than left
        // untested so the loss is visible if that ever stops being acceptable.
        expect(restored.graphic.getScale()).not.toBeCloseTo(1.8, 6);
    });

    it('keeps a movement graphic’s dragged width', () => {
        const from = fakeManager();
        const handler = build(from, TacticalGraphicName.AttackHelicopterAxisOfAdvance) as LineGraphicController;
        const widened = 9_000;
        handler.setOffset?.(widened);

        const {to, report} = roundTrip(from);
        expect(report.failed).toEqual([]);

        const restored = to.graphicControllers[0] as LineGraphicController;
        expect((restored.graphic as unknown as {offset: number}).offset).toBeCloseTo(widened, 6);
    });

    it('keeps amplifiers, including hostility', () => {
        const from = fakeManager();
        const handler = build(from, TacticalGraphicName.PhaseLine);
        const holder = handler.graphic as {setLabel?: (l: unknown) => void};
        holder.setLabel?.({label: 'ALPHA', hostility: TacticalGraphicHostility.hostileFaker});

        const {to} = roundTrip(from);
        const restored = to.graphicControllers[0];
        const labels = readGraphicLabels(restored.graphic.base);
        expect(labels.label).toBe('ALPHA');
        expect(labels.hostility).toBe(TacticalGraphicHostility.hostileFaker);
    });

    it('re-subscribes the restored graphic to zoom changes', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.Cover);

        const to = fakeManager();
        restoreTacticalGraphics(to, serializeTacticalGraphics(from));
        // Without this a security operation stops rescaling on zoom — invisible to any
        // geometry assertion, because the geometry is correct until the user zooms.
        expect(to.resolutionListeners).toContain('change:resolution');
    });
});

describe('the drawing resolution is no longer load-bearing', () => {
    it('rebuilds the same shape whatever resolution it is handed', () => {
        const from = fakeManager();
        const original = build(from, TacticalGraphicName.TacticalBlock);
        const trueExtent = original.graphic.getFeatures()
            .find(f => f.get('role') === 'graphic')!.getGeometry()!.getExtent();

        // The inverse of what this suite used to assert. Every holder now sizes itself
        // from the geometry it was drawn on, so feeding restore a wildly wrong
        // resolution must change nothing — that is what makes the snapshot portable.
        const snapshot = serializeTacticalGraphics(from);
        snapshot.features[0].properties!.renderer = {drawingResolution: RES * 4};

        const to = fakeManager();
        expect(restoreTacticalGraphics(to, snapshot).restored).toBe(1);
        const rebuilt = to.graphicControllers[0].graphic.getFeatures()
            .find(f => f.get('role') === 'graphic')!.getGeometry()!.getExtent();

        expect(Math.abs(rebuilt[2] - rebuilt[0]))
            .toBeCloseTo(Math.abs(trueExtent[2] - trueExtent[0]), 3);
    });

    /**
     * The families list uses PhaseLine for the line case, which has no minimum-length
     * guard — so nothing above covers the two graphics that do. Their guards *modify
     * base geometry* against a screen-pixel floor, which on a restore at a different
     * zoom would silently extend the drawn line.
     */
    it.each([
        ['aviation direction of attack', TacticalGraphicName.AviationDirectionOfAttack],
        ['tactical fix', TacticalGraphicName.TacticalFix],
        ['fix', TacticalGraphicName.Fix],
    ])('%s keeps its drawn base geometry through a restore', (_label, name) => {
        const from = fakeManager();
        const original = build(from, name);
        const {to, report} = roundTrip(from);

        expect(report.failed).toEqual([]);
        // Not "close enough": the guard extends the first segment, so any drift here is
        // the graphic quietly growing a longer line than the user drew.
        expectMetersClose(baseCoords(to.graphicControllers[0]), baseCoords(original));
    });

    /**
     * The floor belongs to the gestures that **author the shape** — a draw, a vertex drag
     * — and to nothing else. It used to be gated on "not a restore" alone, and
     * `setBaseFeature` is the door every gesture comes through: at a zoom where a restored
     * Fix was shorter than the 145 px floor, one *move* took its base from 5.2 degrees to
     * 35.8, the near end following the cursor and the far end shooting off.
     * @see LineGraphicBase.shapingFromGesture
     */
    it('still enforces the minimum length while the shape is being drawn', () => {
        const handler = getController(TacticalGraphicName.Fix, RES);
        const tiny = () => new Feature(new LineString([[CX, CY], [CX + 10, CY]]));

        // What the draw path does: the controller marks the holder as authoring geometry
        // for the length of the gesture.
        (handler.graphic as unknown as {shapingFromGesture: boolean}).shapingFromGesture = true;
        handler.setBaseFeature(tiny() as never);
        expect((handler.graphic.base.getGeometry() as LineString).getLength()).toBeGreaterThan(10);
    });

    it('leaves the geometry alone when the gesture is not authoring it', () => {
        const handler = getController(TacticalGraphicName.Fix, RES);
        const tiny = new Feature(new LineString([[CX, CY], [CX + 10, CY]]));

        handler.setBaseFeature(tiny as never);

        // A move, a restore, or a host setting geometry directly: 10 metres in, 10 out.
        expect((handler.graphic.base.getGeometry() as LineString).getLength()).toBeCloseTo(10, 6);
    });

    it('restores a record carrying nothing but the portable bag', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine);
        const snapshot = serializeTacticalGraphics(from);
        delete snapshot.features[0].properties!.renderer;

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, snapshot);
        // Restore used to refuse this outright rather than guess. It no longer has to
        // guess: the holder derives its size from the base geometry, so a record with
        // nothing but `tacticalGraphic` is complete.
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);
    });
});

describe('a bad record cannot cost the user the good ones', () => {
    it('reports the failure and restores the rest', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine, 'good-1');
        build(from, TacticalGraphicName.BaseDefenseZone, 'good-2');

        const snapshot = serializeTacticalGraphics(from);
        snapshot.features.splice(1, 0, {
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {role: 'base', symbolId: 'bad', drawingResolution: RES,
                tacticalGraphic: {name: 'NotARealGraphic'}},
        });

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, snapshot);

        expect(report.restored).toBe(2);
        expect(report.failed).toHaveLength(1);
        expect(report.failed[0].symbolId).toBe('bad');
        expect(to.graphicControllers).toHaveLength(2);
    });

    it('leaves no orphan features behind when a graphic fails', () => {
        const to = fakeManager();
        restoreTacticalGraphics(to, {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {role: 'base', symbolId: 'bad', renderer: {drawingResolution: RES},
                    tacticalGraphic: {name: 'NotARealGraphic'}},
            }],
        });
        expect(to.renderingVectorSource.getFeatures()).toHaveLength(0);
        expect(to.graphicControllers).toHaveLength(0);
    });

    it('rejects something that is not a FeatureCollection', () => {
        const to = fakeManager();
        const report = restoreTacticalGraphics(to, {} as never);
        expect(report.restored).toBe(0);
        expect(report.failed[0].error).toMatch(/FeatureCollection/);
    });
});

describe('a restored graphic is still editable', () => {
    it('accepts a resize and a rotate after restoring', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.BaseDefenseZone);
        const {to} = roundTrip(from);

        const restored = to.graphicControllers[0] as MissionTaskController;
        const sizeBefore = restored.graphic.size;
        restored.handleResize(1.5);
        restored.handleRotate(0.3);

        expect(restored.graphic.size).toBeGreaterThan(sizeBefore);
        expect(restored.graphic.rotation).toBeCloseTo(0.3, 6);
    });

    it('accepts a vertex modify after restoring', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine);
        const {to} = roundTrip(from);

        const restored = to.graphicControllers[0];
        const moved = new Feature(new Point([CX + 50_000, CY]));
        const edited = restored.graphic.base.clone();
        edited.setGeometry(moved.getGeometry() as never);

        expect(() => restored.setBaseFeature(edited as never)).not.toThrow();
    });

    it('is reachable through the symbol registry, which used to key on the empty string', () => {
        const from = fakeManager();
        build(from, TacticalGraphicName.PhaseLine, 'lookup-me');
        const {to} = roundTrip(from);

        const found = to.graphicControllers.find(c => c.getSymbolId() === 'lookup-me');
        expect(found).toBeDefined();
    });
});

describe('an empty map', () => {
    it('serializes to an empty collection and restores cleanly', () => {
        const from = fakeManager();
        const snapshot = serializeTacticalGraphics(from);
        expect(snapshot.features).toHaveLength(0);

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, snapshot);
        expect(report).toEqual({restored: 0, failed: []});
    });
});

/**
 * A graphic converted to APP-06's drawn anchor points has to load two shapes of save:
 * the LineString it writes now, and the Point every version before the conversion
 * wrote. The second is the one with no second chance — those files already exist.
 */
describe('a graphic saved before the anchor-point conversion', () => {
    /** The base feature a 2.0.0 snapshot held: a Point, with the shape in the bag. */
    function legacyPointSnapshot(name: TacticalGraphicName, bag: Record<string, unknown>) {
        return {
            type: 'FeatureCollection' as const,
            tacticalGraphicsVersion: SNAPSHOT_VERSION,
            features: [
                {
                    type: 'Feature' as const,
                    properties: {role: 'base', graphicName: name, symbolId: 'legacy-1', tacticalGraphic: {name, ...bag}},
                    geometry: {type: 'Point' as const, coordinates: [-0.1, 51.56]},
                },
            ],
        };
    }

    it('upgrades a Point base to drawn anchor points', () => {
        const to = fakeManager();
        const report = restoreTacticalGraphics(
            to,
            legacyPointSnapshot(TacticalGraphicName.Envelopment, {radius: 9000, rotation: 0, bend: 0.6}),
        );

        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);
        const base = to.graphicControllers[0].graphic.base.getGeometry();
        expect(base).toBeInstanceOf(LineString);
        // APP-06 343500's four: the run's two ends, the semicircle's far foot, and the
        // point that says which flank it bulges to.
        expect((base as LineString).getCoordinates()).toHaveLength(4);
    });

    it('keeps the bend it was saved with', () => {
        // The regression this pins: persistence reached for `bend` behind an
        // `instanceof TurnGraphicBase` test, and envelopment is a *sibling* of that
        // class. Every saved envelopment silently came back at the default bend —
        // a shape change no other assertion in this suite could see.
        const to = fakeManager();
        restoreTacticalGraphics(
            to,
            legacyPointSnapshot(TacticalGraphicName.Envelopment, {radius: 9000, rotation: 0, bend: 0.6}),
        );

        const holder = to.graphicControllers[0].graphic as unknown as {bend: number};
        expect(holder.bend).toBeCloseTo(0.6, 10);
    });

    it('keeps a negative bend, which is the far side rather than a smaller curve', () => {
        const to = fakeManager();
        restoreTacticalGraphics(
            to,
            legacyPointSnapshot(TacticalGraphicName.Envelopment, {radius: 6000, rotation: 45, bend: -0.5}),
        );

        const holder = to.graphicControllers[0].graphic as unknown as {bend: number};
        expect(holder.bend).toBeCloseTo(-0.5, 10);
    });

    /**
     * The demonstration is in the family for a different reason: its four points are
     * derived from the first rather than placed. A file written while they were drawn
     * freehand still loads, and comes back as the canonical shape — which is what
     * "auto-calculated" means once the ratios stop being an input.
     */
    it('snaps a freehand demonstration onto the ratios it is now fixed at', () => {
        const to = fakeManager();
        // A U drawn tip-first: point 1 the arrowhead, point 2 the first bend due east.
        const drawn = {
            type: 'FeatureCollection' as const,
            tacticalGraphicsVersion: SNAPSHOT_VERSION,
            features: [
                {
                    type: 'Feature' as const,
                    properties: {
                        role: 'base',
                        graphicName: TacticalGraphicName.Demonstration,
                        symbolId: 'legacy-dem',
                        tacticalGraphic: {name: TacticalGraphicName.Demonstration, label: 'ALPHA'},
                    },
                    // Splayed: the second leg is neither parallel nor the same length.
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: [[-0.6, 51.5], [0.2, 51.5], [0.5, 51.9], [-0.9, 51.8]],
                    },
                },
            ],
        };

        const report = restoreTacticalGraphics(to, drawn);
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);

        const holder = to.graphicControllers[0].graphic;
        // Still four points, and still a LineString: the count is what the standard
        // describes the symbol by, and it survives the trip.
        const base = holder.base.getGeometry();
        expect(base).toBeInstanceOf(LineString);
        const anchors = (base as LineString).getCoordinates().map(c => toLonLat(c));
        expect(anchors).toHaveLength(4);
        // Points 1 and 2 are the two that are read, and they have not moved.
        expect(anchors[0][0]).toBeCloseTo(-0.6, 6);
        expect(anchors[0][1]).toBeCloseTo(51.5, 6);
        expect(anchors[1][0]).toBeCloseTo(0.2, 4);
        // Points 3 and 4 were rewritten from them, so the legs come back equal. Within a
        // percent, and as a ratio: these are *projected* metres, and the second leg sits a
        // quarter of a degree further north, where Mercator's scale factor is 0.8% larger.
        // Asserting equality here would be asserting the projection.
        const rebuilt = holder.getFeatures().find(f => f.get('role') === 'graphic')?.getGeometry();
        const parts = (rebuilt as MultiLineString).getCoordinates();
        const legLength = (part: number[][]) => Math.hypot(part[1][0] - part[0][0], part[1][1] - part[0][1]);
        expect(legLength(parts[2]) / legLength(parts[0])).toBeCloseTo(1, 1);
    });

    it('upgrades a pursuit too, to its own three-point layout', () => {
        // Pursue is 344000, three points, with the diameter across the line rather than
        // along it. Same shim, different shape — which is the case a family-wide
        // assertion would have missed.
        const to = fakeManager();
        const report = restoreTacticalGraphics(
            to,
            legacyPointSnapshot(TacticalGraphicName.Pursuit, {radius: 9000, rotation: 0}),
        );

        expect(report.failed).toEqual([]);
        const base = to.graphicControllers[0].graphic.base.getGeometry();
        expect(base).toBeInstanceOf(LineString);
        expect((base as LineString).getCoordinates()).toHaveLength(3);
    });

    it('keeps a pursuit line-to-hook proportion that is not the dropped default', () => {
        // The dropped form fixed the line at 2.4 radii. A drawn one can be anything, and
        // the holder has to carry that or the next regeneration snaps it back.
        const from = fakeManager();
        restoreTacticalGraphics(
            from,
            legacyPointSnapshot(TacticalGraphicName.Pursuit, {radius: 9000, rotation: 0}),
        );
        const handler = from.graphicControllers[0];
        const coords = (handler.graphic.base.getGeometry() as LineString).getCoordinates();
        // Stretch the straight line to twice its drawn length, leaving the hook alone.
        const stretched = coords.slice();
        stretched[0] = [coords[1][0] - (coords[1][0] - coords[0][0]) * 2, coords[1][1]];
        handler.graphic.base.setGeometry(new LineString(stretched));
        handler.setBaseFeature(handler.graphic.base);

        const {to} = roundTrip(from);
        const after = (to.graphicControllers[0].graphic.base.getGeometry() as LineString).getCoordinates();
        const run = Math.hypot(after[1][0] - after[0][0], after[1][1] - after[0][1]);
        const diameter = Math.hypot(after[2][0] - after[1][0], after[2][1] - after[1][1]);
        expect(run / (diameter / 2)).toBeCloseTo(4.8, 1);
    });

    it('is stable once upgraded: saving the anchored form and reloading changes nothing', () => {
        const first = fakeManager();
        restoreTacticalGraphics(
            first,
            legacyPointSnapshot(TacticalGraphicName.Envelopment, {radius: 9000, rotation: 0, bend: 0.6}),
        );
        const before = baseCoords(first.graphicControllers[0]);

        const {to} = roundTrip(first);
        expectMetersClose(baseCoords(to.graphicControllers[0]), before);
        expect((to.graphicControllers[0].graphic as unknown as {bend: number}).bend).toBeCloseTo(0.6, 10);
    });
});
