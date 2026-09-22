import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {
    ROADBLOCK_MAX_HALF_WIDTH_RATIO,
    ROADBLOCK_MIN_HALF_WIDTH_RATIO,
    TacticalGraphicName,
    baseVertexCount,
    carriesSeparationInBase,
    dropSizePx,
    editStretches,
    handlesAreInert,
    normalizeDrawnBase,
    renderTacticalGraphic,
    usesDrawnAnchors,
} from '@zaes/tactical-graphics';
import {barSymbolStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const PLANNED = TacticalGraphicName.ExplosivesPlannedStateOfReadiness;
const SAFE = TacticalGraphicName.ExplosivesStateOfReadiness1Safe;
const ARMED = TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable;
const NAMES = [PLANNED, SAFE, ARMED];
const ROADBLOCK = TacticalGraphicName.RoadblockCompleteExecuted;
/** The four demolition obstacles: the three states of readiness and roadblock complete. */
const FAMILY = [...NAMES, ROADBLOCK];

/**
 * The three readiness states are a **drawn centerline with a width**, per APP-06
 * 271201 — "points 1 and 2 determine the centerline of the symbol and point 3
 * determines its width" — with FM 1-02.2's plate agreeing. They were point-anchored
 * at a fixed 45° bearing until 2026-08-13, so a demolition could not be laid across a
 * road running any other way. @see ai/app-6.md, "F2"
 *
 * Roadblock complete is the fourth member since 2026-09-21: the same construction, with the
 * pair turned a quarter-turn and drawn again. Its own describe block is at the end.
 */
const render = (name: TacticalGraphicName, width = 1200, coords = [[0, 0], [0.4, 0.4]]) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name, width}},
    } as any) as any;

/** Which bars the style function dashes, left rail first. */
const dashes = (name: TacticalGraphicName) => {
    const bars = render(name).graphic.geometry.coordinates;
    const styles = barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
    return styles.map(s => !!s.getStroke().getLineDash());
};

describe('explosives states of readiness', () => {
    // The three are one shape; the dashing is the entire difference between them, so it is
    // the only thing worth asserting hard. Straight off the FM 1-02.2 table 5-19 plates,
    // and APP-06's templates draw them identically.
    it('dashes each state the way the plate does', () => {
        expect(dashes(PLANNED)).toEqual([true, true]);
        expect(dashes(SAFE)).toEqual([true, false]); // left hashed, right solid
        expect(dashes(ARMED)).toEqual([false, false]);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s draws two parallel rails', (_l, name) => {
        const bars = render(name).graphic.geometry.coordinates;
        expect(bars.length).toBe(2);
        const heading = (b: number[][]) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
        expect(heading(bars[0])).toBeCloseTo(heading(bars[1]), 3);
        for (const bar of bars) for (const c of bar) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    });

    // The movement family's contract: `[start, end, width]`. Reversing it silently breaks
    // both the vertex drag and the width drag.
    it.each(NAMES.map(n => [String(n), n] as const))('%s emits [start, end, width] handles', (_l, name) => {
        const handles = render(name).handles.geometry.coordinates;
        expect(handles.length).toBe(3);
        expect(handles[0]).toEqual([0, 0]);
        expect(handles[1][0]).toBeCloseTo(0.4, 6);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s carries no amplifiers but does carry hostility', (_l, name) => {
        expect(render(name).labels.geometry.coordinates).toEqual([]);
        const fields = getGraphicFields(name);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
        expect(fields.hostility).toBe(true);
    });

    // The whole point of the change: the symbol lies along whatever the user drew,
    // rather than at a fixed 45°.
    it.each(NAMES.map(n => [String(n), n] as const))('%s follows the drawn line’s bearing', (_l, name) => {
        const heading = (coords: number[][]) => {
            const b = render(name, 1200, coords).graphic.geometry.coordinates[0];
            return Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
        };
        const east = heading([[0, 0], [0.5, 0]]);
        const north = heading([[0, 0], [0, 0.5]]);
        expect(Math.abs(east - north)).toBeGreaterThan(1); // radians: nowhere near parallel
    });

    it('separates the rails by the width it is given', () => {
        const gap = (width: number) => {
            const [left, right] = render(ARMED, width).graphic.geometry.coordinates;
            return Math.hypot(left[0][0] - right[0][0], left[0][1] - right[0][1]);
        };
        expect(gap(4000)).toBeGreaterThan(gap(1200));
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString([])}) as any, 20)).not.toThrow();
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new Point([0, 0])}) as any, 20)).not.toThrow();
            expect(() => render(name, 1200, [[0, 0]])).not.toThrow();
        }
    });

    /**
     * Through the *holder*, not the style function. Every assertion above called
     * `barSymbolStyleFunc` directly, which is how a dash length of
     * `[10 * resolution, 7 * resolution]` shipped: OL's lineDash is canvas pixels, so at a
     * real resolution the dash became 200 px on a bar 50 px long and every state rendered
     * solid. Calling the function proves the flag; only drawing proves the dash.
     */
    it.each(NAMES.map(n => [String(n), n] as const))('%s dashes visibly at map scale', (_l, name) => {
        const res = 20;
        const handler: any = getController(name, res);
        handler.setBaseFeature(new Feature({geometry: new (require('ol/geom/LineString').default)([[500000, 2000000], [502000, 2002000]])}));
        const graphic = handler.getFeatures().find((f: any) => f.get('role') === 'graphic');
        const styles = (graphic.getStyle() as any)(graphic, res);

        // The rails are ~2800 m long at this base, i.e. 140 px at resolution 20.
        const railPx = 140;
        for (const st of styles) {
            const dash = st.getStroke()?.getLineDash();
            if (!dash) continue;
            // A dash longer than the rail it is drawn on is indistinguishable from solid.
            expect(Math.max(...dash)).toBeLessThan(railPx / 2);
        }
    });

    /**
     * **Three placed points as of 2026-09-05**, not two and a derived offset.
     *
     * 271201 names them and the third does a job of its own: *"point 3 defines the location
     * of one side of the symbol"*. It was a width amplifier the offset handle set; it is a
     * stored vertex now, so the separation is measured from the coordinates and every one of
     * the three is grabbable. @see carriesSeparationInBase
     */
    it.each(FAMILY.map(n => [String(n), n] as const))('%s is drawn from three placed points', (_l, name) => {
        const controller: any = getController(name, 20);
        expect(controller).toBeInstanceOf(LineGraphicController);
        expect(controller.maxPoints).toBe(3);
        expect(baseVertexCount(name)).toBe(3);
        // All three move independently: an end lengthens the symbol, the side widens it.
        expect(controller.dragsVertices).toBe(true);
        // ...and a drag that grabs none of them does not quietly scale the whole graphic,
        // which would move the length and the width at once. @see NO_EDIT_STRETCH
        expect(editStretches(name)).toBe(false);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps no width beside its base', (_l, name) => {
        // The coordinates carry the separation, so a stamped width would be a second copy.
        expect(carriesSeparationInBase(name)).toBe(true);
    });
});

/*
 * # 271204, the fourth demolition obstacle
 *
 * FM 1-02.2 lists roadblock complete (executed) under "Demolition Obstacle Symbol —
 * obstacles created using explosives", after the three states of readiness; APP-06 puts it
 * after 271201-271203 with an empty Draw Rules cell, inheriting 271201's centreline and
 * width. So its first pair of bars is the readiness states' pair, and its second is the same
 * pair turned a quarter-turn. (User's call, 2026-09-21.) The earlier readings it replaces are
 * in ai/excluded-graphics.md.
 */
describe('roadblock complete (executed)', () => {
    const BASE = [[0, 0], [0.4, 0.4], [0.17, 0.23]];
    const rendered = (coords = BASE, props: Record<string, unknown> = {}) =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {tacticalGraphic: {name: ROADBLOCK, ...props}},
        } as any) as any;
    const armed = (coords = BASE) =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {tacticalGraphic: {name: ARMED}},
        } as any) as any;
    const lengthOf = (b: number[][]) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]);
    const bearingOf = (b: number[][]) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
    const midOf = (b: number[][]) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];

    it('draws the readiness states’ own pair first, bar for bar', () => {
        const bars = rendered().graphic.geometry.coordinates;
        const rails = armed().graphic.geometry.coordinates;
        expect(bars).toHaveLength(4);
        expect(bars.slice(0, 2)).toEqual(rails);
    });

    it('draws the second pair as the first turned a quarter-turn about the midpoint', () => {
        const [a, b, c, d] = rendered().graphic.geometry.coordinates;
        const quarter = Math.PI / 2;
        const turn = Math.abs(((bearingOf(c) - bearingOf(a) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        // Perpendicular, whichever way round the bearings come out; a degree of slack for the
        // difference between a geodesic quarter-turn and one measured in degrees.
        expect(Math.abs(turn - quarter)).toBeLessThan(0.02);
        expect(lengthOf(c)).toBeCloseTo(lengthOf(a), 2);
        expect(lengthOf(d)).toBeCloseTo(lengthOf(b), 2);
        // All four centred on the same point: the centreline's midpoint.
        const centre = midOf([BASE[0], BASE[1]]);
        for (const [x, y] of [[a, b], [c, d]]) {
            const m = midOf([midOf(x), midOf(y)]);
            expect(m[0]).toBeCloseTo(centre[0], 3);
            expect(m[1]).toBeCloseTo(centre[1], 3);
        }
    });

    it('publishes the grips the readiness states publish', () => {
        expect(rendered().handles.geometry.coordinates).toEqual(armed().handles.geometry.coordinates);
    });

    it('is drawn, not dropped, and every grip answers', () => {
        expect(dropSizePx(ROADBLOCK)).toBeUndefined();
        expect(usesDrawnAnchors(ROADBLOCK)).toBe(false);
        expect(handlesAreInert(ROADBLOCK)).toBe(false);
    });

    it('normalizes a dragged side point exactly as the readiness states do, inside its limits', () => {
        // Across by an eighth of the centreline, well inside the limits.
        const dragged = [[0, 0], [0.4, 0.4], [0.25, 0.15]];
        expect(normalizeDrawnBase(ROADBLOCK, dragged, 20)).toEqual(normalizeDrawnBase(ARMED, dragged, 20));
    });

    it('stores point 3 where the bar is drawn when it is dragged past the ceiling', () => {
        // Drawn clamped either way; stored raw, a saved file said something the picture did not.
        const stored = normalizeDrawnBase(ROADBLOCK, [[0, 0], [0.4, 0], [0.2, 0.3]], 20) as number[][];
        expect(stored[2][1]).toBeCloseTo(0.4 * ROADBLOCK_MAX_HALF_WIDTH_RATIO, 3);
        expect(stored[2][0]).toBeCloseTo(0.2, 3);
    });

    describe('the width point 3 may set', () => {
        // A centreline 0.4 degrees east-west at the equator, so a degree is a fixed distance.
        const line = [[0, 0], [0.4, 0]];
        const across = (bars: number[][][]) => Math.abs(midOf(bars[0])[1] - midOf(bars[1])[1]) / 2;

        it('stops before the crossings reach halfway to the bar ends', () => {
            const bars = rendered([...line, [0.2, 0.3]]).graphic.geometry.coordinates;
            expect(across(bars)).toBeCloseTo(0.4 * ROADBLOCK_MAX_HALF_WIDTH_RATIO, 3);
            // The readiness states have no such ceiling, which is the difference.
            const rails = armed([...line, [0.2, 0.3]]).graphic.geometry.coordinates;
            expect(across(rails)).toBeCloseTo(0.3, 3);
        });

        it('keeps a floor, so the two crosses never become one', () => {
            const bars = rendered([...line, [0.2, 0.0001]]).graphic.geometry.coordinates;
            expect(across(bars)).toBeCloseTo(0.4 * ROADBLOCK_MIN_HALF_WIDTH_RATIO, 3);
        });

        it('publishes the side grip on the bar it draws, at the clamped width', () => {
            const out = rendered([...line, [0.2, 0.3]]);
            const side = out.handles.geometry.coordinates[2];
            expect(side[1]).toBeCloseTo(0.4 * ROADBLOCK_MAX_HALF_WIDTH_RATIO, 3);
            expect(side[0]).toBeCloseTo(0.2, 3);
        });
    });

    it('opens a file saved by 3.4.0 as one dropped point', () => {
        const bars = rendered([[0, 0]], {size: 60_000}).graphic.geometry.coordinates;
        expect(bars).toHaveLength(4);
    });

    it('draws every bar solid', () => {
        const bars = rendered().graphic.geometry.coordinates;
        const styles = barSymbolStyleFunc(ROADBLOCK)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
        expect(styles.length).toBe(4);
        for (const st of styles) expect(st.getStroke().getLineDash()).toBeFalsy();
    });
});
