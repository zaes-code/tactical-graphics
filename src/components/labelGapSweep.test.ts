/**
 * # No label keeps a fixed gap while its text shrinks
 *
 * A gap beside a label is stated in screen pixels for the label at full size. A label shrinks
 * as its graphic does, and a gap that stayed at its full pixel count came to outgrow the text:
 * zoomed out, a phase line kept 8 px between its end and a `PL` 7 px wide, and 74 graphics did
 * the same in one place or another. @see labelGapPx
 *
 * Every graphic is painted from its sample-sheet base, hostile and friendly, with a name, dates
 * and additional information: once large on screen, where labels are full size, and again at
 * 120, 70 and 40 px across. For each label within three text heights of its own line work, the
 * gap is the screen distance from the text's box to the nearest stroke. The text shrinking while
 * that distance stays the same is the fixed-gap signature, and nothing may show it.
 *
 * A gap that grows as the text shrinks is not flagged: that is text inside a shape, a name in a
 * convoy's body or an arrow's, which simply has more room as it gets smaller.
 *
 * Lives under `src/components` because the sample bases do. It reads the paint layer through
 * the root entry point, which is what every renderer draws.
 */
import {
    buildPaintedGraphic,
    listTacticalGraphicNames,
    paintGraphic,
    setTacticalGraphicsConfig,
    TacticalGraphicsConfig,
    TacticalGraphicHostility,
    type Paint,
    type PaintContext,
    type TacticalGraphicName,
} from '@zaes/tactical-graphics';
import {sampleBase} from './maplibre/sampleGallery';

const fontPx = (font: string) => parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
/** A stand-in for canvas text measurement, at roughly a bold capital's aspect ratio. */
const measureText = (text: string, font: string) => text.length * fontPx(font) * 0.6;

type Segment = [number, number, number, number];

function pointToSegment(px: number, py: number, [x1, y1, x2, y2]: Segment): number {
    const [vx, vy] = [x2 - x1, y2 - y1];
    const l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l)) : 0;
    return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function segmentDistance(a: Segment, b: Segment): number {
    const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const crosses =
        side(a[0], a[1], a[2], a[3], b[0], b[1]) * side(a[0], a[1], a[2], a[3], b[2], b[3]) < 0 &&
        side(b[0], b[1], b[2], b[3], a[0], a[1]) * side(b[0], b[1], b[2], b[3], a[2], a[3]) < 0;
    if (crosses) return 0;
    return Math.min(pointToSegment(a[0], a[1], b), pointToSegment(a[2], a[3], b), pointToSegment(b[0], b[1], a), pointToSegment(b[2], b[3], a));
}

/** Every stroke of the graphic, as screen-pixel segments with y down. */
function strokes(paints: Paint[], res: number): Segment[] {
    const out: Segment[] = [];
    const add = (line: number[][]) => {
        for (let i = 0; i < line.length - 1; i++) out.push([line[i][0] / res, -line[i][1] / res, line[i + 1][0] / res, -line[i + 1][1] / res]);
    };
    for (const p of paints) {
        if (!p.stroke || p.text) continue;
        const g = p.geometry as {type: string; coordinates: never};
        if (g.type === 'LineString') add(g.coordinates);
        else if (g.type === 'MultiLineString' || g.type === 'Polygon') (g.coordinates as number[][][]).forEach(add);
        else if (g.type === 'MultiPolygon') (g.coordinates as number[][][][]).forEach(poly => poly.forEach(add));
    }
    return out;
}

/** A point label's box as four screen-pixel edges, laid out as `TextSpec` describes it. */
function textBox(p: Paint, res: number): {edges: Segment[]; lineHeightPx: number} | undefined {
    const t = p.text!;
    if (p.geometry.type !== 'Point' || !t.text.trim()) return undefined;
    const scale = t.scale ?? 1;
    const lines = t.text.split('\n');
    const w = Math.max(...lines.map(l => measureText(l, t.font))) * scale;
    const lineHeightPx = fontPx(t.font) * scale;
    const h = lineHeightPx * lines.length;
    const x0 = t.align === 'left' ? 0 : t.align === 'right' ? -w : -w / 2;
    const b = t.baseline ?? 'middle';
    const y0 = b === 'top' || b === 'hanging' ? 0 : b === 'bottom' || b === 'alphabetic' ? -h : -h / 2;
    const r = t.rotation ?? 0;
    const [ax, ay] = (p.geometry as {coordinates: number[]}).coordinates;
    // Rotated about the anchor, then nudged in screen pixels. @see TextSpec.offsetXPx
    const px = ax / res + (t.offsetXPx ?? 0);
    const py = -ay / res + (t.offsetYPx ?? 0);
    const corners = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => [
        px + x * Math.cos(r) - y * Math.sin(r),
        py + x * Math.sin(r) + y * Math.cos(r),
    ]);
    return {edges: corners.map((q, i) => [q[0], q[1], corners[(i + 1) % 4][0], corners[(i + 1) % 4][1]] as Segment), lineHeightPx};
}

interface LabelGap {
    gapPx: number;
    lineHeightPx: number;
    scale: number;
}

function labelGaps(name: TacticalGraphicName, res: number, hostility: TacticalGraphicHostility) {
    const base = sampleBase(name);
    if (!base) return undefined;
    const properties = {...base.properties, designation: 'ALPHA', additionalInfo: 'INFO', startDate: '0600', endDate: '1800', hostility};
    const graphic = buildPaintedGraphic(name, base.geometry, properties);
    if (!graphic) return undefined;
    const paints = paintGraphic(graphic, {resolution: res, measureText} as PaintContext);
    const lines = strokes(paints, res);
    const gaps = new Map<string, LabelGap>();
    const seen = new Map<string, number>();
    for (const p of paints) {
        if (!p.text) continue;
        const box = textBox(p, res);
        if (!box || !lines.length) continue;
        let gapPx = Infinity;
        for (const edge of box.edges) for (const line of lines) gapPx = Math.min(gapPx, segmentDistance(edge, line));
        // Matched across zooms by first word and order, since a name can shrink to its prefix.
        const word = p.text.text.split(/\s/)[0];
        const n = (seen.get(word) ?? 0) + 1;
        seen.set(word, n);
        gaps.set(`${word}#${n}`, {gapPx, lineHeightPx: box.lineHeightPx, scale: p.text.scale ?? 1});
    }
    return {gaps, bounds: graphic.graphic.bounds};
}

describe('label gaps', () => {
    beforeEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({enemyLabels: true})));
    afterEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig()));

    it('shrink with their text on every graphic, so none keeps a fixed pixel gap zoomed out', () => {
        const fixed: string[] = [];
        let compared = 0;
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            for (const hostility of [TacticalGraphicHostility.hostileFaker, TacticalGraphicHostility.friend]) {
                const first = labelGaps(name, 1, hostility);
                const b = first?.bounds;
                const size = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 0;
                if (!(size > 0)) continue;
                const near = labelGaps(name, size / 700, hostility)!;
                for (const farPx of [120, 70, 40]) {
                    const far = labelGaps(name, size / farPx, hostility)!;
                    for (const [key, n] of near.gaps) {
                        const f = far.gaps.get(key);
                        if (!f || !(n.gapPx > 0) || !isFinite(n.gapPx) || !isFinite(f.gapPx)) continue;
                        if (n.gapPx > 3 * n.lineHeightPx) continue;
                        compared++;
                        const shrank = f.scale < 0.75 * n.scale;
                        const heldItsPixels = Math.abs(f.gapPx - n.gapPx) <= 0.1 * n.gapPx;
                        if (shrank && heldItsPixels) {
                            fixed.push(`${name} ${key} at ${farPx}px: text ${n.scale.toFixed(2)} -> ${f.scale.toFixed(2)}, gap ${n.gapPx.toFixed(1)} -> ${f.gapPx.toFixed(1)} px`);
                        }
                    }
                }
            }
        }
        // The sweep has to have looked at something to mean anything.
        expect(compared).toBeGreaterThan(1000);
        expect(fixed).toEqual([]);
    }, 300_000);
});
