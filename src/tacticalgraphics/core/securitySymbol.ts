/**
 * # The centre symbol of a security operation, described without a renderer
 *
 * Cover, Guard and Screen each render a unit symbol between their two arms. That
 * symbol is a *single-point* icon, which is milsymbol's job and not this
 * library's — so the library does not draw it and does not import milsymbol to
 * draw it. It asks a provider, and a host registers one.
 *
 * ## Why this is here and not only in the OpenLayers half
 *
 * `openlayers/securityOperationSymbol.ts` came first and lets a provider return an
 * `ol` `Style` for full control. That escape hatch is what pins it to one
 * renderer: a second renderer cannot import the registry without dragging `ol`
 * with it, and the build asserts it must not.
 *
 * But almost nothing about the question is renderer-specific. *Which* symbol —
 * the SIDC, derived from the graphic's affiliation — and *how big* are symbology,
 * and the answer a provider gives is nearly always an image. So the image-shaped
 * half lives here, where every renderer can read it, and the `Style` hatch stays
 * an OpenLayers extension layered on top.
 *
 * A host registers once and both engines draw the symbol.
 *
 * Registering nothing is a supported state: the arms and letters draw, the centre
 * is simply empty.
 */

import {TacticalGraphicHostility, TacticalGraphicName} from './type';

/** What the provider is told about the symbol it is being asked for. */
export interface SecuritySymbolRequest {
    /** Cover, Guard or Screen. */
    name: TacticalGraphicName;
    /** The graphic's affiliation, defaulted to `pending` when it carries none. */
    hostility: TacticalGraphicHostility;
    /** The 30-character MIL-STD-2525E SIDC this library would use. */
    sidc: string;
    /** Intended on-screen size in CSS pixels. */
    sizePx: number;
}

/** An image to draw at the centre, and optionally the size to draw it at. */
export interface SecuritySymbolImage {
    /** A `data:` URI or a URL. */
    src: string;
    /** On-screen size in CSS px. Omitted means the library's current size. */
    sizePx?: number;
}

/**
 * Produces the centre symbol as an image, or nothing.
 *
 * Deliberately narrower than the OpenLayers provider: no `Style`, because a
 * renderer-neutral registry cannot speak one engine's style objects. A host that
 * needs that level of control registers the OpenLayers provider as well, and it
 * takes precedence there.
 */
export type SecuritySymbolProvider = (request: SecuritySymbolRequest) => SecuritySymbolImage | string | undefined;

/** On-screen size of the centre symbol in CSS pixels, with no host setting. */
export const DEFAULT_SYMBOL_SIZE_PX = 25;

/**
 * Readable bounds. Below 8 px a framed unit symbol is a smudge; past 96 px it
 * swamps the arms it sits between — they are about 410 px end to end at the size
 * the graphic is generated at.
 */
export const MIN_SYMBOL_SIZE_PX = 8;
export const MAX_SYMBOL_SIZE_PX = 96;

let symbolSizePx = DEFAULT_SYMBOL_SIZE_PX;
let provider: SecuritySymbolProvider | undefined;
/** Bumped on every change, so a renderer can tell its cache is stale. */
let revision = 0;

/** Sets how big the centre symbol draws, in CSS pixels, clamped to the readable range. */
export function setSecuritySymbolSize(px: number): void {
    const next = Math.min(MAX_SYMBOL_SIZE_PX, Math.max(MIN_SYMBOL_SIZE_PX, px));
    if (next === symbolSizePx) return;
    symbolSizePx = next;
    revision++;
}

/** The current centre-symbol size in CSS pixels. */
export function getSecuritySymbolSize(): number {
    return symbolSizePx;
}

/**
 * Registers the provider for every security operation on every map.
 *
 * Global, like `configureTacticalGraphics`, and for the same reason: the centre
 * symbol describes the symbology rather than one view, so a host should not have
 * to say it once per map. Pass `undefined` to go back to drawing no symbol.
 */
export function setSecuritySymbolProvider(next: SecuritySymbolProvider | undefined): void {
    provider = next;
    revision++;
}

/** The registered provider, or `undefined` if a host has registered none. */
export function getSecuritySymbolProvider(): SecuritySymbolProvider | undefined {
    return provider;
}

/**
 * A counter that changes whenever the provider or the size does.
 *
 * A renderer that rasterises the symbol needs to know when to throw that away, and
 * comparing providers by identity misses a size change. One number covers both.
 */
export function securitySymbolRevision(): number {
    return revision;
}

/**
 * The doctrinal SIDC, with the standard-identity digit left as a placeholder.
 *
 * Version 13, reality context (digit 3), symbol set 10 (land unit). Digit **4** is
 * standard identity; digit 3 is context, and putting the placeholder there instead
 * produces a valid-looking code for the wrong thing.
 */
const SIDC_TEMPLATE = '130#10000000000000000000000000000';

const IDENTITY_DIGIT: Partial<Record<TacticalGraphicHostility, string>> = {
    [TacticalGraphicHostility.pending]: '0',
    [TacticalGraphicHostility.unknown]: '1',
    [TacticalGraphicHostility.assumedFriend]: '2',
    [TacticalGraphicHostility.friend]: '3',
    [TacticalGraphicHostility.neutral]: '4',
    [TacticalGraphicHostility.suspectJoker]: '5',
    [TacticalGraphicHostility.hostileFaker]: '6',
};

/**
 * The MIL-STD-2525E SIDC for a security operation at a given affiliation.
 *
 * Exported so a host writing its own provider can start from the doctrinal code
 * rather than reverse-engineering one.
 */
export function securitySymbolSidc(hostility: TacticalGraphicHostility): string {
    return SIDC_TEMPLATE.replace('#', IDENTITY_DIGIT[hostility] ?? IDENTITY_DIGIT[TacticalGraphicHostility.pending]!);
}

/** The shape of the milsymbol module this library needs, and no more of it. */
export interface MilsymbolModule {
    Symbol: new (sidc: string, ...options: never[]) => {asSVG(): string};
}

/**
 * Registers milsymbol as the provider, for **both** renderers.
 *
 * ```ts
 * import ms from 'milsymbol';
 * import {useMilsymbolSecuritySymbols} from '@zaes/tactical-graphics';
 *
 * useMilsymbolSecuritySymbols(ms);
 * ```
 *
 * `options` is merged into every `ms.Symbol` call, so a host can pass its own
 * fill, mono-colour or frame settings and have the centre symbol match the rest of
 * its map.
 *
 * **`size` is not how you make the symbol bigger** — use
 * {@link setSecuritySymbolSize}. milsymbol's `size` sets the SVG's internal
 * resolution; the icon built around it still draws at the library's size, so
 * passing `{size: 40}` here changes the sharpness and nothing else.
 *
 * Uses `asSVG()` rather than `asCanvas().toDataURL()`: the canvas route needs a
 * real DOM, which is why a restore had to wrap the symbol build in a try/catch to
 * survive Node and jsdom, and it rasterises at one fixed size so the glyph is soft
 * on a HiDPI display. An SVG data URI has neither problem.
 */
export function useMilsymbolSecuritySymbols(ms: MilsymbolModule, options: Record<string, unknown> = {}): void {
    setSecuritySymbolProvider(({sidc, sizePx}) => {
        const svg = new ms.Symbol(sidc, {size: sizePx * 2, ...options} as never).asSVG();
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
}

/** The provider's answer as an image, whichever shape it returned. */
export function resolveSecuritySymbol(request: SecuritySymbolRequest): SecuritySymbolImage | undefined {
    const answer = provider?.(request);
    if (!answer) return undefined;
    return typeof answer === 'string' ? {src: answer, sizePx: request.sizePx} : {sizePx: request.sizePx, ...answer};
}
