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
import {ANTI_TANK_HEIGHT_RATIO, ANTI_TANK_TOOTH_PX} from '../graphics/AntiTankDitch';
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

    it('puts a mine in every notch between two teeth, and none at the ends', () => {
        const mined = discs(painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines));
        const completed = discs(painted(TacticalGraphicName.AntiTankDitchCompleted));

        expect(completed).toHaveLength(0);
        expect(mined.length).toBeGreaterThan(3);

        // A ditch of N teeth has N-1 notches: a mine goes *between* two teeth, so the run
        // can neither begin nor end with one.
        const toothWidth = ANTI_TANK_TOOTH_PX * RESOLUTION;
        const teeth = Math.floor(900_000 / toothWidth);
        expect(mined).toHaveLength(teeth - 1);
    });

    it('draws each mine big enough to see beside the tooth it sits between', () => {
        const [first] = discs(painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines));
        const ring = (first.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const xs = ring.map(p => p[0]);
        const diameterPx = (Math.max(...xs) - Math.min(...xs)) / RESOLUTION;

        // At least a fifth of the tooth's width. It was a twelfth, which is the bug.
        expect(diameterPx).toBeGreaterThan(ANTI_TANK_TOOTH_PX * 0.2);
    });

    it('keeps the mine inside its notch rather than merging with the teeth', () => {
        // The other half of the constraint: a disc drawn to the notch's limit meets the
        // filled teeth either side and the three read as one black mass.
        const [first] = discs(painted(TacticalGraphicName.AntiTankDitchReinforcedWithMines));
        const ring = (first.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const ys = ring.map(p => p[1]);
        const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
        const radius = (Math.max(...ys) - Math.min(...ys)) / 2;

        const depth = ANTI_TANK_TOOTH_PX * ANTI_TANK_HEIGHT_RATIO * RESOLUTION;
        const halfAngleSin = (ANTI_TANK_TOOTH_PX / 2) / Math.hypot(ANTI_TANK_TOOTH_PX / 2, ANTI_TANK_TOOTH_PX * ANTI_TANK_HEIGHT_RATIO);
        // The notch is an upward triangle: at `d` below the line it is `d·sin(halfAngle)`
        // wide either side of the middle.
        const room = Math.abs(centerY) * halfAngleSin;

        expect(radius).toBeLessThan(room);
        expect(Math.abs(centerY)).toBeLessThan(depth);
    });
});
