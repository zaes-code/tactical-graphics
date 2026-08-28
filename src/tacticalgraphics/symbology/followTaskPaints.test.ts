/**
 * # APP-06 341200/341300 — follow and assume, follow and support
 *
 * Two symbols that are the same shape apart from two details, which makes them exactly
 * the pair a renderer can quietly collapse into one picture: same body, same axis, same
 * field T. What tells them apart is the connector and the head, so that is what this
 * pins — along with the note that makes the assume variant's dash a property of the
 * symbol rather than of its status.
 */

import {getPaintFunction} from './registry';
import {TacticalGraphicName, TacticalGraphicStatus} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/** Rear at the origin, tip 8 km east — the generator order, rear to tip. */
const REAR: ProjectedPosition = [0, 0];
const TIP: ProjectedPosition = [8000, 0];

const paintsFor = (name: TacticalGraphicName, properties: Record<string, unknown> = {}): Paint[] => {
    const paint = getPaintFunction(name)?.graphic;
    if (!paint) return [];
    const feature = {
        geometry: {type: 'LineString', coordinates: [REAR, TIP]},
        properties: {name, ...properties},
    } as PaintFeature;
    return paint(feature, context);
};

/** The stroked line paints, in the order they are emitted: body, connector, head. */
const lines = (paints: Paint[]) => paints.filter(p => p.stroke && p.geometry.type === 'LineString');
const filled = (paints: Paint[]) => paints.filter(p => p.fill);
const texts = (paints: Paint[]) => paints.filter(p => p.text?.text).map(p => p.text!.text);

beforeEach(() => resetTacticalGraphicsConfig());

describe('what separates the two follow tasks', () => {
    it('dashes the assume variant"s connector and leaves the support variant solid', () => {
        const assume = lines(paintsFor(TacticalGraphicName.FollowAndAssume));
        const support = lines(paintsFor(TacticalGraphicName.FollowAndSupport));
        // The connector is the two-point run between the body and the head.
        const connectorOf = (ls: Paint[]) => ls.find(p => (p.geometry as {coordinates: unknown[]}).coordinates.length === 2);
        expect(connectorOf(assume)?.stroke?.dashPx?.length).toBeGreaterThan(0);
        expect(connectorOf(support)?.stroke?.dashPx ?? []).toEqual([]);
    });

    it('fills the support head and leaves the assume head hollow', () => {
        expect(filled(paintsFor(TacticalGraphicName.FollowAndSupport))).toHaveLength(1);
        expect(filled(paintsFor(TacticalGraphicName.FollowAndAssume))).toHaveLength(0);
    });

    /**
     * The support variant's rear edge is notched; the assume variant's is flat. One more
     * vertex on the body ring is the whole difference, and it is the one a reader uses
     * to tell the two apart when the head is off-screen.
     */
    it('notches the support body"s rear edge and not the assume body"s', () => {
        const bodyOf = (name: TacticalGraphicName) =>
            (lines(paintsFor(name))[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;
        expect(bodyOf(TacticalGraphicName.FollowAndSupport)).toHaveLength(bodyOf(TacticalGraphicName.FollowAndAssume).length + 1);
    });
});

describe('the parts both of them share', () => {
    it.each([TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport])(
        '%s puts its head at the tip, which is point 1',
        name => {
            const paints = paintsFor(name);
            const everyPoint = paints.flatMap(p => {
                const c = (p.geometry as {coordinates: unknown}).coordinates;
                return JSON.stringify(c).includes(`[${TIP[0]},${TIP[1]}]`) ? [true] : [];
            });
            expect(everyPoint.length).toBeGreaterThan(0);
        },
    );

    it.each([TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport])(
        '%s draws field T inside its body, not beside it',
        name => {
            const paints = paintsFor(name, {designation: 'TF RAIDER'});
            expect(texts(paints)).toEqual(['TF RAIDER']);
            const at = (paints.find(p => p.text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
            const body = (lines(paints)[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;
            const maxX = Math.max(...body.map(p => p[0]));
            expect(at[0]).toBeGreaterThan(0);
            expect(at[0]).toBeLessThan(maxX);
        },
    );

    /**
     * The body grows to hold a real designation. Fixed at its plate proportions, a
     * `TF RAIDER` hung out of both ends of the shape it is supposed to sit inside.
     */
    it('widens the body for a longer designation', () => {
        const widthOf = (designation: string) => {
            const body = (lines(paintsFor(TacticalGraphicName.FollowAndAssume, {designation}))[0].geometry as {
                coordinates: ProjectedPosition[];
            }).coordinates;
            return Math.max(...body.map(p => p[0]));
        };
        expect(widthOf('TASK FORCE RAIDER')).toBeGreaterThan(widthOf('A'));
    });

    /**
     * APP-06 341200: *"The dashed lines in this symbol shall be displayed in present and
     * anticipated status."* The dash belongs to the symbol, so a planned graphic — whose
     * every other stroke dashes for being planned — must not cancel it.
     */
    it('keeps the assume connector dashed when the graphic is planned', () => {
        const planned = lines(paintsFor(TacticalGraphicName.FollowAndAssume, {status: TacticalGraphicStatus.planned}));
        const connector = planned.find(p => (p.geometry as {coordinates: unknown[]}).coordinates.length === 2);
        expect(connector?.stroke?.dashPx?.length).toBeGreaterThan(0);
    });
});

/**
 * # A resize scales the whole symbol, not just the line
 *
 * The body and the head are sized from `decorationSize` — the metre distance the holder
 * stamps and a resize multiplies — rather than from `context.resolution` alone. Derived
 * from the resolution, as the first version was, a resize stretched the axis and left the
 * body and head exactly the size they were: "the resize handle was elongating the line vs
 * making the whole graphic bigger", which is the user's own description of it.
 *
 * The vertex handle still lengthens the line alone. That is the other half of the rule and
 * it is unchanged: only the *resize* gesture scales `decorationSize`.
 * @see LineGraphicController.handleResize, scaleDrawnSizes
 */
describe('the symbol scales with the graphic', () => {
    const bodyLengthWith = (decorationSize?: number) => {
        const paints = paintsFor(TacticalGraphicName.FollowAndAssume, decorationSize ? {decorationSize} : {});
        const body = (lines(paints)[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;
        return Math.max(...body.map(p => p[0])) - Math.min(...body.map(p => p[0]));
    };

    it('doubles the body when the stamped decoration size doubles', () => {
        const single = bodyLengthWith(20 * context.resolution);
        const double = bodyLengthWith(40 * context.resolution);
        expect(double / single).toBeCloseTo(2, 1);
    });

    it('draws the plate size when nothing is stamped, so the default is unchanged', () => {
        // The fallback is the same number the holder would have stamped at this zoom,
        // which is what keeps a graphic built outside a holder looking identical.
        expect(bodyLengthWith(undefined)).toBeCloseTo(bodyLengthWith(20 * context.resolution), 5);
    });

    it('leaves the head clear of the body at either size', () => {
        for (const size of [20 * context.resolution, 40 * context.resolution]) {
            const paints = paintsFor(TacticalGraphicName.FollowAndAssume, {decorationSize: size});
            const body = (lines(paints)[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;
            const bodyEnd = Math.max(...body.map(p => p[0]));
            expect(bodyEnd).toBeLessThan(TIP[0]);
        }
    });
});

/**
 * # The vertex handle lengthens the line and nothing else
 *
 * The two gestures do different jobs and must not bleed into each other: dragging the
 * red vertex handle stretches the *line*, leaving the fish tail and the arrowhead the
 * size they were; only the resize affordance scales the symbol, by scaling
 * `decorationSize`.
 *
 * They bled once already. Running the sizes through `endMarkScale` — the shape-relative
 * cap the repeating decorations use — ties them to the line's own length, so every drag
 * of the vertex handle resized the whole symbol with it.
 */
describe('lengthening the line leaves the symbol alone', () => {
    const symbolAt = (lengthMetres: number, decorationSize?: number) => {
        const paint = getPaintFunction(TacticalGraphicName.FollowAndAssume)!.graphic;
        const feature = {
            geometry: {type: 'LineString', coordinates: [REAR, [lengthMetres, 0]]},
            properties: {name: TacticalGraphicName.FollowAndAssume, ...(decorationSize ? {decorationSize} : {})},
        } as PaintFeature;
        const parts = paint(feature, context).filter(p => p.stroke && p.geometry.type === 'LineString');
        const span = (i: number) => {
            const c = (parts[i].geometry as {coordinates: ProjectedPosition[]}).coordinates;
            return Math.max(...c.map(p => p[0])) - Math.min(...c.map(p => p[0]));
        };
        return {body: span(0), head: span(parts.length - 1)};
    };

    it.each([4000, 8000, 16000, 40000])('is the same symbol on a %i m line', lengthMetres => {
        const reference = symbolAt(8000);
        const measured = symbolAt(lengthMetres);
        expect(measured.body).toBeCloseTo(reference.body, 5);
        expect(measured.head).toBeCloseTo(reference.head, 5);
    });

    it('still scales when the resize gesture changes the stamped size', () => {
        const single = symbolAt(8000, 20 * context.resolution);
        const double = symbolAt(8000, 40 * context.resolution);
        expect(double.body / single.body).toBeCloseTo(2, 1);
        expect(double.head / single.head).toBeCloseTo(2, 1);
    });
});
