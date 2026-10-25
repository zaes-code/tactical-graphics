/**
 * Smooth lines, across every graphic on the sample sheet.
 *
 * The setting reshapes line work and nothing else, and only for the graphics
 * `SMOOTHED_GRAPHICS` names. These pin both halves, plus the rebuild every renderer runs when
 * the setting changes: with nothing changed it has to reproduce the graphic exactly, or turning
 * the setting on and off again would move graphics it never touched.
 */
import {
    carriesWidthPointInBase,
    configureTacticalGraphics,
    rebuildPaintedGraphic,
    resetTacticalGraphicsConfig,
    smoothingKindOf,
    type PaintedGraphic,
} from '@zaes/tactical-graphics';
import {buildSampleGraphics} from './sampleGallery';

const resolution = 150;

/** Every number in a geometry, in order. */
const numbers = (x: unknown): number[] =>
    Array.isArray(x) ? x.flatMap(numbers) : typeof x === 'number' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(numbers) : [];

/**
 * Whether two geometries are the same within a millimeter. A rebuild is not bit for bit: the
 * generators walk geodesically and come back through the projection, which lands a few
 * micrometers away.
 */
const same = (a: unknown, b: unknown): boolean => {
    const [x, y] = [numbers(a), numbers(b)];
    return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-3);
};

/** The drawn points the curve runs through: an area's corners, or a line's route without an axis arrow's width point. */
function routePoints(graphic: PaintedGraphic): number {
    const g = graphic.base.geometry;
    if (g.type === 'Polygon') return g.coordinates[0].length - 1;
    if (g.type !== 'LineString') return 0;
    return g.coordinates.length - (carriesWidthPointInBase(graphic.name) ? 1 : 0);
}

/** A movement label's span: the two anchors every layout starts with. */
function leadingAnchors(graphic: PaintedGraphic): unknown {
    const g = graphic.labels?.geometry;
    return g?.type === 'MultiPoint' ? g.coordinates.slice(0, 2) : g;
}

/** Fewest route points with a corner to round: an arrow keeping both end segments needs a third. */
function pointsToSmooth(graphic: PaintedGraphic): number {
    const kind = smoothingKindOf(graphic.name);
    return kind === 'arrowFixedTail' || kind === 'corridorFixedTail' ? 4 : 3;
}

describe('smooth lines', () => {
    afterEach(() => resetTacticalGraphicsConfig());

    const hard = buildSampleGraphics(undefined, resolution).graphics;

    it('the sample sheet reaches every smoothed graphic', () => {
        const drawn = new Set(hard.map(g => g.name));
        const smoothed = hard.filter(g => smoothingKindOf(g.name)).map(g => g.name);
        expect(smoothed.length).toBeGreaterThan(100);
        expect(drawn.size).toBeGreaterThan(300);
    });

    it('a rebuild with nothing changed reproduces every graphic exactly', () => {
        const moved = hard.filter(graphic => {
            const rebuilt = rebuildPaintedGraphic(graphic);
            return !same(rebuilt.graphic.geometry, graphic.graphic.geometry) || !same(rebuilt.handles, graphic.handles)
                || !same(rebuilt.labels?.geometry, graphic.labels?.geometry);
        });
        expect(moved.map(g => g.name)).toEqual([]);
    });

    it('reshapes the line work of the listed graphics and never their base, handles or labels', () => {
        configureTacticalGraphics({smoothLines: true});
        const reshaped: string[] = [];
        const touchedOther: string[] = [];
        const missed: string[] = [];
        for (const graphic of hard) {
            const smooth = rebuildPaintedGraphic(graphic);
            // Group or series of targets anchors its name on the outline it draws, which is the point.
            // The corridor arrows publish the rounded center line after their label span, for a long
            // label to bend along; the span itself stays put. @see MovementGraphicBase.labelPath
            const corridor = /^corridor/.test(smoothingKindOf(graphic.name) ?? '');
            const labelsKept = graphic.name === 'GroupOrSeriesOfTargets'
                || (corridor ? same(leadingAnchors(smooth), leadingAnchors(graphic)) : same(smooth.labels?.geometry, graphic.labels?.geometry));
            if (!same(smooth.base.geometry, graphic.base.geometry) || !same(smooth.handles, graphic.handles) || !labelsKept) {
                touchedOther.push(graphic.name);
            }
            const moved = !same(smooth.graphic.geometry, graphic.graphic.geometry);
            if (moved) reshaped.push(graphic.name);
            if (!smoothingKindOf(graphic.name) && moved) touchedOther.push(graphic.name);
            // A free path of three or more points is what the setting is for.
            if (smoothingKindOf(graphic.name) && routePoints(graphic) >= pointsToSmooth(graphic) && !moved) missed.push(graphic.name);
        }
        expect(touchedOther).toEqual([]);
        expect(missed).toEqual([]);
        expect(reshaped.length).toBeGreaterThan(100);
    });

    it('turning it off again restores the hard drawing', () => {
        configureTacticalGraphics({smoothLines: true});
        const smooth = hard.map(rebuildPaintedGraphic);
        configureTacticalGraphics({smoothLines: false});
        const back = smooth.map(rebuildPaintedGraphic);
        expect(back.filter((graphic, i) => !same(graphic.graphic.geometry, hard[i].graphic.geometry)).map(g => g.name)).toEqual([]);
    });
});
