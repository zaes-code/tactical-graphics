# Tactical Graphics

Render **MIL-STD-2525E / FM 1-02.2 / APP-06 tactical graphics** — axis-of-advance arrows, phase lines, mission tasks, range fans, boundaries — as plain **GeoJSON**.

Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON feature's `properties`. Call one function. Get GeoJSON back. Draw it with OpenLayers, MapLibre, or anything else that reads GeoJSON.

This library complements [milsymbol](https://github.com/spatialillusions/milsymbol), which renders single-point unit symbols. Tactical Graphics handles the multi-point geometries milsymbol doesn't: arrows that bend along a drawn path, corridors with parallel rails, arcs and fans sized in meters.

**[▶ Try the live demo](https://zaes-code.github.io/tactical-graphics/)** — draw any graphic, edit its handles, and set its amplifiers in the browser. No install, no sign-up.

**288 graphics** are implemented and verified today, covering **301 doctrinal variants**, across 14 categories — see [Supported graphics](#supported-graphics) for the full catalog, and [Upcoming graphics](#upcoming-graphics) for what's next. Release history is in the [changelog](CHANGELOG.md).

![The demo's sample sweep, framed on the middle of the block it draws](docs/images/sample-gallery.png)

*The demo's **Draw samples** button, drawing every verified graphic in one sweep — framed on the middle of the block, so the rows above and below run past the edge of the frame. Press it yourself in the [live demo](https://zaes-code.github.io/tactical-graphics/) — nothing here is a mock-up, it is the library rendering through the same path your code would. Both renderers draw this from the identical GeoJSON, so switching engines in the demo redraws the same grid.*

---

## Install

```bash
npm install @zaes/tactical-graphics
```

The only runtime dependency is [TurfJS](https://turfjs.org/) — and only the individual modules this library actually calls, not the `@turf/turf` meta-package. That keeps the production tree at 34 packages — 32 MIT, one Unlicense, one 0BSD. No copyleft, and every one of them declares a license.

Three entry points ship, and you can use any of them on its own:

| Import | What it gives you | Needs |
|---|---|---|
| `@zaes/tactical-graphics` | The geometry, **and how a symbol is painted**. GeoJSON in, GeoJSON out — no map library, no DOM. | individual `@turf/*` modules only |
| `@zaes/tactical-graphics/openlayers` | The OpenLayers renderer: the 4326 → 3857 adapter, the feature holders and controllers, and the draw and edit interactions. | `ol` as a peer; `milsymbol` only if you want the [center symbol](#the-center-symbol) |
| `@zaes/tactical-graphics/maplibre` | The MapLibre renderer: native GeoJSON layers, draw and edit interactions, and the same editor chrome. Exposes the **same `createTacticalGraphics`** as the OpenLayers entry point. | `maplibre-gl` as a peer; `milsymbol` for the center symbol |

```bash
npm install ol             # only for the OpenLayers entry point
npm install maplibre-gl    # only for the MapLibre entry point
npm install milsymbol      # only for the center symbol — six graphics carry one
```

All three are peer dependencies and all are optional, so installing the package
for its geometry alone pulls in none of them. Nothing in this package imports
`milsymbol` — you hand it in, once, if you want it. See
[The center symbol](#the-center-symbol).

**The same names, from either subpath.** `createTacticalGraphics` and the library's own
exports — configuration, the palette, the property key, the center-symbol controls — are
offered by both entry points, so moving a program from one engine to the other changes
the import path and nothing else. A test asserts the two keep matching.

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
[`createTacticalGraphics`](#rendering) — the same three lines whichever
engine you point it at.

---

## The `tacticalGraphic` object

Everything the library needs lives in one object on the feature's `properties`:

```ts
{
    type: 'Feature',
    geometry: {/* LineString, Point or Polygon — which one depends on the graphic */},
    properties: {
        tacticalGraphic: {/* every field below goes in here */},
    },
}
```

Only `name` is required. Each graphic ignores the fields that don't apply to it, so
there is no per-graphic options type to look up:

```ts
tacticalGraphic: {
    // Required — which graphic to draw.
    name: 'MainAxisOfAdvance',

    // Amplifiers — text rendered on the graphic.
    designation: '1-508 IN',  // field T — the primary designation
    secondDesignation: 'TF RAIDER', // field T1 — the second one, where a graphic
                              // carries two. A boundary shows both
    additionalInfo: 'CONCRETE 3000M', // field H — free text a symbol carries beside its
                              // designation: the airfield zone's runway note, the PsyOps
                              // zone's line above its name, human terrain's only text
    countryCode: 'USA',       // country beside the primary designation
    secondCountryCode: 'CAN', // country beside the secondary designation
    startDate: '021200ZJUN26',
    endDate: '021800ZJUN26',
    eff: '021200Z-021800Z',   // effective time, where a graphic shows one line for both
    minAltitude: 500,         // a NUMBER, in the configured altitude unit — see below
    maxAltitude: 2000,
    altitudeDatum: 'AGL',     // AltitudeDatum — what those numbers are measured from
    weapon: 'M252 81mm',      // FinalProtectiveFire only
    grid: '18SUJ2345',

    // Symbology — affects color and dash pattern. Every field below is backed by an
    // exported enum; the table after this block lists each one's complete set of values.
    hostility: 'Friend',      // TacticalGraphicHostility
    status: 'present',        // TacticalGraphicStatus — planned ⇒ dashed
    confidence: 'known',      // TacticalGraphicConfidence — rendered where doctrine
                              // shows a reliability rating
    echelon: 'Battalion/Squadron', // TacticalGraphicEchelon
    direction: 'ONE_WAY',     // RouteDirection — route graphics
    mineType: 'Antitank Mine', // TacticalGraphicMineType — which mine the two mine
                              // areas draw inside themselves
    mobility: 'Tracked',      // TacticalGraphicMobility — APP-06 Table 8-24 sector 1,
                              // the icon a limited access area or restricted terrain
                              // carries to say what kind of movement the ground admits
    terrain: 'Ground',        // TacticalGraphicTerrain — APP-06 Table 8-25 sector 2,
                              // the word under that icon, and the color the area is
                              // hatched in

    // Geometry, in meters.
    radius: 1000,             // how far the symbol reaches from its own center:
                              // circle radius, or a point-anchored arrow's half-length.
                              // Only for graphics that HAVE a center. METERS — note that
                              // a range fan's bands are kilometers, see below.
    decorationSize: 300,      // how big to draw a line graphic's decorations — an
                              // arrowhead's barb length, a passage lane's teeth. Not a
                              // reach from anywhere, which is why it isn't `radius`.
    width: 600,               // FULL width across a drawn line — rail to rail on an axis
                              // of advance, edge to edge on a corridor, and the across
                              // dimension of a rectangular zone
    length: 1120,             // FULL length ALONG the graphic. Only the rectangular
                              // target carries both; every other rectangle takes its
                              // length from the anchor points instead
    rotation: 45,             // degrees, counter-clockwise from east (point graphics)
    mirrored: false,          // which side an asymmetric symbol hangs on — the cane on a
                              // withdrawal, the chevron on an abatis
    bend: 0.8,                // Turn and Envelopment — how sharply the curve bows
    labelGapDegrees: 15,      // arc mission tasks — angular hole left for the letter
    labelGap: 0,              // the same hole in meters, for the graphics that cut it
                              // from the rendered glyph instead
    rangeFan: {bands: [...]}, // weapon/sensor range fans — see below
}
```

### The selector fields, and every value they take

Each of these is a **string enum**, exported from the root entry point, so the member and
its value are the same string at run time — `TacticalGraphicHostility.friend` **is**
`'Friend'`. Pass the member; the literal works too, and is what a saved file holds.

| Field | Enum | Every accepted value |
|---|---|---|
| `hostility` | `TacticalGraphicHostility` | `Assumed Friend` · `Friend` · `Hostile/Faker` · `Neutral` · `Pending` · `Suspect/Joker` · `Unknown` |
| `status` | `TacticalGraphicStatus` | `present` · `planned` |
| `confidence` | `TacticalGraphicConfidence` | `known` · `suspected` |
| `echelon` | `TacticalGraphicEchelon` | `Squad` · `Section` · `Platoon/Detachment` · `Company/Battery/Troop` · `Battalion/Squadron` · `Regiment/Group` · `Brigade` · `Unknown` |
| `direction` | `RouteDirection` | `GENERAL` · `ONE_WAY` · `TWO_WAY` · `ALTERNATING` |
| `mineType` | `TacticalGraphicMineType` | `Unspecified Mine` · `Antipersonnel Mine` · `Antipersonnel Mine with Directional Effects` · `Antitank Mine` · `Antitank Mine with Antihandling Device` · `Wide Area Antitank Mine` · `Mine Cluster` |
| `mobility` | `TacticalGraphicMobility` | `Unspecified` · `Standard Mobility/On-Road` · `High Mobility/Off-Road` · `Tracked` · `Tracked and Wheeled Combination` · `Towed` · `Railway` · `Over-Snow (Prime Mover)` · `Sled` · `Pack Animal` · `Barge` · `Amphibious` · `No Vehicles` · `Dismounted` |
| `terrain` | `TacticalGraphicTerrain` | `Unspecified` · `Urban` · `Water` · `Ground` · `Vegetation` · `Obstacles` |
| `altitudeDatum` | `AltitudeDatum` | `MSL` · `AGL` · `FL` |

`AltitudeUnit` (`meters` · `feet`) is not a per-graphic field — it is host configuration,
set once with `configureTacticalGraphics({altitudeUnit})`, because a map does not mix
units. A graphic that needs its own is free to pass a string altitude instead.

**A value not in these lists is ignored rather than drawn**, so a typo shows up as a
missing amplifier rather than an error. The table is generated from the enums by a test,
so it cannot drift from them.

**`label` and `secondId` were renamed in 3.0.0** — they are `designation` and
`secondDesignation` now. They are fields **T** and **T1**, the standard's unique
designations, and the old names said neither what they were nor which was which. `label`
also collided with the three other senses of the word in this library: the anchor
features `renderTacticalGraphic` returns, the `role: 'label'` tag, and the amplifier bag
itself, which meant `readGraphicLabels(f).label` read as the label of the labels and was
none of them.

They are not `identifier1` / `identifier2` for a specific reason: doctrine numbers these
**T and T1**, so `identifier1` would be field T and `identifier2` would be field T1 —
off by one against the plate anyone would check them against.

**Saved data keeps working.** The old keys are still accepted on read, everywhere a
stored `tacticalGraphic` bag is loaded — `renderTacticalGraphic`, both renderers' style
paths, and both engines' `restore`. Nothing writes them back, they are absent from the
types, and a bag carrying both keeps the current one. So a file written by 1.x or 2.x
opens with its designations intact; you migrate when you next save.

**Altitudes are numbers**, in whichever unit the host configured — feet by default. The
renderer appends it, so `500` draws as `500FT`, or `500M` under
`configureTacticalGraphics({altitudeUnit: AltitudeUnit.Meters})`.

`altitudeDatum` says what they are measured **from**, and it is a property rather than a
setting because two zones on one map can honestly differ: 1500 AGL over a 3000 ft ridge
is 4500 MSL. It renders after the unit, as the plates print it — `1500FT AGL`.

**`FL` is the exception, and deliberately so.** A flight level is hundreds of feet of
*pressure* altitude against the standard 1013.25 hPa setting, so it is not a height above
anything and the configured unit does not apply. Under `FL` the number **is** the level:
`150` draws as `FL150`, not `FL15000`.

FM 1-02.2 makes these fields free text, so a string still renders untouched — a
`'FL150'` or a `'1500MSL'` from another system draws exactly as written, datum and all.
A number plus a datum is what the types invite, because that is what a program can sort
and compare. See [Configuring colors and sizes](#configuring-colors-and-sizes).

### Range fans

The two weapon/sensor range fans read one extra object. Every other graphic ignores it:

```ts
rangeFan: {
    // One entry per ring, innermost first — they are sorted, so the order you write
    // them in does not matter.
    bands: [
        {range: 5,  label: 'MG',   altitude: 300},
        {range: 12, label: 'ATGM', altitude: 1500, leftAzimuthDeg: 340, rightAzimuthDeg: 40},
    ],
    // Sector fan only: where the sector points, degrees clockwise from north.
    // Omit it and the fan uses the bearing the graphic was drawn at.
    centerAzimuthDeg: 15,
}
```

| Field | Meaning |
|---|---|
| `range` | how far the ring reaches, **in kilometers** — see the warning below |
| `label` | optional name, drawn above the range line (`MG`, `ATGM`) |
| `altitude` | optional, a number in the configured unit — drawn as `ALT 300FT AGL`, measured from the graphic's own `altitudeDatum` |
| `leftAzimuthDeg` / `rightAzimuthDeg` | sector fan only: this band's own edges, degrees clockwise from north. Omit them and the band spans the sector |

**`range` is in kilometers, and it is the only distance here that is not meters.**
`radius`, `width`, `length` and `decorationSize` are all meters. A range fan is quoted in
kilometers because that is how an envelope is written and the label prints the number
bare — meters would put three zeroes on every ring. It is a wart, and it stays one: the
alternative silently rescales every range fan already saved by a factor of a thousand.

Bands render as `MIN RG 5` on a circular fan and `RG 5` on a sector, matching FM 1-02.2
table 5-276.

**A fan with no `bands` still draws.** It falls back to a single ring taken from the
graphic's own `radius` — so a `radius` of 180000 meters draws one ring labeled
`MIN RG 180`. That is the shape you get from the draw tool before any band is entered,
and it is why the two units sit next to each other on one graphic: `radius` is the
meters a user dragged, `range` is the kilometers they typed.

Because the description rides on the feature, a tactical graphic is **just GeoJSON**.
Save it, `POST` it, put it in PostGIS, diff it in git — then render it back with
`renderTacticalGraphic()`.

The rendered output carries the same `properties.tacticalGraphic` plus a `role` of
`graphic`, `label` or `handle`, so your styling code can read a graphic's amplifiers
straight off the feature it is drawing.

### Sizing a graphic

Three fields size a graphic, and which one applies depends on what the symbol *is*. They
are all in meters and none of them overlap — a graphic reads one.

| Field | Means | Graphics |
|---|---|---|
| `radius` | reach from the symbol's own center | circles and point-anchored symbols |
| `width` | **full** width across a drawn line | axes of advance, corridors, rectangular zones |
| `length` | **full** length along the graphic | the rectangular target, which is the only one that carries both |
| `decorationSize` | how large the decorations on a line are drawn | arrowheads, teeth, label offsets |

**`radius` — a circle, sized from its center:**

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: 'Secure', radius: 5000, rotation: 0}},
});                                             // a 5 km circle → 10 km across
```

**`width` — rail to rail across a drawn line.** Full width, not half: send the number you
would measure on the map, and the library halves it internally to offset each rail.

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
    properties: {tacticalGraphic: {name: 'MainAxisOfAdvance', designation: '1-508 IN', width: 600}},
});                                             // rails 300 m either side of the centerline
```

**`decorationSize` — the ornament on a line, not a reach.** A direction of attack is its
drawn line plus an arrowhead; there is no center to take a radius of, which is why this is
its own field.

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
    properties: {tacticalGraphic: {name: 'DirectionOfSupportingAttack', decorationSize: 400}},
});
```

Omit any of them and the graphic falls back to its own default.

### Which base geometry does a graphic need?

Each graphic expects one geometry type. Pass the wrong one and you get a clear error
rather than a broken shape.

| Base geometry | Graphics | Example |
|---|---|---|
| `LineString` | arrows, phase lines, boundaries, corridors | `MainAxisOfAdvance`, `PhaseLine` |
| `LineString` **+ `width`** | the eighteen rectangular zones | `FreeFireAreaRectangular`, `TargetAreaRectangular` |
| `Point` | mission tasks, range fans, fighting positions | `Secure`, `Contain`, `BaseDefenseZone` |
| `Polygon` | areas | `ObjectiveArea`, `NamedAreaOfInterest` |

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: 'Secure', radius: 1000, rotation: 0}},
});
```

**The rectangular zones are the exception worth knowing about.** APP-06 defines them
from two anchor points and a width rather than from a drawn box — points 1 and 2 sit at
the centers of two opposing sides, and `width` spans the other dimension — so they take
a two-point `LineString`, and a `Polygon` throws. `isRectangular(name)` is the test.
That is what lets the width be dragged and the zone be turned; a drawn box could only be
reshaped corner by corner.

```ts
import {isRectangular, axisFromRectangleRing, TacticalGraphicName} from '@zaes/tactical-graphics';

isRectangular(TacticalGraphicName.FreeFireAreaRectangular);   // → true
axisFromRectangleRing(ring);                                  // → {p1, p2, halfWidth} — halfWidth in meters
```

Both renderers migrate zones saved as polygons by an earlier version on restore, so a
saved map opens editable. `axisFromRectangleRing` is the same recovery, exported for
anyone calling the generator directly: hand it the ring and it returns the two anchor
points and the half-width in meters.

Discover what is available at run time:

```ts
import {
    listTacticalGraphicNames,
    GRAPHIC_CATEGORIES,
    getDisplayName,
    getEntityCode,
    getSpecifications,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';

listTacticalGraphicNames();                                     // → ['MainAxisOfAdvance', 'PhaseLine', ...]
GRAPHIC_CATEGORIES[TacticalGraphicName.PhaseLine];              // → 'Lines'
getDisplayName(TacticalGraphicName.MainAxisOfAdvance);          // → 'main axis of advance'
getEntityCode(TacticalGraphicName.PhaseLine);                   // → 140300
getSpecifications(TacticalGraphicName.PhaseLine);               // → ['FM 1-02.2', 'APP-06']
```

**Every graphic says which standard defines it, and carries the identifier that standard
gives it.** `getSpecifications(name)` answers with one or both — 211 graphics are in both
FM 1-02.2 and APP-06, 69 are APP-06 only, and 8 are FM 1-02.2 only. `getEntityCode(name)`
returns APP-06's six-digit entity code as a number, or `null` for those 8, since FM 1-02.2
publishes no identifiers of its own. `getNameByEntityCode(140300)` goes the other way, for
reading a symbol out of a feed that addresses graphics by code.

`TacticalGraphicName` is a string enum, so `TacticalGraphicName.PhaseLine` **is** `'PhaseLine'`
at run time — which is why `listTacticalGraphicNames()` returns plain strings and why a saved
`tacticalGraphic.name` is readable in a raw GeoJSON file. TypeScript still wants the member
rather than the literal, so pass the enum.

### Which end is the arrowhead?

**Thirty-two graphics number their points from the tip**, because APP-06 does: *"Point 1
defines the tip of the arrowhead. Point N-1 defines the rear of the symbol."* So on an
axis of advance the **first** coordinate is the head and the last is the tail. The list is
the axis-of-advance family, avenue of approach, both counterattacks, advance to contact,
frontal attack, turning movement, mobile defense, the seven retrograde canes, exploit,
both fixes, breach, bypass, canalize, clear, both blocks, penetrate, relief in place, and
fields of fire.

```ts
import {TIP_FIRST_GRAPHICS, drawsTipFirst} from '@zaes/tactical-graphics';

drawsTipFirst(TacticalGraphicName.MainAxisOfAdvance);   // → true
TIP_FIRST_GRAPHICS.length;                              // → 32 — the whole list, if you need to migrate
```

Nothing about the rendered symbol changes — the shape, its decorations, its handles and
its labels are what they were. What changes is which end of your `coordinates` array the
arrow points at.

**3.0.0 changed this and saved data is not migrated.** There is no version marker in
`properties.tacticalGraphic` to detect an older graphic by, so if you hold data written by
1.x or 2.x, reverse the coordinate array of any graphic `drawsTipFirst` returns true for.
The other 22 multipoint graphics — the ones drawn from anchor points, demonstration, the
obstacle bypasses, the swept-arc tasks, exfiltrate and infiltrate, the ferry and raft site,
and the four direction-of-attack graphics — are untouched.

---

## Rendering

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
graphics.setInteractionMode('modify');                         // rotate | resize | translate | modify | view

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
| `setInteractionMode(mode)` / `getInteractionMode()` | what a drag means: `view`, `translate`, `rotate`, `resize`, `modify` |
| `clearAll()` | remove every graphic and return to `view` |
| `snapshot()` / `restore(fc)` | the whole map as GeoJSON, and back — see [Saving and restoring](#saving-and-restoring-a-whole-map) |
| `refreshStyles()` | redraw against the current config, after `configureTacticalGraphics` |
| `destroy()` | detach every listener and interaction |

Pass callbacks as the second argument — `onChange`, `onSelect`, `onDrawEnd`,
`onModeChange` — and they mean the same thing in both engines.

### A complete example, per engine

The same program twice. Read either one on its own — that is the point of printing both
in full rather than a shared snippet with the import elided.

#### OpenLayers

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

#### MapLibre

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';

import {TacticalGraphicName, configureTacticalGraphics} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from '@zaes/tactical-graphics/maplibre';

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://your-style-server/style.json',   // must serve glyphs — see below
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

**Three lines differ**, and each for a reason that is MapLibre's rather than this
library's: the map is constructed differently, the work waits for `load`, and the style
must serve glyphs because MapLibre draws text from SDF glyph PBFs rather than a system
font. Everything from `createTacticalGraphics` onward is character-for-character the
same.

### What the two engines share

Nearly everything, and by construction rather than by discipline: **both paint
through the same map-agnostic code**. Every color and label rule, the screen-sized
decorations, the radius read-out, which handle sets a width, which vertex is inert
under a reshape, how many points a base takes, where a rotate pivots, which graphics
must stay rectangular, and where a drag may add a vertex. Fixing one fixes both,
because there is only one of each.

Draw, edit, rotate, resize, reshape, add-a-vertex, the hover cursor and the marker
showing where a new vertex would land are all present in both.

### What still differs

| | |
|---|---|
| **Label rasterization** | MapLibre places text from an SDF glyph set, OpenLayers from a browser font. Text lands a pixel or so apart, and a label anchored off-screen is clipped by one and not placed at all by the other. Not something you can configure away. |
| **Glyph hosting** | MapLibre needs a glyph server for any text at all, so a deployment self-hosts a glyph set or points at someone else's. OpenLayers uses the system font and needs nothing. |
| **Redraw during a zoom** | OpenLayers re-runs its style functions every frame. MapLibre has to re-realize geometry into GeoJSON, which is far too costly per frame, so screen-sized decorations hold a stale size mid-gesture and settle when it ends. |

### The radius read-out

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
`78 km`. That is deliberately not how the `WIDTH` amplifier or a range band is written:
those are part of the symbol and follow doctrine's own conventions. A read-out that
changes units is easier to read; an amplifier that does is a symbol that changes meaning.

### Geometry only, no styling

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

### Any GeoJSON renderer

`toFeatureCollection()` flattens a render into a standard `FeatureCollection`, so any
renderer that reads GeoJSON can consume it — filter on `properties.role`
(`graphic` / `label` / `handle`) to style each part. It returns the `graphic` and
`label` features by default; ask for `handle` too when you are building an editor.

**Geometry is not the whole symbol.** Obstacle teeth, the gap cut around a mission
task's letter, a screen-sized arrowhead and the rest are synthesized at paint time,
so a raw `renderTacticalGraphic` consumer gets the skeleton. The paint functions are
exported from the root entry point for exactly this — `getPaintFunction(name)`
returns the marks to draw, in projected meters, with no renderer in them. That is
how both of the renderers above are built, and it is the supported way to build a
third.

### Drawing the label text

`labels` gives you **anchor points**, not rendered text. Read the text from the
properties, or from `getLabel()` for graphics whose abbreviation is fixed by doctrine:

```ts
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';

getLabel(TacticalGraphicName.PhaseLine);           // → 'PL'   (doctrinal, not user-editable)
getLabel(TacticalGraphicName.FinalProtectiveFire); // → 'FPF'
```

**Making room for the letter on the arc mission tasks.** Secure, Isolate, Retain,
Occupy, Control, Contain, Cordon and Search and Area Defense are two arcs of one
circle with a one-letter label in the hole between them. The generator leaves 15° of
arc either side of the label, which is the best it can do with no glyph to measure —
so on a large circle the hole is bigger than the letter needs.

If you measure your own text, set `labelGapDegrees: 0` and the arcs run right up to
the label axis; cut the gap yourself from the rendered glyph. That is what this
package's OpenLayers layer does, and why its circles hug their letters at every size:

```ts
tacticalGraphic: {name: 'Secure', radius: 1000, rotation: 0, labelGapDegrees: 0}
```

The gap is **tangential**: a horizontal label sitting due east of the circle needs
clearance for its *height*, not its width.

---

## Configuring colors and sizes

Everything re-styleable lives on one all-optional config. Omit a field and you get
the doctrinal FM 1-02.2 value, so an unconfigured consumer needs none of this.

It lives in the **root** entry point, not the OpenLayers one: none of it is specific
to a renderer, so a second view inherits it rather than reinventing it, and you
configure the library once however many views you have open.

```ts
import {TacticalGraphicHostility, configureTacticalGraphics} from '@zaes/tactical-graphics';

configureTacticalGraphics({
    labelSize: 18,                 // px, default 16
    lineWidth: 3,                  // px, default 2, clamped to [1, 8]
    hostilityColors: {             // partial — the rest stay doctrinal
        [TacticalGraphicHostility.friend]: 'rgb(92,148,255)',
    },
    defaultLineColor: '#000000',   // unaffiliated line work, and label text with it
});

source.forEachFeature(f => f.changed());   // repaint what is already drawn
```

That last line matters: OpenLayers caches its render per feature revision, so a
config change does not reach features already on the map until something bumps their
revision.

### There is one palette

The library takes colors, not themes. It cannot see your basemap — or your projector,
or your darkened operations floor — so it never picks a color set for you. There is
one default, `DEFAULT_PALETTE`. If your app has more than one look, keep the sets
yourself and send whichever is current:

```ts
import {configureTacticalGraphics, DEFAULT_PALETTE} from '@zaes/tactical-graphics';

const MY_DARK_PALETTE = {
    ...DEFAULT_PALETTE,
    defaultLineColor: 'rgb(198,198,198)',   // and the label text that follows it
    labelHaloColor: 'rgb(23,23,23)',
    handleColor: 'rgba(208,123,123,1)',     // editor chrome, so nothing is left behind
    drawMarkerColor: 'rgb(69,106,185)',
};

configureTacticalGraphics(dark ? MY_DARK_PALETTE : DEFAULT_PALETTE);
source.forEachFeature(f => f.changed());
```

Spread `DEFAULT_PALETTE` into your set as above. `configureTacticalGraphics` merges,
so a set that names only the colors it changes can never undo the previous one —
going back to light has to actively re-send the light values, not merely stop sending
the dark ones.

`DEFAULT_PALETTE` covers the *unaffiliated* neutrals — the default line color, the
label text that follows it, the halo behind that text — and the editor chrome (handle
dots, the inert center, the draw marker). It deliberately carries no
`hostilityColors`: the four affiliation colors are doctrine, and shifting them for a
display setting makes a symbol read differently depending on how the app is
configured. Pass `hostilityColors` yourself if you disagree.

Building your own settings UI? Use `getDoctrinalHostilityColor(hostility)` for the
swatch, not `getColorByHostility`. The latter reads the live config, so a control that
edits an override renders one frame stale — clearing an override shows you the value
you just cleared. The former is a pure function of the enum.

---

## Saving and restoring a whole map

`snapshot()` writes every graphic to GeoJSON and `restore()` rebuilds them **editable**
— not a picture of the symbols, the same objects, ready to rotate, resize and modify.
Both come from [`createTacticalGraphics`](#rendering), so this is the same code whichever
engine drew the map:

```ts
const snapshot = graphics.snapshot();          // one feature per graphic
await db.save(JSON.stringify(snapshot));

// later, in a fresh session — or in the other engine
graphics.restore(await db.load());
```

**A snapshot taken in one engine restores in the other.** Nothing renderer-specific
travels with it, which is what makes that true rather than merely likely; the demo's
engine picker hands the map across on every switch.

A snapshot holds **one feature per graphic** — the base geometry the user drew.
Everything else is derived and regenerates on load. A record is the same
`tacticalGraphic` object described [above](#the-tacticalgraphic-object), and nothing
else:

```jsonc
"properties": {
    // The portable description of the symbol — what renderTacticalGraphic consumes.
    // Meters, degrees and text: meaningful to any renderer, in any language.
    "tacticalGraphic": {"name": "MovementToContact", "radius": 30600, "rotation": 45,
                        "label": "", "hostility": "Pending"},

    "role": "base", "symbolId": "45e2e470-…", "graphicName": "MovementToContact"
}
```

**That is the whole record.** Transform it, store it in PostGIS, write it by hand —
as long as `tacticalGraphic` survives, the graphic rebuilds exactly. There is no
companion object to keep, and no viewport state to lose.

A base short of what its graphic needs is completed on the way in, so a record written
by hand — or by an older version — arrives fully editable rather than half-drawn.

---

## The center symbol

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
| Cover, Guard, Screen | between the two arms | `setSecuritySymbolSize` — a screen constant, like every other part of these three |
| Escort | in the break in its bar | a share of the bar's on-screen span, so the two read as one group |
| Follow And Assume, Follow And Support | inside the body, **in place of field T** | a share of the body, which is what a resize scales |

Both of the drawn ones stop at 96 px however far the map zooms in. A framed 2525E symbol
carries a fixed amount of information, and one that kept pace with a graphic zoomed to fill
the screen would be a badge the size of a hand. It is the ceiling
`setSecuritySymbolSize` is clamped to, so every center symbol agrees on how large it ever
draws. Zoomed *out* they keep shrinking with the graphic — a floor would leave the symbol
bigger than the shape it sits in.

The last three are *drawn* rather than placed, so their symbol scales with the graphic
instead of holding a fixed pixel size. On the two follow tasks the symbol **replaces**
the designation: a picture of the unit says more than its name. Type a designation and
register no provider, and the text draws as before.

Register nothing and the arms and labels draw with an empty center — no error, no
missing module. That is what makes `milsymbol` an *actually* optional peer
dependency: a consumer who wants the geometry, or the other 280-odd graphics, never
resolves it.

The SIDC handed to the provider is derived from the graphic's own `hostility`, so a
hostile Screen gets a hostile-framed symbol and changing the affiliation redraws it.
`securitySymbolSidc(hostility)` exposes the same doctrinal code if you want to build on
it. All six offer the affiliation for that reason — the escort and the two follow tasks
are tactical mission tasks, which otherwise carry no amplifiers at all, and an entity
symbol's frame *is* its standard identity.

**Size the symbol by its width.** Both renderers draw the image at the width they are
given and let its height follow the image's own aspect, because neither knows how tall
the picture is until it has loaded. The follow tasks reserve room for a frame up to 1.25×
as tall as it is wide — a 2525E land unit runs about 0.86 (friend) to 1.23 (neutral) —
so a much taller image would overflow the body it sits in.

### Sizing the symbol

```ts
import {setSecuritySymbolSize} from '@zaes/tactical-graphics';

setSecuritySymbolSize(40);   // CSS px, default 25, clamped to [8, 96]
graphics.refreshStyles();    // takes effect on the next render
```

**Not** milsymbol's own `size` option. That sets the SVG's internal resolution; the
image built around it still draws at the library's size, so passing `{size: 40}` to
`useMilsymbolSecuritySymbols` changes the sharpness and nothing you can see. The size
belongs to the library because the library is what places the image around a provider
that returns a `src` string.

To size **one** symbol rather than all of them, return `{src, sizePx}` from its
provider. That wins over the global size and leaves it untouched.

### Choosing the symbol

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
(`getGraphicFields('Screen')` offers nothing else), so two Screens look identical to a
provider keyed on the bag alone.

**To tell two of a kind apart, bind a provider to one graphic by id:**

```ts
import {setGraphicSecuritySymbolProvider} from '@zaes/tactical-graphics';

setGraphicSecuritySymbolProvider(graphicId, ({sidc, sizePx}) => cavalryTroop(sidc, sizePx));
setGraphicSecuritySymbolProvider(graphicId, undefined);   // back to the global provider
```

It wins over the global provider for that graphic and returns `undefined` to draw no
center symbol at all. The id is the graphic's own — `symbolId` on an OpenLayers holder,
`id` on a `MapLibreTacticalGraphic`. Both engines honor it, and both repaint straight
away. `clearGraphicSecuritySymbolProviders()` forgets the lot when a map is torn down:
the registry is keyed by id and the library is never told when an id stops existing.

#### Worked example: three security operations, three units

Each with its own unit symbol, on **either engine** — every call below is from the façade
or the root package, so the only thing that differs between OpenLayers and MapLibre is
the import path in the setup above.

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
const at = (name, coordinates, hostility = TacticalGraphicHostility.friend) => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates},
    properties: {tacticalGraphic: {name, hostility}},
});

// `restore` replaces the map's contents, so this is a load rather than an append —
// snapshot first if you are adding to something already drawn.
graphics.restore({
    type: 'FeatureCollection',
    features: [
        at(TacticalGraphicName.Screen, [-77.10, 38.89]),
        at(TacticalGraphicName.Guard, [-77.04, 38.89], TacticalGraphicHostility.hostileFaker),
        at(TacticalGraphicName.Cover, [-76.98, 38.89]),
    ],
});
```

The entity codes are illustrative — FM 1-02.2 does not prescribe which unit performs
which security task, so substitute your own.

Note what you do **not** do here. These three are sized in screen pixels rather than
meters, so their geometry has to be re-derived whenever the map zooms; the façade
subscribes for you. Reaching past it to place graphics yourself is where that becomes
your job — see [Placing graphics from data](#placing-graphics-from-data).

---

## Advanced: reaching past the façade

Everything above works the same on both engines. Everything below does not, and is
grouped here so that the difference is a place you go rather than a surprise you meet.

The two renderers are not mirror images and are not meant to be: OpenLayers retains
mutable features and edits them in place, MapLibre derives GeoJSON sources and discards
them on the next rebuild. Those are different rendering models, and the façade exists so
you only have to care when you want to. `createTacticalGraphics(map, {manager})` and
`{renderer}` adopt an object you already built, so reaching past it costs nothing.

### Advanced: OpenLayers

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

#### Placing graphics from data

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

**`manager.watchResolution(handler)` is not optional.** Some graphics — every
security operation — have geometry that is a screen-pixel constant times the map
resolution, so without a `change:resolution` subscription they are pinned in meters
and grow and shrink as you zoom. The manager does this for you when the user draws,
and `restore` does it on load; a graphic you build yourself needs it doing. Pair it
with `unwatchResolution` when you remove the graphic, or the listener outlives its
features.

#### When you need the restore report

`restore()` returns nothing, because the common case is "put the map back". This subpath
exposes the underlying pair when you need to know what failed:

```ts
import {serializeTacticalGraphics, restoreTacticalGraphics} from '@zaes/tactical-graphics/openlayers';

const {restored, failed} = restoreTacticalGraphics(manager, await db.load());
```

A graphic that fails to restore is reported in `failed` and rolled back on its own, so
one bad record cannot cost you the rest of the map.

### Advanced: MapLibre

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

---

## Errors

`renderTacticalGraphic` throws `TacticalGraphicError` with an actionable message:

```
Feature has no "properties.tacticalGraphic" object. Add one naming the graphic,
e.g. {"tacticalGraphic": {"name": "PhaseLine"}}.

Unknown tactical graphic "AxisOfAdvnce". Call listTacticalGraphicNames() to see
the 292 supported names.

Graphic "Secure" expects a Point base geometry, got LineString.

Graphic "FreeFireAreaRectangular" expects a LineString base geometry, got Polygon.
```

---

## Coordinate systems

The library is projection-agnostic in one specific way: **it works entirely in
EPSG:4326**, and hands you EPSG:4326 back. Reproject at your renderer's boundary, not
before you call it.

Sizes (`radius`, `width`, `length`, `decorationSize`) are in **meters**, and range-fan
band ranges are in **kilometers**.

---

## Supported graphics

The graphics below are **fully implemented and verified** — each can be drawn, labeled, repositioned and modified, and rotated and resized wherever the symbol admits it, with its shape and labels checked against the plate that defines it. This is the library's real, proven capability.

**Which plate that is depends on the graphic, and each one records its own answer.** 211 are defined by both FM 1-02.2 and NATO APP-06, 69 by APP-06 alone, and 8 by FM 1-02.2 alone — `getSpecifications(name)` returns the answer for any of them, and `getEntityCode(name)` returns APP-06's six-digit identifier where there is one. Where the two standards draw the same symbol differently, the divergence is recorded beside the graphic rather than silently resolved.

*Some symbols are fixed by doctrine rather than sized to the ground, and refuse the gestures that would misrepresent them: the crossed mission tasks (Destroy, Suppress, …) are dropped at one size and one orientation, and Cover, Guard and Screen hold a constant on-screen size while still rotating to face the threat.*

(The [gallery at the top](#tactical-graphics) covers every graphic whose shape and labels are verified, so it shows a few still finishing their edit handles — slightly more than the table below lists. `listTacticalGraphicNames()` returns more again — the registry also carries variants still being finished, listed under [Upcoming graphics](#upcoming-graphics). The table below is the verified set: drawable, correctly shaped and labeled, and fully editable.)

| Graphic | Category |
|---|---|
| Air Corridor | Airspace Coordinating Measures |
| Air-To-Air Refueling Restricted Operations Zone | Airspace Coordinating Measures |
| Airspace Coordination Area, Circular | Airspace Coordinating Measures |
| Airspace Coordination Area, Irregular | Airspace Coordinating Measures |
| Airspace Coordination Area, Rectangular | Airspace Coordinating Measures |
| Base Defense Zone | Airspace Coordinating Measures |
| Fighter Engagement Zone | Airspace Coordinating Measures |
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
| Airfield Zone | Areas |
| Airhead Line | Areas |
| Area | Areas |
| Area Of Operations | Areas |
| Area, Generic | Areas |
| Assault Position | Areas |
| Assembly Area | Areas |
| Attack Position | Areas |
| Base Camp | Areas |
| Battle Position | Areas |
| Battle Position Planned But Not Prepared | Areas |
| Battle Position Prepared But Not Occupied | Areas |
| Biological Contaminated Area | Areas |
| Biological Contaminated Area, Toxic Industrial Material | Areas |
| Bridgehead | Areas |
| Brigade Support Area | Areas |
| Chemical Contaminated Area | Areas |
| Chemical Contaminated Area, Toxic Industrial Material | Areas |
| Corps Support Area | Areas |
| Detainee Holding Area | Areas |
| Division Support Area | Areas |
| Drop Zone | Areas |
| Encirclement | Areas |
| Enemy Prisoner Of War Holding Area | Areas |
| Engagement Area | Areas |
| Extraction Zone | Areas |
| Fortified Area | Areas |
| Forward Arming And Refueling Point | Areas |
| Guerrilla Base | Areas |
| Human Terrain | Areas |
| Joint Tactical Action Area | Areas |
| Kill Zone | Areas |
| Landing Zone | Areas |
| Limited Access Area | Areas |
| Named Area Of Interest | Areas |
| Nuclear Contaminated Area | Areas |
| Objective Area | Areas |
| Penetration Box | Areas |
| Pickup Zone | Areas |
| PsyOps Zone, Circular | Areas |
| PsyOps Zone, Irregular | Areas |
| PsyOps Zone, Rectangular | Areas |
| Radiological Contaminated Area | Areas |
| Radiological Contaminated Area, Toxic Industrial Material | Areas |
| Refugee Holding Area | Areas |
| Regimental Support Area | Areas |
| Restricted Terrain | Areas |
| Severely Restricted Terrain | Areas |
| Strong Point | Areas |
| Submarine Action Area | Areas |
| Submarine-Generated Action Area | Areas |
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
| Fortified Position | Field Fortification Symbols |
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
| Battlefield Coordination Line | Lines |
| Battlefield Handover Line | Lines |
| Bridgehead Line | Lines |
| Common Sensor Boundary | Lines |
| Coordinated Fire Line | Lines |
| Decision Line | Lines |
| Delay Line | Lines |
| Engineer Work Line | Lines |
| Final Coordination Line | Lines |
| Fire Support Coordination Line | Lines |
| Forward Edge Of The Battle Area | Lines |
| Forward Line Of Own Troops | Lines |
| Handover Line | Lines |
| Holding Line | Lines |
| Intelligence Coordination Line | Lines |
| Light Line | Lines |
| Limit Of Advance | Lines |
| Line Of Contact | Lines |
| Line Of Departure | Lines |
| Line Of Departure Or Line Of Contact | Lines |
| Line, Generic | Lines |
| Mobility Corridor | Lines |
| Named Area Of Interest Line | Lines |
| No Fire Line | Lines |
| Phase Line | Lines |
| Probable Line Of Deployment | Lines |
| Release Line | Lines |
| Restrictive Fire Line | Lines |
| Abatis | Mobility and Countermobility Control Measures |
| Alternate Supply Route | Mobility and Countermobility Control Measures |
| Alternate Supply Route, Alternating Traffic | Mobility and Countermobility Control Measures |
| Alternate Supply Route, One-Way Traffic | Mobility and Countermobility Control Measures |
| Alternate Supply Route, Two-Way Traffic | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch - Completed | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch - Under Construction | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch Reinforced, With Anti-Tank Mines | Mobility and Countermobility Control Measures |
| Assault Crossing | Mobility and Countermobility Control Measures |
| Block | Mobility and Countermobility Control Measures |
| Bridge | Mobility and Countermobility Control Measures |
| Disrupt | Mobility and Countermobility Control Measures |
| Explosives, Planned State Of Readiness | Mobility and Countermobility Control Measures |
| Explosives, State Of Readiness 1 (safe) | Mobility and Countermobility Control Measures |
| Explosives, State Of Readiness 2 (armed But Passable) | Mobility and Countermobility Control Measures |
| Ferry Crossing | Mobility and Countermobility Control Measures |
| Fix | Mobility and Countermobility Control Measures |
| Ford, Difficult | Mobility and Countermobility Control Measures |
| Ford, Easy | Mobility and Countermobility Control Measures |
| Gap | Mobility and Countermobility Control Measures |
| Main Supply Route | Mobility and Countermobility Control Measures |
| Main Supply Route, Alternating Traffic | Mobility and Countermobility Control Measures |
| Main Supply Route, One-Way Traffic | Mobility and Countermobility Control Measures |
| Main Supply Route, Two-Way Traffic | Mobility and Countermobility Control Measures |
| Mine Cluster | Mobility and Countermobility Control Measures |
| Mined Area, Fenced | Mobility and Countermobility Control Measures |
| Minefield, Dynamic Depiction | Mobility and Countermobility Control Measures |
| Mineline | Mobility and Countermobility Control Measures |
| Obstacle Belt | Mobility and Countermobility Control Measures |
| Obstacle Bypass Difficult | Mobility and Countermobility Control Measures |
| Obstacle Bypass Easy | Mobility and Countermobility Control Measures |
| Obstacle Bypass Impossible | Mobility and Countermobility Control Measures |
| Obstacle Free Area | Mobility and Countermobility Control Measures |
| Obstacle Group | Mobility and Countermobility Control Measures |
| Obstacle Line | Mobility and Countermobility Control Measures |
| Obstacle Restricted Area | Mobility and Countermobility Control Measures |
| Obstacle Zone | Mobility and Countermobility Control Measures |
| Passage Lane | Mobility and Countermobility Control Measures |
| Raft Site | Mobility and Countermobility Control Measures |
| Roadblock Complete (executed) | Mobility and Countermobility Control Measures |
| Route | Mobility and Countermobility Control Measures |
| Route - Alternating Traffic | Mobility and Countermobility Control Measures |
| Route - One-Way Traffic | Mobility and Countermobility Control Measures |
| Route - Two-Way Traffic | Mobility and Countermobility Control Measures |
| Trip Wire | Mobility and Countermobility Control Measures |
| Turn | Mobility and Countermobility Control Measures |
| Wire, Double Apron Fence | Mobility and Countermobility Control Measures |
| Wire, Double Fence | Mobility and Countermobility Control Measures |
| Wire, Double Strand Concertina | Mobility and Countermobility Control Measures |
| Wire, High Wire Fence | Mobility and Countermobility Control Measures |
| Wire, Low Wire Fence | Mobility and Countermobility Control Measures |
| Wire, Single Concertina | Mobility and Countermobility Control Measures |
| Wire, Single Fence | Mobility and Countermobility Control Measures |
| Wire, Triple Strand Concertina | Mobility and Countermobility Control Measures |
| Wire, Unspecified | Mobility and Countermobility Control Measures |
| Airborne Or Aviation Axis Of Advance | Movement and Maneuver |
| Attack Helicopter Axis Of Advance | Movement and Maneuver |
| Avenue Of Approach | Movement and Maneuver |
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
| Advance To Contact | Offense Operations Planning |
| Ambush | Offense Operations Planning |
| Cordon And Knock | Offense Operations Planning |
| Cordon And Search | Offense Operations Planning |
| Counterattack | Offense Operations Planning |
| Counterattack By Fire | Offense Operations Planning |
| Exploitation | Offense Operations Planning |
| Movement To Contact | Offense Operations Planning |
| Pursuit | Offense Operations Planning |
| Attack By Fire | Tactical Mission Tasks |
| Block | Tactical Mission Tasks |
| Breach | Tactical Mission Tasks |
| Bypass | Tactical Mission Tasks |
| Canalize | Tactical Mission Tasks |
| Capture | Tactical Mission Tasks |
| Clear | Tactical Mission Tasks |
| Contain | Tactical Mission Tasks |
| Control | Tactical Mission Tasks |
| Demonstration | Tactical Mission Tasks |
| Deny | Tactical Mission Tasks |
| Destroy | Tactical Mission Tasks |
| Disengage | Tactical Mission Tasks |
| Disrupt | Tactical Mission Tasks |
| Escort | Tactical Mission Tasks |
| Evacuate | Tactical Mission Tasks |
| Exfiltrate | Tactical Mission Tasks |
| Fix | Tactical Mission Tasks |
| Follow And Assume | Tactical Mission Tasks |
| Follow And Support | Tactical Mission Tasks |
| Interdict | Tactical Mission Tasks |
| Isolate | Tactical Mission Tasks |
| Locate | Tactical Mission Tasks |
| Neutralize | Tactical Mission Tasks |
| Occupy | Tactical Mission Tasks |
| Recover | Tactical Mission Tasks |
| Retain | Tactical Mission Tasks |
| Secure | Tactical Mission Tasks |
| Seize | Tactical Mission Tasks |
| Support By Fire | Tactical Mission Tasks |
| Suppress | Tactical Mission Tasks |
| Turn | Tactical Mission Tasks |
| Artillery Maneuver Area | Target Acquisition Control Measures |
| Artillery Reserved Area | Target Acquisition Control Measures |
| Artillery Target Intelligence Zone, Circular | Target Acquisition Control Measures |
| Artillery Target Intelligence Zone, Irregular | Target Acquisition Control Measures |
| Artillery Target Intelligence Zone, Rectangular | Target Acquisition Control Measures |
| Blue Kill Box, Circular | Target Acquisition Control Measures |
| Blue Kill Box, Irregular | Target Acquisition Control Measures |
| Blue Kill Box, Rectangular | Target Acquisition Control Measures |
| Bomb Area | Target Acquisition Control Measures |
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
| Target Build-Up Area, Circular | Target Acquisition Control Measures |
| Target Build-Up Area, Irregular | Target Acquisition Control Measures |
| Target Build-Up Area, Rectangular | Target Acquisition Control Measures |
| Target Value Area, Circular | Target Acquisition Control Measures |
| Target Value Area, Irregular | Target Acquisition Control Measures |
| Target Value Area, Rectangular | Target Acquisition Control Measures |
| Terminally Guided Munition Footprint | Target Acquisition Control Measures |
| Weapon Or Sensor Range Fan | Target Acquisition Control Measures |
| Weapon Or Sensor Range Fan, Circular | Target Acquisition Control Measures |
| Zone Of Fire | Target Acquisition Control Measures |
| Zone Of Responsibility, Circular | Target Acquisition Control Measures |
| Zone Of Responsibility, Irregular | Target Acquisition Control Measures |
| Zone Of Responsibility, Rectangular | Target Acquisition Control Measures |
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

## Upcoming graphics

Everything still being worked towards. A graphic is listed here until it is drawable, its shape and labels are signed off against the plate that defines it — FM 1-02.2, APP-06, or both — **and** its edit handles are finished — so this covers both graphics that have not been started and ones that are partly done. Several are already selectable in the demo app; treat anything here as work in progress rather than capability.

| Graphic | Category |
|---|---|
| Minimum Safe Distance Zone | Areas |
| Minimum Safe Distance Zone, Multiple Strike (STRIKWARN) | Areas |
| Radiation Dose Rate Contour Line | Areas |
| Halted Convoy | Mobility and Countermobility Control Measures |
| Moving Convoy | Mobility and Countermobility Control Measures |

---

## Project layout

```
src/tacticalgraphics/          # The library. Pure GeoJSON, map-agnostic.
  index.ts                     #   public entry point
  core/render.ts               #   renderTacticalGraphic()
  core/type.ts                 #   TacticalGraphicName + the properties schema
  core/GeometryService.ts      #   all geographic math (turf + custom)
  core/handles.ts              #   the editing rules both renderers obey
  core/symbology.ts            #   colors, label scales, per-graphic symbol rules
  symbology/                   #   paint functions — the marks, with no renderer
  graphics/                    #   one generator class per graphic family

src/components/
  openlayers/                  # Published as @zaes/tactical-graphics/openlayers
  maplibre/                    # Published as @zaes/tactical-graphics/maplibre
  MapControls.tsx, …           # The React demo — not published.
```

The demo runs on **either renderer** — there is a picker in the app bar, and a
graphic drawn in one survives the switch to the other. It shows drawing, editing,
rotating, resizing, modifying and a Feature Properties dialog, on a keyless
OpenStreetMap basemap (no API key needed). Start it with `npm start`.

**Where the shared code lives, and why it matters.** The geometry layer never
imports `ol` or `maplibre-gl` — the build asserts it — but it carries more than
geometry: `symbology/` holds the paint functions that say what marks to draw, and
`core/symbology.ts` and `core/handles.ts` hold the per-graphic rules that decide a
label's font, a decoration's size, which handle sets a width and where a rotate
pivots. Both renderers read all of it. A rule that lives in one renderer instead
is how the two silently drift apart, which is a mistake this repo has made and
written up: `ai/conventions.md`, "A symbology fact never lives in a holder".

---

## Development

```bash
npm start            # run the demo app
npm test             # run the test suite
npx tsc --noEmit     # typecheck (the main correctness gate)
npm run lint         # eslint --fix
```

The generators in `src/tacticalgraphics/graphics/` are the reference for new
shapes, and the OpenLayers demo under `src/components/openlayers/` shows how a
renderer consumes them. See **Adding a graphic** below for the steps.

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

A graphic is "done" when a user can draw it, label it, reposition and modify it,
and rotate and resize it wherever those gestures mean something for that symbol —
a fixed-size badge like Destroy has no resize to offer.

---

## Roadmap

- Complete the remaining graphics from FM 1-02.2.
- **Leaflet is scoped as a third rendering engine.** The groundwork is done: symbology
  now lives in the map-agnostic half as paint functions — geometry, colors, and text
  described in projected meters — and both shipping engines are consumers of it rather
  than owners. A third engine implements one bridge from those paint descriptions to
  its own primitives, and inherits every graphic. Leaflet's canvas renderer is the
  natural fit; the open questions are its lack of a built-in editing interaction and
  how far its layer model stretches to the screen-space decorations, and both are being
  assessed before any commitment to a date.

---

## References

- [FM 1-02.2, Military Symbols](https://www.battleorder.org/post/symbolsfm) — US Army
- [DoD Joint Military Symbology (MIL-STD-2525E)](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=114934)
- [APP-06, NATO Joint Military Symbology](https://nso.nato.int/nso/nsdd/main/standards), Edition E — retrieved from the
  NATO Standardization Document Database. NATO is acknowledged as its publisher; NATO
  charges no fee for its standardization documents
- [TurfJS](https://turfjs.org/) — the geospatial math underneath

## About Zaes

[Zaes](https://zaes.com) is a software engineering and consulting firm working with the
U.S. Department of Defense and enterprise clients, founded in 2017 and operating
remote-first from Chantilly, VA and Charleston, SC.

The work spans full-stack engineering, enterprise and application architecture,
geospatial engineering and GIS development, systems integration, UI/UX design, DevOps and
CI/CD automation, and program management — with domain consulting in DoD and C2 systems,
and cleared personnel where a program requires it.

This library comes out of that geospatial and C2 work. It is open-sourced because an
accurate MIL-STD-2525E symbol set is infrastructure rather than an advantage worth
keeping: every team building a common operational picture rebuilds the same arrows and
the same amplifier rules, and doing it once, in the open, against the plates is better
for everyone drawing them.

## Contributors

- **Edwin Sanchez** — maintainer
- **Eric Marks**
- **Navie Huynh** — past contributor

Commit-level credit lives in the [contributors graph](https://github.com/zaes-code/tactical-graphics/graphs/contributors).

## License

MIT
