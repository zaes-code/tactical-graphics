/**
 * # APP-06 §8.10 Table 8-12 — the maritime control areas
 *
 * The risks here are not shape-drawing ones. Group 20 is nine leaves in four
 * constructions, and what a careless implementation gets wrong is *which* of them share
 * a treatment:
 *
 * - **200400 and 200500 differ only in colour.** 200400 is not built (it is a static
 *   console icon), so nothing collides today — but the amber is the only thing that makes
 *   200500 a symbol rather than a circle, and it is a single constant one edit could lose.
 * - **The three ellipses and the two rectangles do not letter the same boxes.** The launch
 *   and defended areas print `LA - T` / `DA - T` inside the shape; the ship areas of
 *   interest print a bare `AOI` under it and letter no `T` at all. Reading the five as one
 *   family is the mistake, and it is invisible in a picture with no designation set.
 * - **200300 letters no designation**, so one carried on a restored graphic must not draw.
 *
 * The ellipse's *geometry* is pinned in `maritimeArea.test.ts`; this file is the paint.
 */
import {TacticalGraphicName, getLabel} from '../core/type';
import {supportsHostility} from '../core/symbology';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {getPaintFunction, isPaintable} from './registry';
import {withHiddenAmplifiers} from './paintFunctions';
import {
    ACTIVE_MANEUVER_AMBER,
    CUED_ACQUISITION_COLOR,
    CUED_ACQUISITION_FILL,
    RADAR_SEARCH_FILL,
    RADAR_SEARCH_STROKE,
    activeManeuverAreaPaint,
    cuedAcquisitionDoctrinePaint,
    radarSearchDoctrinePaint,
    radarSearchLabelPaint,
} from './maritimeAreaPaints';

const RESOLUTION = 100;
const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

const MARITIME_AREAS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.LaunchAreaEllipse,
    TacticalGraphicName.DefendedAreaEllipse,
    TacticalGraphicName.DefendedAreaRectangle,
    TacticalGraphicName.NoAttackZone,
    TacticalGraphicName.ShipAreaOfInterestEllipse,
    TacticalGraphicName.ShipAreaOfInterestRectangle,
    TacticalGraphicName.ActiveManeuverArea,
    TacticalGraphicName.CuedAcquisitionDoctrine,
    TacticalGraphicName.RadarSearchDoctrine,
];

/** A square ring, as a paint sees an area's graphic feature. */
function ringFeature(name: TacticalGraphicName, properties: Record<string, unknown> = {}): PaintFeature {
    const r = 100_000;
    return {
        geometry: {type: 'Polygon', coordinates: [[[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]]]},
        properties: {name, ...properties},
        bounds: {minX: -r, minY: -r, maxX: r, maxY: r},
        graphicSize: 2 * r,
    } as unknown as PaintFeature;
}

/** The label anchor an area's label slot is handed. */
function anchorFeature(
    name: TacticalGraphicName,
    properties: Record<string, unknown> = {},
    at: ProjectedPosition = [0, 0],
): PaintFeature {
    const r = 200_000;
    return {
        geometry: {type: 'Point', coordinates: at},
        properties: {name, ...properties},
        bounds: {minX: -r, minY: -r, maxX: r, maxY: r},
        graphicSize: 2 * r,
    } as unknown as PaintFeature;
}

const textsOf = (paints: Paint[]): string[] =>
    paints.filter(p => p.text?.text).flatMap(p => String(p.text!.text).split('\n')).map(s => s.trim()).filter(Boolean);

describe('all nine are drawable', () => {
    it.each(MARITIME_AREAS)('%s is registered with a graphic painter', name => {
        expect(isPaintable(name)).toBe(true);
        expect(getPaintFunction(name)?.graphic).toBeDefined();
    });
});

describe('the colours the plates state outright', () => {
    it('draws the active manoeuvre area in the plate amber, not the affiliation colour', () => {
        /*
         * **The whole symbol.** 200500's Template is a bare circle and so is 200400's; the
         * amber is the entire difference between them, which makes this constant the kind
         * of thing that can be "tidied" into `lineColorOf` without anything looking wrong.
         */
        const [ring] = activeManeuverAreaPaint()(ringFeature(TacticalGraphicName.ActiveManeuverArea), context);
        expect(ring.stroke?.color).toBe(ACTIVE_MANEUVER_AMBER);
        expect(ring.fill).toBeUndefined();
    });

    it('keeps that amber when the graphic is hostile', () => {
        // A hostile 200500 drawn red would be 200400 in red — a different symbol, not the
        // same one on the other side. Same rule as the CBRN hazard yellow.
        const hostile = ringFeature(TacticalGraphicName.ActiveManeuverArea, {hostility: 'hostileFaker'});
        expect(activeManeuverAreaPaint()(hostile, context)[0].stroke?.color).toBe(ACTIVE_MANEUVER_AMBER);
    });

    it('offers no identity on either of the two, so nothing can ask for one', () => {
        /*
         * **The paint refusing to change colour is only half of it.** The sweep asserts
         * that every graphic which *supports* hostility paints red from a bag-only stamp,
         * and it caught these two: a symbol whose colour is fixed must also stop offering
         * the field, or the dialog collects an identity the picture cannot show. Same
         * ruling the hazard areas took on 2026-08-26. @see supportsHostility
         */
        expect(supportsHostility(TacticalGraphicName.ActiveManeuverArea)).toBe(false);
        expect(supportsHostility(TacticalGraphicName.RadarSearchDoctrine)).toBe(false);
        /*
         * 200600 was the exception for one round, on the argument that its stated *white*
         * border is invisible on the basemaps this palette is built for, so its rim could
         * carry an affiliation. The user's call (2026-09-04) is that the plate says white —
         * *"Cued Acquisition Doctrine symbol has a white border (RGB: 255,255,255)"* — and
         * the identity goes with the rim.
         */
        expect(supportsHostility(TacticalGraphicName.CuedAcquisitionDoctrine)).toBe(false);
        expect(cuedAcquisitionDoctrinePaint()(ringFeature(TacticalGraphicName.CuedAcquisitionDoctrine, {hostility: 'hostileFaker'}), context)[0].stroke?.color)
            .toBe(CUED_ACQUISITION_COLOR);
    });

    it('prints 240802 in the units its own Example uses, which are not the ellipses\'', () => {
        /*
         * **Two plates letter `AM` / `AM1` / `AN` and mean different things by them.** The
         * ellipses call theirs axis *radii* and state `AN` counter-clockwise from east;
         * 240802 calls its two *"the target length (AM1) in metres and target width (AM) in
         * metres"* — full figures — and states `AN` as a compass attitude **in mils**.
         *
         * Numbers chosen so each mistake is visible: halving would print `20 km`, and
         * reading the angle as degrees would print `60` where the answer is 1067.
         */
        const feature = anchorFeature(TacticalGraphicName.TargetAreaRectangular, {width: 40_000, length: 224_000, rotation: 30});
        const drawn = textsOf(getPaintFunction(TacticalGraphicName.TargetAreaRectangular)!.label!(feature, context)).join('\n');
        expect(drawn).toContain('AM = 40 km');
        expect(drawn).toContain('AM1 = 224 km');
        // 90 - 30 = 60 degrees of compass attitude, and 60 degrees is 1067 mils.
        expect(drawn).toContain('AN = 1067 mils');
    });

    it.each([
        [TacticalGraphicName.LaunchAreaEllipse, 'rgb(255,155,0)', 'rgba(255,155,0,0.25)'],
        [TacticalGraphicName.DefendedAreaEllipse, 'rgb(85,119,136)', 'rgba(85,119,136,0.25)'],
        [TacticalGraphicName.DefendedAreaRectangle, 'rgb(85,119,136)', 'rgba(85,119,136,0.25)'],
    ])('%s takes the plate colour on its rim as well as its fill', (name, colour, fill) => {
        /*
         * **Rim and fill, not fill alone.** The first version tinted the middle and left the
         * outline in the affiliation's colour; the Examples draw an orange ellipse with an
         * orange rim and a grey one with a grey rim. (User's call, 2026-09-04.)
         */
        const [ring] = getPaintFunction(name)!.graphic!(ringFeature(name), context);
        expect(ring.stroke?.color).toBe(colour);
        expect(ring.fill?.color).toBe(fill);
    });

    it.each([
        TacticalGraphicName.LaunchAreaEllipse,
        TacticalGraphicName.DefendedAreaEllipse,
        TacticalGraphicName.DefendedAreaRectangle,
    ])('%s keeps that colour when hostile, and offers no identity', name => {
        /*
         * The two halves that have to move together. With no line work left in the
         * affiliation's colour there is nothing for an identity to show, and the sample
         * sweep asserts that anything still claiming hostility paints red from a bag-only
         * stamp. @see COLOUR_NAMED_AREAS
         */
        const hostile = ringFeature(name, {hostility: 'hostileFaker'});
        const [ring] = getPaintFunction(name)!.graphic!(hostile, context);
        expect(ring.stroke?.color).not.toMatch(/255,\s*0,\s*0/);
        expect(supportsHostility(name)).toBe(false);
    });

    it('gives the cued acquisition doctrine the white border its Note states, and the grey fill', () => {
        /*
         * **This assertion used to be `not.toBe(CUED_ACQUISITION_FILL)`**, which is true of
         * the affiliation colour and true of white — so it passed before the border changed
         * and passed after, and could not have caught either. Naming the colour is the whole
         * value of the test.
         *
         * *"Cued Acquisition Doctrine symbol has a white border (RGB: 255,255,255) with a
         * 75% transparent Grey fill"*, and its Note 2 adds that the grey panel behind the
         * Template is only there so the white can be seen.
         */
        const [box] = cuedAcquisitionDoctrinePaint()(ringFeature(TacticalGraphicName.CuedAcquisitionDoctrine), context);
        expect(box.fill?.color).toBe(CUED_ACQUISITION_FILL);
        expect(box.stroke?.color).toBe(CUED_ACQUISITION_COLOR);
    });

    it('gives the radar search doctrine both the stated cyan border and its fill', () => {
        const [sector] = radarSearchDoctrinePaint()(ringFeature(TacticalGraphicName.RadarSearchDoctrine), context);
        expect(sector.stroke?.color).toBe(RADAR_SEARCH_STROKE);
        expect(sector.fill?.color).toBe(RADAR_SEARCH_FILL);
    });

    it('states both fills at the caption alpha rather than the artwork opacity', () => {
        // The plates say "75% transparent" and their own artwork is drawn at 75% *opacity*.
        // The words are normative and a three-quarters-opaque fill hides the chart.
        for (const colour of [CUED_ACQUISITION_FILL, RADAR_SEARCH_FILL]) {
            expect(colour).toMatch(/,0\.25\)$/);
        }
    });
});

describe('the label blocks, which are three different arrangements', () => {
    const label = (name: TacticalGraphicName, properties: Record<string, unknown> = {}) =>
        textsOf(getPaintFunction(name)!.label!(anchorFeature(name, properties), context));

    it.each([
        [TacticalGraphicName.LaunchAreaEllipse, 'LA - 1'],
        [TacticalGraphicName.DefendedAreaEllipse, 'DA - 1'],
        [TacticalGraphicName.DefendedAreaRectangle, 'DA - 1'],
    ])('%s joins its literal to the designation with a hyphen', (name, expected) => {
        // `LA - 1` and `DA - 1` are the Examples' own text. `getFullLabel` would write
        // `LA 1`, which is the join every *other* prefixed area makes.
        expect(label(name, {designation: '1'})).toContain(expected);
    });

    it.each([
        TacticalGraphicName.ShipAreaOfInterestEllipse,
        TacticalGraphicName.ShipAreaOfInterestRectangle,
    ])('%s prints a bare AOI and never a designation', name => {
        /*
         * Their Templates letter `AM` / `AM1` / `AN` and **no `T` box**, and their Examples
         * print `AOI` under the shape. Passing a designation is the point of the test: the
         * field registry offers none, so one can only arrive from a restore or an import,
         * and drawing it would put text on a symbol the standard does not letter.
         */
        const drawn = label(name, {designation: 'SHOULD-NOT-DRAW'});
        expect(drawn).toEqual([getLabel(name)]);
    });

    it.each([
        TacticalGraphicName.LaunchAreaEllipse,
        TacticalGraphicName.DefendedAreaEllipse,
    ])('%s prints AM, AM1 and AN under the shape', name => {
        /*
         * **The user's call, 2026-09-04:** the Templates letter all three in boxes on their
         * own construction arrows, and the Examples print the values under the symbol. The
         * first version offered the three as dialog inputs and drew none of them.
         *
         * `AM` is the *minor axis radius* and `AM1` the *major*, so both are half the public
         * schema's figure — the factor of two this asserts, since a version that forgot it
         * still prints three plausible-looking lines. @see axisAmplifierPaint
         */
        const drawn = label(name, {width: 40_000, length: 224_000, rotation: 30});
        expect(drawn).toContain('AM = 20 km');
        expect(drawn).toContain('AM1 = 112 km');
        expect(drawn).toContain('AN = +30\u00b0');
    });

    it('sets the axis block below the shape, not over it', () => {
        const name = TacticalGraphicName.LaunchAreaEllipse;
        const marks = getPaintFunction(name)!.label!(
            anchorFeature(name, {width: 40_000, length: 224_000, rotation: 30}), context,
        );
        const block = marks.find(m => String(m.text?.text ?? '').includes('AM1'))!;
        expect((block.geometry as {coordinates: ProjectedPosition}).coordinates[1]).toBeLessThan(-200_000);
    });

    it('drops the axis block under "name only", and keeps the designation', () => {
        // The user asked for exactly this: the three are amplifiers, the `LA - T` is not.
        const name = TacticalGraphicName.LaunchAreaEllipse;
        const feature = {
            ...anchorFeature(name, {designation: '1', width: 40_000, length: 224_000, rotation: 30}),
            hideAmplifiers: true,
        } as unknown as PaintFeature;
        const drawn = withHiddenAmplifiers(getPaintFunction(name)!.label!(feature, context), true);
        const lines = textsOf(drawn);
        expect(lines).toContain('LA - 1');
        expect(lines.some(l => l.startsWith('AM'))).toBe(false);
    });

    it('sets AOI outside the shape rather than in the middle of it', () => {
        const name = TacticalGraphicName.ShipAreaOfInterestEllipse;
        const [mark] = getPaintFunction(name)!.label!(anchorFeature(name), context);
        const at = (mark.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[1]).toBeLessThan(-200_000);
    });

    it('draws the no-attack zone as N over its dates, with no designation', () => {
        const drawn = label(TacticalGraphicName.NoAttackZone, {
            designation: 'SHOULD-NOT-DRAW',
            startDate: '051030ZAPR2025',
            endDate: '051600ZAPR2025',
        });
        expect(drawn).toEqual(['N', '051030ZAPR2025 - 051600ZAPR2025']);
    });

    it('puts the radar search designation out in the search area, not at the anchor', () => {
        // The plate: "field T should be positioned in the centre of the search area aligned
        // with the search axis". The generator supplies that point; this only draws it.
        const at: ProjectedPosition = [123_000, -456_000];
        const [mark] = radarSearchLabelPaint()(anchorFeature(TacticalGraphicName.RadarSearchDoctrine, {designation: 'FF'}, at), context);
        expect((mark.geometry as {coordinates: ProjectedPosition}).coordinates).toEqual(at);
        expect(mark.text?.text).toBe('FF');
    });

    it('keeps that designation when amplifiers are hidden', () => {
        // A designation names the symbol; `amplifierSweep` asserts it for every graphic and
        // caught this paint running its text through `amplifierText`.
        const feature = {
            ...anchorFeature(TacticalGraphicName.RadarSearchDoctrine, {designation: 'FF'}),
            hideAmplifiers: true,
        } as unknown as PaintFeature;
        expect(textsOf(radarSearchLabelPaint()(feature, context))).toEqual(['FF']);
    });
});
