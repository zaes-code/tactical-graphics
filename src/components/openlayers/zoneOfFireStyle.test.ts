/**
 * The OpenLayers half of APP-06 242600 Note 2: a zone of fire whose boundary is switched off
 * draws it transparent, as the shared paint does. @see zoneOfFireBoundary.test.ts
 */
import Feature from 'ol/Feature';
import {Polygon} from 'ol/geom';
import type {Style} from 'ol/style';
import {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getStyle} from './openlayerStyles';
import {writeGraphicProperties} from './graphicProperties';
import {getGraphicFields} from './graphicFieldRegistry';

const zone = (hideBoundary?: boolean) => {
    const feature = new Feature(new Polygon([[[0, 0], [5000, 0], [5000, 3000], [0, 3000], [0, 0]]]));
    feature.set('graphicName', TacticalGraphicName.ZoneOfFire);
    writeGraphicProperties([feature], TacticalGraphicName.ZoneOfFire, {designation: 'ZF 1', hostility: TacticalGraphicHostility.friend, hideBoundary});
    return feature;
};

const strokeColors = (feature: Feature) => {
    const styles = [getStyle(TacticalGraphicName.ZoneOfFire, feature, 10)].flat() as Style[];
    return styles.map(s => s.getStroke()?.getColor()).filter(c => c !== undefined);
};

describe('the zone of fire boundary on OpenLayers', () => {
    it('is drawn by default', () => {
        expect(strokeColors(zone()).some(c => c !== 'rgba(0,0,0,0)')).toBe(true);
    });

    it('is transparent when switched off', () => {
        const colors = strokeColors(zone(true));
        expect(colors.length).toBeGreaterThan(0);
        expect(colors.every(c => c === 'rgba(0,0,0,0)')).toBe(true);
    });

    it('is offered as a switch on the zone of fire and nowhere else', () => {
        expect(getGraphicFields(TacticalGraphicName.ZoneOfFire).boundarySwitch).toBe(true);
        const others = Object.values(TacticalGraphicName).filter(n => n !== TacticalGraphicName.ZoneOfFire && getGraphicFields(n).boundarySwitch);
        expect(others).toEqual([]);
    });
});
