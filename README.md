# Tactical Graphics

Render **MIL-STD-2525E tactical graphics** — axis-of-advance arrows, phase lines, mission tasks, range fans, boundaries — as plain **GeoJSON**.

Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON feature's `properties`. Call one function. Get GeoJSON back. Draw it with OpenLayers, MapLibre, Cesium, Leaflet, or anything else that reads GeoJSON.

This library complements [milsymbol](https://github.com/spatialillusions/milsymbol), which renders single-point unit symbols. Tactical Graphics handles the multi-point geometries milsymbol doesn't: arrows that bend along a drawn path, corridors with parallel rails, arcs and fans sized in metres.

**199 graphics** are implemented today, across 12 categories.

---

## Install

```bash
npm install @zaes/tactical-graphics
```

The only runtime dependency is [`@turf/turf`](https://turfjs.org/).

---

## Quick start

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
            label: '1-508 IN',
            hostility: 'Friend',
            radius: 300,
        },
    },
});
```

`graphic` is a `MultiLineString` — the drawn symbol. `labels` is a `MultiPoint` of anchor points for text. `handles` is a `MultiPoint` of vertices an editor can expose as drag handles.

Everything is GeoJSON, in **EPSG:4326** (`[longitude, latitude]`), in and out.

---

## The properties object

Everything the library needs lives under `properties.tacticalGraphic`. Only `name` is required; each graphic ignores the fields that don't apply to it.

```ts
properties: {
    tacticalGraphic: {
        // Required — which graphic to draw.
        name: 'MainAxisOfAdvance',

        // Amplifiers — text rendered on the graphic.
        label: '1-508 IN',        // primary designation
        secondId: 'TF RAIDER',    // secondary designation
        startDate: '021200ZJUN26',
        endDate: '021800ZJUN26',
        minAltitude: '500',
        maxAltitude: '2000',
        weapon: 'M252 81mm',      // FinalProtectiveFire only
        grid: '18SUJ2345',

        // Symbology — affects colour and dash pattern.
        hostility: 'Friend',      // Friend | Hostile/Faker | Neutral | Unknown | ...
        status: 'present',        // present | planned  (planned ⇒ dashed)
        echelon: 'battalion',
        direction: 'ONE_WAY',     // route graphics

        // Geometry, in metres.
        radius: 300,              // arrow width / circle radius
        size: 1000,               // generic size scalar (point graphics)
        rotation: 45,             // degrees (point graphics)
    },
}
```

Because the config rides on the feature, a tactical graphic is **just GeoJSON**. Save it, `POST` it, put it in PostGIS, diff it in git — then render it back with `renderTacticalGraphic()`.

The rendered output carries the same `properties.tacticalGraphic` plus a `role` of `graphic`, `label`, or `handle`, so your styling code can read a graphic's amplifiers straight off the feature it's drawing.

---

## Which geometry does a graphic need?

Each graphic expects one base geometry type. Pass the wrong one and you get a clear error rather than a broken shape.

| Base geometry | Graphics | Example |
|---|---|---|
| `LineString` | arrows, phase lines, boundaries, corridors | `MainAxisOfAdvance`, `PhaseLine` |
| `Point` | mission tasks, range fans, fighting positions | `Secure`, `Contain`, `BaseDefenseZone` |
| `Polygon` | areas | `ObjectiveArea`, `NamedAreaOfInterest` |

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: 'Secure', size: 1000, rotation: 0}},
});
```

Discover what's available at runtime:

```ts
import {listTacticalGraphicNames, GRAPHIC_CATEGORIES, getDisplayName} from '@zaes/tactical-graphics';

listTacticalGraphicNames();                     // → ['MainAxisOfAdvance', 'PhaseLine', ...]
GRAPHIC_CATEGORIES['PhaseLine'];                // → 'Lines'
getDisplayName('MainAxisOfAdvance');            // → 'main axis of advance'
```

---

## Rendering

`toFeatureCollection()` flattens a render into a `FeatureCollection` you can hand straight to a map. It returns the `graphic` and `label` features by default; ask for `handle` too when you're building an editor.

### MapLibre

```ts
import {renderTacticalGraphic, toFeatureCollection} from '@zaes/tactical-graphics';

const data = toFeatureCollection(renderTacticalGraphic(feature));

map.addSource('tg', {type: 'geojson', data});
map.addLayer({
    id: 'tg-lines',
    type: 'line',
    source: 'tg',
    filter: ['==', ['get', 'role'], 'graphic'],
    paint: {'line-width': 4, 'line-color': '#0000c8'},
});
```

### OpenLayers

`renderTacticalGraphic` emits EPSG:4326, so reproject on read:

```ts
import GeoJSON from 'ol/format/GeoJSON';

const features = new GeoJSON().readFeatures(
    toFeatureCollection(renderTacticalGraphic(feature)),
    {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'},
);
source.addFeatures(features);
```

### Leaflet

```ts
L.geoJSON(toFeatureCollection(renderTacticalGraphic(feature))).addTo(map);
```

### Drawing the label text

`labels` gives you **anchor points**, not rendered text — you own the typography. Read the text from the properties, or from `getLabel()` for graphics whose abbreviation is fixed by doctrine:

```ts
import {getLabel} from '@zaes/tactical-graphics';

getLabel('PhaseLine');           // → 'PL'   (doctrinal, not user-editable)
getLabel('FinalProtectiveFire'); // → 'FPF'
```

---

## Errors

`renderTacticalGraphic` throws `TacticalGraphicError` with an actionable message:

```
Feature has no "properties.tacticalGraphic" object. Add one naming the graphic,
e.g. {"tacticalGraphic": {"name": "PhaseLine"}}.

Unknown tactical graphic "AxisOfAdvnce". Call listTacticalGraphicNames() to see
the 199 supported names.

Graphic "Secure" expects a Point base geometry, got LineString.
```

---

## Coordinate systems

The library is projection-agnostic in one specific way: **it works entirely in EPSG:4326**, and hands you EPSG:4326 back. Reproject at your renderer's boundary, not before you call it.

Sizes (`radius`, `size`) are in **metres**, and range-fan band ranges are in **kilometres**.

---

## Project layout

```
src/tacticalgraphics/          # The library. Pure GeoJSON, map-agnostic.
  index.ts                     #   public entry point
  core/render.ts               #   renderTacticalGraphic()
  core/type.ts                 #   TacticalGraphicName + the properties schema
  core/GeometryService.ts      #   all geographic math (turf + custom)
  core/TacticalGraphicsRegistry.ts
  graphics/                    #   one generator class per graphic family

src/components/                # Demo app — not published.
  openlayers/                  #   the reference renderer (styling, draw/edit)
  maplibre/  cesium/           #   secondary adapters
```

The demo application shows drawing, editing, rotating, resizing, and a Feature Properties dialog. Run it with `npm start`.

> **Status:** the OpenLayers renderer in `src/components/openlayers/` predates the
> `properties.tacticalGraphic` API and still carries its own styling and label
> state. It is being migrated to read amplifiers from feature properties. The
> published library — geometry generation — is unaffected.

---

## Development

```bash
npm start            # run the demo app
npm test             # run the test suite
npx tsc --noEmit     # typecheck (the main correctness gate)
npm run lint         # eslint --fix
```

Contributor documentation lives in [`ai/`](./ai): `context.md` (architecture),
`conventions.md` (the patterns to follow), and `decisions.md` (why things are the
way they are). Read those before adding a graphic.

---

## Adding a graphic

1. Add the name to `TacticalGraphicName` in `core/type.ts`.
2. Write a generator in `graphics/`, extending `TacticalGraphicsBase`.
3. Register it in `core/TacticalGraphicsRegistry.ts`.
4. Add it to `GRAPHIC_CATEGORIES` in `core/categories.ts`.

Steps 1 and 4 are enforced by the compiler — `GRAPHIC_CATEGORIES` is an exhaustive
`Record<TacticalGraphicName, …>`, so TypeScript tells you what's missing. To wire
the graphic into the demo app you also need entries in
`controllerRegistry.ts` and `graphicFieldRegistry.ts`.

A graphic is "done" when a user can draw it, label it, and rotate, resize,
reposition, and modify it.

---

## Roadmap

- Migrate the OpenLayers renderer to read styling from `properties.tacticalGraphic`, so MapLibre and Cesium get styling for free.
- Map graphics to their SIDC codes (`GRAPHIC_TO_SIDC` is partial and best-effort today).
- Complete the remaining graphics from FM 1-02.2.

---

## References

- [FM 1-02.2, Military Symbols](https://www.battleorder.org/post/symbolsfm) — US Army
- [DoD Joint Military Symbology (MIL-STD-2525E)](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=114934)
- [TurfJS](https://turfjs.org/) — the geospatial math underneath

## License

MIT
