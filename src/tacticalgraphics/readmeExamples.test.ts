/**
 * The three sizing examples in README.md, run. A snippet that does not compile or that
 * quietly means something else is worse than no snippet — this file has already had to be
 * fixed once for naming a constructor arity and a method that did not exist.
 */
import {renderTacticalGraphic, TacticalGraphicName} from './index';
import type {Feature, MultiLineString} from 'geojson';
import * as turf from './core/turf';

const LINE: [number, number][] = [[-77.04, 38.89], [-76.95, 38.95]];

describe('README sizing examples', () => {
    it('radius: a circle sized from its centre', () => {
        const out = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.Secure, radius: 5000, rotation: 0}},
        } as Feature);
        const ring = (out.graphic.geometry as MultiLineString).coordinates.flat();
        const far = Math.max(...ring.map(c => turf.distance(turf.point([-77.0, 38.9]), turf.point(c), {units: 'meters'})));
        // The arc itself sits at the stated radius; the arrowhead that caps it reaches
        // about 19% further, so the outermost point is ~5.9 km for a 5 km radius.
        expect(far).toBeGreaterThan(4500);
        expect(far).toBeLessThan(6500);
    });

    it('width: full width, halved into rails either side of the centreline', () => {
        const out = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: LINE},
            properties: {tacticalGraphic: {name: TacticalGraphicName.MainAxisOfAdvance, label: '1-508 IN', width: 600}},
        } as Feature);
        // Rail offset from the drawn centreline must be half the stated width.
        const rail = (out.graphic.geometry as MultiLineString).coordinates[0][0];
        const offset = turf.pointToLineDistance(turf.point(rail), turf.lineString(LINE), {units: 'meters'});
        expect(offset).toBeGreaterThan(250);
        expect(offset).toBeLessThan(350);      // ~300 m, i.e. half of 600
    });

    it('decorationSize: renders the ornament without error', () => {
        const out = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: LINE},
            properties: {tacticalGraphic: {name: TacticalGraphicName.DirectionOfSupportingAttack, decorationSize: 400}},
        } as Feature);
        // Drawn line plus an arrowhead — two sub-lines, not one.
        expect((out.graphic.geometry as MultiLineString).coordinates.length).toBe(2);
    });
});
