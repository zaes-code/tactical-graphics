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
