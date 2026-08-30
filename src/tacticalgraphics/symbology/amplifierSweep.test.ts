/**
 * # Every graphic, with its amplifiers and without them
 *
 * `hideAmplifiers.test.ts` states the rule and checks it on a corridor. This is the sweep:
 * all 291 paintable graphics, each painted twice, with every amplifier the schema offers
 * set to a value nothing else could produce.
 *
 * It exists because the rule is enforced **per mark** — `withHiddenAmplifiers` drops a
 * paint whose `text.kind` is `amplifier` — while several paints stack an annotation and a
 * designation into *one* mark. Those cannot be filtered out; the amplifier line has to be
 * emptied inside the stack, which is what `amplifierText` is for. Nothing made a paint
 * author choose between the two, so eleven graphics leaked: the date range under a
 * coordinated fire line, a munition flight path and a passage lane; field H on human
 * terrain, the two restricted terrains, the three psyops zones and the limited access
 * area; and the weapon under a final protective fire.
 *
 * A per-graphic test would not have found them, because each looked right on its own —
 * the text was drawn, and the toggle was never asked about it. What catches this is
 * asking the same question of every graphic at once.
 *
 * Through the **paint layer**, not one renderer's style functions, so what it holds holds
 * for both engines.
 */

import {getPaintFunction, isPaintable} from './registry';
import {withHiddenAmplifiers} from './paintFunctions';
import type {Paint, PaintContext, PaintFeature, ProjectedGeometry} from '../core/paint';
import {renderTacticalGraphic, baseGeometryFor, listTacticalGraphicNames} from '../core/render';
import {baseVertexCount} from '../core/handles';
import {storedOrder} from '../core/drawOrder';
import {getLabel, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';

/** The designation, which must survive. Deliberately not in {@link AMPLIFIER_MARKERS}. */
const DESIGNATION = 'ALPHA';

/** Values only an amplifier could have put on the map. */
const AMPLIFIER_MARKERS = ['011200ZJUL', '021800ZJUL', 'TYPE II', 'GRIDREF', 'M203', 'EFFTXT'];

const BAG = {
    rotation: 0,
    radius: 20_000,
    decorationSize: 20_000,
    width: 20_000,
    designation: DESIGNATION,
    secondDesignation: 'BRAVO',
    additionalInfo: 'TYPE II',
    startDate: '011200ZJUL',
    endDate: '021800ZJUL',
    minAltitude: 1500,
    maxAltitude: 9000,
    grid: 'GRIDREF',
    weapon: 'M203',
    eff: 'EFFTXT',
};

/** A base with the vertex count the graphic actually takes, in the order it is stored in. */
function baseFor(name: TacticalGraphicName) {
    const kind = baseGeometryFor(name);
    if (kind === 'Point') return {type: 'Point' as const, coordinates: [10, 40]};
    if (kind === 'Polygon') {
        return {
            type: 'Polygon' as const,
            coordinates: [
                [
                    [10, 40],
                    [10.6, 40],
                    [10.6, 40.4],
                    [10, 40.4],
                    [10, 40],
                ],
            ],
        };
    }
    const wanted = Math.max(2, baseVertexCount(name) ?? 3);
    const run = Array.from({length: wanted}, (_, i) => [10 + i * 0.35, 40 + (i % 2) * 0.12]);
    return {type: 'LineString' as const, coordinates: storedOrder(name, run)};
}

const EARTH_RADIUS_M = 6378137;

/** Degrees to the projected metres a paint function is handed. */
const toMercator = ([lon, lat]: number[]): [number, number] => [
    (EARTH_RADIUS_M * lon * Math.PI) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

function project(geometry: {type: string; coordinates?: unknown; geometries?: unknown[]}): ProjectedGeometry {
    if (geometry.type === 'GeometryCollection') {
        return {
            type: 'GeometryCollection',
            geometries: (geometry.geometries ?? []).map(g => project(g as never)),
        } as unknown as ProjectedGeometry;
    }
    const walk = (c: unknown): unknown => (typeof (c as number[])[0] === 'number' ? toMercator(c as number[]) : (c as unknown[]).map(walk));
    return {type: geometry.type, coordinates: walk(geometry.coordinates)} as ProjectedGeometry;
}

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/**
 * Every line of text the graphic draws, after the hide rule has been applied.
 *
 * **Per line, not per mark.** A stacked label is one string with newlines, and comparing
 * whole strings makes the line that survives look like text that appeared when the rest
 * of the stack went.
 */
function linesFor(name: TacticalGraphicName, extra: Record<string, unknown>): string[] {
    const painters = getPaintFunction(name);
    if (!painters) return [];

    const {hideAmplifiers, ...bag} = {...BAG, ...extra} as Record<string, unknown>;
    const properties = {name, ...bag} as never;
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        geometry: baseFor(name) as never,
        properties: {tacticalGraphic: properties},
    } as never);

    const featureFor = (geometry: unknown): PaintFeature =>
        ({
            geometry: project(geometry as never),
            properties,
            graphicSize: 20_000,
            hideAmplifiers,
            bounds: {minX: -3e6, minY: -3e6, maxX: 3e6, maxY: 3e6},
        }) as unknown as PaintFeature;

    const drawn: Paint[] = [];
    if (rendered.graphic) drawn.push(...(painters.graphic?.(featureFor(rendered.graphic.geometry), context) ?? []));
    if (rendered.labels) drawn.push(...(painters.label?.(featureFor(rendered.labels.geometry), context) ?? []));

    const out: string[] = [];
    for (const paint of withHiddenAmplifiers(drawn, hideAmplifiers as boolean | undefined)) {
        if (!paint.text?.text) continue;
        for (const line of String(paint.text.text).split(/\r?\n/)) {
            const trimmed = line.replace(/\s+/g, ' ').trim();
            if (trimmed) out.push(trimmed);
        }
    }
    return out;
}

const ALL = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(isPaintable);

beforeEach(() => resetTacticalGraphicsConfig());

describe('hideAmplifiers, across every graphic', () => {
    it('sweeps a meaningful number of graphics', () => {
        expect(ALL.length).toBeGreaterThan(280);
    });

    it('drops every annotation, on every graphic', () => {
        const leaked: string[] = [];
        for (const name of ALL) {
            const hidden = linesFor(name, {hideAmplifiers: true});
            const survivors = hidden.filter(line => AMPLIFIER_MARKERS.some(marker => line.includes(marker)));
            if (survivors.length) leaked.push(`${name}: ${JSON.stringify(survivors)}`);
        }
        expect(leaked).toEqual([]);
    });

    it('keeps the symbol — its doctrinal abbreviation and its designation', () => {
        const lost: string[] = [];
        for (const name of ALL) {
            const shown = linesFor(name, {});
            const hidden = linesFor(name, {hideAmplifiers: true});

            const doctrinal = getLabel(name);
            if (doctrinal && shown.some(l => l.includes(doctrinal)) && !hidden.some(l => l.includes(doctrinal))) {
                lost.push(`${name}: doctrinal "${doctrinal}"`);
            }
            if (shown.some(l => l.includes(DESIGNATION)) && !hidden.some(l => l.includes(DESIGNATION))) {
                lost.push(`${name}: designation`);
            }
        }
        expect(lost).toEqual([]);
    });

    it('draws amplifier text in the first place, or the sweep proves nothing', () => {
        // A sweep that found no annotations anywhere would pass the check above trivially.
        const annotated = ALL.filter(name => {
            const shown = linesFor(name, {});
            return AMPLIFIER_MARKERS.some(marker => shown.some(line => line.includes(marker)));
        });
        expect(annotated.length).toBeGreaterThan(100);
    });
});
