/**
 * # Fields of fire and MIL-STD-2525E Change 1's four symbols on the same V
 *
 * 2525E Change 1 (March 2025) made 140500 a grouping and coded four symbols on the fields-of-fire
 * V: 140501 Final Protective Fire (Left), the blade on the PT 1 to PT 2 leg, which is APP-06
 * 140500's picture and is kept as its own graphic so each standard's code has one; 140502 the blade on the PT 1 to PT 3 leg; 140503
 * Principal Direction of Fire, no blade; 140504 Secondary Direction of Fire, no blade and dashed.
 *
 * These go through the generator from a stored base, as a saved file does, so "left" and "right"
 * are the plate's anchor points and not an assumption about the paint's input order.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {getEntityCode, getNameByEntityCode, listEntityCodes, resolveEntityCode} from '../core/entityCodes';
import {FIELD_OF_FIRE_GRAPHICS} from '../core/fieldOfFire';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicSpecification, getSpecifications} from '../core/specifications';
import {LINE_WIDTH} from '../core/symbology';
import {TacticalGraphicName, getDisplayName} from '../core/type';
import {fieldsOfFirePaint} from './mobilityPaints';
import {PAINTABLE_GRAPHICS} from './registry';

const N = TacticalGraphicName;

/** APP-06 numbering, as stored: PT 1 the vertex, PT 2 the left tip, PT 3 the right tip. */
const PT1: ProjectedPosition = [0, 0];
const PT2: ProjectedPosition = [-0.06, 0.08];
const PT3: ProjectedPosition = [0.06, 0.08];

const context: PaintContext = {resolution: 0.00002, measureText: text => text.length * 10};

/** The graphic's generated geometry, painted. Coordinates are read as projected units. */
function painted(name: TacticalGraphicName): {paints: Paint[]; rendered: ReturnType<typeof renderTacticalGraphic>} {
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [PT1, PT2, PT3]},
        properties: {tacticalGraphic: {name}},
    } as never);
    const feature = {geometry: rendered.graphic.geometry, properties: {name, designation: 'MG'}} as PaintFeature;
    return {paints: fieldsOfFirePaint(name)(feature, context), rendered};
}

/** The blade: the one stroke wider than the line work. */
const bladesOf = (paints: Paint[]) => paints.filter(p => p.stroke && p.stroke.widthPx !== LINE_WIDTH());

/** Which tip the blade's midpoint is nearer: 2 or 3. */
function bladeSide(paints: Paint[]): 2 | 3 {
    const [blade] = bladesOf(paints);
    const [[ax, ay], [bx, by]] = (blade.geometry as {coordinates: ProjectedPosition[]}).coordinates;
    const mid: ProjectedPosition = [(ax + bx) / 2, (ay + by) / 2];
    const d = (p: ProjectedPosition) => Math.hypot(p[0] - mid[0], p[1] - mid[1]);
    return d(PT2) < d(PT3) ? 2 : 3;
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('the fields-of-fire family', () => {
    it('is five graphics, all painted, coded and named', () => {
        expect(FIELD_OF_FIRE_GRAPHICS).toEqual([
            N.FieldsOfFire,
            N.FinalProtectiveFireLeft,
            N.FinalProtectiveFireRight,
            N.PrincipalDirectionOfFire,
            N.SecondaryDirectionOfFire,
        ]);
        for (const name of FIELD_OF_FIRE_GRAPHICS) expect(PAINTABLE_GRAPHICS).toContain(name);
        expect(FIELD_OF_FIRE_GRAPHICS.map(n => getEntityCode(n))).toEqual(['140500', '140501', '140502', '140503', '140504']);
        expect(getDisplayName(N.FinalProtectiveFireLeft)).toBe('final protective fire (left)');
        expect(getDisplayName(N.FinalProtectiveFireRight)).toBe('final protective fire (right)');
        for (const name of [N.FinalProtectiveFireLeft, N.FinalProtectiveFireRight, N.PrincipalDirectionOfFire, N.SecondaryDirectionOfFire]) {
            expect(getSpecifications(name)).toEqual([TacticalGraphicSpecification.MIL_STD_2525]);
        }
    });

    it('builds the same V from the same base, whichever of the five it is', () => {
        const geometry = (name: TacticalGraphicName) => JSON.stringify(painted(name).rendered.graphic.geometry);
        for (const name of FIELD_OF_FIRE_GRAPHICS) expect(geometry(name)).toBe(geometry(N.FieldsOfFire));
    });

    it('puts the blade on the PT 1 to PT 2 leg for fields of fire and the left, and PT 1 to PT 3 for the right', () => {
        expect(bladeSide(painted(N.FieldsOfFire).paints)).toBe(2);
        expect(bladeSide(painted(N.FinalProtectiveFireLeft).paints)).toBe(2);
        expect(bladeSide(painted(N.FinalProtectiveFireRight).paints)).toBe(3);
    });

    it('draws no blade on the principal or secondary direction of fire', () => {
        expect(bladesOf(painted(N.PrincipalDirectionOfFire).paints)).toEqual([]);
        expect(bladesOf(painted(N.SecondaryDirectionOfFire).paints)).toEqual([]);
    });

    it('dashes the secondary direction of fire, legs only, and nothing else in the family', () => {
        const dashed = (name: TacticalGraphicName) => painted(name).paints.filter(p => p.stroke?.dashPx);
        const secondary = dashed(N.SecondaryDirectionOfFire);
        expect(secondary).toHaveLength(1);
        // The V's three points, not an arrowhead.
        expect((secondary[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates).toHaveLength(1);
        expect((secondary[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates[0]).toHaveLength(3);
        expect(painted(N.SecondaryDirectionOfFire).rendered.graphic.properties?.dashedParts).toEqual([0]);
        for (const name of [N.FieldsOfFire, N.FinalProtectiveFireLeft, N.FinalProtectiveFireRight, N.PrincipalDirectionOfFire])
            expect(dashed(name)).toEqual([]);
    });

    it('keeps the designation below the vertex on all five', () => {
        for (const name of FIELD_OF_FIRE_GRAPHICS) {
            const labels = painted(name).paints.filter(p => p.text);
            expect(labels).toHaveLength(1);
            expect((labels[0].geometry as {coordinates: ProjectedPosition}).coordinates).toEqual(PT1);
        }
    });
});

describe('140500 and 140501', () => {
    it('are two graphics with the same picture, one code each', () => {
        expect(resolveEntityCode('140501')).toEqual({name: N.FinalProtectiveFireLeft});
        expect(getNameByEntityCode('140500')).toBe(N.FieldsOfFire);
        expect(listEntityCodes()).toEqual(expect.arrayContaining(['140500', '140501']));
        const paints = (name: TacticalGraphicName) => JSON.stringify(painted(name).paints.map(p => p.geometry));
        expect(paints(N.FinalProtectiveFireLeft)).toBe(paints(N.FieldsOfFire));
    });
});
