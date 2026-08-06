/**
 * `writeGraphicProperties` replaces `properties.tacticalGraphic` wholesale, so any
 * `setLabel` that writes only amplifiers erases the geometry state stamped beside them.
 * Nothing recomputes it until the next `updateGeometry`, so a save taken straight after
 * editing an amplifier loses the size the user dragged — silently.
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {AirCorridor} from './graphics/AirCorridor';
import {LineGraphicBase} from './graphics/LineGraphicBase';
import {readGraphicGeometryState} from './graphicProperties';

const line = () => new Feature(new LineString([[0, 0], [100_000, 0]]));

describe('setLabel keeps the geometry state', () => {
    it('air corridor keeps its dragged width', () => {
        const c = new AirCorridor(TacticalGraphicName.AirCorridor, 20 * 1200, 1200);
        c.setBaseFeature(line() as never);
        c.setOffset(9000);
        expect(readGraphicGeometryState(c.getFeatures()[0]).width).toBe(18000);

        c.setLabel({label: 'CORRIDOR-1'});          // what the dialog sends: amplifiers only
        expect(readGraphicGeometryState(c.getFeatures()[0]).width).toBe(18000);
    });

    it('line graphic keeps its stamped radius', () => {
        const g = new LineGraphicBase(TacticalGraphicName.PassageLane, 1200);
        g.setBaseFeature(line() as never);
        const before = readGraphicGeometryState(g.getFeatures()[0]).radius;
        expect(before).toBeGreaterThan(0);

        g.setLabel({label: 'PL-1'});
        expect(readGraphicGeometryState(g.getFeatures()[0]).radius).toBe(before);
    });
});
