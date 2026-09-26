# The center symbol

Six graphics draw a single-point 2525E unit symbol as part of themselves. That is
[milsymbol](https://github.com/spatialillusions/milsymbol)'s job, not this library's —
so this library **never imports milsymbol**. It asks a provider, and you register one:

```ts
import ms from 'milsymbol';
import {useMilsymbolSecuritySymbols} from '@zaes/tactical-graphics';

useMilsymbolSecuritySymbols(ms);   // once, at startup
```

From the **root** entry point, because a center symbol is symbology rather than
rendering: one registration serves whichever engine is drawing, and both read it. One
call covers all six, and `CENTER_SYMBOL_GRAPHICS` is the set:

| Graphic | Where the symbol goes | How big |
|---|---|---|
| Cover, Guard, Screen | between the two arms | a share of the gap between them, so a resize scales it with the symbol |
| Escort | in the break in its bar | a share of the bar's on-screen span, so the two read as one group |
| Follow And Assume, Follow And Support | inside the body, **in place of field T** | a share of the body, which is what a resize scales |

All of them stop at 96 px however far the map zooms in. A framed 2525E symbol
carries a fixed amount of information, and one that kept pace with a graphic zoomed to fill
the screen would be a badge the size of a hand. It is the ceiling
`setSecuritySymbolSize` is clamped to, so every center symbol agrees on how large it ever
draws. Zoomed *out*, Cover, Guard, Screen and the two follow tasks keep shrinking with the
graphic — a floor would leave the symbol bigger than the shape it sits in. The escort is
the exception: it holds an 8 px floor, because its size comes from the span of its bar,
which can be short while the graphic is still plainly visible.

On the two follow tasks the symbol **replaces** the designation: a picture of the unit
says more than its name. Type a designation and register no provider, and the text draws
as before. Every one of the six sizes its symbol from the graphic it sits in — none of
them holds a fixed pixel size — and all six stop growing at the same 96 px ceiling.

Register nothing and the arms and labels draw with an empty center — no error, no
missing module. That is what makes `milsymbol` an *actually* optional peer
dependency: a consumer who wants the geometry, or the other 312 graphics, never
resolves it.

The SIDC handed to the provider is derived from the graphic's own `hostility`, so a
hostile Screen gets a hostile-framed symbol and changing the affiliation redraws it.
`securitySymbolSidc(hostility)` exposes the same doctrinal code if you want to build on
it. All six offer the affiliation for that reason — the escort and the two follow tasks
are tactical mission tasks, which otherwise carry little (the escort nothing, the follow
tasks only a designation), and an entity symbol's frame *is* its standard identity.

**Size the symbol by its width.** Both renderers draw the image at the width they are
given and let its height follow the image's own aspect, because neither knows how tall
the picture is until it has loaded. The follow tasks reserve room for a frame up to 1.25×
as tall as it is wide — a 2525E land unit runs about 0.86 (friend) to 1.23 (neutral) —
so a much taller image would overflow the body it sits in.

## Sizing the symbol

**Every one of the six sizes itself from the graphic it sits in**, and stops at 96 px so
zooming in cannot inflate it. `setSecuritySymbolSize` no longer governs any of them — it
is the size for a symbol a host places itself, and it is clamped to the same 96 px ceiling
the six share (`MAX_SYMBOL_SIZE_PX`, a constant). On MapLibre it is also the fallback width
for an image that could not be rasterized:

```ts
import {setSecuritySymbolSize} from '@zaes/tactical-graphics';

setSecuritySymbolSize(40);   // CSS px, default 25, clamped to [8, 96]; both engines repaint
```

**Not** milsymbol's own `size` option. That sets the SVG's internal resolution; the
image built around it still draws at the library's size, so passing `{size: 40}` to
`useMilsymbolSecuritySymbols` changes the sharpness and nothing you can see. The size
belongs to the library because the library is what places the image around a provider
that returns a `src` string.

To size **one** symbol rather than all of them, return `{src, sizePx}` from its
provider. That wins over the size the library derived from the graphic and leaves the
global size untouched. It is used as given: the 96 px ceiling applies to the size the
library derives, not to one a provider returns.

## Choosing the symbol

Register a provider of your own instead of `useMilsymbolSecuritySymbols`. It can return
three things, in ascending order of control:

| Return | You get |
|---|---|
| a **string** | used as an image `src`, drawn at the library's size |
| **`{src, sizePx}`** | a `src` plus its own on-screen size, for this symbol only |
| **`undefined`** | no center symbol |

```ts
import {setSecuritySymbolProvider} from '@zaes/tactical-graphics';

setSecuritySymbolProvider(({name, sidc, sizePx}) => symbolFor(name, sidc, sizePx));
```

It is global — one call configures the whole application — and it is handed the
graphic's `name`, so it can give Cover, Guard and Screen three different symbols.

It also receives `labels`, the graphic's amplifiers, and may return a per-graphic
`sizePx`. In practice these three graphics carry only `hostility`
(`getGraphicFields('Screen')`, from `/openlayers`, offers nothing else), so two Screens look identical to a
provider keyed on the bag alone.

**To tell two of a kind apart, bind a provider to one graphic by id:**

```ts
import {setGraphicSecuritySymbolProvider} from '@zaes/tactical-graphics';

setGraphicSecuritySymbolProvider(graphicId, ({sidc, sizePx}) => cavalryTroop(sidc, sizePx));
setGraphicSecuritySymbolProvider(graphicId, undefined);   // back to the global provider
```

It wins over the global provider for that graphic and returns `undefined` to draw no
center symbol at all. The id is the graphic's own — `getSymbolId()` on an OpenLayers
handler (its features carry it as `symbolId`), `id` on a `MapLibreTacticalGraphic`, and
`id` on the façade's selection either way. Both engines honor it and repaint straight
away. `clearGraphicSecuritySymbolProviders()`
forgets the lot when a map is torn down:
the registry is keyed by id and the library is never told when an id stops existing.

### Worked example: three security operations, three units

Each with its own unit symbol, on **either engine** — every call below is from the façade
or the root package, so the only thing that differs between OpenLayers and MapLibre is
the subpath `createTacticalGraphics` is imported from.

The provider is the global one, keyed on `request.name`. That is enough here because the
three graphics are three *kinds*; reach for `setGraphicSecuritySymbolProvider` only when
two graphics of the **same** kind need different symbols.

```ts
import ms from 'milsymbol';
import {TacticalGraphicHostility, TacticalGraphicName, setSecuritySymbolProvider} from '@zaes/tactical-graphics';

// Entity digits — SIDC positions 11-16. Digits 1-10 are kept, so the standard identity
// the library derived from `hostility` survives the swap, and a hostile graphic stays
// hostile-framed whichever unit goes in.
const UNIT = {
    [TacticalGraphicName.Screen]: '121300',   // single diagonal — reconnaissance
    [TacticalGraphicName.Guard]: '121000',    // oval + diagonal  — armored cavalry
    [TacticalGraphicName.Cover]: '120500',    // oval             — armor
};
const UNIT_SIZE_PX = 34;   // bigger than the library's 25px default

setSecuritySymbolProvider(({name, sidc}) => {
    const entity = UNIT[name];
    if (!entity) return undefined;                    // no symbol for anything else
    // milsymbol's `size` is the SVG's internal resolution — 2x for a crisp HiDPI render.
    // `sizePx` is what it actually draws at; return a bare string to take the library's.
    const svg = new ms.Symbol(sidc.slice(0, 10) + entity + sidc.slice(16), {size: UNIT_SIZE_PX * 2}).asSVG();
    return {src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, sizePx: UNIT_SIZE_PX};
});

// Placed from data rather than drawn. `hostility` is the only amplifier these three
// take: the letter between the arms is `getLabel(name)`, fixed by doctrine as C/G/S,
// so there is no user label to set.
//
// **Two points, not one.** APP-06 gives these four anchors — one arm's ends, then the
// other's — and the library derives the second arm from the first, so the base is
// `[the arrowhead, that arm's inner end]`. A Point base throws.
const at = (name, [lon, lat], arm, hostility = TacticalGraphicHostility.friend) => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[lon, lat], [lon + arm, lat]]},
    properties: {tacticalGraphic: {name, hostility}},
});

// `restore` replaces the map's contents, so this is a load rather than an append —
// snapshot first if you are adding to something already drawn.
graphics.restore({
    type: 'FeatureCollection',
    features: [
        at(TacticalGraphicName.Screen, [-77.10, 38.89], 0.04),
        at(TacticalGraphicName.Guard, [-77.04, 38.89], 0.04, TacticalGraphicHostility.hostileFaker),
        at(TacticalGraphicName.Cover, [-76.98, 38.89], 0.04),
    ],
});
```

The entity codes are illustrative — FM 1-02.2 does not prescribe which unit performs
which security task, so substitute your own.

Note that these three are **drawn from two points in meters**, like every other graphic
in the library — they were the last screen-sized symbols and stopped being so in 3.0.0.
Nothing here has to be re-derived when the map zooms. On OpenLayers the façade still
subscribes a resolution handler for you, because that hook is what a screen-sized graphic *would* need;
see [Placing graphics from data](/guide/advanced#placing-graphics-from-data) for why the hook is kept.
