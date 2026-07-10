# Tactical Graphics

Render **MIL-STD-2525E tactical graphics** — axis-of-advance arrows, phase lines, mission tasks, range fans, boundaries — as plain **GeoJSON**.

Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON feature's `properties`. Call one function. Get GeoJSON back. Draw it with OpenLayers, MapLibre, Cesium, Leaflet, or anything else that reads GeoJSON.

This library complements [milsymbol](https://github.com/spatialillusions/milsymbol), which renders single-point unit symbols. Tactical Graphics handles the multi-point geometries milsymbol doesn't: arrows that bend along a drawn path, corridors with parallel rails, arcs and fans sized in metres.

**171 graphics** are implemented and verified today, across 13 categories — see [Supported graphics](#supported-graphics) for the full catalog.

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

## Supported graphics

The graphics below are **fully implemented and verified** — each can be drawn, labelled, rotated, resized, repositioned, and modified, with its shape and labels checked against FM 1-02.2. This is the library's real, proven capability.

(`listTacticalGraphicNames()` returns more names than this — the registry also carries variants still being finished. The table lists only the verified set.)

| Graphic | Category |
|---|---|
| Air Corridor | Airspace Coordinating Measures |
| Air-To-Air Refueling Restricted Operations Zone | Airspace Coordinating Measures |
| Airspace Coordination Area, Circular | Airspace Coordinating Measures |
| Airspace Coordination Area, Irregular | Airspace Coordinating Measures |
| Airspace Coordination Area, Rectangular | Airspace Coordinating Measures |
| Base Defense Zone | Airspace Coordinating Measures |
| High-Altitude Missile Engagement Zone | Airspace Coordinating Measures |
| High-Density Airspace Control Zone | Airspace Coordinating Measures |
| Identification, Friend-Or-Foe Switch Off-Line | Airspace Coordinating Measures |
| Identification, Friend-Or-Foe Switch On-Line | Airspace Coordinating Measures |
| Joint Engagement Zone | Airspace Coordinating Measures |
| Low-Altitude Missile Engagement Zone | Airspace Coordinating Measures |
| Low-Level Transit Route | Airspace Coordinating Measures |
| Minimum-Risk Route | Airspace Coordinating Measures |
| Missile Engagement Zone | Airspace Coordinating Measures |
| Restricted Operations Zone | Airspace Coordinating Measures |
| Safe Lane | Airspace Coordinating Measures |
| Short-Range Air Defense Engagement Zone | Airspace Coordinating Measures |
| Special Corridor | Airspace Coordinating Measures |
| Standard Use Army Aircraft Flight Route | Airspace Coordinating Measures |
| Transit Corridor | Airspace Coordinating Measures |
| Unmanned Aircraft (UA) Corridor | Airspace Coordinating Measures |
| Unmanned Aircraft Restricted Operations Zone | Airspace Coordinating Measures |
| Weapon Engagement Zone | Airspace Coordinating Measures |
| Weapons Free Zone | Airspace Coordinating Measures |
| Airfield | Areas |
| Airhead Line | Areas |
| Area Of Operations | Areas |
| Assault Position | Areas |
| Assembly Area | Areas |
| Attack Position | Areas |
| Base Camp | Areas |
| Battle Position | Areas |
| Battle Position Planned But Not Prepared | Areas |
| Battle Position Prepared But Not Occupied | Areas |
| Brigade Support Area | Areas |
| Corps Support Area | Areas |
| Detainee Holding Area | Areas |
| Division Support Area | Areas |
| Drop Zone | Areas |
| Encirclement | Areas |
| Engagement Area | Areas |
| Fortified Area | Areas |
| Forward Arming And Refueling Point | Areas |
| Guerrilla Base | Areas |
| Kill Zone | Areas |
| Landing Zone | Areas |
| Named Area Of Interest | Areas |
| Objective Area | Areas |
| Pickup Zone | Areas |
| Refugee Holding Area | Areas |
| Strong Point | Areas |
| Target Area Of Interest | Areas |
| Unexploded Explosive Ordnance (UXO) Area | Areas |
| Enemy Known Boundary | Boundaries |
| Enemy Suspected Boundary | Boundaries |
| Friendly Planned Boundary | Boundaries |
| Friendly Present Boundary | Boundaries |
| Area Defense | Defense Operations Planning |
| Delay | Defense Operations Planning |
| Mobile Defense | Defense Operations Planning |
| Retirement | Defense Operations Planning |
| Withdraw | Defense Operations Planning |
| Withdraw Under Pressure | Defense Operations Planning |
| Cover | Enabling Operations Planning |
| Forward Passage Of Lines | Enabling Operations Planning |
| Guard | Enabling Operations Planning |
| Rearward Passage Of Lines | Enabling Operations Planning |
| Relief In Place | Enabling Operations Planning |
| Screen | Enabling Operations Planning |
| Fighting Position | Field Fortification Symbols |
| Fortified/Trench Line | Field Fortification Symbols |
| Fields Of Fire/Sector Of Fire | Fire Support Coordination Control Measures |
| Free-Fire Area, Circular | Fire Support Coordination Control Measures |
| Free-Fire Area, Irregular | Fire Support Coordination Control Measures |
| Free-Fire Area, Rectangular | Fire Support Coordination Control Measures |
| Munition Flight Path (MFP) | Fire Support Coordination Control Measures |
| No-Fire Area, Circular | Fire Support Coordination Control Measures |
| No-Fire Area, Irregular | Fire Support Coordination Control Measures |
| No-Fire Area, Rectangular | Fire Support Coordination Control Measures |
| Position Area For Artillery, Circular | Fire Support Coordination Control Measures |
| Position Area For Artillery, Irregular | Fire Support Coordination Control Measures |
| Position Area For Artillery, Rectangular | Fire Support Coordination Control Measures |
| Restrictive Fire Area, Circular | Fire Support Coordination Control Measures |
| Restrictive Fire Area, Irregular | Fire Support Coordination Control Measures |
| Restrictive Fire Area, Rectangular | Fire Support Coordination Control Measures |
| Battlefield Handover Line | Lines |
| Bridgehead Line | Lines |
| Common Sensor Boundary | Lines |
| Coordinated Fire Line | Lines |
| Delay Line | Lines |
| Engineer Work Line | Lines |
| Final Coordination Line | Lines |
| Fire Support Coordination Line | Lines |
| Forward Edge Of The Battle Area | Lines |
| Forward Line Of Own Troops | Lines |
| Intelligence Coordination Line | Lines |
| Limit Of Advance | Lines |
| Line Of Contact | Lines |
| Line Of Departure | Lines |
| Line Of Departure Or Line Of Contact | Lines |
| Phase Line | Lines |
| Probable Line Of Deployment | Lines |
| Release Line | Lines |
| Restrictive Fire Line | Lines |
| Airborne Or Aviation Axis Of Advance | Movement and Maneuver |
| Attack Helicopter Axis Of Advance | Movement and Maneuver |
| Aviation Direction Of Attack | Movement and Maneuver |
| Direction Of Main Attack | Movement and Maneuver |
| Direction Of Main Attack Feint | Movement and Maneuver |
| Direction Of Supporting Attack | Movement and Maneuver |
| Envelopment | Movement and Maneuver |
| Frontal Attack | Movement and Maneuver |
| Infiltration | Movement and Maneuver |
| Infiltration Lane | Movement and Maneuver |
| Main Axis Of Advance | Movement and Maneuver |
| Main Axis Of Advance Feint | Movement and Maneuver |
| Penetration | Movement and Maneuver |
| Supporting Axis Of Advance | Movement and Maneuver |
| Turning Movement | Movement and Maneuver |
| Ambush | Offense Operations Planning |
| Cordon And Search | Offense Operations Planning |
| Counterattack | Offense Operations Planning |
| Exploitation | Offense Operations Planning |
| Movement To Contact | Offense Operations Planning |
| Pursuit | Offense Operations Planning |
| Block | Tactical Mission Tasks |
| Breach | Tactical Mission Tasks |
| Bypass | Tactical Mission Tasks |
| Canalize | Tactical Mission Tasks |
| Clear | Tactical Mission Tasks |
| Contain | Tactical Mission Tasks |
| Control | Tactical Mission Tasks |
| Disengage | Tactical Mission Tasks |
| Disrupt | Tactical Mission Tasks |
| Fix | Tactical Mission Tasks |
| Isolate | Tactical Mission Tasks |
| Artillery Target Intelligence Zone, Circular | Target Acquisition Control Measures |
| Artillery Target Intelligence Zone, Irregular | Target Acquisition Control Measures |
| Artillery Target Intelligence Zone, Rectangular | Target Acquisition Control Measures |
| Blue Kill Box, Circular | Target Acquisition Control Measures |
| Blue Kill Box, Irregular | Target Acquisition Control Measures |
| Blue Kill Box, Rectangular | Target Acquisition Control Measures |
| Call For Fire Zone, Circular | Target Acquisition Control Measures |
| Call For Fire Zone, Irregular | Target Acquisition Control Measures |
| Call For Fire Zone, Rectangular | Target Acquisition Control Measures |
| Censor Zone, Circular | Target Acquisition Control Measures |
| Censor Zone, Irregular | Target Acquisition Control Measures |
| Censor Zone, Rectangular | Target Acquisition Control Measures |
| Critical Friendly Zone, Circular | Target Acquisition Control Measures |
| Critical Friendly Zone, Irregular | Target Acquisition Control Measures |
| Critical Friendly Zone, Rectangular | Target Acquisition Control Measures |
| Dead Space Area, Circular | Target Acquisition Control Measures |
| Dead Space Area, Irregular | Target Acquisition Control Measures |
| Dead Space Area, Rectangular | Target Acquisition Control Measures |
| Purple Kill Box, Circular | Target Acquisition Control Measures |
| Purple Kill Box, Irregular | Target Acquisition Control Measures |
| Purple Kill Box, Rectangular | Target Acquisition Control Measures |
| Weapon Or Sensor Range Fan | Target Acquisition Control Measures |
| Weapon Or Sensor Range Fan, Circular | Target Acquisition Control Measures |
| Final Protective Fire | Target Control Measures |
| Fire Support Area, Circular | Target Control Measures |
| Fire Support Area, Irregular | Target Control Measures |
| Fire Support Area, Rectangular | Target Control Measures |
| Group/Series Of Targets | Target Control Measures |
| Linear Smoke Target | Target Control Measures |
| Linear Target | Target Control Measures |
| Smoke Obscurant | Target Control Measures |
| Target Area, Circular | Target Control Measures |
| Target Area, Irregular | Target Control Measures |
| Target Area, Rectangular | Target Control Measures |

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
  openlayers/                  #   the renderer: styling, draw/edit, dialog
```

The demo application is built on **OpenLayers** — it shows drawing, editing, rotating, resizing, modifying, and a Feature Properties dialog, on a keyless OpenStreetMap basemap (no API key needed). Start it with `npm start`.

The library itself is renderer-agnostic — it emits GeoJSON, so you can draw it with MapLibre, Cesium, Leaflet, or anything else that reads GeoJSON (see [Rendering](#rendering)). The demo standardises on OpenLayers because that is where the full MIL-STD-2525E styling lives; matching that styling pixel-for-pixel on other engines is a per-renderer effort left to consumers.

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
