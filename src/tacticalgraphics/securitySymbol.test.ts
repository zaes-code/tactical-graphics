/**
 * # The renderer-neutral centre-symbol registry
 *
 * The contract both engines read. It had no tests, which is most of why the two
 * renderers could ask milsymbol for different symbols for a year without anything
 * going red — the only assertions that existed were in `openlayerStyles.test.ts`,
 * against OpenLayers' own copy of the constants.
 *
 * What is asserted here is the **shape of the request a host's provider is handed**,
 * because that is the part a host writes code against and the part that silently
 * differed between engines.
 */

import {TacticalGraphicHostility, TacticalGraphicName} from './core/type';
import type {GraphicLabels} from './core/render';
import {
    DEFAULT_SYMBOL_SIZE_PX,
    MAX_SYMBOL_SIZE_PX,
    MIN_SYMBOL_SIZE_PX,
    getSecuritySymbolProvider,
    getSecuritySymbolSize,
    resolveSecuritySymbol,
    securitySymbolRevision,
    securitySymbolSidc,
    setSecuritySymbolProvider,
    setSecuritySymbolSize,
} from './core/securitySymbol';
import type {SecuritySymbolRequest} from './core/securitySymbol';

const labels = (over: Partial<GraphicLabels> = {}): GraphicLabels => ({label: '', ...over});

const request = (over: Partial<SecuritySymbolRequest> = {}): SecuritySymbolRequest => ({
    name: TacticalGraphicName.Guard,
    hostility: TacticalGraphicHostility.friend,
    sidc: securitySymbolSidc(TacticalGraphicHostility.friend),
    sizePx: DEFAULT_SYMBOL_SIZE_PX,
    labels: labels(),
    ...over,
});

afterEach(() => {
    setSecuritySymbolProvider(undefined);
    setSecuritySymbolSize(DEFAULT_SYMBOL_SIZE_PX);
});

describe('registering nothing', () => {
    it('is a supported state — the centre is simply empty', () => {
        expect(getSecuritySymbolProvider()).toBeUndefined();
        expect(resolveSecuritySymbol(request())).toBeUndefined();
    });
});

describe('what a provider is told', () => {
    it('receives the graphic, its affiliation, the SIDC and the size', () => {
        let seen: SecuritySymbolRequest | undefined;
        setSecuritySymbolProvider(r => {
            seen = r;
            return 'data:image/svg+xml,x';
        });
        resolveSecuritySymbol(
            request({
                name: TacticalGraphicName.Screen,
                hostility: TacticalGraphicHostility.hostileFaker,
                sidc: securitySymbolSidc(TacticalGraphicHostility.hostileFaker),
            }),
        );

        expect(seen?.name).toBe(TacticalGraphicName.Screen);
        expect(seen?.hostility).toBe(TacticalGraphicHostility.hostileFaker);
        // Identity digit 6, so a host that builds its own SIDC from the affiliation can
        // check its work against the one the library would have used.
        expect(seen?.sidc).toBe('130610001413010000000000000000');
        expect(seen?.sizePx).toBe(DEFAULT_SYMBOL_SIZE_PX);
    });

    /**
     * The field this registry did not have. A provider reading `labels` worked on
     * OpenLayers and silently did nothing on MapLibre, because only one of the two
     * request types carried it — the sort of gap no single-engine test can see.
     */
    it('receives the graphic amplifiers, which only the OpenLayers half used to pass', () => {
        let seen: SecuritySymbolRequest | undefined;
        setSecuritySymbolProvider(r => {
            seen = r;
            return 'data:image/svg+xml,x';
        });
        resolveSecuritySymbol(request({labels: labels({echelon: undefined, weapon: 'TOW', grid: '38SMB4484'})}));

        expect(seen?.labels.weapon).toBe('TOW');
        expect(seen?.labels.grid).toBe('38SMB4484');
    });
});

describe('what a provider may answer', () => {
    it('takes a bare string and sizes it at what was asked for', () => {
        setSecuritySymbolProvider(() => 'data:image/svg+xml,plain');
        expect(resolveSecuritySymbol(request({sizePx: 40}))).toEqual({src: 'data:image/svg+xml,plain', sizePx: 40});
    });

    it('takes an image with its own size, which overrides the library\'s', () => {
        setSecuritySymbolProvider(() => ({src: 'data:image/svg+xml,big', sizePx: 64}));
        expect(resolveSecuritySymbol(request({sizePx: 25}))).toEqual({src: 'data:image/svg+xml,big', sizePx: 64});
    });

    it('takes an image without one, and the library\'s size applies', () => {
        setSecuritySymbolProvider(() => ({src: 'data:image/svg+xml,plain'}));
        expect(resolveSecuritySymbol(request({sizePx: 25}))?.sizePx).toBe(25);
    });

    it('takes undefined, drawing no centre symbol for that graphic alone', () => {
        setSecuritySymbolProvider(r => (r.name === TacticalGraphicName.Cover ? undefined : 'data:image/svg+xml,x'));
        expect(resolveSecuritySymbol(request({name: TacticalGraphicName.Cover}))).toBeUndefined();
        expect(resolveSecuritySymbol(request({name: TacticalGraphicName.Guard}))).toBeDefined();
    });

    /**
     * A per-graphic size is a per-graphic *image*: milsymbol bakes the requested size
     * into the SVG it returns. A renderer that caches the raster therefore cannot key
     * that cache on the graphic's name and affiliation, which is what MapLibre did —
     * every differently-sized graphic collapsed onto the first raster registered.
     */
    it('lets one provider answer differently per graphic', () => {
        setSecuritySymbolProvider(r => ({src: `data:image/svg+xml,${r.name}`, sizePx: r.name === TacticalGraphicName.Cover ? 48 : 20}));
        const cover = resolveSecuritySymbol(request({name: TacticalGraphicName.Cover}));
        const screen = resolveSecuritySymbol(request({name: TacticalGraphicName.Screen}));

        expect(cover?.src).not.toBe(screen?.src);
        expect(cover?.sizePx).toBe(48);
        expect(screen?.sizePx).toBe(20);
    });
});

describe('the revision counter a renderer flushes its rasters on', () => {
    it('changes when the provider changes', () => {
        const before = securitySymbolRevision();
        setSecuritySymbolProvider(() => 'data:image/svg+xml,x');
        expect(securitySymbolRevision()).not.toBe(before);
    });

    it('changes when only the size changes, which comparing providers would miss', () => {
        setSecuritySymbolProvider(() => 'data:image/svg+xml,x');
        const before = securitySymbolRevision();
        setSecuritySymbolSize(40);
        expect(securitySymbolRevision()).not.toBe(before);
    });
});

describe('the size', () => {
    it('clamps to the readable range rather than refusing', () => {
        setSecuritySymbolSize(1);
        expect(getSecuritySymbolSize()).toBe(MIN_SYMBOL_SIZE_PX);
        setSecuritySymbolSize(500);
        expect(getSecuritySymbolSize()).toBe(MAX_SYMBOL_SIZE_PX);
    });
});
