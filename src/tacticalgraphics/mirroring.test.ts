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
 * **The index is per graphic and cannot be guessed**, which is why it is declared. The
 * retrograde tasks put it first, on the cane; abatis puts it third, on the chevron's
 * apex; pursuit and mobile defense put it second. Getting it wrong is silent and looks
 * plausible — it was on the arrowhead of the retrograde tasks for a while, which flips
 * the graphic from the one part of it that does not move.
 */

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
    it('names the ten graphics that flip', () => {
        expect(mirrorable().sort()).toEqual([
            'Abatis',
            'Delay',
            'Disengage',
            'ForwardPassageOfLines',
            'MobileDefense',
            'Pursuit',
            'RearwardPassageOfLines',
            'Retirement',
            'Withdraw',
            'WithdrawUnderPressure',
        ]);
    });

    it('gives each of them exactly one mirror handle', () => {
        for (const name of mirrorable()) {
            const {roles} = handleContract(name as TacticalGraphicName);
            expect(roles.filter(role => role === 'mirror')).toHaveLength(1);
        }
    });

    it('puts the retrograde tasks on the cane, not the arrowhead', () => {
        // Handle 0 is the cane hanging off the start; handle 1 is the far end the arrow
        // points from. Flipping from the arrowhead is the wrong end of the symbol.
        for (const name of ['Delay', 'Withdraw', 'WithdrawUnderPressure', 'Disengage', 'Retirement', 'ForwardPassageOfLines', 'RearwardPassageOfLines'] as TacticalGraphicName[]) {
            expect(handleRole(name, 0)).toBe('mirror');
            expect(handleRole(name, 1)).toBe('shape');
        }
    });

    it('puts pursuit on its hook, first, like the retrograde tasks', () => {
        // The hook is a pursuit's cane — the part that hangs off the line and swaps
        // sides — and its generator emits that end first. A user reaching to flip a
        // graphic should find the handle in the same place on all of them.
        expect(handleRole(TacticalGraphicName.Pursuit, 0)).toBe('mirror');
        expect(handleRole(TacticalGraphicName.Pursuit, 1)).toBe('shape');
    });

    it('puts the other two where their own generators emit one', () => {
        expect(handleRole(TacticalGraphicName.Abatis, 2)).toBe('mirror');
        expect(handleRole(TacticalGraphicName.MobileDefense, 1)).toBe('mirror');
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
    const rendered = (mirrored: boolean) =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: BASES.Point as never,
            properties: {tacticalGraphic: {name: TacticalGraphicName.Pursuit, rotation: 0, radius: 60000, mirrored}},
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
