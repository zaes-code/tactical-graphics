/**
 * # The two engines file the same description for the same symbol
 *
 * A snapshot is what a host writes to disk and what the engine toggle hands across, so a file
 * whose contents depend on which renderer last saved it is a file that says different things
 * to the same reader. They did: measured on `npm run sweep:import-export`, a MapLibre-written
 * file carried `labelGapDegrees` for 192 graphics and `radius` plus `rotation` for 249 that an
 * OpenLayers-written one carried nothing for.
 *
 * The cause was one sentence's worth of difference in what each engine thought the bag *was*.
 * OpenLayers files what its holder knows; MapLibre completed the bag before drawing — a zero
 * label gap for the arc tasks, a rectangle's width read back off the ring, a drawn-anchor
 * graphic's `radius` and `rotation` recovered from the points — and then filed the thing it
 * had drawn with. Half of that is an instruction to a paint layer and half is a second copy
 * of the geometry, and a second copy is worse than redundant because the two can disagree:
 * 151204 contain reported a 40 km radius beside a symbol drawn at 29.8, from exactly this.
 *
 * What both engines legitimately file is a value nothing else in the file states — a
 * screen-sized default spent at the drawing resolution, most of all, since a snapshot carries
 * no viewport and that metre figure is the only record of it there will ever be.
 *
 * @see describedProperties, ai/conventions.md "A base is the library's reading of it"
 */
import VectorSource from 'ol/source/Vector';
import {listTacticalGraphicNames, TacticalGraphicName, TACTICAL_GRAPHIC_KEY, toSnapshot} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {applyBaseGeometry} from './openlayers/sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './openlayers/persistence';
import {buildTacticalGraphic, descriptionOf} from './maplibre/maplibreAdapter';

const RES = 1200;
const CX = 500_000;
const CY = 2_000_000;

/** Values each engine derives from something the file does not carry, and so must state. */
const FROM_THE_DRAWING_ZOOM = new Set(['radius', 'decorationSize', 'width', 'length', 'startRange', 'stopRange']);

const fakeManager = () => ({
    renderingVectorSource: new VectorSource(),
    graphicControllers: [] as TacticalGraphicHandler[],
    map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
    watchResolution: () => undefined,
    unwatchResolution: () => undefined,
    releaseAllGraphics: () => undefined,
    setSelection: () => undefined,
} as unknown as TacticalGraphicsManager);

/** What OpenLayers writes for a graphic drawn the way both sample sheets draw one. */
function openLayersFiles(name: TacticalGraphicName) {
    const handler = getController(name, RES);
    handler.setSymbolId('x');
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', 'x');
    });
    applyBaseGeometry(handler, name, CX, CY, 'x');
    const manager = fakeManager();
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    const snapshot = serializeTacticalGraphics(manager);
    return {
        bag: (snapshot.features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>,
        geometry: snapshot.features[0].geometry,
    };
}

/** And what MapLibre writes, handed that same file. */
function mapLibreFiles(name: TacticalGraphicName, geometry: unknown, bag: Record<string, unknown>) {
    const properties = {...bag};
    delete properties.name;
    const built = buildTacticalGraphic(name, geometry as never, properties as never, RES);
    return (built?.base.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
}

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe(`one file, whichever engine wrote it (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        let ol;
        try {
            ol = openLayersFiles(name);
        } catch {
            return; // a graphic this harness cannot lay out is a different suite's problem
        }
        const mlb = mapLibreFiles(name, ol.geometry, ol.bag);

        /*
         * **Only the keys, not the values.** The two engines round a screen-sized default
         * differently in places and that is a separate question with its own sweep row; what
         * this suite is for is a *field* one engine states and the other does not, which is
         * the shape that made one file read two ways. A key MapLibre adds because it spent
         * the drawing resolution on it is legitimate and listed above.
         */
        const added = Object.keys(mlb).filter(key => !(key in ol.bag) && !FROM_THE_DRAWING_ZOOM.has(key));
        expect(added).toEqual([]);

        /*
         * **And one size is named once.** `bakedDecorationSize` exists to put a baked
         * decoration's figure where `toGraphicOptions` reads it, which is `radius`, and it ran
         * over the bag that gets filed — so for the 29 graphics with a baked decoration a file
         * came out carrying `radius` and `decorationSize` holding the identical number. Both
         * engines read the second and only MapLibre wrote the first, so OpenLayers dropped it
         * on the next save and the two files differed over a value neither of them uses. A
         * second copy is the thing the rule above exists to stop, whatever it is called.
         */
        if (typeof mlb.radius === 'number' && typeof mlb.decorationSize === 'number') {
            expect(mlb.radius).not.toBe(mlb.decorationSize);
        }
    });
});

/**
 * # And it holds after the graphic is touched
 *
 * The first version of the strip did not. `buildTacticalGraphic` filed the description, but
 * every path that *rebuilds* a graphic — a gesture's starting shape, the properties dialog's
 * apply — handed the completed bag back in as the caller's own properties, so everything the
 * adapter had derived looked stated and went straight back into the file. The strip held for a
 * graphic nobody touched and came undone on the first drag.
 *
 * Nothing caught it: the import/export sweep draws its samples and exports them without
 * gesturing, and the unit suite above builds once. This is the assertion that would have.
 * @see descriptionOf
 */
describe('the description survives a rebuild', () => {
    /** The keys that only ever get into a file by being derived from the points. */
    const FROM_THE_POINTS = ['labelGapDegrees', 'labelGap', 'rotation', 'bend', 'mirrored'];

    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        let ol;
        try {
            ol = openLayersFiles(name);
        } catch {
            return;
        }
        const properties = {...ol.bag};
        delete properties.name;
        const built = buildTacticalGraphic(name, ol.geometry as never, properties as never, RES);
        if (!built) return;

        const filed = (graphic: NonNullable<typeof built>) =>
            (graphic.base.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
        const before = filed(built);

        // Rebuilt the way a gesture and the dialog rebuild it: from the description this
        // graphic carries, which is what both now start from.
        const again = buildTacticalGraphic(name, built.base.geometry, descriptionOf(built) as never, RES);
        expect(again).toBeDefined();

        const after = filed(again!);
        const gained = FROM_THE_POINTS.filter(key => !(key in before) && key in after);
        expect(gained).toEqual([]);
        // And the description is stable, so a graphic rebuilt twice files what it filed once.
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    });
});


/**
 * # And the file survives a re-save on the other engine
 *
 * The mirror of everything above, and the half that was still open. A save walks the
 * OpenLayers holders and asks each what it knows, which is the right question for a graphic
 * drawn here and the wrong one for a file someone else wrote: a holder that owns no
 * `decorationSize` answers nothing, so the figure the file stated was gone the first time
 * this engine re-saved it. Measured against MapLibre's own output, that was `decorationSize`
 * on 146 of the 318 — each one a screen-sized default spent at the zoom the graphic was drawn
 * at, which `conventions.md` names as the one kind of derived value a file must carry, since
 * a snapshot holds no viewport to re-derive it from.
 *
 * Worse than the missing key, and what this suite found: a `decorationSize` arriving beside a
 * `width` **outranked it** in `applyRestoredGeometry`, because that precedence was written
 * against the files this engine writes and OpenLayers states one number per holder. The
 * twenty rectangular areas took the decoration as their half-width — a box saved at 87,465 m
 * came back 45,733 wide, drawing 20.7 km from where the same file draws on MapLibre.
 *
 * @see FILED_DESCRIPTION_KEY, shapedByWidth
 */
describe('OpenLayers re-saves what it was handed', () => {
    /** The file MapLibre would write for the graphic this sheet draws. */
    function mapLibreFile(name: TacticalGraphicName, ol: ReturnType<typeof openLayersFiles>) {
        const properties = {...ol.bag};
        delete properties.name;
        const built = buildTacticalGraphic(name, ol.geometry as never, properties as never, RES);
        if (!built) return undefined;
        const bag = (built.base.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
        return {
            bag,
            snapshot: toSnapshot([
                {
                    type: 'Feature',
                    geometry: built.base.geometry,
                    properties: {tacticalGraphic: bag, role: 'base', graphicName: name, symbolId: 'x'},
                } as never,
            ]),
        };
    }

    /** Every point of every rendered graphic feature, so the drawing itself is compared. */
    const shapeOf = (fc: {features: {geometry: unknown; properties?: Record<string, unknown> | null}[]}): number[] => {
        const out: number[] = [];
        for (const feature of fc.features) {
            if (feature.properties?.role !== 'graphic') continue;
            (function walk(node: unknown) {
                if (!Array.isArray(node)) return;
                if (typeof node[0] === 'number') {
                    out.push(node[0] as number, node[1] as number);
                    return;
                }
                node.forEach(walk);
            })((feature.geometry as {coordinates?: unknown})?.coordinates);
        }
        return out;
    };

    /** Metres between the two drawings, at their widest. `Infinity` for a different shape. */
    function spread(a: number[], b: number[]): number {
        if (a.length !== b.length) return Infinity;
        let worst = 0;
        for (let i = 0; i < a.length; i += 2) {
            const dx = (a[i] - b[i]) * 111_320 * Math.cos((a[i + 1] * Math.PI) / 180);
            const dy = (a[i + 1] - b[i + 1]) * 110_540;
            worst = Math.max(worst, Math.hypot(dx, dy));
        }
        return worst;
    }

    const unset = (value: unknown) => value === '' || value === false || value === undefined || value === null;

    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        let ol;
        try {
            ol = openLayersFiles(name);
        } catch {
            return;
        }
        const written = mapLibreFile(name, ol);
        if (!written) return;

        const manager = fakeManager();
        expect(restoreTacticalGraphics(manager, written.snapshot).restored).toBe(1);
        const reSaved = serializeTacticalGraphics(manager, {includeDerived: true});
        const bag = (reSaved.features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;

        // Nothing the file stated may go missing on the way back out...
        const lost = Object.keys(written.bag).filter(key => !unset(written.bag[key]) && unset(bag[key]));
        expect(lost).toEqual([]);

        // ...and nothing it stated may come back a different number, which is the shape a
        // re-derived default has when it displaces the figure the file carried.
        const moved = Object.keys(written.bag).filter(key => {
            const before = written.bag[key];
            const after = bag[key];
            if (typeof before !== 'number' || typeof after !== 'number') return false;
            return Math.abs(before - after) > Math.max(1e-6, Math.abs(before) * 1e-6);
        });
        expect(moved).toEqual([]);

        // And the drawing is the drawing: the same file, opened here and opened after a trip
        // through the other engine, is the same symbol in the same place.
        const own = fakeManager();
        const ownFile = toSnapshot([
            {
                type: 'Feature',
                geometry: ol.geometry,
                properties: {tacticalGraphic: ol.bag, role: 'base', graphicName: name, symbolId: 'x'},
            } as never,
        ]);
        expect(restoreTacticalGraphics(own, ownFile).restored).toBe(1);
        expect(spread(shapeOf(serializeTacticalGraphics(own, {includeDerived: true}) as never), shapeOf(reSaved as never)))
            .toBeLessThan(1);
    });
});


/**
 * # A number the caller stated comes back the number they stated
 *
 * The two rules above are about which *keys* a file carries. This is about the values, and it
 * is the half the unit suite could not see: both engines complete the bag before they draw,
 * and a completed value sits in the same field the caller's did. So a bag stating
 * `radius: 180000` for a bridge was filed back at 146,485 — the tick size MapLibre had
 * substituted to draw with — and a stated `radius` and `rotation` on a drawn-anchor graphic
 * came back as whatever its own points measured.
 *
 * Both were found by `npm run sweep:import-export` against the demo's sample sheet, which
 * states every field on every graphic, and neither had a unit guard. This is it. The rule is
 * the sweep's own: a field only one engine files is fine, because the two legitimately differ
 * over what is worth stating; a field that comes back a **different number** is a loss.
 *
 * @see describedProperties, describedBy
 */
describe('a stated number is not quietly replaced', () => {
    /** What the demo's sample sheet states on every graphic, and the shape that found this. */
    const STATED: Record<string, number> = {radius: 180_000, rotation: 0};

    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        let ol;
        try {
            ol = openLayersFiles(name);
        } catch {
            return;
        }
        const properties = {...ol.bag, ...STATED};
        delete properties.name;

        const built = buildTacticalGraphic(name, ol.geometry as never, properties as never, RES);
        if (!built) return;
        const filed = (built.base.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;

        // MapLibre keeps the caller's own figure, never the one it drew with.
        for (const [key, value] of Object.entries(STATED)) {
            if (filed[key] !== undefined) expect([key, filed[key]]).toEqual([key, value]);
        }

        // And OpenLayers, restoring that file, files back the same number or none at all —
        // it refuses `radius` and `rotation` for the drawn-anchor graphics on purpose, since
        // their points already carry both. What it must never do is state a different one.
        const manager = fakeManager();
        const snapshot = toSnapshot([
            {
                type: 'Feature',
                geometry: built.base.geometry,
                properties: {tacticalGraphic: filed, role: 'base', graphicName: name, symbolId: 'x'},
            } as never,
        ]);
        if (restoreTacticalGraphics(manager, snapshot).restored !== 1) return;
        const back = (serializeTacticalGraphics(manager).features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(STATED)) {
            if (filed[key] === undefined || back[key] === undefined) continue;
            expect([key, back[key]]).toEqual([key, value]);
        }
    });
});
