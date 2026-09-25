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

**A provider for one graphic, handed straight to the holder.** `handler.setSymbolProvider`
is the same idea as `setGraphicSecuritySymbolProvider` above without needing an id, and it
accepts this subpath's wider return — an `ol` `Style` included. It takes precedence over
the shared per-graphic registry, which works on both engines and is what to reach for
first.

**A provider that returns an `ol` `Style`.** Used verbatim — no image is built, so sizing
and anchoring are yours. `setSecurityOperationSymbolProvider` from the OpenLayers subpath
accepts this fourth return where the shared `setSecuritySymbolProvider` accepts three.

Everything *else* about the provider is shared, and a provider is resolved most-specific
first: `handler.setSymbolProvider`, then `setGraphicSecuritySymbolProvider(id, …)`, then
the OpenLayers global, then the shared global. `labels`, a per-graphic `sizePx` and a
per-graphic provider all reach both engines. What stays OpenLayers-only is the `ol`
`Style` return, which cannot cross engines at all.

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
they are drawn from two points as of 2.0.0 — so every live controller's
`onResolutionChangeFunc` is empty and the subscription drives nothing. The manager
still does it when the user draws and `restore` still does it on load; a graphic you
build yourself should too, because the hook is what a screen-sized graphic would need
and the alternative is finding out later. Pair it with `unwatchResolution` when you
remove the graphic, or the listener outlives its features.

### When you need the restore report

`restore()` returns nothing, because the common case is "put the map back". This subpath
exposes the underlying pair when you need to know what failed:

```ts
import {serializeTacticalGraphics, restoreTacticalGraphics} from '@zaes/tactical-graphics/openlayers';

const {restored, failed} = restoreTacticalGraphics(manager, await db.load());
```

A graphic that fails to restore is reported in `failed` and rolled back on its own, so
one bad record cannot cost you the rest of the map.

## Advanced: MapLibre

`NativeLayerRenderer` and `MapLibreInteractions`. `buildTacticalGraphic` is the
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

**Text needs a glyph server.** MapLibre draws labels from pre-generated SDF glyphs served
over HTTP; there is no path to a system font. A deployment either self-hosts a glyph set
or points at someone else's. OpenLayers has no equivalent requirement — it is the
sharpest practical difference between the two.
