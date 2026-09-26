# Advanced: reaching past the façade

Everything above works the same on both engines. Everything below does not, and is
grouped here so that the difference is a place you go rather than a surprise you meet.

The two renderers are not mirror images and are not meant to be: OpenLayers retains
mutable features and edits them in place, MapLibre derives GeoJSON sources and discards
them on the next rebuild. Those are different rendering models, and the façade exists so
you only have to care when you want to. `createTacticalGraphics(map, {manager})` and
`{renderer}` adopt an object you already built, so reaching past it costs nothing.

## Advanced: OpenLayers

`TacticalGraphicsManager`, `getController`, the feature holders and the controllers. One
thing here has no MapLibre counterpart:

**A provider that returns an `ol` `Style`.** Used verbatim — no image is built, so sizing
and anchoring are yours. `setSecurityOperationSymbolProvider` from the OpenLayers subpath
accepts this fourth return where the shared `setSecuritySymbolProvider` accepts three.
`useMilsymbolSecurityOperationSymbols(ms)` registers milsymbol as both this provider and
the shared one. On its own it is enough on OpenLayers: all six center-symbol graphics draw
from it. Changing any provider or the size repaints on its own;
`subscribeSecurityOperationSymbolChange(listener)` tells a host when that happens.

Everything *else* about the provider is shared, and a provider is resolved most-specific
first: `setGraphicSecuritySymbolProvider(id, …)`, then the OpenLayers global, then the
shared global. `labels`, a per-graphic `sizePx` and a per-graphic provider all reach both
engines. What stays OpenLayers-only is the `ol` `Style` return, which cannot cross engines
at all.

### Placing graphics from data

Skip the draw interaction when the geometry comes from data rather than a user's clicks.
You build the base feature; the controller does the rest:

```ts
import {TacticalGraphicName, TacticalGraphicHostility} from '@zaes/tactical-graphics';
import {getController, writeGraphicProperties} from '@zaes/tactical-graphics/openlayers';

const handler = getController(TacticalGraphicName.FieldsOfFire, map.getView().getResolution()!);
handler.setBaseFeature(drawnFeature);          // your own LineString / Point / Polygon feature
source.addFeatures(handler.getFeatures());     // graphic + labels + handles
manager.watchResolution(handler);              // see below — not optional

writeGraphicProperties(handler.getFeatures(), TacticalGraphicName.FieldsOfFire, {
    designation: 'A',
    hostility: TacticalGraphicHostility.hostileFaker,   // strokes turn red; text stays black
});
```

Two rules apply to anything built this way:

**Set amplifiers through `writeGraphicProperties`, never `feature.set`.**
`ol/Object.set` fires `propertychange` without calling `changed()`, so the map can
keep drawing the old label.

**`manager.watchResolution(handler)` costs nothing today, and is still the contract.**
It subscribes a handler to `change:resolution` so a graphic whose geometry is a
screen-pixel constant times the resolution can re-derive itself. **No graphic in the
library is built that way any more** — the security operations were the last, and
they are drawn from two points as of 3.0.0 — so every live controller's
`onResolutionChangeFunc` is empty and the subscription drives nothing. The manager
still does it when the user draws and `restore` still does it on load; a graphic you
build yourself should too, because the hook is what a screen-sized graphic would need
and the alternative is finding out later. Pair it with `unwatchResolution` when you
remove the graphic, or the listener outlives its features.

**The manager does not know about a graphic built this way.** `serializeTacticalGraphics`
and selection walk `manager.graphicControllers`, not the vector source, so the sample above
draws a graphic that is left out of a save. `restoreTacticalGraphics` is the path that does
all of it for you — it builds each base through `getController`, stamps `graphicName` and
`symbolId`, applies the amplifiers, registers the handler with the manager and watches its
resolution — so placing graphics from GeoJSON through it is usually the shorter route.

### When you need the restore report

`restore()` returns nothing, because the common case is "put the map back". This subpath
exposes the underlying pair when you need to know what failed:

```ts
import {serializeTacticalGraphics, restoreTacticalGraphics} from '@zaes/tactical-graphics/openlayers';

const {restored, failed} = restoreTacticalGraphics(manager, await db.load());
```

A graphic that fails to restore is reported in `failed` and rolled back on its own, so
one bad record cannot cost you the rest of the map. The report also carries `version`, the
snapshot version the file declared (or the current one where it declared none).

Unlike the façade's `restore()`, `restoreTacticalGraphics` **adds** to what the manager
already holds; it does not clear the map first.

## Advanced: MapLibre

`NativeLayerRenderer` (the renderer the façade builds and the one `{renderer}` adopts),
`CanvasOverlayRenderer` and `MapLibreInteractions`. `buildTacticalGraphic` is the
counterpart to `getController` for placing graphics from data, and hands back a ready
graphic rather than mutating a holder:

```ts
import {TacticalGraphicName, TacticalGraphicHostility} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from '@zaes/tactical-graphics/maplibre';

const graphic = buildTacticalGraphic(TacticalGraphicName.FieldsOfFire, geometry, {
    designation: 'A',
    hostility: TacticalGraphicHostility.hostileFaker,
}, resolution);
if (graphic) renderer.add(graphic);
```

**Text on the native renderer needs a glyph server.** `NativeLayerRenderer` draws labels
with MapLibre symbol layers, which read pre-generated SDF glyphs served over HTTP; there is
no path to a system font, and a style with no `glyphs` URL renders its labels silently
empty. The renderer's `glyphs` and `fontStack` options choose the server and font, and by
default it uses MapLibre's public demo server, which a production deployment should
replace.
`CanvasOverlayRenderer` paints its text itself with a real font and needs none, and neither
does OpenLayers — it is the sharpest practical difference between the two engines.
