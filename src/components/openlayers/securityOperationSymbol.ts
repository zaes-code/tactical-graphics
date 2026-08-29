/**
 * The 2525E point symbol that sits at the center of a security operation.
 *
 * Cover, Guard and Screen each render a unit symbol between their two arms. That
 * symbol is a *single-point* icon, which is milsymbol's job and not this
 * library's — so the library does not draw it and does not import milsymbol to
 * draw it. It asks a provider, and a host registers one.
 *
 * Why not just import milsymbol here
 * ---------------------------------
 * `milsymbol` is declared an OPTIONAL peer dependency, and it used not to be one
 * in fact. `SecurityOperationsController` carried a static top-level
 * `import ms from 'milsymbol'`, and that controller is reachable from the
 * `/openlayers` barrel through `getController`. So importing the entry point at
 * all — for any of the two hundred graphics, not just these three — threw
 * `MODULE_NOT_FOUND` unless milsymbol was installed. The declared optionality was
 * a fiction. Injection is what makes it true: nothing in this package names
 * milsymbol, so a consumer who wants the geometry pays for nothing else.
 *
 * It also buys three things the hardcoded version could not do:
 *
 *   - **Affiliation is honored.** The old code used one frozen SIDC for all
 *     three graphics, so a hostile Screen drew a friend-framed symbol. The SIDC
 *     is now derived from the graphic's own `hostility`.
 *   - **The symbol tracks a change.** It was built once at `drawend`, so editing
 *     the affiliation afterwards left the old glyph. This is a StyleFunction, so
 *     it re-resolves whenever the feature is marked dirty.
 *   - **A host stays visually consistent.** An app that already configures
 *     milsymbol — its own size, frame, fill or icon conventions — gets the same
 *     symbol here as everywhere else on its map, instead of ours.
 *
 * Registering nothing is a supported state: the arms and labels draw, the center
 * is simply empty.
 */
import {Feature} from 'ol';
import type {FeatureLike} from 'ol/Feature';
import {LineString, Point} from 'ol/geom';
import {Icon, Style} from 'ol/style';
import {StyleFunction} from 'ol/style/Style';
import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    escortSymbolSizePx,
    getGraphicSecuritySymbolProvider,
    getSecuritySymbolProvider,
    securitySymbolSidc,
    useMilsymbolSecuritySymbols,
    followTaskSymbol,
    securityOperationSymbol,
} from '@zaes/tactical-graphics';
import {paintContext, toPaintFeature} from './paintToOpenLayers';
import {readGraphicLabels} from './graphicProperties';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';

/** What the provider is told about the symbol it is being asked for. */
export interface SecurityOperationSymbolRequest {
    /** Cover, Guard or Screen. */
    name: TacticalGraphicName;
    /** This graphic's `symbolId`, when it has one. @see setGraphicSecuritySymbolProvider */
    graphicId?: string;
    /** The graphic's current affiliation, defaulted to `pending` when it carries none. */
    hostility: TacticalGraphicHostility;
    /** The 30-character MIL-STD-2525E SIDC this library would use. @see securityOperationSidc */
    sidc: string;
    /** Intended on-screen size in CSS pixels. */
    sizePx: number;
    /**
     * This graphic's amplifiers, live off the feature.
     *
     * Do not reach for this to vary the symbol between two graphics of the same
     * kind: Cover, Guard and Screen are `SHAPE_ONLY` in the field registry and
     * carry **hostility and nothing else** — no user identifier, since the letter
     * between the arms is `getLabel(name)` and fixed by doctrine. Two Screens are
     * therefore indistinguishable here. Per-graphic symbols come from
     * `SecurityOperationsController.setSymbolProvider`.
     *
     * It is passed anyway because a provider is a host's code and may key on
     * whatever it likes, and because the set of amplifiers a graphic carries is
     * the registry's business rather than this module's.
     */
    labels: GraphicLabels;
}

/**
 * An image source, with an on-screen size that overrides the library's for this
 * symbol only.
 *
 * The middle ground between the two original return types. A bare string is
 * sized by {@link setSecurityOperationSymbolSize}, which is global; overriding it
 * per graphic used to mean returning a whole `Style`, and building a `Style` and
 * an `Icon` — remembering the centering anchor — to change one number is a poor
 * trade. Omit `sizePx` and the library's size applies, exactly as for a string.
 */
export interface SecurityOperationSymbolImage {
    /** A `data:` URI or a URL. */
    src: string;
    /** On-screen size in CSS px. Omitted means the library's current size. */
    sizePx?: number;
}

/**
 * Produces the center symbol. Four shapes, in ascending order of control:
 *
 * - a **string** — used as an image `src`, drawn at the library's size
 * - a **{@link SecurityOperationSymbolImage}** — a `src` plus its own `sizePx`
 * - an **`ol` `Style`** — used verbatim; the library builds no `Icon`, so sizing,
 *   anchoring and everything else are yours
 * - **`undefined`** — draw no center symbol
 */
export type SecurityOperationSymbolProvider = (
    request: SecurityOperationSymbolRequest,
) => Style | string | SecurityOperationSymbolImage | undefined;

/** On-screen size of the center symbol in CSS pixels, with no host setting. */
export const DEFAULT_SYMBOL_SIZE_PX = 25;

/**
 * Readable bounds, mirroring the pair on `lineWidth`. Below 8px a framed unit
 * symbol is a smudge; past 96px it swamps the arms it sits between — they are
 * about 410px end to end at the size the graphic is generated at.
 */
export const MIN_SYMBOL_SIZE_PX = 8;
export const MAX_SYMBOL_SIZE_PX = 96;

let symbolSizePx = DEFAULT_SYMBOL_SIZE_PX;

/**
 * Sets how big the center symbol draws, in CSS pixels, for every security
 * operation on every map.
 *
 * The size is the *library's*, not the provider's, because the library is what
 * builds the `Icon` around a provider that returns a `src` string — so a provider
 * had no way to change it. Passing milsymbol its own `size` option looks like it
 * should work and does not: it changes the SVG's internal resolution, and the
 * `Icon` still draws that SVG at this many pixels.
 *
 * A provider returning a whole `Style` bypasses this and owns its own sizing.
 */
export function setSecurityOperationSymbolSize(px: number): void {
    const next = Math.min(MAX_SYMBOL_SIZE_PX, Math.max(MIN_SYMBOL_SIZE_PX, px));
    if (next === symbolSizePx) return;
    symbolSizePx = next;
    // The cache is keyed on the request, size included, so stale entries could
    // never be *returned* — but nothing would ever evict them either.
    styleCache.clear();
}

/** The current center-symbol size in CSS pixels. */
export function getSecurityOperationSymbolSize(): number {
    return symbolSizePx;
}

/**
 * The MIL-STD-2525E SIDC for a security operation at a given affiliation.
 *
 * **Re-exported, not defined.** This module used to build the code from its own
 * template and its own identity-digit table, beside an identical pair in
 * `core/securitySymbol.ts` that MapLibre reads. The two drifted: this half filled
 * in the echelon and entity digits, that half left them zero, and the same graphic
 * drew a platoon symbol in OpenLayers and a bare frame in MapLibre. Which SIDC a
 * symbol carries is a symbology fact, so it lives in the map-agnostic half and both
 * renderers read it — one code, one place to correct it.
 *
 * Kept as an export because a host writing its own provider wants the doctrinal
 * code rather than a reverse-engineered one, and this subpath's provider contract
 * is the wider of the two. @see securitySymbolSidc
 */
export const securityOperationSidc = securitySymbolSidc;

let provider: SecurityOperationSymbolProvider | undefined;

/**
 * Registers the provider for every security operation on every map.
 *
 * Global, like `configureTacticalGraphics`, and for the same reason: the center
 * symbol describes the symbology rather than one view, so a host should not have
 * to say it once per map. Pass `undefined` to go back to drawing no symbol.
 */
export function setSecurityOperationSymbolProvider(next: SecurityOperationSymbolProvider | undefined): void {
    provider = next;
    styleCache.clear();
}

/** The registered provider, or `undefined` if a host has registered none. */
export function getSecurityOperationSymbolProvider(): SecurityOperationSymbolProvider | undefined {
    return provider;
}

/**
 * The shape of `milsymbol`'s default export, to the extent this module uses it.
 *
 * Declared structurally rather than imported. A `import type ms from 'milsymbol'`
 * would be erased at run time and cost nothing — but it would also make the
 * package's types unresolvable for a consumer who did not install the optional
 * peer, which is the same problem one level up.
 */
export interface MilsymbolModule {
    // Rest-typed and `any`-typed on purpose. milsymbol's real signature is
    // `new (code: string | SymbolOptions, ...options: SymbolOptions[])`, and a
    // narrower shim here fails to accept the actual module — the whole point is to
    // describe just enough of it without depending on its types.
    Symbol: new (sidc: string, ...options: any[]) => {asSVG(): string};
}

/**
 * Registers a provider backed by the milsymbol the host already has.
 *
 * ```ts
 * import ms from 'milsymbol';
 * import {useMilsymbolSecurityOperationSymbols} from '@zaes/tactical-graphics/openlayers';
 *
 * useMilsymbolSecurityOperationSymbols(ms);
 * ```
 *
 * `options` is merged into every `ms.Symbol` call, so a host can pass its own
 * `fill`, `monoColor` or frame settings and have the center symbol match the rest
 * of its map.
 *
 * **`size` is not how you make the symbol bigger** — use
 * {@link setSecurityOperationSymbolSize}. milsymbol's `size` sets the SVG's
 * internal resolution; the `Icon` built around it still draws at the library's
 * size, so passing `{size: 40}` here changes the sharpness and nothing else. It
 * is passed through rather than blocked because that is occasionally what a host
 * wants, but it is not the knob it looks like.
 *
 * Uses `asSVG()` rather than `asCanvas().toDataURL()`. The canvas route needed a
 * real DOM — which is why `restoreTacticalGraphics` had to wrap the symbol build
 * in a try/catch to survive Node and jsdom — and rasterised at one fixed size, so
 * the glyph was soft on a HiDPI display. An SVG data URI has neither problem.
 */
export function useMilsymbolSecurityOperationSymbols(ms: MilsymbolModule, options: Record<string, unknown> = {}): void {
    setSecurityOperationSymbolProvider(({sidc, sizePx}) => {
        const svg = new ms.Symbol(sidc, {size: sizePx * 2, ...options}).asSVG();
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    // And the renderer-neutral registry, so **one call serves both engines**. A host
    // that has done this from the OpenLayers entry point should not have to discover
    // a second function to make the MapLibre view draw the same symbol.
    // @see core/securitySymbol.ts for why there are two registries at all.
    useMilsymbolSecuritySymbols(ms as never, options);
}

/**
 * One resolved Style per distinct request. Rebuilding an Icon — and rasterising a
 * symbol behind it — on every render frame is wasteful.
 *
 * Keyed on the whole request and not just the SIDC, because a provider may key on
 * any of it. A cache keyed on the SIDC alone would hand two graphics with the same
 * affiliation and different labels the same glyph, which is precisely the case
 * `labels` exists to support.
 */
const styleCache = new globalThis.Map<SecurityOperationSymbolProvider, globalThis.Map<string, Style | undefined>>();

/**
 * Includes `name` so one provider can hand Cover, Guard and Screen different
 * symbols and have all three cached — the request carries it, so a key that
 * dropped it would give whichever rendered first to all of them.
 */
const cacheKey = (request: SecurityOperationSymbolRequest): string =>
    `${request.name}|${request.sidc}|${request.sizePx}|${JSON.stringify(request.labels)}`;

/**
 * Wraps a provider's `src` in the `Icon` the library builds on its behalf.
 *
 * The anchor is the reason this exists rather than being left to the caller: the
 * symbol sits between the two arms and is centered on the graphic's base point, so
 * it must be anchored at its own center. A provider that returned a `Style` and
 * forgot that got a symbol hanging down and to the right of where it belongs.
 *
 * `image.sizePx` wins over the library's when it is given.
 */
function iconStyle(image: string | SecurityOperationSymbolImage, defaultSizePx: number): Style {
    const {src, sizePx} = typeof image === 'string' ? {src: image, sizePx: undefined} : image;
    return new Style({
        image: new Icon({
            src,
            width: sizePx ?? defaultSizePx,
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
        }),
    });
}

/**
 * `active` is the per-graphic override when there is one, and the global provider
 * otherwise. Cached under the provider itself, not in one flat map: two graphics
 * with identical amplifiers and *different* providers are a normal case now, and a
 * shared key space would give the second one the first one's symbol.
 */
function resolve(request: SecurityOperationSymbolRequest, active: SecurityOperationSymbolProvider | undefined): Style | undefined {
    if (!active) return undefined;

    let perProvider = styleCache.get(active);
    if (!perProvider) {
        perProvider = new globalThis.Map<string, Style | undefined>();
        styleCache.set(active, perProvider);
    }

    const key = cacheKey(request);
    if (perProvider.has(key)) return perProvider.get(key);

    let style: Style | undefined;
    try {
        const produced = active(request);
        style = produced instanceof Style || produced === undefined ? produced : iconStyle(produced, request.sizePx);
    } catch {
        // A provider that throws — a missing DOM, a SIDC milsymbol rejects — costs
        // the center glyph and nothing else. The arms, the labels and every
        // interaction are already in place, and losing the whole graphic over its
        // decoration is not an acceptable trade.
        style = undefined;
    }

    perProvider.set(key, style);
    return style;
}

/**
 * The StyleFunction for a security operation's center symbol.
 *
 * Reads the affiliation off `source` on every render rather than closing over it,
 * so changing a graphic's hostility updates the glyph — the old code built the
 * symbol once at `drawend` and never revisited it.
 *
 * `source` is the holder's own graphic feature and not the icon feature, because
 * the icon feature is owned by the controller and is not in the set
 * `writeGraphicProperties` stamps.
 *
 * `override` is this graphic's own provider, if it has been given one. Resolved
 * per render like everything else here, so a host can set or clear it at any
 * point rather than only at construction.
 */
export function securityOperationSymbolStyle(
    name: TacticalGraphicName,
    source: () => Feature | undefined,
    override: () => SecurityOperationSymbolProvider | undefined = () => undefined,
    graphicId: () => string = () => '',
): StyleFunction {
    return () => {
        const labels = readGraphicLabels(source() ?? new Feature());
        const hostility = labels.hostility ?? TacticalGraphicHostility.pending;
        const id = graphicId();
        // **Four places a provider can come from, most specific first.** The two
        // OpenLayers ones are supersets — they may return an `ol` `Style` — and the
        // two shared ones reach both engines from a single call. The shared pair
        // used to be missed entirely on this side: a host that registered only
        // `setSecuritySymbolProvider` got symbols in MapLibre and an empty center
        // here, while the README called that call application-wide.
        const active =
            override() ??
            (id ? getGraphicSecuritySymbolProvider(id) : undefined) ??
            provider ??
            getSecuritySymbolProvider();
        return resolve(
            {name, graphicId: id || undefined, hostility, sidc: securityOperationSidc(hostility), sizePx: symbolSizePx, labels},
            active,
        );
    };
}

/**
 * The escort's centre symbol: the same provider chain, at a size taken from the bar.
 *
 * Separate from {@link securityOperationSymbolStyle} in two ways, both because an escort is
 * *drawn* where a security operation is *placed*. Its anchor is the middle of the rendered
 * bar rather than a base point — the generator emits the bar alone, and the break for the
 * symbol is cut at its midpoint — and its size comes from the bar's on-screen span rather
 * than the global setting, so the graphic and the symbol scale together.
 *
 * The size is `escortSymbolSizePx`, which is also what the paint layer sizes the hole in
 * the bar from. Reading it from anywhere else is how a symbol ends up not fitting its gap.
 */
/**
 * The unit symbol inside a follow task's body, where field T would otherwise be drawn.
 *
 * Placed and sized by the library, not here: `followTaskSymbol` is what the paint reads to
 * cut the body to fit and to know it must not also draw the designation, and a symbol
 * placed from a second calculation does not sit in its own hole. This function is only the
 * OpenLayers half — turning the library's answer into a `Style`.
 */
export function followTaskSymbolStyle(feature: FeatureLike, resolution: number): Style | undefined {
    const paintFeature = toPaintFeature(feature as Feature);
    if (!paintFeature) return undefined;

    const placement = followTaskSymbol(paintFeature, paintContext(resolution));
    if (!placement) return undefined;

    const labels = readGraphicLabels(feature);
    const hostility = labels.hostility ?? TacticalGraphicHostility.pending;
    const active =
        (feature.get('symbolId') ? getGraphicSecuritySymbolProvider(feature.get('symbolId') as string) : undefined)
        ?? provider
        ?? getSecuritySymbolProvider();

    const style = resolve(
        {
            name: feature.get('graphicName') as TacticalGraphicName,
            graphicId: (feature.get('symbolId') as string) || undefined,
            hostility,
            sidc: securitySymbolSidc(hostility),
            sizePx: placement.sizePx,
            labels,
        },
        active,
    );
    if (!style) return undefined;

    // Cached per request and therefore shared, so this one gets its own geometry rather
    // than mutating the cached style's. @see escortSymbolStyle
    const placed = style.clone();
    placed.setGeometry(new Point(placement.at as number[]));
    return placed;
}

/**
 * The unit symbol between a security operation's two arms.
 *
 * Placed and sized by the library — `securityOperationSymbol` cuts the gap from the same
 * numbers — so this is only the OpenLayers half: turning the answer into a `Style`.
 * @see followTaskSymbolStyle, which is the same arrangement for the follow tasks.
 */
export function securityOperationCentreSymbolStyle(feature: FeatureLike, resolution: number): Style | undefined {
    const paintFeature = toPaintFeature(feature as Feature);
    if (!paintFeature) return undefined;

    const placement = securityOperationSymbol(paintFeature, paintContext(resolution));
    if (!placement) return undefined;

    const labels = readGraphicLabels(feature);
    const hostility = labels.hostility ?? TacticalGraphicHostility.pending;
    const active =
        (feature.get('symbolId') ? getGraphicSecuritySymbolProvider(feature.get('symbolId') as string) : undefined)
        ?? provider
        ?? getSecuritySymbolProvider();

    const style = resolve(
        {
            name: feature.get('graphicName') as TacticalGraphicName,
            graphicId: (feature.get('symbolId') as string) || undefined,
            hostility,
            sidc: securitySymbolSidc(hostility),
            sizePx: placement.sizePx,
            labels,
        },
        active,
    );
    if (!style) return undefined;

    const placed = style.clone();
    placed.setGeometry(new Point(placement.at as number[]));
    return placed;
}

export function escortSymbolStyle(feature: FeatureLike, resolution: number): Style | undefined {
    const geometry = feature.getGeometry();
    if (!geometry || geometry.getType() !== 'LineString') return undefined;
    const coords = (geometry as LineString).getCoordinates();
    if (coords.length < 2) return undefined;

    const start = coords[0];
    const end = coords[coords.length - 1];
    const spanPx = Math.hypot(end[0] - start[0], end[1] - start[1]) / resolution;
    if (!(spanPx > 0)) return undefined;

    const labels = readGraphicLabels(feature);
    const hostility = labels.hostility ?? TacticalGraphicHostility.pending;
    const active =
        (feature.get('symbolId') ? getGraphicSecuritySymbolProvider(feature.get('symbolId') as string) : undefined)
        ?? provider
        ?? getSecuritySymbolProvider();

    const style = resolve(
        {
            name: TacticalGraphicName.Escort,
            graphicId: (feature.get('symbolId') as string) || undefined,
            hostility,
            sidc: securityOperationSidc(hostility),
            sizePx: escortSymbolSizePx(spanPx),
            labels,
        },
        active,
    );
    if (!style) return undefined;

    // The provider's answer is cached per request, so the returned `Style` is shared
    // between every escort asking for the same picture at the same size. Give this one its
    // own geometry rather than mutating the cached style's.
    const placed = style.clone();
    placed.setGeometry(new Point([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]));
    return placed;
}
