# Rendering

Both renderers expose the **same function, with the same signature, returning the
same interface**. The import line is the only difference between the two forms below
— everything after it is identical, and so is everything you do with the result.

```ts
import {createTacticalGraphics} from '@zaes/tactical-graphics/openlayers';
// ...or
import {createTacticalGraphics} from '@zaes/tactical-graphics/maplibre';

import {TacticalGraphicName} from '@zaes/tactical-graphics';

const graphics = createTacticalGraphics(map);

graphics.startDrawing(TacticalGraphicName.MainAxisOfAdvance);  // then the user clicks
graphics.setInteractionMode('edit');                           // edit | view — or a single gesture:
                                                               // translate | rotate | resize | modify

const saved = graphics.snapshot();     // portable GeoJSON, one feature per graphic
graphics.restore(saved);               // rebuilt editable — in either engine
```

`createTacticalGraphics` attaches to a map you already made, adds its own layer or
sources, and wires the draw and edit interactions. `destroy()` takes them off again
and leaves your map alone.

| | |
|---|---|
| `capabilities` | what this engine supports, so a host can disable a control **with a reason** rather than offer one that does nothing |
| `startDrawing(name)` / `cancelDrawing()` | arm the draw tool; the next clicks place the base |
| `setInteractionMode(mode)` / `getInteractionMode()` | what a drag means: `view`, `edit`, `translate`, `rotate`, `resize`, `modify`. `getInteractionMode()` also reports `drawing`, which `startDrawing` sets |
| `getSelection()` / `select(id)` | the selected graphic as `{id, name, base}`, or `null`; `select(null)` clears |
| `selectionGestures()` | which of translate, rotate and resize the selected graphic accepts, or `null` with nothing selected |
| `selectionBox()` | the selection's bounding box in map-container pixels, for drawing your own edit chrome |
| `beginGesture(kind, event)` | start a `translate`, `rotate` or `resize` on the selection from your own control; returns `false` if refused |
| `clearAll()` | remove every graphic and return to `view` |
| `snapshot()` / `restore(fc)` | the whole map as GeoJSON, and back — see [Saving and restoring](/guide/saving-and-restoring) |
| `refreshStyles()` | redraw against the current config, after `configureTacticalGraphics` |
| `destroy()` | detach every listener and interaction |

Pass callbacks as the second argument — `onChange`, `onSelect`, `onDrawEnd`,
`onModeChange` — and they mean the same thing in both engines. The same options object
also takes one engine-specific field: an existing `manager` (a `TacticalGraphicsManager`)
on OpenLayers, or an existing `renderer` (a `NativeLayerRenderer`) on MapLibre, to wrap
instead of constructing a new one.

## A complete example, per engine

The same program twice. Read either one on its own — that is the point of printing both
in full rather than a shared snippet with the import elided.

### OpenLayers

```ts
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import {fromLonLat} from 'ol/proj';

import {TacticalGraphicName, configureTacticalGraphics} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from '@zaes/tactical-graphics/openlayers';

const map = new Map({
    target: 'map',
    layers: [new TileLayer({source: new OSM()})],
    view: new View({center: fromLonLat([-77.04, 38.89]), zoom: 10}),
});

const graphics = createTacticalGraphics(map, {
    onChange: () => localStorage.setItem('map', JSON.stringify(graphics.snapshot())),
    onSelect: g => console.log(g ? `selected ${g.name}` : 'nothing selected'),
    onModeChange: mode => toolbar.setActive(mode),
});

// Draw one: the user clicks out the base geometry from here.
graphics.startDrawing(TacticalGraphicName.MainAxisOfAdvance);

// Then let them edit it.
graphics.setInteractionMode('modify');

// Re-theme at any time. The config lives in the root package, so this call is
// identical on both engines — but a repaint has to be asked for.
configureTacticalGraphics({lineWidth: 3, defaultLineColor: '#e0e0e0'});
graphics.refreshStyles();

// Save and reload.
const saved = graphics.snapshot();
graphics.clearAll();
graphics.restore(saved);

// On teardown.
graphics.destroy();
```

### MapLibre

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import {Map as MapLibreMap} from 'maplibre-gl';

import {TacticalGraphicName, configureTacticalGraphics} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from '@zaes/tactical-graphics/maplibre';

const map = new MapLibreMap({
    container: 'map',
    style: 'https://your-style-server/style.json',   // glyphs are replaced — see below
    center: [-77.04, 38.89],
    zoom: 10,
});

// Sources and layers cannot be added before the style is ready.
map.on('load', () => {
    const graphics = createTacticalGraphics(map, {
        onChange: () => localStorage.setItem('map', JSON.stringify(graphics.snapshot())),
        onSelect: g => console.log(g ? `selected ${g.name}` : 'nothing selected'),
        onModeChange: mode => toolbar.setActive(mode),
    });

    // Draw one: the user clicks out the base geometry from here.
    graphics.startDrawing(TacticalGraphicName.MainAxisOfAdvance);

    // Then let them edit it.
    graphics.setInteractionMode('modify');

    // Re-theme at any time. The config lives in the root package, so this call is
    // identical on both engines — but a repaint has to be asked for.
    configureTacticalGraphics({lineWidth: 3, defaultLineColor: '#e0e0e0'});
    graphics.refreshStyles();

    // Save and reload.
    const saved = graphics.snapshot();
    graphics.clearAll();
    graphics.restore(saved);

    // On teardown.
    graphics.destroy();
});
```

**Besides the imports, three things differ**, and each for a reason that is MapLibre's
rather than this library's: the map is constructed differently, the work waits for
`load`, and text needs a glyph server because MapLibre draws text from SDF glyph PBFs
rather than a system font. The renderer sets that server itself: on construction it
calls `map.setGlyphs()` with MapLibre's demo server
(`https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf`) and draws every label in
the `Noto Sans Bold` stack, replacing any `glyphs` URL your style carried. Neither is an
option in this release. Everything from `createTacticalGraphics` onward is
character-for-character the same.

## What the two engines share

Nearly everything, and by construction rather than by discipline: **both paint
through the same map-agnostic code**. Every color and label rule, the screen-sized
decorations, the radius read-out, which handle sets a width, which vertex is inert
under a reshape, how many points a base takes, where a rotate pivots, which graphics
must stay rectangular, and where a drag may add a vertex. Fixing one fixes both,
because there is only one of each.

Draw, edit, rotate, resize, reshape, add-a-vertex, the hover cursor and the marker
showing where a new vertex would land are all present in both.

## What still differs

| | |
|---|---|
| **Label rasterization** | MapLibre places text from an SDF glyph set, OpenLayers from a browser font. Text lands a pixel or so apart, and a label anchored off-screen is clipped by one and not placed at all by the other. Not something you can configure away. |
| **Glyph hosting** | MapLibre needs a glyph server for any text at all. The renderer points the map at MapLibre's public demo glyph server and the `Noto Sans Bold` stack, and neither is configurable yet, so labels depend on that server being reachable. OpenLayers uses the system font and needs nothing. |
| **Redraw during a zoom** | OpenLayers re-runs its style functions every frame. MapLibre has to re-realize geometry into GeoJSON, which is far too costly per frame, so mid-gesture it rebuilds only at coarse zoom steps (and no more often than a minimum interval); screen-sized decorations are briefly the wrong size between rebuilds and settle when the zoom ends. |

## The radius read-out

While a circular graphic is drawn or resized, both renderers draw a hashed line from
its center out along the gesture, labeled with the distance — meters below a
kilometer, kilometers above. It is editor chrome: `role: 'handle'`, cleared the
moment the gesture ends, and it never reaches a snapshot or a restored map.

It applies to the graphics a user sizes by dragging a radius — the circular areas, the arc
mission tasks, the range fans. Graphics whose radius is real but not a dimension you could
measure on the drawn shape are deliberately excluded: Ambush is a hooked arrow, Turn and
Tactical Turn are bowed arrows.

That same list decides whether the Feature Properties dialog shows a **Radius** read-out,
so a graphic can never report a radius in one place and not the other. Both are read-outs,
not inputs — a graphic is sized by dragging it.

The read-out is a *measurement*, so it reads in whichever unit suits the number — `400 m`,
`78 km`. The `WIDTH` (AM) amplifier uses the same formatter (`formatDistance`, exported
from the root), a deliberate departure from FM 1-02.2, which admits only meters or feet
for that field. A range fan's band labels do not: they follow the plate and print whole
meters with thousands separators, such as `MAX RG(1) 28,500`.

## Geometry only, no styling

If you would rather keep your own styling, skip the subpaths entirely.
`renderTacticalGraphic` emits EPSG:4326, so reproject on read:

```ts
import GeoJSON from 'ol/format/GeoJSON';
import {renderTacticalGraphic, toFeatureCollection} from '@zaes/tactical-graphics';

const features = new GeoJSON().readFeatures(
    toFeatureCollection(renderTacticalGraphic(feature)),
    {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'},
);
source.addFeatures(features);
```

## Showing a graphic's name only

Set `hideAmplifiers` on the **feature**, not in the `tacticalGraphic` bag, and the graphic
draws its symbol and designation while every annotation — dates, altitudes, widths, field
H, a corridor's information block — goes:

```ts
graphicFeature.set('hideAmplifiers', true);
labelFeature.set('hideAmplifiers', true);
```

**The symbol's own text is never hidden.** A cover's `C`, a mission task's letter, a `PL`
prefix, an `ACP` number: hide those and the reader is looking at a different graphic.
`TextKind` is what separates the two, and a mark that never says which it is counts as part
of the symbol — a stray date is noise, a missing letter is wrong.

It is deliberately **not** part of the portable description. It says nothing about what the
symbol is: two identical corridors side by side may reasonably differ, and none of it
should travel in a file another operator opens. So the host keeps the choice wherever its
other view state lives — a store, a URL, local storage — and supplies it at render time,
the way it supplies `graphicSize`. On MapLibre the same flag goes on the `PaintFeature`.

## A picture for a menu

A list of names does not tell an operator what is about to land on their map, and 318 of
them do not tell them apart. `@zaes/tactical-graphics/thumbnails` carries one small SVG
per graphic for exactly that:

```tsx
import {getGraphicThumbnailUrl} from '@zaes/tactical-graphics/thumbnails';
import {getDisplayName, TacticalGraphicName} from '@zaes/tactical-graphics';

Object.values(TacticalGraphicName).map(name => (
    <li key={name}>
        <img src={getGraphicThumbnailUrl(name)} alt="" width={72} height={47} loading="lazy" />
        <span>{getDisplayName(name)}</span>
    </li>
));
```

`Object.values(TacticalGraphicName)` rather than `listTacticalGraphicNames()` because the
latter [returns plain strings](/guide/tactical-graphic-object) and `getDisplayName` wants the
enum. Either works for the thumbnail itself — both accessors take a `string` too.

Four exports, and one of them is usually all you need:

| Export | Gives you |
|---|---|
| `getGraphicThumbnailUrl(name)` | A `data:` URI ready for `<img src>`. Percent-encoded, built on first ask and cached, so re-rendering the same option costs nothing |
| `getGraphicThumbnailSvg(name)` | The raw `<svg>` markup, for inlining into the DOM — the one to use if you want to restyle it with CSS |
| `GRAPHIC_THUMBNAIL_SVGS` | The whole `Partial<Record<TacticalGraphicName, string>>`, if you would rather hold the map yourself |
| `GRAPHIC_THUMBNAIL_ASPECT` | `1.53`, the width-to-height ratio of the viewBox every thumbnail is composed against, for sizing the `<img>` |

Both accessors return `undefined` for a name that has no thumbnail, so a picker can render
a spacer and keep its rows aligned.

**They are drawn by this library's own paint layer**, through the same seam the two
renderers use — not traced by hand and not exported from a design tool. A symbol and its
thumbnail cannot drift apart, and a graphic whose rendering changes gets a new thumbnail
in the same release.

**Give them a background.** The markup is transparent and its line work is black, the same
[one palette](/guide/colors-and-sizes#there-is-one-palette) the map uses. On a dark panel the only thing that
shows is the halo around the text, so the picker supplies the plate:

```css
.graphic-thumbnail { background: #fff; border-radius: 4px; }
```

That is the host's to set for the same reason the palette is: a white rectangle baked into
the artwork could never sit on anything else.

**They are tuned for a picker, not for study.** At a few dozen pixels beside a label that
already spells the name out, text is a smudge that costs the shape its room — so a line
graphic carries no amplifier at all, a point graphic carries its designation and nothing
else, and only an area keeps the full stack, held clear of its own boundary. The doctrinal
abbreviation always stays, because `PL` against `LD` against `FSCL` is the whole difference
between forty otherwise identical strokes. Areas are drawn as a free-form blob, since a
rectangle is a *different symbol* in this standard — the twenty genuinely rectangular
zones and the nineteen circular ones keep their true shapes.

**Nothing here is fetched.** The subpath is plain inline markup with no external
references, so it works offline, behind a proxy, and inside a `data:` URI. It is also
**not re-exported from the root**, so the markup only reaches a program that imports the
subpath — using this package for geometry costs you nothing for pictures you never asked
for.

## Your own features, our styling

Between the two: you want the symbols to look right, but the features have to be
yours — your layer, your ids, your selection model. `stylesFor(name)` gives you the
style pair the library's own holders draw that graphic with.

```ts
import {renderTacticalGraphic} from '@zaes/tactical-graphics';
import {prepareFeatures} from '@zaes/tactical-graphics/openlayers';

const rendered = renderTacticalGraphic(feature);
const {graphic, labels} = prepareFeatures(rendered);

source.addFeature(graphic);

// `labels` is undefined for 114 of the 318 graphics — the ones that keep every glyph
// on the graphic feature, like a phase line whose "PL ALPHA" rides its own line work.
// Adding a label feature for one of those draws its designation twice.
if (labels) source.addFeature(labels);
```

They are your features: stamp your own ids, selection state and layer keys on them
before you add them. `prepareFeatures` takes `{featureProjection}` if your map is not
Web Mercator, and `{hideAmplifiers: true}` to draw a graphic name-only.

**What it does, in case you want to do it yourself.** Three steps that have to happen in
order, and all three parts stay exported:

1. Read the GeoJSON into OpenLayers features, projecting 4326 → your map's projection.
2. `stylesFor(name)` — the style pair the library's own holders draw that graphic with.
   A `labels` of `undefined` is the signal above.
3. `publishGraphicExtent(labels, graphic)` — how big the shape is. Several symbols are
   *fitted* to the area they land in: the CBRN triangle, the airfield zone's crossed
   runways, the sector-1 modifier glyphs. The fit reads the extent off the **label**
   feature, which is a bare anchor point with no shape of its own, so skipping this
   leaves them at a fixed size in meters — **silently**. Nothing throws and the map
   looks plausible until you notice a symbol that does not grow with its shape.

**Do not reach for `getStyle` here.** It is exported, it takes a name and it returns
styles, which makes it look like this answer — but it is the *area outline*
dispatcher. It draws no text, and for the graphics that are not areas it is the wrong
function. An integration that used it for both features shipped with every area
unlabelled and every arc mission task missing the letter that identifies it.

Amplifiers still come off the feature, so stamp `properties.tacticalGraphic` on
anything you build by hand — `renderTacticalGraphic` already does it for its own
output. Sizes that a style reads, such as a corridor's `graphicSize`, are set the
same way.

## Any GeoJSON renderer

`toFeatureCollection()` flattens a render into a standard `FeatureCollection`, so any
renderer that reads GeoJSON can consume it — filter on `properties.role`
(`graphic` / `label` / `handle`) to style each part. It returns the `graphic` and
`label` features by default; ask for `handle` too when you are building an editor.

**Geometry is not the whole symbol.** Obstacle teeth, the gap cut around a mission
task's letter, a screen-sized arrowhead and the rest are synthesized at paint time,
so a raw `renderTacticalGraphic` consumer gets the skeleton. The paint functions are
exported from the root entry point for exactly this — `getPaintFunction(name)`
returns the graphic's paint functions, which return the marks to draw, in projected
meters, with no renderer in them. That is
how both of the renderers above are built, and it is the supported way to build a
third.

**Start from the builder rather than the paint functions.** `buildPaintedGraphic` takes a
graphic's name, its base geometry in lon/lat and its `tacticalGraphic` fields, and returns
the paint layer's input with the base tidied and every default filled in, the same way the
MapLibre renderer builds its graphics. `paintGraphic` then returns the marks:

```ts
import {buildPaintedGraphic, paintGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';

const resolution = 20;                                          // meters per screen pixel
const context = document.createElement('canvas').getContext('2d')!;  // only to measure text

const graphic = buildPaintedGraphic(TacticalGraphicName.FieldsOfFire, geometry, {designation: 'A'}, resolution);
const paints = graphic
    ? paintGraphic(graphic, {resolution, measureText: (text, font) => ((context.font = font), context.measureText(text).width)})
    : [];

for (const paint of paints) {
    // paint.geometry is in EPSG:3857 meters; draw its stroke, fill, text or circle.
}
```

`restoreSnapshotGraphics(snapshot, resolution)` builds a whole saved map the same way, and
`lonLatToMercator` / `mercatorToLonLat` convert between the two coordinate spaces.

## Drawing the label text

`labels` gives you **anchor points**, not rendered text. Read the text from the
properties, or from `getLabel()` for graphics whose abbreviation is fixed by doctrine:

```ts
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';

getLabel(TacticalGraphicName.PhaseLine);           // → 'PL'   (doctrinal, not user-editable)
getLabel(TacticalGraphicName.FinalProtectiveFire); // → 'FPF'
```

**Making room for the letter on the arc mission tasks.** Secure, Isolate, Retain,
Occupy, Control, Contain, Deny, Locate, Cordon and Search, Cordon and Knock and Area
Defense are two arcs of one circle with a short label in the hole between them — `S`,
`AD`, `C/S` and `LOC` all occur. The generator leaves 15° of
arc either side of the label, which is the best it can do with no glyph to measure —
so on a large circle the hole is bigger than the letter needs.

If you measure your own text, set `labelGapDegrees: 0` and the arcs run right up to
the label axis; cut the gap yourself from the rendered glyph. That is what both of this
package's renderers do, and why their circles hug their letters at every size:

```ts
tacticalGraphic: {name: 'Secure', radius: 1000, rotation: 0, labelGapDegrees: 0}
```

The gap is **tangential**: a horizontal label sitting due east of the circle needs
clearance for its *height*, not its width.
