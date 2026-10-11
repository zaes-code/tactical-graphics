import {Position} from "geojson";

/** Corner-cutting passes. Each doubles the vertex count; three reads as a curve at any zoom a line is drawn at. */
export const CHAIKIN_ITERATIONS = 3;

function cut(a: Position, b: Position): [Position, Position] {
    return [
        [0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
        [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]],
    ];
}

/**
 * Chaikin corner cutting on an open line. The two ends stay where they were drawn, so
 * end marks and end labels keep their anchor; every inner vertex is cut away.
 */
export function chaikinLine(coords: Position[], iterations = CHAIKIN_ITERATIONS): Position[] {
    if (coords.length < 3) return coords;
    let line = coords;
    for (let i = 0; i < iterations; i++) {
        const next: Position[] = [line[0]];
        for (let j = 0; j < line.length - 1; j++) {
            const [q, r] = cut(line[j], line[j + 1]);
            if (j > 0) next.push(q);
            if (j < line.length - 2) next.push(r);
        }
        next.push(line[line.length - 1]);
        line = next;
    }
    return line;
}

/** Chaikin corner cutting on a closed ring (first == last). Every corner is cut, the closing one included. */
export function chaikinRing(ring: Position[], iterations = CHAIKIN_ITERATIONS): Position[] {
    if (ring.length < 4) return ring;
    let open = ring.slice(0, -1);
    for (let i = 0; i < iterations; i++) {
        const next: Position[] = [];
        for (let j = 0; j < open.length; j++) next.push(...cut(open[j], open[(j + 1) % open.length]));
        open = next;
    }
    return [...open, open[0]];
}
