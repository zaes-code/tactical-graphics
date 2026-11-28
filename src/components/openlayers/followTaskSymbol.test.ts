/**
 * # The unit symbol reaches the map, and the designation gets out of its way
 *
 * The library decides *whether* there is a symbol and *where* it goes; this renderer turns
 * that into a `Style`. Both halves have to agree or the picture is wrong in one of two
 * visible ways — a symbol beside a designation that should have yielded to it, or a symbol
 * placed somewhere other than the hole the body left for it.
 *
 * Nothing in the package imports milsymbol: the provider here stands in for a host's.
 */

import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    resetTacticalGraphicsConfig,
    setSecuritySymbolProvider,
} from '@zaes/tactical-graphics';
import {followTaskStyleFunc} from './openlayerStyles';

const RESOLUTION = 40;
const PROVIDED = 'data:image/png;base64,iVBORw0KGgo=';

function feature(name: TacticalGraphicName, designation?: string): Feature {
    const f = new Feature(new LineString([[0, 0], [8000, 0]]));
    f.set(TACTICAL_GRAPHIC_KEY, {name, ...(designation ? {designation} : {})});
    f.set('graphicName', name);
    f.set('symbolId', `id-${name}`);
    return f;
}

const stylesFor = (name: TacticalGraphicName, designation?: string) => {
    const out = followTaskStyleFunc(name)(feature(name, designation), RESOLUTION);
    return Array.isArray(out) ? out : out ? [out] : [];
};

const textsOf = (styles: ReturnType<typeof stylesFor>) =>
    styles.map(s => s.getText?.()?.getText?.()).filter((t): t is string => typeof t === 'string');
const imagesOf = (styles: ReturnType<typeof stylesFor>) => styles.filter(s => s.getImage?.());

beforeEach(() => resetTacticalGraphicsConfig());
afterEach(() => setSecuritySymbolProvider(undefined));

describe.each([TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport])('%s', name => {
    it('draws its designation when no host provider answers', () => {
        expect(textsOf(stylesFor(name, 'TF RAIDER'))).toContain('TF RAIDER');
        expect(imagesOf(stylesFor(name, 'TF RAIDER'))).toHaveLength(0);
    });

    it('draws the host symbol instead of the designation when one does', () => {
        setSecuritySymbolProvider(() => ({src: PROVIDED}));
        const styles = stylesFor(name, 'TF RAIDER');
        expect(imagesOf(styles)).toHaveLength(1);
        expect(textsOf(styles)).not.toContain('TF RAIDER');
    });

    it('still draws the line work around it', () => {
        setSecuritySymbolProvider(() => ({src: PROVIDED}));
        // Body, connector and head are strokes; the symbol is the only image.
        expect(stylesFor(name).filter(s => s.getStroke?.()).length).toBeGreaterThanOrEqual(2);
    });

    it('draws no symbol for a provider that answers with nothing', () => {
        setSecuritySymbolProvider(() => undefined);
        expect(imagesOf(stylesFor(name, 'TF RAIDER'))).toHaveLength(0);
        expect(textsOf(stylesFor(name, 'TF RAIDER'))).toContain('TF RAIDER');
    });
});
