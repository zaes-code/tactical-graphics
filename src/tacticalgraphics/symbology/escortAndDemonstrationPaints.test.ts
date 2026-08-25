/**
 * # Escort and demonstration
 *
 * Two tasks whose shape is easy to get *nearly* right and whose draw rules say which way
 * round the near-misses go: a bracket whose legs could face either way, and a U that
 * becomes an S if the turn bulges toward the arrowheads instead of away from them.
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {demonstrationPaint, escortPaint} from './escortAndDemonstrationPaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const HALF_WORLD = 20037508.34;
const project = ([lon, lat]: Position): ProjectedPosition => [
    (lon * HALF_WORLD) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI,
];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

const built = (name: TacticalGraphicName, coordinates: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates},
    } as Feature).graphic.geometry;

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    paints.flatMap(p => {
        if (p.geometry.type === 'LineString') return [p.geometry.coordinates];
        if (p.geometry.type === 'MultiLineString') return p.geometry.coordinates;
        return [];
    });

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 343600 — escort', () => {
    // "Point 1 defines the centre of the graphic. Point 2 and Point 3 defines the length
    //  of the escort."
    const POINTS: Position[] = [[-76.5, 38.9], [-77.0, 38.9], [-76.0, 38.9]];

    it('spans points 2 and 3, ignoring the centre for the bar itself', () => {
        const geometry = built(TacticalGraphicName.Escort, POINTS) as {coordinates: Position[]};
        expect(geometry.coordinates).toHaveLength(2);
        expect(meters(geometry.coordinates[0], POINTS[1])).toBeLessThan(1);
        expect(meters(geometry.coordinates[1], POINTS[2])).toBeLessThan(1);
    });

    it('breaks the bar for the amplifiers and sets an E against each side', () => {
        const feature: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [POINTS[1], POINTS[2]].map(project)},
            properties: {name: TacticalGraphicName.Escort},
        };
        const paints = escortPaint('E')(feature, context());
        expect(paints.filter(p => p.text).map(p => p.text!.text)).toEqual(['E', 'E']);

        const runs = lines(paints);
        // Two bar runs plus two legs — the gap between the runs is what the host's unit
        // symbol goes into, and nothing here draws one.
        expect(runs).toHaveLength(4);
        expect(runs[0][1][0]).toBeLessThan(runs[1][0][0]);
    });

    // "The escort symbol appears above the convoy or escorted unit symbol."
    it('turns both legs to the same side, below a bar drawn left to right', () => {
        const feature: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [POINTS[1], POINTS[2]].map(project)},
            properties: {name: TacticalGraphicName.Escort},
        };
        const [, legStart, legEnd] = lines(escortPaint('E')(feature, context())).slice(1);
        expect(legStart[1][1]).toBeLessThan(legStart[0][1]);
        expect(legEnd[1][1]).toBeLessThan(legEnd[0][1]);
    });
});

describe('APP-06 343300 — demonstration', () => {
    // "Point 1 defines the tip of the arrowhead. Point 2 defines the end of the straight
    //  line portion of the first arrow. […] Points 2 and 3 shall be connected by a smooth,
    //  curved line."
    const POINTS: Position[] = [[-77.0, 38.7], [-76.4, 38.7], [-76.4, 39.1], [-77.0, 39.1]];

    it('draws two straight legs joined by a turn', () => {
        const geometry = built(TacticalGraphicName.Demonstration, POINTS) as MultiLineString;
        expect(geometry.coordinates).toHaveLength(3);
        expect(geometry.coordinates[0]).toHaveLength(2);
        expect(geometry.coordinates[2]).toHaveLength(2);
        expect(geometry.coordinates[1].length).toBeGreaterThan(3);
    });

    it('bulges the turn away from the arrowheads, whichever way it was drawn', () => {
        // Drawn the other way round, the turn must still bulge away — a hard-coded side
        // turns the U into an S for half of all drawings, and an S is a different symbol.
        for (const points of [POINTS, [...POINTS].reverse()]) {
            const turn = (built(TacticalGraphicName.Demonstration, points) as MultiLineString).coordinates[1];
            const apex = turn[Math.floor(turn.length / 2)];
            const tipsMidLon = (points[0][0] + points[3][0]) / 2;
            const bendsMidLon = (points[1][0] + points[2][0]) / 2;
            // The apex lies beyond the bends, on the side away from the tips.
            expect(Math.sign(apex[0] - bendsMidLon)).toBe(Math.sign(bendsMidLon - tipsMidLon));
        }
    });

    it('arrowheads both open ends and labels the first leg', () => {
        const geometry = built(TacticalGraphicName.Demonstration, POINTS) as MultiLineString;
        const feature: PaintFeature = {
            geometry: {
                type: 'MultiLineString',
                coordinates: geometry.coordinates.map(part => part.map(project)),
            },
            properties: {name: TacticalGraphicName.Demonstration, label: '1'},
        };
        const paints = demonstrationPaint('DEM')(feature, context());
        expect(paints.filter(p => p.text).map(p => p.text!.text)).toEqual(['DEM 1']);

        // Four barbs — two per open end — and open, not filled: no paint carries a fill.
        const barbs = paints.find(p =>
            p.geometry.type === 'MultiLineString' && p.geometry.coordinates.length === 4);
        expect(barbs).toBeDefined();
        expect(paints.some(p => p.fill)).toBe(false);
    });
});
