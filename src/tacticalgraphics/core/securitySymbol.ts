/**
 * # The center symbol of a security operation, described without a renderer
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
 * Registering nothing is a supported state: the arms and letters draw, the center
 * is simply empty.
 */

import {TacticalGraphicHostility, TacticalGraphicName} from './type';
import type {GraphicLabels} from './render';

/** What the provider is told about the symbol it is being asked for. */
export interface SecuritySymbolRequest {
    /** Cover, Guard or Screen. */
    name: TacticalGraphicName;
    /**
     * This graphic's own id, when the renderer knows one.
     *
     * Only used to find a provider registered for this graphic alone — @see
     * setGraphicSecuritySymbolProvider. A provider may read it, but two graphics of
     * the same kind are otherwise indistinguishable here, which is the whole reason
     * the per-graphic registry exists.
     */
    graphicId?: string;
    /** The graphic's affiliation, defaulted to `pending` when it carries none. */
    hostility: TacticalGraphicHostility;
    /** The 30-character MIL-STD-2525E SIDC this library would use. */
    sidc: string;
    /** Intended on-screen size in CSS pixels. */
    sizePx: number;
    /**
     * This graphic's amplifiers.
     *
     * Do not reach for this to tell two graphics of the same kind apart: Cover,
     * Guard and Screen are `SHAPE_ONLY` in the field registry and carry
     * **hostility and nothing else** — the letter between the arms is
     * `getLabel(name)`, fixed by doctrine, so two Screens are indistinguishable
     * here. It is passed because a provider is a host's code and may key on
     * whatever it likes, and because which amplifiers a graphic carries is the
     * registry's business rather than this module's.
     *
     * Present on the OpenLayers provider from the start and absent here, which
     * made a provider that read it work on one renderer and quietly not on the
     * other.
     */
    labels: GraphicLabels;
}

/** An image to draw at the center, and optionally the size to draw it at. */
export interface SecuritySymbolImage {
    /** A `data:` URI or a URL. */
    src: string;
    /** On-screen size in CSS px. Omitted means the library's current size. */
    sizePx?: number;
}

/**
 * Produces the center symbol as an image, or nothing.
 *
 * Deliberately narrower than the OpenLayers provider: no `Style`, because a
 * renderer-neutral registry cannot speak one engine's style objects. A host that
 * needs that level of control registers the OpenLayers provider as well, and it
 * takes precedence there.
 */
export type SecuritySymbolProvider = (request: SecuritySymbolRequest) => SecuritySymbolImage | string | undefined;

/** On-screen size of the center symbol in CSS pixels, with no host setting. */
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
const listeners = new Set<() => void>();

/**
 * Records a change and tells every renderer about it.
 *
 * The revision alone is a *pull*: a renderer notices it is stale the next time it
 * happens to look. That is enough for OpenLayers, whose style functions re-run on
 * the next draw, and not for MapLibre, which realizes its sources on zoom and would
 * otherwise show the old symbol until something unrelated moved the map. A provider
 * set and nothing visibly happening is not an API worth shipping.
 */
function bump(): void {
    revision++;
    listeners.forEach(listener => listener());
}

/**
 * Subscribes to provider and size changes. Returns the unsubscribe.
 *
 * For a renderer that has to be *told*. @see bump
 */
export function subscribeSecuritySymbolChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Sets how big the center symbol draws, in CSS pixels, clamped to the readable range. */
export function setSecuritySymbolSize(px: number): void {
    const next = Math.min(MAX_SYMBOL_SIZE_PX, Math.max(MIN_SYMBOL_SIZE_PX, px));
    if (next === symbolSizePx) return;
    symbolSizePx = next;
    bump();
}

/** The current center-symbol size in CSS pixels. */
export function getSecuritySymbolSize(): number {
    return symbolSizePx;
}

/**
 * Registers the provider for every security operation on every map.
 *
 * Global, like `configureTacticalGraphics`, and for the same reason: the center
 * symbol describes the symbology rather than one view, so a host should not have
 * to say it once per map. Pass `undefined` to go back to drawing no symbol.
 */
export function setSecuritySymbolProvider(next: SecuritySymbolProvider | undefined): void {
    provider = next;
    bump();
}

/** The registered provider, or `undefined` if a host has registered none. */
export function getSecuritySymbolProvider(): SecuritySymbolProvider | undefined {
    return provider;
}

/**
 * Providers bound to one graphic, by id.
 *
 * The global provider is chosen once for the whole application and is told the
 * graphic's `name` and its amplifiers — enough to give Cover, Guard and Screen
 * three different symbols, and not enough to give *this* Screen a different one
 * from that Screen. These three graphics are `SHAPE_ONLY` in the field registry
 * and carry only `hostility`, so no amount of reading the bag separates two of
 * them. A map routinely wants exactly that: one Screen is a cavalry troop and the
 * next is something else.
 *
 * Held here rather than on a renderer's object so that **one call covers both
 * engines**. OpenLayers can hang a provider on its holder because it keeps one per
 * graphic; MapLibre derives its features from GeoJSON on every realize and has no
 * such object to hang anything on. Keying by id is the mechanism that works for
 * both, and it is the only one that could be shared.
 */
const graphicProviders = new Map<string, SecuritySymbolProvider>();

/**
 * Gives one graphic its own center-symbol provider, on every renderer.
 *
 * `undefined` removes it, putting that graphic back on the global provider. The id
 * is the graphic's own — `symbolId` on an OpenLayers holder, `id` on a
 * `MapLibreTacticalGraphic`.
 */
export function setGraphicSecuritySymbolProvider(graphicId: string, next: SecuritySymbolProvider | undefined): void {
    if (next) graphicProviders.set(graphicId, next);
    else graphicProviders.delete(graphicId);
    bump();
}

/** The provider bound to one graphic, or `undefined` if it uses the global one. */
export function getGraphicSecuritySymbolProvider(graphicId: string): SecuritySymbolProvider | undefined {
    return graphicProviders.get(graphicId);
}

/**
 * Forgets every per-graphic provider.
 *
 * For a host tearing down a map: the registry is keyed by id and nothing in the
 * library knows when an id stops existing, so without this a long-lived page that
 * draws and clears repeatedly accumulates providers for graphics that are gone.
 */
export function clearGraphicSecuritySymbolProviders(): void {
    if (!graphicProviders.size) return;
    graphicProviders.clear();
    bump();
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
 *
 * Positions 9-10 are the echelon — `14`, platoon — and 11-16 the entity. They are
 * what milsymbol draws the three dots above the frame from, and the detail inside
 * it. **A template of all zeros is not a neutral default; it is a bare frame.**
 * This module carried exactly that while the OpenLayers half carried the code with
 * the digits filled in, so the same graphic drew a full symbol in one renderer and
 * an empty outline in the other — reported as MapLibre "clipping the top", which is
 * what a missing echelon looks like. Rendered through milsymbol the two differ by
 * 6 drawn elements against 2.
 *
 * The entity is illustrative rather than prescribed — FM 1-02.2 does not say which
 * unit performs a security task — so a host that cares substitutes its own through
 * a provider. What matters here is that both renderers start from **one** code.
 */
const SIDC_TEMPLATE = '130#10001413010000000000000000';

/**
 * Standard-identity digit per MIL-STD-2525E, position 4 of the SIDC.
 *
 * `assumedFriend` and `suspectJoker` are distinct identities in the standard and
 * get their own digits here, even though the *color* accessors alias them onto
 * friend and pending — color is a rendering choice, identity is what the symbol
 * asserts.
 */
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
 * fill, mono-color or frame settings and have the center symbol match the rest of
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

/**
 * The provider's answer as an image, whichever shape it returned.
 *
 * A provider bound to this graphic wins over the global one; a provider that throws
 * costs the center symbol and nothing else. The arms, the letter and every
 * interaction are already in place, and losing a whole graphic over its decoration
 * is not a trade worth making — a host's provider is a host's code, and a bad SIDC
 * or a missing DOM is the ordinary way it fails.
 */
export function resolveSecuritySymbol(request: SecuritySymbolRequest): SecuritySymbolImage | undefined {
    const active = (request.graphicId ? graphicProviders.get(request.graphicId) : undefined) ?? provider;
    if (!active) return undefined;

    let answer: ReturnType<SecuritySymbolProvider>;
    try {
        answer = active(request);
    } catch {
        return undefined;
    }
    if (!answer) return undefined;
    return typeof answer === 'string' ? {src: answer, sizePx: request.sizePx} : {sizePx: request.sizePx, ...answer};
}
