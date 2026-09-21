/**
 * Every dashed line is sized to its graphic and capped at the planned dash.
 *
 * Two rules used to decide a dash's size, and both were wrong at one end: a status dash
 * was a fixed 12/8 px however small the graphic, and a symbol dash was cut into the
 * geometry in meters, so it grew with the zoom without limit. @see withFittedDashes
 */

import {getPaintFunction, isPaintable} from './registry';
import {
    DASH_CAP_PX,
    DASH_FULL_SIZE_PX,
    DASH_SCALE_STEPS,
    PLANNED_DASH_PX,
    dashScale,
    fitDash,
    strokeParts,
    strokedExtentPx,
    withFittedDashes,
} from './dashFit';
import {CIRCLED_STATUS_DASH_PX} from './paintFunctions';
import type {Paint, PaintContext, PaintFeature, ProjectedGeometry} from '../core/paint';
import {DASHED_PARTS} from '../core/dashedParts';
import {renderTacticalGraphic, baseGeometryFor, listTacticalGraphicNames} from '../core/render';
import {baseVertexCount} from '../core/handles';
import {storedOrder} from '../core/drawOrder';
import {TacticalGraphicName, TacticalGraphicStatus} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';

const measureText = (text: string, font: string) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6;
const at = (resolution: number): PaintContext => ({resolution, measureText});

/** A horizontal line `px` screen pixels long at resolution 1. */
const lineOf = (px: number, dashPx?: number[]): Paint => ({
    geometry: {type: 'LineString', coordinates: [[0, 0], [px, 0]]},
    stroke: {color: '#000', widthPx: 2, ...(dashPx ? {dashPx} : {})},
});

beforeEach(() => resetTacticalGraphicsConfig());

describe('dashScale', () => {
    it('is full size from DASH_FULL_SIZE_PX up, and never more', () => {
        expect(dashScale(DASH_FULL_SIZE_PX)).toBe(1);
        expect(dashScale(DASH_FULL_SIZE_PX * 50)).toBe(1);
    });

    it('steps down with the shape and stops at the floor', () => {
        expect(dashScale(DASH_FULL_SIZE_PX * 0.8)).toBe(0.75);
        expect(dashScale(DASH_FULL_SIZE_PX * 0.5)).toBe(0.5);
        expect(dashScale(DASH_FULL_SIZE_PX * 0.3)).toBe(0.25);
        // A dash stays a dash: a planned line drawn solid would state the wrong status.
        expect(dashScale(1)).toBe(0.25);
        expect(dashScale(0)).toBe(DASH_SCALE_STEPS[DASH_SCALE_STEPS.length - 1]);
    });

    it('only ever answers one of the steps, so MapLibre sees a bounded set of patterns', () => {
        for (let px = 0; px < DASH_FULL_SIZE_PX * 2; px += 3) {
            expect(DASH_SCALE_STEPS).toContain(dashScale(px));
        }
    });
});

describe('fitDash', () => {
    it('leaves the planned dash alone at full size, and it is the cap', () => {
        expect(fitDash(PLANNED_DASH_PX, 1)).toEqual([12, 8]);
        expect(DASH_CAP_PX).toBe(12);
    });

    it('caps a longer pattern, keeping its proportions', () => {
        // The circled status ring: still a dash-dot, just no longer than the planned dash.
        expect(fitDash(CIRCLED_STATUS_DASH_PX, 1)).toEqual([12, 4, 2, 4]);
    });

    it('never draws a segment under a pixel, so a dash-dot keeps its dot', () => {
        expect(Math.min(...fitDash(CIRCLED_STATUS_DASH_PX, 0.25))).toBeGreaterThanOrEqual(1);
    });
});

describe('withFittedDashes', () => {
    it('shrinks the planned dash on a small graphic', () => {
        const [fitted] = withFittedDashes([lineOf(40, PLANNED_DASH_PX)], at(1));
        expect(fitted.stroke?.dashPx).toEqual([3, 2]);
    });

    it('gives every dash on one graphic the same scale, however short its own line', () => {
        const fitted = withFittedDashes([lineOf(400), lineOf(20, PLANNED_DASH_PX), lineOf(400, PLANNED_DASH_PX)], at(1));
        expect(fitted[1].stroke?.dashPx).toEqual(fitted[2].stroke?.dashPx);
        expect(fitted[1].stroke?.dashPx).toEqual([12, 8]);
    });

    it('measures the shape on screen, so zooming out shrinks the dash and zooming in stops at the cap', () => {
        const paints = [lineOf(1000, PLANNED_DASH_PX)];
        expect(withFittedDashes(paints, at(1))[0].stroke?.dashPx).toEqual([12, 8]);
        expect(withFittedDashes(paints, at(0.01))[0].stroke?.dashPx).toEqual([12, 8]);
        expect(withFittedDashes(paints, at(20))[0].stroke?.dashPx).toEqual([3, 2]);
    });

    it('caps a dash a mark sized for itself, and does not rescale it', () => {
        const own: Paint = {...lineOf(1000, [6, 4]), stroke: {color: '#000', widthPx: 2, dashPx: [6, 4], dashSized: true}};
        const fitted = withFittedDashes([lineOf(20, PLANNED_DASH_PX), own], at(1));
        expect(fitted[0].stroke?.dashPx).toEqual([12, 8]);
        expect(fitted[1].stroke?.dashPx).toEqual([6, 4]);
        const long: Paint = {...own, stroke: {...own.stroke!, dashPx: [30, 10]}};
        expect(withFittedDashes([long], at(1))[0].stroke?.dashPx).toEqual([12, 4]);
    });

    it('leaves a list with no dash untouched', () => {
        const paints = [lineOf(40)];
        expect(withFittedDashes(paints, at(1))).toBe(paints);
    });

    it('does not count a label toward the shape', () => {
        const text: Paint = {geometry: {type: 'Point', coordinates: [5000, 0]}, text: {text: 'A', font: 'bold 16px sans-serif', fill: '#000'}} as Paint;
        expect(strokedExtentPx([lineOf(40, PLANNED_DASH_PX), text], 1)).toBe(40);
    });
});

describe('strokeParts', () => {
    const parts: [number, number][][] = [[[0, 0], [1, 0]], [[0, 1], [1, 1]], [[0, 2], [1, 2]], [[0, 3], [1, 3]]];
    const stroke = {color: '#000', widthPx: 2};

    it('dashes exactly the parts DASHED_PARTS names', () => {
        const [solid, dashed] = strokeParts(TacticalGraphicName.MainAxisOfAdvanceFeint, parts, stroke);
        expect(solid.geometry.coordinates).toEqual(parts.slice(0, 3));
        expect(solid.stroke?.dashPx).toBeUndefined();
        expect(dashed.geometry.coordinates).toEqual([parts[3]]);
        expect(dashed.stroke?.dashPx).toEqual(PLANNED_DASH_PX);
    });

    it('counts from firstIndex when the caller drew the leading parts itself', () => {
        const out = strokeParts(TacticalGraphicName.DirectionOfMainAttackFeint, parts.slice(1, 3), stroke, 1);
        expect(out[1].geometry.coordinates).toEqual([parts[2]]);
    });

    it('strokes a graphic with no dashed parts as one solid mark', () => {
        const out = strokeParts(TacticalGraphicName.MainAxisOfAdvance, parts, stroke);
        expect(out).toHaveLength(1);
        expect(out[0].stroke?.dashPx).toBeUndefined();
    });
});

// ── across the catalog ──────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6378137;
const toMercator = ([lon, lat]: number[]): [number, number] => [
    (EARTH_RADIUS_M * lon * Math.PI) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

function project(geometry: {type: string; coordinates?: unknown; geometries?: unknown[]}): ProjectedGeometry {
    if (geometry.type === 'GeometryCollection') {
        return {type: 'GeometryCollection', geometries: (geometry.geometries ?? []).map(g => project(g as never))} as unknown as ProjectedGeometry;
    }
    const walk = (c: unknown): unknown => (typeof (c as number[])[0] === 'number' ? toMercator(c as number[]) : (c as unknown[]).map(walk));
    return {type: geometry.type, coordinates: walk(geometry.coordinates)} as ProjectedGeometry;
}

function baseFor(name: TacticalGraphicName) {
    const kind = baseGeometryFor(name);
    if (kind === 'Point') return {type: 'Point' as const, coordinates: [10, 40]};
    if (kind === 'Polygon') {
        return {type: 'Polygon' as const, coordinates: [[[10, 40], [10.6, 40], [10.6, 40.4], [10, 40.4], [10, 40]]]};
    }
    const wanted = Math.max(2, baseVertexCount(name) ?? 3);
    const run = Array.from({length: wanted}, (_, i) => [10 + i * 0.35, 40 + (i % 2) * 0.12]);
    return {type: 'LineString' as const, coordinates: storedOrder(name, run)};
}

/** Each half's paints for one graphic, fitted as the renderers fit them. */
function fittedHalves(name: TacticalGraphicName, status: TacticalGraphicStatus, resolution: number): Paint[][] {
    const painters = getPaintFunction(name);
    if (!painters) return [];
    const properties = {name, status, radius: 20_000, decorationSize: 20_000, width: 20_000, rotation: 0} as never;
    const rendered = renderTacticalGraphic({type: 'Feature', geometry: baseFor(name) as never, properties: {tacticalGraphic: properties}} as never);
    const featureFor = (geometry: unknown): PaintFeature =>
        ({geometry: project(geometry as never), properties, graphicSize: 20_000, bounds: {minX: -3e6, minY: -3e6, maxX: 3e6, maxY: 3e6}}) as unknown as PaintFeature;
    const context = at(resolution);
    const halves: Paint[][] = [];
    if (rendered.graphic && painters.graphic) halves.push(withFittedDashes(painters.graphic(featureFor(rendered.graphic.geometry), context), context));
    if (rendered.labels && painters.label) halves.push(withFittedDashes(painters.label(featureFor(rendered.labels.geometry), context), context));
    return halves;
}

const ALL = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(isPaintable);

/** From a graphic a few pixels across to one filling several screens. */
const RESOLUTIONS = [5, 60, 800, 20_000];

describe('every dashed line in the catalog', () => {
    it('is never longer than the planned dash, nor under a pixel, at any zoom', () => {
        const wrong: string[] = [];
        let dashedSeen = 0;
        for (const name of ALL) {
            for (const resolution of RESOLUTIONS) {
                for (const half of fittedHalves(name, TacticalGraphicStatus.planned, resolution)) {
                    for (const paint of half) {
                        const dash = paint.stroke?.dashPx;
                        if (!dash?.length) continue;
                        dashedSeen++;
                        if (Math.max(...dash) > DASH_CAP_PX || Math.min(...dash) < 1) wrong.push(`${name} @${resolution}: [${dash}]`);
                    }
                }
            }
        }
        expect(dashedSeen).toBeGreaterThan(200);
        expect(wrong).toEqual([]);
    });

    it('carries one dash size per graphic', () => {
        const mixed: string[] = [];
        for (const name of ALL) {
            for (const resolution of RESOLUTIONS) {
                for (const half of fittedHalves(name, TacticalGraphicStatus.planned, resolution)) {
                    // Every pattern in the half, put back to full size, must have been scaled
                    // by the same factor. The planned dash is the common case.
                    // A mark that sizes its own dash is the stated exception. @see dashSized
                    const scales = new Set(
                        half
                            .filter(p => p.stroke?.dashPx?.length && !p.stroke.dashSized)
                            .map(p => (p.stroke!.dashPx![0] / fitDash([...PLANNED_DASH_PX], 1)[0]).toFixed(3))
                            .filter(s => DASH_SCALE_STEPS.map(x => x.toFixed(3)).includes(s)),
                    );
                    if (scales.size > 1) mixed.push(`${name} @${resolution}: ${[...scales]}`);
                }
            }
        }
        expect(mixed).toEqual([]);
    });
});

describe('the graphics whose dash is the symbol', () => {
    const NAMES = Object.keys(DASHED_PARTS) as TacticalGraphicName[];

    it('are seven, and every index they name is a part their generator returns', () => {
        expect(NAMES).toHaveLength(7);
        for (const name of NAMES) {
            const rendered = renderTacticalGraphic({type: 'Feature', geometry: baseFor(name) as never, properties: {tacticalGraphic: {name, radius: 20_000}}} as never);
            const parts = (rendered.graphic.geometry as {coordinates: unknown[]}).coordinates;
            for (const index of DASHED_PARTS[name]!) expect(index).toBeLessThan(parts.length);
            expect(rendered.graphic.properties?.dashedParts).toEqual(DASHED_PARTS[name]);
        }
    });

    it('draw dashed when present, at every zoom, and within the cap', () => {
        for (const name of NAMES) {
            for (const resolution of RESOLUTIONS) {
                const dashes = fittedHalves(name, TacticalGraphicStatus.present, resolution)
                    .flat()
                    .map(p => p.stroke?.dashPx)
                    .filter((d): d is number[] => !!d?.length);
                expect(dashes.length).toBeGreaterThan(0);
                dashes.forEach(d => expect(Math.max(...d)).toBeLessThanOrEqual(DASH_CAP_PX));
            }
        }
    });
});
