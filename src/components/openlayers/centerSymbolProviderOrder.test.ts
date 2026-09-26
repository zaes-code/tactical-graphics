/**
 * # The OpenLayers provider alone draws every center symbol
 *
 * Three places can supply a center symbol on this engine, most specific first: a
 * provider bound to one graphic (`setGraphicSecuritySymbolProvider`), the OpenLayers
 * provider (`setSecurityOperationSymbolProvider`), and the shared one
 * (`setSecuritySymbolProvider`). The order was honored by the OpenLayers style functions
 * and not by the shared paints they place the symbol from: those consulted only the
 * per-graphic and shared providers, found nothing, and reported no placement, so with the
 * OpenLayers provider alone five of the six graphics drew an empty center. The escort
 * worked because it is placed without the paint.
 *
 * Nothing in the package imports milsymbol: the providers here stand in for a host's.
 */

import Feature from 'ol/Feature';
import {LineString, MultiLineString} from 'ol/geom';
import {Icon, Style} from 'ol/style';
import {
    CENTER_SYMBOL_GRAPHICS,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    resetTacticalGraphicsConfig,
    setGraphicSecuritySymbolProvider,
    setSecuritySymbolProvider,
} from '@zaes/tactical-graphics';
import {escortOrDemonstrationStyleFunc, followTaskStyleFunc, securityOperationStyleFunc} from './openlayerStyles';
import {setSecurityOperationSymbolProvider} from './securityOperationSymbol';

const RESOLUTION = 40;

/** Geometry each family's paint can place a symbol on, in projected metres. */
function geometryFor(name: TacticalGraphicName) {
    switch (name) {
        case TacticalGraphicName.Cover:
        case TacticalGraphicName.Guard:
        case TacticalGraphicName.Screen:
            // [left arm, left head, right arm, right head], each arm starting at its inner end.
            return new MultiLineString([
                [[-2000, 0], [-6000, 0]],
                [[-6000, 0], [-5600, 300]],
                [[2000, 0], [6000, 0]],
                [[6000, 0], [5600, 300]],
            ]);
        case TacticalGraphicName.Escort:
            return new LineString([[0, 2000], [0, 0], [8000, 0], [8000, 2000]]);
        default:
            return new LineString([[0, 0], [8000, 0]]);
    }
}

function feature(name: TacticalGraphicName, designation?: string): Feature {
    const f = new Feature(geometryFor(name));
    f.set(TACTICAL_GRAPHIC_KEY, {name, ...(designation ? {designation} : {})});
    f.set('graphicName', name);
    f.set('symbolId', `id-${name}`);
    return f;
}

function styleFuncFor(name: TacticalGraphicName) {
    if (name === TacticalGraphicName.Escort) return escortOrDemonstrationStyleFunc(name);
    if (name === TacticalGraphicName.FollowAndAssume || name === TacticalGraphicName.FollowAndSupport) return followTaskStyleFunc(name);
    return securityOperationStyleFunc(name);
}

const stylesFor = (name: TacticalGraphicName, designation?: string): Style[] => {
    const out = styleFuncFor(name)(feature(name, designation), RESOLUTION);
    return Array.isArray(out) ? out : out ? [out] : [];
};

const srcsOf = (styles: Style[]) =>
    styles.map(s => s.getImage?.()).filter((i): i is Icon => i instanceof Icon).map(i => i.getSrc());

const SIX = [...CENTER_SYMBOL_GRAPHICS];

beforeEach(() => resetTacticalGraphicsConfig());
afterEach(() => {
    setSecurityOperationSymbolProvider(undefined);
    setSecuritySymbolProvider(undefined);
    SIX.forEach(name => setGraphicSecuritySymbolProvider(`id-${name}`, undefined));
});

it('covers the six graphics that carry a center symbol', () => {
    expect(SIX).toHaveLength(6);
});

describe.each(SIX)('%s', name => {
    it('draws nothing at the center with no provider registered', () => {
        expect(srcsOf(stylesFor(name))).toEqual([]);
    });

    it('draws the OpenLayers provider\'s symbol when that is the only one registered', () => {
        setSecurityOperationSymbolProvider(() => 'ol-only');
        expect(srcsOf(stylesFor(name))).toEqual(['ol-only']);
    });

    it('draws a {src, sizePx} answer from the OpenLayers provider', () => {
        setSecurityOperationSymbolProvider(() => ({src: 'ol-object', sizePx: 30}));
        expect(srcsOf(stylesFor(name))).toEqual(['ol-object']);
    });

    it('draws a Style answer from the OpenLayers provider, at the library\'s placement', () => {
        setSecurityOperationSymbolProvider(() => new Style({image: new Icon({src: 'ol-style', width: 20})}));
        const styles = stylesFor(name);
        const withImage = styles.filter(s => s.getImage?.());
        expect(withImage).toHaveLength(1);
        expect((withImage[0].getImage() as Icon).getSrc()).toBe('ol-style');
        // Placed: a cloned style with its own point geometry, not the provider's style as it came.
        expect(withImage[0].getGeometry()).toBeTruthy();
    });

    it('prefers the OpenLayers provider over the shared one', () => {
        setSecuritySymbolProvider(() => 'shared');
        setSecurityOperationSymbolProvider(() => 'ol');
        expect(srcsOf(stylesFor(name))).toEqual(['ol']);
    });

    it('prefers a per-graphic provider over the OpenLayers one', () => {
        setSecurityOperationSymbolProvider(() => 'ol');
        setGraphicSecuritySymbolProvider(`id-${name}`, () => 'this-one');
        expect(srcsOf(stylesFor(name))).toEqual(['this-one']);
    });

    /**
     * The paint looked the per-graphic provider up by a `symbolId` in the bag, which
     * OpenLayers never puts there (it is stamped on the feature), so a provider bound to
     * one graphic was found by the style and never by the paint that places it.
     */
    it('draws a per-graphic provider\'s symbol when that is the only one registered', () => {
        setGraphicSecuritySymbolProvider(`id-${name}`, () => 'this-one');
        expect(srcsOf(stylesFor(name))).toEqual(['this-one']);
    });

    it('falls back to the shared provider when the OpenLayers one is cleared', () => {
        setSecuritySymbolProvider(() => 'shared');
        setSecurityOperationSymbolProvider(() => 'ol');
        setSecurityOperationSymbolProvider(undefined);
        expect(srcsOf(stylesFor(name))).toEqual(['shared']);
    });
});

/**
 * The follow tasks lay their body out around the symbol and drop field T for it, so the
 * paint has to know the OpenLayers provider answers — not only the style that draws the
 * picture, or the designation and the symbol land on top of each other.
 */
describe.each([TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport])('%s with the OpenLayers provider', name => {
    const textsOf = (styles: Style[]) =>
        styles.map(s => s.getText?.()?.getText?.()).filter((t): t is string => typeof t === 'string');

    it('yields its designation to the symbol', () => {
        setSecurityOperationSymbolProvider(() => 'ol-only');
        const styles = stylesFor(name, 'TF RAIDER');
        expect(srcsOf(styles)).toEqual(['ol-only']);
        expect(textsOf(styles)).not.toContain('TF RAIDER');
    });

    it('keeps its designation when the OpenLayers provider answers with nothing', () => {
        setSecurityOperationSymbolProvider(() => undefined);
        const styles = stylesFor(name, 'TF RAIDER');
        expect(srcsOf(styles)).toEqual([]);
        expect(textsOf(styles)).toContain('TF RAIDER');
    });
});
