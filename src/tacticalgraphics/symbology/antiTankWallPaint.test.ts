/**
 * # Antitank wall: the obstacle line with its teeth to the right of travel
 *
 * MIL-STD-2525 290204, in neither FM 1-02.2 nor APP-06. Its plate (2525D Table H-XIX) draws
 * PT 1 to PT 2 left to right with V teeth hanging below and no amplifier, and says the teeth
 * "typically point toward enemy forces". So the side is the meaning and follows the drawing
 * order, on the right where the obstacle line's teeth go on the left.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {drawsAsObstacle} from '../core/obstacles';
import {TacticalGraphicName} from '../core/type';
import {antiTankWallPaint} from './obstaclePaints';
import {obstacleLinePaint} from './paintFunctions';
import {PAINTABLE_GRAPHICS} from './registry';

const context: PaintContext = {
    resolution: 1000,
    measureText: (text) => text.length * 10,
};

/** Long enough that `decorationScale` leaves the teeth at full size. */
const line = (...coordinates: ProjectedPosition[]): PaintFeature => ({
    geometry: {type: 'LineString', coordinates},
    properties: {name: TacticalGraphicName.AntiTankWall, designation: 'W1'},
});

const vertices = (paints: Paint[]) => paints.flatMap((p) => (p.geometry.type === 'LineString' ? p.geometry.coordinates : []));

beforeEach(() => resetTacticalGraphicsConfig());

describe('MIL-STD-2525 290204 antitank wall', () => {
    it('is registered, paintable on both engines and drawn in obstacle green', () => {
        expect(PAINTABLE_GRAPHICS).toContain(TacticalGraphicName.AntiTankWall);
        expect(drawsAsObstacle(TacticalGraphicName.AntiTankWall)).toBe(true);
    });

    it('hangs its teeth below a line drawn west to east', () => {
        const ys = vertices(antiTankWallPaint()(line([0, 0], [900_000, 0]), context)).map((p) => p[1]);
        expect(Math.min(...ys)).toBeLessThan(0);
        expect(Math.max(...ys)).toBeCloseTo(0, 6);
    });

    it('puts them above the same line drawn east to west', () => {
        const ys = vertices(antiTankWallPaint()(line([900_000, 0], [0, 0]), context)).map((p) => p[1]);
        expect(Math.max(...ys)).toBeGreaterThan(0);
        expect(Math.min(...ys)).toBeCloseTo(0, 6);
    });

    it('puts them east of a line drawn south to north', () => {
        const xs = vertices(antiTankWallPaint()(line([0, 0], [0, 900_000]), context)).map((p) => p[0]);
        expect(Math.max(...xs)).toBeGreaterThan(0);
        expect(Math.min(...xs)).toBeCloseTo(0, 6);
    });

    it('is the obstacle line mirrored: same teeth, the other side of travel', () => {
        // Same tooth, same run: only the side differs.
        const forward = line([0, 0], [900_000, 0]);
        const wall = vertices(antiTankWallPaint()(forward, context));
        const obstacle = vertices(obstacleLinePaint(TacticalGraphicName.ObstacleLine)(forward, context));
        // `+ 0` folds -0 into 0, which toEqual would otherwise tell apart.
        expect(wall.map(([x, y]) => [x, -y + 0])).toEqual(obstacle.map(([x, y]) => [x, y + 0]));
    });

    it('carries no label, even when handed a designation', () => {
        const paints = antiTankWallPaint()(line([0, 0], [900_000, 0]), context);
        expect(paints.filter((p) => p.text)).toHaveLength(0);
    });
});
