/**
 * # Every OpenLayers centre-symbol path asks for its own graphic's unit
 *
 * The SIDC handed to a provider names the unit: 141700 Security for cover, guard and screen,
 * 130100 for the other centre-symbol graphics. The OpenLayers style functions build the request
 * themselves, so each path is checked here against what MapLibre asks for the same graphic.
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    securitySymbolSidc,
    setSecuritySymbolProvider,
    type SecuritySymbolRequest,
} from '@zaes/tactical-graphics';
import {writeGraphicProperties} from './graphicProperties';
import {escortSymbolStyle, securityOperationSymbolStyle} from './securityOperationSymbol';

const entity = (sidc: string | undefined) => sidc?.slice(10, 16);

let seen: SecuritySymbolRequest | undefined;
beforeEach(() => {
    seen = undefined;
    setSecuritySymbolProvider(request => {
        seen = request;
        return 'data:image/svg+xml,x';
    });
});
afterEach(() => setSecuritySymbolProvider(undefined));

function stamped(name: TacticalGraphicName): Feature {
    const feature = new Feature(new LineString([[0, 0], [100_000, 0]]));
    writeGraphicProperties([feature], name, {designation: '', hostility: TacticalGraphicHostility.friend});
    feature.set('graphicName', name);
    return feature;
}

describe('the unit an OpenLayers centre symbol asks for', () => {
    it('is 130100 on the escort, as on MapLibre', () => {
        escortSymbolStyle(stamped(TacticalGraphicName.Escort), 100);
        expect(entity(seen?.sidc)).toBe('130100');
        expect(seen?.sidc).toBe(securitySymbolSidc(TacticalGraphicHostility.friend, TacticalGraphicName.Escort));
    });

    it.each([TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen])('is 141700 Security on the %s', name => {
        const feature = stamped(name);
        securityOperationSymbolStyle(name, () => feature)(feature, 100);
        expect(entity(seen?.sidc)).toBe('141700');
    });
});
