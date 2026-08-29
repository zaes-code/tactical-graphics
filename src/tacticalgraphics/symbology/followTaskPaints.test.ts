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
import {followTaskSymbol} from './followTaskPaints';
import {CENTER_SYMBOL_GRAPHICS, setSecuritySymbolProvider} from '../core/securitySymbol';
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

/**
 * # Field T lies along the symbol
 *
 * The designation sits *inside* the body, so it turns with it. Drawn horizontal, a
 * designation on a graphic pointing north-south ran across the body and out of both
 * sides of the shape it is supposed to be within.
 */
describe('the designation follows the line', () => {
    const rotationFor = (tip: ProjectedPosition) => {
        const paint = getPaintFunction(TacticalGraphicName.FollowAndAssume)!.graphic;
        const feature = {
            geometry: {type: 'LineString', coordinates: [REAR, tip]},
            properties: {name: TacticalGraphicName.FollowAndAssume, designation: 'TF RAIDER'},
        } as PaintFeature;
        return paint(feature, context).find(p => p.text)?.text?.rotation ?? 0;
    };

    it('lies flat on an eastward graphic', () => {
        expect(rotationFor([8000, 0])).toBeCloseTo(0, 6);
    });

    it('turns with a graphic drawn north', () => {
        // Map angles run counter-clockwise from east, screen rotations clockwise.
        expect(rotationFor([0, 8000])).toBeCloseTo(-Math.PI / 2, 6);
    });

    it('turns with a diagonal', () => {
        expect(rotationFor([8000, 8000])).toBeCloseTo(-Math.PI / 4, 6);
    });

    /**
     * A westward graphic reads upside down without the half turn — the defect the
     * movement labels already had once. @see uprightRotation
     */
    it('never renders upside down, whichever way the graphic points', () => {
        for (const tip of [[-8000, 0], [-8000, -3000], [-3000, 8000], [8000, -8000]] as ProjectedPosition[]) {
            const rotation = rotationFor(tip);
            expect(Math.abs(rotation)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
        }
    });
});

/**
 * # A unit symbol takes the place of field T
 *
 * The host supplies it through the provider the security operations and the escort
 * already use — nothing in this package imports milsymbol. When one answers, it *replaces*
 * the designation rather than crowding it, and the body makes room for it: a picture of
 * the unit says more than its name.
 */
describe('a host-supplied unit symbol', () => {
    afterEach(() => setSecuritySymbolProvider(undefined));

    const paintWithSymbol = (properties: Record<string, unknown> = {}) => {
        setSecuritySymbolProvider(() => ({src: 'data:image/png;base64,AAA'}));
        return paintsFor(TacticalGraphicName.FollowAndAssume, properties);
    };

    it('is offered for both follow tasks', () => {
        expect(CENTER_SYMBOL_GRAPHICS.has(TacticalGraphicName.FollowAndAssume)).toBe(true);
        expect(CENTER_SYMBOL_GRAPHICS.has(TacticalGraphicName.FollowAndSupport)).toBe(true);
    });

    it('takes priority over the designation', () => {
        expect(texts(paintWithSymbol({designation: 'TF RAIDER'}))).toEqual([]);
    });

    it('leaves the designation alone when no provider answers', () => {
        expect(texts(paintsFor(TacticalGraphicName.FollowAndAssume, {designation: 'TF RAIDER'}))).toEqual(['TF RAIDER']);
    });

    it('is placed inside the body, at the same point the text would have used', () => {
        setSecuritySymbolProvider(() => ({src: 'data:image/png;base64,AAA'}));
        const feature = {
            geometry: {type: 'LineString', coordinates: [REAR, TIP]},
            properties: {name: TacticalGraphicName.FollowAndAssume},
        } as PaintFeature;
        const placement = followTaskSymbol(feature, context);
        expect(placement).toBeDefined();

        const body = (lines(paintWithSymbol())[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;
        const maxX = Math.max(...body.map(p => p[0]));
        expect(placement!.at[0]).toBeGreaterThan(0);
        expect(placement!.at[0]).toBeLessThan(maxX);
        expect(placement!.sizePx).toBeGreaterThan(0);
    });

    it('gives nothing back when no provider is registered', () => {
        const feature = {
            geometry: {type: 'LineString', coordinates: [REAR, TIP]},
            properties: {name: TacticalGraphicName.FollowAndAssume},
        } as PaintFeature;
        expect(followTaskSymbol(feature, context)).toBeUndefined();
    });
});

/**
 * # The unit symbol has to fit in the body it sits in
 *
 * Two ways it did not. The support variant's rear edge is a notch cut forward into the
 * body, and the content was centred on the *whole* body — so the point of the notch ran
 * through the middle of field T and, once a unit symbol replaced it, through the symbol.
 * And both renderers size an icon by its width with the height following the image's own
 * aspect, so a frame taller than it is wide overflowed a box measured as though it were
 * square: a hostile land unit runs about 1.18 tall per unit wide, which is why nothing was
 * visibly wrong until the affiliation became settable.
 */
describe('a unit symbol fits inside the body', () => {
    /** The body ring is the first stroked line the paint emits. */
    const bodyOf = (name: TacticalGraphicName, properties: Record<string, unknown> = {}) =>
        (lines(paintsFor(name, properties))[0].geometry as {coordinates: ProjectedPosition[]}).coordinates;

    /** Distance along the axis from the rear, in metres. The axis runs due east here. */
    const along = (p: ProjectedPosition) => p[0];

    const symbolFor = (name: TacticalGraphicName) =>
        followTaskSymbol(
            {geometry: {type: 'LineString', coordinates: [REAR, TIP]}, properties: {name}} as PaintFeature,
            context,
        );

    beforeEach(() => setSecuritySymbolProvider(() => 'data:image/svg+xml,<svg/>'));
    afterEach(() => setSecuritySymbolProvider(undefined));

    it.each([TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport])(
        '%s keeps the symbol clear of both the rear edge and the nose',
        name => {
            const placed = symbolFor(name);
            expect(placed).toBeDefined();

            const body = bodyOf(name);
            // The body's parallel sides run from the rear edge to where the nose starts.
            const noseStart = Math.max(...body.map(along).filter(a => a < Math.max(...body.map(along))));
            const halfWidth = (placed!.sizePx * context.resolution) / 2;
            expect(along(placed!.at) - halfWidth).toBeGreaterThan(0);
            expect(along(placed!.at) + halfWidth).toBeLessThan(noseStart);
        },
    );

    it('centres the support variant"s symbol forward of the notch it would otherwise cross', () => {
        const support = symbolFor(TacticalGraphicName.FollowAndSupport)!;
        const assume = symbolFor(TacticalGraphicName.FollowAndAssume)!;
        // The notch is the one body vertex sitting on the axis at the rear end.
        const notch = Math.min(...bodyOf(TacticalGraphicName.FollowAndSupport).filter(c => c[1] === 0).map(along));
        expect(notch).toBeGreaterThan(0);

        const halfWidth = (support.sizePx * context.resolution) / 2;
        expect(along(support.at) - halfWidth).toBeGreaterThan(notch);
        // And it is the notch that moved it: the flat-backed variant sits further back.
        expect(along(support.at)).toBeGreaterThan(along(assume.at));
    });

    it('asks for a width that still fits the body when the image comes back taller than it is wide', () => {
        const placed = symbolFor(TacticalGraphicName.FollowAndAssume)!;
        const body = bodyOf(TacticalGraphicName.FollowAndAssume);
        const bodyHeight = Math.max(...body.map(c => c[1])) - Math.min(...body.map(c => c[1]));

        // 1.23 is the tallest 2525E land-unit frame measured through milsymbol at this
        // library's SIDC — a neutral square under its echelon marks. Fitting is not
        // enough: the body is stroked, so a symbol that merely touches its edges reads as
        // a collision. Daylight either side is the requirement.
        const drawnHeight = placed.sizePx * context.resolution * 1.23;
        expect(drawnHeight).toBeLessThan(bodyHeight * 0.85);
    });

    it('moves field T forward of the notch as well — it is the same box', () => {
        // No provider: field T is drawn only when nothing came back to replace it.
        setSecuritySymbolProvider(undefined);
        // Long enough that the body has to grow for it, which is the case that bites: a
        // designation centred on the whole body starts one padding in from the rear, and
        // the notch reaches further than that.
        const designation = 'TF RAIDER';
        const withText = paintsFor(TacticalGraphicName.FollowAndSupport, {designation});
        const drawn = withText.find(p => p.text?.text === designation)!;
        const anchor = (drawn.geometry as {coordinates: ProjectedPosition}).coordinates;
        const halfText =
            (context.measureText(designation, '16px sans-serif') * (drawn.text!.scale ?? 1) * context.resolution) / 2;
        const notch = Math.min(...bodyOf(TacticalGraphicName.FollowAndSupport, {designation}).filter(c => c[1] === 0).map(along));
        expect(along(anchor) - halfText).toBeGreaterThan(notch);
    });
});
