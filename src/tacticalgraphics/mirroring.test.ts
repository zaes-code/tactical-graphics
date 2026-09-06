/**
 * # Which graphics flip, and which handle flips them
 *
 * Ten graphics hang part of themselves to one side of their own axis and can be turned
 * over: the seven retrograde tasks, plus abatis, pursuit and mobile defense.
 *
 * That fact lived in the OpenLayers controllers, so `handleRole` called every handle
 * `shape` and MapLibre moved a vertex where OpenLayers flipped the symbol — measured
 * across all seven of the retrograde tasks, one engine flipped via a handle and the
 * other flipped via nothing at all.
 *
 * **The index is per graphic and cannot be guessed**, which is why it is declared. Abatis
 * puts it third, on the chevron's apex; pursuit puts it second, on its hook. Getting it
 * wrong is silent and looks plausible — it sat on the arrowhead of the retrograde tasks for
 * a while, which flips the graphic from the one part of it that does not move.
 *
 * **Two graphics are left.** Mobile defence and the seven cane arrows gave the job to an
 * anchor point instead: their plates all read *"Point 3 defines which side of the line the
 * arc is on"*, so the flip is a place rather than a flag. @see RetrogradeTask
 */

import type {Position} from 'geojson';
import {anchorsForHook} from './core/anchors';
import {handleContract, handleRole, supportsMirror} from './core/handles';
import {baseGeometryFor, listTacticalGraphicNames, renderTacticalGraphic, toFeatureCollection} from './index';
import {TacticalGraphicName} from './core/type';

const BASES: Record<string, {type: string; coordinates: unknown}> = {
    Point: {type: 'Point', coordinates: [2, 1]},
    LineString: {type: 'LineString', coordinates: [[2, 1], [3, 1.6]]},
    Polygon: {type: 'Polygon', coordinates: [[[2, 1], [3, 1], [3, 2], [2, 2], [2, 1]]]},
};

/** The drawn geometry only — the flag itself is stamped onto every output feature. */
const geometryOf = (name: TacticalGraphicName, mirrored: boolean) =>
    JSON.stringify(
        toFeatureCollection(
            renderTacticalGraphic({
                type: 'Feature',
                geometry: BASES[baseGeometryFor(name) ?? 'LineString'] as never,
                properties: {tacticalGraphic: {name, rotation: 0, radius: 60000, width: 30000, mirrored}},
            }),
        ).features.map(f => f.geometry),
    );

const mirrorable = () => listTacticalGraphicNames().filter(n => supportsMirror(n as TacticalGraphicName));

describe('mirroring', () => {
    it('names the two graphics that still flip', () => {
        /*
         * **152800 left this list on 2026-09-06, then the seven cane arrows, then 344000.**
         *
         * It is the interesting departure: none of them lost the ability to face either way,
         * they stopped expressing it with an amplifier. Every one of their plates gives point
         * 3 the job — *"Point 3 defines which side of the line the arc is on"* — so dragging
         * that point across the line is the flip, and a `mirrored` flag plus a grip whose
         * only purpose was to toggle it were a second way of saying what the geometry says.
         *
         * Pursuit was the last out, and the straggler is what made the case. Its rule says
         * exactly the same thing — *"Point 3 defines the diameter and orientation of the 180
         * degree circular arc"* — but it kept the grip after its seven siblings dropped
         * theirs, which left a **mirror** handle at index 0 where every sibling has a shape
         * vertex. So the first gesture anyone tries on a cane arrow, dragging the arc's end,
         * did something different on this one symbol. (User's report, 2026-09-06: "I'm trying
         * to have consistency across similar graphics".)
         *
         * What is left is the one graphic whose side genuinely is not in its points: an
         * abatis chevron, whose base is a free-form route and whose tooth hangs off it.
         * @see MobileDefense.frame, RetrogradeTask, Pursuit.generateHandles
         */
        expect(mirrorable().sort()).toEqual(['Abatis']);
    });

    it('gives each of them exactly one mirror handle', () => {
        for (const name of mirrorable()) {
            const {roles} = handleContract(name as TacticalGraphicName);
            expect(roles.filter(role => role === 'mirror')).toHaveLength(1);
        }
    });

    it('leaves the seven cane arrows three shape grips and no mirror', () => {
        /*
         * They published `[mirror, shape]` until 2026-09-06: one grip that only turned the
         * symbol over and one for the arrowhead, with the arc's own diameter reachable from
         * neither — though APP-06 gives all seven a third anchor point that states it.
         * Now every grip moves a point the operator placed. @see RetrogradeTask
         */
        for (const name of ['Delay', 'Withdraw', 'WithdrawUnderPressure', 'Disengage', 'Retirement', 'ForwardPassageOfLines', 'RearwardPassageOfLines'] as TacticalGraphicName[]) {
            expect(handleContract(name).roles).toEqual(['shape', 'shape', 'shape']);
            expect(supportsMirror(name)).toBe(false);
        }
    });

    it('leaves pursuit three shape grips, in its base\'s own order', () => {
        /*
         * **The reversal, and the reason the whole list matters.** This asserted the
         * opposite: grip 0 was a `mirror`, because the generator emitted the hook's tip
         * first and a flip handle went where the flip was. That made the grip on the arc's
         * end flip the symbol, while the same grip on any of pursuit's seven siblings drags
         * point 3 — and point 3 *is* the flip, so the handle was a second way of saying what
         * moving it already says. Grips are `[start, join, tip]` now: index N is base point
         * N, which is what a vertex drag on either engine assumes.
         * @see Pursuit.generateHandles
         */
        const {roles} = handleContract(TacticalGraphicName.Pursuit);
        expect(roles).toEqual(['shape', 'shape', 'shape']);
        expect(handleRole(TacticalGraphicName.Pursuit, 0)).toBe('shape');
    });

    it('puts the abatis mirror where its own generator emits one', () => {
        // Mobile defence used to be the other half of this pair. @see the list above
        expect(handleRole(TacticalGraphicName.Abatis, 2)).toBe('mirror');
    });

    it('leaves mobile defence three shape grips and no mirror', () => {
        // The flip is point 3 now, so all three grips move the symbol's own anchors and
        // none of them exists purely to turn it over. @see MobileDefense.generateHandles
        const {roles} = handleContract(TacticalGraphicName.MobileDefense);
        expect(roles).toEqual(['shape', 'shape', 'shape']);
    });

    it('actually changes the drawn geometry for every one of them', () => {
        // A mirror handle on a graphic whose generator ignores `mirrored` would be a
        // gesture that visibly does nothing.
        for (const name of mirrorable()) {
            expect(geometryOf(name as TacticalGraphicName, true)).not.toEqual(geometryOf(name as TacticalGraphicName, false));
        }
    });

    it('emits a handle at every index it declares a role for', () => {
        // A declared mirror handle the generator never emits is a rule with nothing to
        // apply it to — which is what mobile defense was before it grew a second handle.
        for (const name of mirrorable()) {
            const {roles} = handleContract(name as TacticalGraphicName);
            const rendered = renderTacticalGraphic({
                type: 'Feature',
                geometry: BASES[baseGeometryFor(name as TacticalGraphicName) ?? 'LineString'] as never,
                properties: {tacticalGraphic: {name, rotation: 0, radius: 60000, width: 30000}},
            });
            const handles = (rendered.handles?.geometry as {coordinates?: unknown[]})?.coordinates ?? [];
            expect(handles.length).toBeGreaterThanOrEqual(roles.length);
        }
    });

    it('leaves a graphic without the handle alone', () => {
        expect(supportsMirror(TacticalGraphicName.PhaseLine)).toBe(false);
        expect(handleRole(TacticalGraphicName.PhaseLine, 0)).toBe('shape');
    });
});

/**
 * How a pursuit mirrors, which took two wrong turns worth recording.
 *
 * It reflects the **whole construction** about its own axis: the P-line moves to the
 * other side, the hook curls the other way, the arrowhead and its crossbar follow.
 *
 * It used to reverse the arc's *sweep* instead, keeping the line and arrowhead put and
 * sending the arc the long way round through 180°. That produced a backwards C whose
 * ends no longer met the line and the arrow — a shape that is not a pursuit at all —
 * and, because the bulge then moved east-to-west rather than across the axis, it also
 * needed a special along-axis rule to decide the flip. Reflecting properly removed both:
 * the bulge stays east, and the perpendicular decides it like every other graphic here.
 */
describe('a pursuit reflects about its own axis', () => {
    // Since the APP-06 conversion the flip is expressed by **where point 3 was drawn**,
    // not by an amplifier: the three anchor points say which side the hook falls on, so
    // there is nothing left for a `mirrored` flag to decide. The property under test is
    // unchanged — the whole construction reflects — only the way it is stated is.
    const PURSUIT_RADIUS = 60000;
    const rendered = (mirrored: boolean) =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: anchorsForHook(
                    BASES.Point.coordinates as Position,
                    PURSUIT_RADIUS,
                    0,
                    mirrored ? -1 : 1,
                ),
            } as never,
            properties: {tacticalGraphic: {name: TacticalGraphicName.Pursuit}},
        });

    it('needs no special axis — the perpendicular decides it', () => {
        for (const name of mirrorable()) {
            expect(handleContract(name as TacticalGraphicName).mirrorAxis).toBeUndefined();
        }
    });

    /** Latitude relative to the anchor — absolute latitude is positive on both sides of it. */
    const ANCHOR_LAT = (BASES.Point.coordinates as number[])[1];

    it('moves the P-line to the other side of the anchor', () => {
        // The line is what a reader sees move. At rotation 0 it sits one radius north of
        // the anchor when unmirrored and one radius south when mirrored.
        const lineY = (mirrored: boolean) => {
            const members = (rendered(mirrored).graphic.geometry as {coordinates: number[][][]}).coordinates;
            return members[0][0][1] - ANCHOR_LAT;
        };
        expect(Math.sign(lineY(false))).toBe(-Math.sign(lineY(true)));
    });

    it('carries its label and its mirror handle across with it', () => {
        const labelY = (mirrored: boolean) => (rendered(mirrored).labels?.geometry as {coordinates: number[]}).coordinates[1] - ANCHOR_LAT;
        expect(Math.sign(labelY(false))).toBe(-Math.sign(labelY(true)));

        // A handle that stays put through a flip can neither show the state nor be
        // dragged across anything.
        const handleY = (mirrored: boolean) => (rendered(mirrored).handles?.geometry as {coordinates: number[][]}).coordinates[0][1] - ANCHOR_LAT;
        expect(Math.sign(handleY(false))).toBe(-Math.sign(handleY(true)));
    });
});
