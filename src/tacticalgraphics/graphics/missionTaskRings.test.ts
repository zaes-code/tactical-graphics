/**
 * # The ring mission tasks' decoration, against MIL-STD-2525E Tables L-VIII and L-XXI
 *
 * Isolate and the two cordons carry four small, separate inward teeth on each arc; Retain's
 * tics run round both arcs without the bare stretches it used to leave.
 */
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';

const CENTER = [0, 0];
const RADIUS = 10_000;

/** The decoration members: everything after the arcs-and-head MultiLineString. */
function decoration(name: TacticalGraphicName): number[][][] {
    const {graphic} = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: CENTER},
        properties: {tacticalGraphic: {name, radius: RADIUS, rotation: 0}},
    } as never);
    const members = (graphic.geometry as {geometries: {coordinates: number[][][]}[]}).geometries;
    return members.slice(1).flatMap(m => m.coordinates);
}

const fromCentre = (p: number[]) => turf.distance(turf.point(CENTER), turf.point(p), {units: 'meters'});
/** Planar degrees from the rotation axis (east), counter-clockwise, in [0, 360). */
const angleOf = (p: number[]) => ((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360;

describe.each([TacticalGraphicName.Isolate, TacticalGraphicName.CordonAndSearch, TacticalGraphicName.CordonAndKnock])('%s', name => {
    it('has four small inward teeth on each arc', () => {
        const teeth = decoration(name);
        expect(teeth).toHaveLength(8);
        for (const [a, apex, b] of teeth) {
            // Apex a fifth of the radius in from the rim.
            expect(fromCentre(apex) / RADIUS).toBeCloseTo(0.8, 1);
            // Base about 12 degrees of arc: separate teeth, not a sawtooth.
            const span = Math.abs(angleOf(b) - angleOf(a));
            expect(Math.min(span, 360 - span)).toBeCloseTo(12, 0);
        }
    });
});

describe('Retain', () => {
    it('tics both arcs up to the start point, the arrowhead and either side of the R', () => {
        const angles = decoration(TacticalGraphicName.Retain).map(tic => angleOf(tic[0]));
        const upper = angles.filter(a => a < 180);
        const lower = angles.filter(a => a > 180);
        // Within a degree and a half: the first and last tics of each arc.
        const near = (value: number, target: number) => expect(Math.abs(value - target)).toBeLessThan(1.5);
        near(Math.min(...upper), 20);
        near(Math.max(...upper), 170);
        near(Math.min(...lower), 215);
        near(Math.max(...lower), 340);
    });
});

/** APP-06 343400, the only plate that defines Deny: a solid head, and the D low on the right. */
describe('Deny', () => {
    const rendered = () =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: CENTER},
            properties: {tacticalGraphic: {name: TacticalGraphicName.Deny, radius: RADIUS, rotation: 0}},
        } as never);

    it('fills its arrowhead', () => {
        const members = (rendered().graphic.geometry as {geometries: {type: string}[]}).geometries;
        expect(members.filter(m => m.type === 'Polygon')).toHaveLength(1);
    });

    it('sets its D at about half past four', () => {
        const label = (rendered().labels!.geometry as {coordinates: number[]}).coordinates;
        expect(angleOf(label)).toBeCloseTo(360 - 35, 0);
    });
});
