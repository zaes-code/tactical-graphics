# Getting started

## Install

```bash
npm install @zaes/tactical-graphics
```

The only runtime dependency is [TurfJS](https://turfjs.org/) — and only the individual modules this library actually calls, not the `@turf/turf` meta-package. That keeps the production tree at 34 packages — 32 MIT, one Unlicense, one 0BSD. No copyleft, and every one of them declares a license.

Four entry points ship, and you can use any of them on its own:

| Import | What it gives you | Needs |
|---|---|---|
| `@zaes/tactical-graphics` | The geometry, **and how a symbol is painted**. GeoJSON in, GeoJSON out — no map library, no DOM. | individual `@turf/*` modules only |
| `@zaes/tactical-graphics/openlayers` | The OpenLayers renderer: the 4326 → 3857 adapter, the feature holders and controllers, and the draw and edit interactions. | `ol` as a peer; `milsymbol` only if you want the [center symbol](/guide/center-symbol) |
| `@zaes/tactical-graphics/maplibre` | The MapLibre renderer: native GeoJSON layers, draw and edit interactions, and the same editor chrome. Exposes the **same `createTacticalGraphics`** as the OpenLayers entry point. | `maplibre-gl` as a peer; `milsymbol` for the center symbol |
| `@zaes/tactical-graphics/thumbnails` | One small SVG per graphic, for a menu or picker that has to show what the user is about to add. Inline markup or a `data:` URI — no network, no loader. | nothing |

```bash
npm install ol             # only for the OpenLayers entry point
npm install maplibre-gl    # only for the MapLibre entry point
npm install milsymbol      # only for the center symbol — six graphics carry one
```

`ol`, `maplibre-gl` and `milsymbol` are peer dependencies and all are optional, so
installing the package for its geometry alone pulls in none of them. The thumbnails
subpath has no dependency at all — it is inline markup. Nothing in this package imports
`milsymbol` — you hand it in, once, if you want it. See
[The center symbol](/guide/center-symbol).

**The same names, from either subpath.** `createTacticalGraphics` and the library's own
exports — configuration, the palette, the property key — are offered by both entry points,
so moving a program from one engine to the other changes the import path and nothing else.
A test asserts the two keep matching.

The **center-symbol controls are the exception**, and they are not a subpath's to offer:
`setSecuritySymbolProvider` and `useMilsymbolSecuritySymbols` live on the **root** entry,
because which symbol a graphic draws is symbology rather than rendering. Import them from
`@zaes/tactical-graphics` whichever engine you use. @see [The center symbol](/guide/center-symbol)

**The two renderers paint through the same code.** Colors, label placement,
screen-sized decorations, the radius read-out, which handle does what, how a
rotate picks its pivot — all of it lives in the map-agnostic entry point and both
renderers read it. That is deliberate: it is what stops the two drifting apart,
and it means a third renderer inherits the symbology rather than reinventing it.

---

## Quick start

Describe a graphic on a GeoJSON feature, call one function, get GeoJSON back:

```ts
import {renderTacticalGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';

const {graphic, labels, handles} = renderTacticalGraphic({
    type: 'Feature',
    geometry: {
        type: 'LineString',
        coordinates: [[-77.04, 38.89], [-76.95, 38.95]],
    },
    properties: {
        tacticalGraphic: {
            name: TacticalGraphicName.MainAxisOfAdvance,
            designation: '1-508 IN',
            hostility: 'Friend',
            width: 300,
        },
    },
});
```

You get three pieces back:

| | What it is |
|---|---|
| `graphic` | the drawn symbol — a `MultiLineString` here |
| `labels` | a `MultiPoint` of anchor points for text. Anchors only; you own the typography |
| `handles` | a `MultiPoint` of grab points an editor can expose as drag handles — usually the drawn vertices, plus shape or width points for the graphics that have them. A generator may leave a vertex out when a handle there would be redundant or would sit under the symbol's own label |

Everything is GeoJSON, in **EPSG:4326** (`[longitude, latitude]`), in and out.

If you want it drawn, styled and editable on a map instead, that is
[`createTacticalGraphics`](/guide/rendering) — the same three lines whichever
engine you point it at.
