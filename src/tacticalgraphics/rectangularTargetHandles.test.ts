/**
 * The rectangular target's two grips.
 *
 * APP-06 240802 gives this symbol two independent dimensions — a length (AM1) and a width
 * (AM) — so one grip cannot serve it: whichever dimension the single handle drove, the other
 * would be typed-only, which is a control the operator cannot see. Every other point-anchored
 * graphic has one number to drag and keeps the `[edge, centre]` convention.
 *
 * Layer 1, so both renderers are held to it. @see RectangularTarget, handleContract
 */

import {
    TacticalGraphicName,
    handleContract,
    handleRole,
    renderTacticalGraphic,
} from './index';
import type {Feature, MultiPoint, Point, Polygon, Position} from 'geojson';

const NAME = TacticalGraphicName.TargetAreaRectangular;
const CENTRE: Position = [10, 50];
const LENGTH = 8000;
const WIDTH = 4000;

/** Metres between two lon/lat points, good enough for a ratio assertion at this scale. */
function metres(a: Position, b: Position): number {
    const R = 6371008.8;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function render(rotation = 0) {
    return renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: CENTRE},
        properties: {tacticalGraphic: {name: NAME, length: LENGTH, width: WIDTH, rotation}},
    } as Feature);
}

const handlesOf = (out: ReturnType<typeof render>) =>
    (out.handles.geometry as MultiPoint).coordinates;

describe('the contract', () => {
    it('is a shape grip then an offset grip', () => {
        const contract = handleContract(NAME);
        expect(contract.roles).toEqual(['shape', 'offset']);
        // The grip sits exactly one half-width out, so the drag has to track the cursor
        // 1:1 — the same reasoning the two-point rectangles use.
        expect(contract.offsetScale).toBe(1);
    });

    it('names each grip by index', () => {
        expect(handleRole(NAME, 0)).toBe('shape');
        expect(handleRole(NAME, 1)).toBe('offset');
    });
});

describe('the grips themselves', () => {
    it('emits a length grip, a width grip and the centre', () => {
        expect(handlesOf(render())).toHaveLength(3);
    });

    it('puts the length grip one half-length out and the width grip one half-width out', () => {
        const [lengthGrip, widthGrip, centre] = handlesOf(render());
        expect(centre).toEqual(CENTRE);
        expect(metres(CENTRE, lengthGrip) / (LENGTH / 2)).toBeCloseTo(1, 2);
        expect(metres(CENTRE, widthGrip) / (WIDTH / 2)).toBeCloseTo(1, 2);
    });

    it('sets the two grips at right angles', () => {
        // The whole point of two grips: one along the box, one across it. A build that put
        // them on the same line would still pass the distance checks above and be useless.
        const [lengthGrip, widthGrip] = handlesOf(render());
        const ax = lengthGrip[0] - CENTRE[0];
        const ay = lengthGrip[1] - CENTRE[1];
        const bx = widthGrip[0] - CENTRE[0];
        const by = widthGrip[1] - CENTRE[1];
        const cosine = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
        expect(Math.abs(cosine)).toBeLessThan(0.02);
    });

    /**
     * Both grips sit **on** the outline, which is what lets the read-out line stop at the
     * edge it names instead of extrapolating a distance past it. A grip further from the
     * centre than the nearest corner would be outside the box.
     */
    it('places both grips on an edge, inside the corner radius', () => {
        const out = render();
        const ring = (out.graphic.geometry as Polygon).coordinates[0];
        const nearestCorner = Math.min(...ring.map(p => metres(CENTRE, p)));
        for (const grip of handlesOf(out).slice(0, 2)) {
            expect(metres(CENTRE, grip)).toBeLessThan(nearestCorner);
        }
    });

    it('turns both grips with the attitude', () => {
        // 90 planar is north; the length grip should lead the box that way.
        const [lengthGrip] = handlesOf(render(90));
        expect(lengthGrip[1]).toBeGreaterThan(CENTRE[1]);
        expect(Math.abs(lengthGrip[0] - CENTRE[0])).toBeLessThan(1e-6);
    });

    it('labels the target at its centre', () => {
        expect((render().labels.geometry as Point).coordinates).toEqual(CENTRE);
    });
});
