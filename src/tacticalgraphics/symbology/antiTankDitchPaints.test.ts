/**
 * # The anti-tank ditch reinforced with mines has to look reinforced with mines
 *
 * Found by the APP-06 conformance sweep, not by a test: the mined variant rendered
 * **pixel-for-pixel identical** to the completed one. The discs were being drawn — a sixth
 * of a tooth's width, at a point where `decorationScale` had usually already halved the
 * whole pattern, which lands them at two or three pixels across and invisible against the
 * teeth beside them.
 *
 * That is the worst class of symbology defect this library can have. A symbol whose entire
 * meaning is "there are mines in this ditch" was quietly saying "there are not", and the
 * only thing separating the two graphics was a name in a menu.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {ANTI_TANK_TOOTH_PX} from '../graphics/AntiTankDitch';
import {antiTankDitchPaint} from './obstaclePaints';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** Long enough that `decorationScale` leaves the teeth at full size. */
const PATH: ProjectedPosition[] = [[0, 0], [900_000, 0]];

const feature = (name: TacticalGraphicName): PaintFeature => ({
    geometry: {type: 'LineString', coordinates: PATH},
    properties: {name},
});

const RESOLUTION = 1000;
const painted = (name: TacticalGraphicName) => antiTankDitchPaint(name)(feature(name), context(RESOLUTION));

/**
 * The filled discs.
 *
 * Selected by **vertex count**, not by "filled and unstroked": the completed ditch's teeth
 * are filled and unstroked too, for the reason the paint's own comment gives, so that test
 * picks up thirty teeth and calls them mines. A tooth is a triangle; a disc is a ring of
 * nineteen.
 */
const discs = (paints: Paint[]) =>
    paints.filter(p =>
        p.geometry.type === 'Polygon' && !!p.fill && p.geometry.coordinates[0].length > 10);

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 290203 — anti-tank ditch reinforced with mines', () => {
    it('does not render identically to the completed ditch', () => {
        // The assertion that would have caught it. Everything else about the two is the
        // same by design, so this is the whole difference between the symbols.
        const mined = JSON.stringify(painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines));
        const completed = JSON.stringify(painted(TacticalGraphicName.AntiTankDitchCompleted));
        expect(mined).not.toEqual(completed);
    });

    it('alternates tooth and mine from PT 1, the teeth apart (2525E 290203)', () => {
        const paints = painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines);
        const mined = discs(paints);
        const teeth = paints.filter(p => p.geometry.type === 'Polygon' && (p.geometry.coordinates[0] as unknown[]).length === 4);
        expect(teeth.length).toBeGreaterThan(3);
        expect(mined).toHaveLength(teeth.length);

        const minX = (p: Paint) => Math.min(...(p.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0].map(q => q[0]));
        const maxX = (p: Paint) => Math.max(...(p.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0].map(q => q[0]));
        // The run starts with a tooth, and each mine sits between the tooth before it and the next.
        expect(minX(teeth[0])).toBeLessThan(minX(mined[0]));
        for (let i = 0; i < mined.length; i++) {
            expect(minX(mined[i])).toBeGreaterThan(maxX(teeth[i]));
            if (teeth[i + 1]) expect(maxX(mined[i])).toBeLessThan(minX(teeth[i + 1]));
        }
    });

    it('draws each mine big enough to see beside the tooth it follows', () => {
        const [first] = discs(painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines));
        const ring = (first.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const xs = ring.map(p => p[0]);
        const diameterPx = (Math.max(...xs) - Math.min(...xs)) / RESOLUTION;
        expect(diameterPx).toBeGreaterThan(ANTI_TANK_TOOTH_PX * 0.4);
    });
});

/** The y of every tooth apex, relative to an eastward line: positive is left of travel. */
const apexSide = (name: TacticalGraphicName): number[] =>
    painted(name).flatMap(p => {
        const ring = (p.geometry.type === 'Polygon' ? p.geometry.coordinates[0] : p.geometry.type === 'LineString' ? p.geometry.coordinates : []) as ProjectedPosition[];
        return ring.length === 4 ? [ring[2][1]] : [];
    });

describe('which side of PT 1 -> PT 2 the teeth hang on', () => {
    it('puts 290201 and 290202 on the left, as 2525E Table L-XVI and APP-06 draw them', () => {
        for (const name of [TacticalGraphicName.AntiTankDitchUnderConstruction, TacticalGraphicName.AntiTankDitchCompleted]) {
            const sides = apexSide(name);
            expect(sides.length).toBeGreaterThan(3);
            expect(sides.every(y => y > 0)).toBe(true);
        }
    });

    it('puts 290203 on the right, where 2525E draws it', () => {
        const sides = apexSide(TacticalGraphicName.AntiTankDitchReinforcedWithMines);
        expect(sides.length).toBeGreaterThan(3);
        expect(sides.every(y => y < 0)).toBe(true);
    });
});
