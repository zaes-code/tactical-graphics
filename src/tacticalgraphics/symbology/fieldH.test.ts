/**
 * # Field H, and the plates that place it
 *
 * APP-06 calls H "additional information" and puts it somewhere different on every symbol
 * that carries it: outside the airfield zone to the right, left of T on the generic area,
 * alone under human terrain's literal, above T beside the PsyOps speaker. One property,
 * four placements — so the placements are what is pinned here.
 *
 * The action areas come with it: 150501-150503 share a Template whose N marks the west and
 * east edges when the graphic is hostile, which is the affiliation speaking rather than
 * anything a user typed.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {getPaintFunction} from './registry';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A square ring 200 km across, centred on the origin, and its interior point. */
const RING: ProjectedPosition[] = [
    [-100_000, -100_000], [100_000, -100_000], [100_000, 100_000], [-100_000, 100_000], [-100_000, -100_000],
];

const labelPaints = (name: TacticalGraphicName, properties: Record<string, unknown>): Paint[] => {
    const paint = getPaintFunction(name)?.label;
    if (!paint) return [];
    const feature = {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, ...properties},
        ring: RING,
        bounds: {minX: -100_000, minY: -100_000, maxX: 100_000, maxY: 100_000},
    } as unknown as PaintFeature;
    return paint(feature, context);
};

const texts = (paints: Paint[]) => paints.filter(p => p.text?.text).map(p => p.text!.text as string);
const spotOf = (paints: Paint[], match: string): ProjectedPosition | undefined => {
    const hit = paints.find(p => (p.text?.text ?? '').includes(match));
    return hit && hit.geometry.type === 'Point' ? (hit.geometry.coordinates as ProjectedPosition) : undefined;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 120400 — airfield zone', () => {
    it('sets field H outside the area, to its right', () => {
        const paints = labelPaints(TacticalGraphicName.AirfieldZone, {additionalInfo: 'CONCRETE 3000M'});
        const at = spotOf(paints, 'CONCRETE');
        expect(at).toBeDefined();
        // Past the ring's eastern edge, and level with the middle — the Template's box.
        expect(at![0]).toBeGreaterThan(100_000);
        expect(at![1]).toBeCloseTo(0, 6);
    });

    it('draws nothing extra when the field is empty', () => {
        expect(texts(labelPaints(TacticalGraphicName.AirfieldZone, {}))).toEqual([]);
    });
});

describe('APP-06 370100 — human terrain', () => {
    it('stacks field H under the literal, with no designation between them', () => {
        const lines = texts(labelPaints(TacticalGraphicName.HumanTerrain, {additionalInfo: 'TRIBAL'}))
            .join('\n')
            .split('\n');
        expect(lines).toEqual(['HT', 'TRIBAL']);
    });
});

describe('APP-06 150501-150503 — the action areas', () => {
    it('joins the literal to the designation with a hyphen, dates beneath', () => {
        const lines = texts(labelPaints(TacticalGraphicName.JointTacticalActionArea, {
            label: '02', startDate: '240400ZMAY2026', endDate: '250300ZMAY2026',
        })).join('\n').split('\n');
        expect(lines[0]).toBe('JTAA - 02');
        expect(lines[1]).toBe('240400ZMAY2026 - 250300ZMAY2026');
    });

    it('gives the submarine areas their own literals', () => {
        expect(texts(labelPaints(TacticalGraphicName.SubmarineActionArea, {label: '02'}))[0]).toBe('SAA - 02');
        expect(texts(labelPaints(TacticalGraphicName.SubmarineGeneratedActionArea, {label: '02'}))[0]).toBe('SGAA - 02');
    });

    it('marks the west and east edges only when the graphic is hostile', () => {
        const friendly = labelPaints(TacticalGraphicName.JointTacticalActionArea, {label: '02'});
        expect(texts(friendly).filter(t => t === 'ENY')).toEqual([]);

        const hostile = labelPaints(TacticalGraphicName.JointTacticalActionArea, {
            label: '02', hostility: TacticalGraphicHostility.hostileFaker,
        });
        const marks = hostile.filter(p => p.text?.text === 'ENY');
        expect(marks).toHaveLength(2);

        // One on each side, on the outline rather than inside it.
        const xs = marks.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates[0]).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(-100_000, 0);
        expect(xs[1]).toBeCloseTo(100_000, 0);
    });

    it('sets H to the left of T on the generic area, and only there', () => {
        const generic = texts(labelPaints(TacticalGraphicName.AreaGeneric, {label: 'A-1', additionalInfo: 'NOTE'}));
        expect(generic[0].split('\n')[0]).toBe('NOTE  A-1');

        // The three action areas carry no H — their Template has no box for one.
        const jtaa = texts(labelPaints(TacticalGraphicName.JointTacticalActionArea, {label: '02', additionalInfo: 'NOTE'}));
        expect(jtaa.join(' ')).not.toContain('NOTE');
    });
});

describe('APP-06 242701-242703 — the PsyOps zones', () => {
    const psyOps = (properties: Record<string, unknown>) =>
        labelPaints(TacticalGraphicName.PsyOpsZoneIrregular, properties);

    it('sets H over T beside the speaker', () => {
        const block = texts(psyOps({label: 'PSY-1', additionalInfo: 'LOUDSPEAKER'}))
            .find(t => t.includes('PSY-1'))!;
        expect(block.split('\n')).toEqual(['LOUDSPEAKER', 'PSY-1']);
    });

    it('puts a round zone above its middle, not level with it', () => {
        // A circle's leftmost *vertex* sits at its centre height, so anchoring on the ring
        // put the block at the middle-left. Only the irregular variant takes the vertex.
        const paint = getPaintFunction(TacticalGraphicName.PsyOpsZoneCircular)!.label!;
        const circle: ProjectedPosition[] = Array.from({length: 33}, (_p, i) => {
            const angle = (i / 32) * Math.PI * 2;
            return [Math.cos(angle) * 100_000, Math.sin(angle) * 100_000] as ProjectedPosition;
        });
        const paints = paint({
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {name: TacticalGraphicName.PsyOpsZoneCircular, startDate: '021200ZJUN26'},
            ring: circle,
            bounds: {minX: -100_000, minY: -100_000, maxX: 100_000, maxY: 100_000},
        } as unknown as PaintFeature, context);
        const at = spotOf(paints, '021200ZJUN26');
        expect(at).toBeDefined();
        expect(at![1]).toBeCloseTo(100_000, 0);
    });

    it('hangs the dates outside the upper-left corner', () => {
        const paints = psyOps({label: 'PSY-1', startDate: '021200ZJUN26', endDate: '021800ZJUN26'});
        const at = spotOf(paints, '021200ZJUN26');
        expect(at).toBeDefined();
        // The ring's upper-left vertex: west edge, north edge.
        expect(at![0]).toBeCloseTo(-100_000, 0);
        expect(at![1]).toBeCloseTo(100_000, 0);
    });

    it('stops the speaker growing once the labels stop', () => {
        // The same graphic on a much larger area: `fitSymbolScale` would keep opening the
        // glyph up, and the label scale would not follow it.
        const speakerWidth = (halfSpan: number): number => {
            const paint = getPaintFunction(TacticalGraphicName.PsyOpsZoneIrregular)!.label!;
            const ring: ProjectedPosition[] = [
                [-halfSpan, -halfSpan], [halfSpan, -halfSpan], [halfSpan, halfSpan], [-halfSpan, halfSpan], [-halfSpan, -halfSpan],
            ];
            const paints = paint({
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: TacticalGraphicName.PsyOpsZoneIrregular, label: 'PSY-1'},
                ring,
                bounds: {minX: -halfSpan, minY: -halfSpan, maxX: halfSpan, maxY: halfSpan},
            } as unknown as PaintFeature, context);
            const body = paints.find(p => p.geometry.type === 'Polygon');
            const xs = ((body!.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0]).map(([x]) => x);
            return Math.max(...xs) - Math.min(...xs);
        };
        expect(speakerWidth(2_000_000)).toBeCloseTo(speakerWidth(400_000), 0);
    });
});
