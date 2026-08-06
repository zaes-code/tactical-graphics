# Tactical Graphics

Render **MIL-STD-2525E / FM 1-02.2 tactical graphics** — axis-of-advance arrows, phase lines, mission tasks, range fans, boundaries — as plain **GeoJSON**.

Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON feature's `properties`. Call one function. Get GeoJSON back. Draw it with OpenLayers or anything else that reads GeoJSON.

This library complements [milsymbol](https://github.com/spatialillusions/milsymbol), which renders single-point unit symbols. Tactical Graphics handles the multi-point geometries milsymbol doesn't: arrows that bend along a drawn path, corridors with parallel rails, arcs and fans sized in meters.

**[▶ Try the live demo](https://zaes-code.github.io/tactical-graphics/)** — draw any graphic, edit its handles, and set its amplifiers in the browser. No install, no sign-up.

**211 graphics** are implemented and verified today, across 14 categories — see [Supported graphics](#supported-graphics) for the full catalog, and [Upcoming graphics](#upcoming-graphics) for what's next.

![Every verified tactical graphic, rendered at once by the sample gallery](docs/images/sample-gallery.png)

*Every verified graphic, drawn in one sweep by the demo's **Draw all samples** button and grouped by category. Press it yourself in the [live demo](https://zaes-code.github.io/tactical-graphics/) — nothing here is a mock-up, it is the library rendering through the same path your code would.*

---

## Install

```bash
npm install @zaes/tactical-graphics
```

The only runtime dependency is [`@turf/turf`](https://turfjs.org/).

Two entry points ship, and you can use either on its own:

| Import | What it gives you | Needs |
|---|---|---|
| `@zaes/tactical-graphics` | The geometry. GeoJSON in, GeoJSON out — no map library, no DOM. | `@turf/turf` only |
| `@zaes/tactical-graphics/openlayers` | The renderer: every style function, the 4326 → 3857 adapter, the feature holders and controllers, and a manager that wires draw/modify onto a map. | `ol` as a peer; `milsymbol` only if you want the [center symbol](#security-operations-the-center-symbol) |

```bash
npm install ol             # only if you want the OpenLayers entry point
npm install milsymbol      # only for the center symbol on Cover / Guard / Screen
```

Both are peer dependencies and both are optional, so installing the package for
its geometry alone pulls in neither. Nothing in this package imports `milsymbol`
— you hand it in, once, if you want it. See
[Security operations: the center symbol](#security-operations-the-center-symbol).

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
            label: '1-508 IN',
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

If you want it drawn, styled and editable on an OpenLayers map instead, that is the
[OpenLayers entry point](#openlayers--styled-drawable-editable) — three lines.

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
    label: '1-508 IN',        // primary designation
    secondId: 'TF RAIDER',    // secondary designation
    startDate: '021200ZJUN26',
    endDate: '021800ZJUN26',
    minAltitude: '500',
    maxAltitude: '2000',
    weapon: 'M252 81mm',      // FinalProtectiveFire only
    grid: '18SUJ2345',
    corridorWidth: '600',     // air corridors — FULL width, as shown in a dialog.
                              // Display only; the geometry comes from `width`.

    // Symbology — affects color and dash pattern.
    hostility: 'Friend',      // Friend | Hostile/Faker | Neutral | Unknown | ...
    status: 'present',        // present | planned  (planned ⇒ dashed)
    echelon: 'battalion',
    direction: 'ONE_WAY',     // route graphics

    // Geometry, in meters.
    radius: 1000,             // how far the symbol reaches from its own centre:
                              // circle radius, or a point-anchored arrow's half-length
    width: 300,               // perpendicular HALF-width from a drawn line — the offset
                              // of an axis-of-advance's rails from its centreline
    rotation: 45,             // degrees (point graphics)
    bend: 0.8,                // Turn only — how sharply it turns, × radius
    labelGapDegrees: 15,      // arc mission tasks — hole left for the letter
}
```

Because the description rides on the feature, a tactical graphic is **just GeoJSON**.
Save it, `POST` it, put it in PostGIS, diff it in git — then render it back with
`renderTacticalGraphic()`.

The rendered output carries the same `properties.tacticalGraphic` plus a `role` of
`graphic`, `label` or `handle`, so your styling code can read a graphic's amplifiers
straight off the feature it is drawing.

### Which base geometry does a graphic need?

Each graphic expects one geometry type. Pass the wrong one and you get a clear error
rather than a broken shape.

| Base geometry | Graphics | Example |
|---|---|---|
| `LineString` | arrows, phase lines, boundaries, corridors | `MainAxisOfAdvance`, `PhaseLine` |
| `Point` | mission tasks, range fans, fighting positions | `Secure`, `Contain`, `BaseDefenseZone` |
| `Polygon` | areas | `ObjectiveArea`, `NamedAreaOfInterest` |

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: 'Secure', radius: 1000, rotation: 0}},
});
```

Discover what is available at run time:

```ts
import {listTacticalGraphicNames, GRAPHIC_CATEGORIES, getDisplayName} from '@zaes/tactical-graphics';

listTacticalGraphicNames();                     // → ['MainAxisOfAdvance', 'PhaseLine', ...]
GRAPHIC_CATEGORIES['PhaseLine'];                // → 'Lines'
getDisplayName('MainAxisOfAdvance');            // → 'main axis of advance'
```

---

## Rendering

### OpenLayers — styled, drawable, editable

`@zaes/tactical-graphics/openlayers` is the renderer the demo uses. It carries the
doctrinal styling — standard identity colors, dashed planned status, echelon glyphs,
amplifier placement — plus draw and edit interactions.

Three objects appear in every OpenLayers snippet below. This is all they are:

```ts
import Map from 'ol/Map';
import View from 'ol/View';
import {fromLonLat} from 'ol/proj';
import {TacticalGraphicsManager} from '@zaes/tactical-graphics/openlayers';

// `map` — your own ol/Map. Nothing about it is special; the manager attaches to it.
const map = new Map({
    target: 'map',
    view: new View({center: fromLonLat([-77.04, 38.89]), zoom: 12}),
});

// `manager` — takes the map and nothing else. It creates its own vector layer,
// adds it to the map, and owns every graphic drawn through it.
const manager = new TacticalGraphicsManager(map);

// `source` — that layer's ol/source/Vector, exposed for the things you do directly
// to features: add your own, or repaint them all after a config change.
const source = manager.renderingVectorSource;
```

Then drawing a graphic is one call. The user clicks out the base geometry, and the
manager builds, styles and wires it up:

```ts
import {TacticalGraphicName} from '@zaes/tactical-graphics';

manager.startDrawing(TacticalGraphicName.MainAxisOfAdvance);
```

That is the whole managed path — draw, modify, rotate, resize and the properties the
style functions read all follow from it.

This method was previously called `handleDrawTacticalGraphic`. That name still works
— it delegates to `startDrawing` — but it is deprecated.

### Driving one graphic yourself

Skip the manager's draw interaction when you are placing graphics from data rather
than from a user's clicks. You build the base feature; the controller does the rest:

```ts
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController, writeGraphicProperties} from '@zaes/tactical-graphics/openlayers';

const handler = getController(TacticalGraphicName.FieldsOfFire, map.getView().getResolution()!);
handler.setBaseFeature(drawnFeature);          // your own LineString / Point / Polygon feature
source.addFeatures(handler.getFeatures());     // graphic + labels + handles
manager.watchResolution(handler);              // see below — not optional

writeGraphicProperties(handler.getFeatures(), TacticalGraphicName.FieldsOfFire, {
    label: 'A', hostility: 'Hostile/Faker',    // strokes turn red; text stays black
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
and `restoreTacticalGraphics` does it on load; a graphic you build yourself needs it
doing. Pair it with `unwatchResolution` when you remove the graphic, or the listener
outlives its features.

### OpenLayers — geometry only

If you would rather keep your own styling, skip the subpath entirely.
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

OpenLayers is the reference implementation because that is where the full
MIL-STD-2525E / FM 1-02.2 styling lives; other renderers show the correct geometry
but style it themselves.

### Drawing the label text

`labels` gives you **anchor points**, not rendered text. Read the text from the
properties, or from `getLabel()` for graphics whose abbreviation is fixed by doctrine:

```ts
import {getLabel} from '@zaes/tactical-graphics';

getLabel('PhaseLine');           // → 'PL'   (doctrinal, not user-editable)
getLabel('FinalProtectiveFire'); // → 'FPF'
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

`serializeTacticalGraphics` writes every graphic the manager holds to GeoJSON, and
`restoreTacticalGraphics` rebuilds them **editable** — not a picture of the symbols,
the same objects, ready to rotate, resize and modify:

```ts
import {serializeTacticalGraphics, restoreTacticalGraphics} from '@zaes/tactical-graphics/openlayers';

const snapshot = serializeTacticalGraphics(manager);   // one feature per graphic
await db.save(JSON.stringify(snapshot));

// later, in a fresh session
const {restored, failed} = restoreTacticalGraphics(manager, await db.load());
```

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

A graphic that fails to restore is reported in `failed` and rolled back on its own,
so one bad record cannot cost you the rest of the map.

---

## Security operations: the center symbol

Cover, Guard and Screen draw a single-point 2525E unit symbol between their two arms.
That is [milsymbol](https://github.com/spatialillusions/milsymbol)'s job, not this
library's — so this library **never imports milsymbol**. It asks a provider, and you
register one:

```ts
import ms from 'milsymbol';
import {useMilsymbolSecurityOperationSymbols} from '@zaes/tactical-graphics/openlayers';

useMilsymbolSecurityOperationSymbols(ms);   // once, at startup
```

Register nothing and the arms and labels draw with an empty center — no error, no
missing module. That is what makes `milsymbol` an *actually* optional peer
dependency: a consumer who wants the geometry, or the other 200-odd graphics, never
resolves it.

The SIDC handed to the provider is derived from the graphic's own `hostility`, so a
hostile Screen gets a hostile-framed symbol. `securityOperationSidc(hostility)`
exposes the same doctrinal code if you want to build on it.

### Sizing the symbol

```ts
import {setSecurityOperationSymbolSize} from '@zaes/tactical-graphics/openlayers';

setSecurityOperationSymbolSize(40);        // CSS px, default 25, clamped to [8, 96]
source.forEachFeature(f => f.changed());   // takes effect on the next render
```

**Not** milsymbol's own `size` option. That sets the SVG's internal resolution; the
`Icon` built around it still draws at the library's size, so
`useMilsymbolSecurityOperationSymbols(ms, {size: 40})` changes the sharpness and
nothing you can see. The size belongs to the library because the library is what
builds the `Icon` around a provider that returns a `src` string — a provider
returning a whole `Style` bypasses this and owns its own sizing.

To size **one** symbol rather than all of them, return `{src, sizePx}` from its
provider. That wins over the global size and leaves it untouched.

### Choosing the symbol

Register a provider of your own instead of `useMilsymbolSecurityOperationSymbols`.
It can return four things, in ascending order of control:

| Return | You get |
|---|---|
| a **string** | used as an image `src`, drawn at the library's size |
| **`{src, sizePx}`** | a `src` plus its own on-screen size, for this symbol only |
| an **`ol` `Style`** | used verbatim — no `Icon` is built, so sizing and anchoring are yours |
| **`undefined`** | no center symbol |

```ts
setSecurityOperationSymbolProvider(({name, sidc, sizePx}) => symbolFor(name, sidc, sizePx));
```

It is global — one call configures the whole application — and it is handed the
graphic's `name`, so it can give Cover, Guard and Screen three different symbols.

That is as far as the global provider goes. It also receives `labels`, but these three
graphics carry only `hostility` (`getGraphicFields('Screen')` offers nothing else), so
two Screens look identical to it. To vary those, give the individual graphic its own
provider with `handler.setSymbolProvider` — it wins over the global one, and
`undefined` puts the graphic back on it.

### Worked example: three security operations, three units

Placed programmatically, each with its own unit symbol. Uses the `map`, `source` and
`manager` from [the setup above](#openlayers--styled-drawable-editable).

```ts
import ms from 'milsymbol';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import {fromLonLat} from 'ol/proj';
import {TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController, writeGraphicProperties} from '@zaes/tactical-graphics/openlayers';

// Entity digits — SIDC positions 11-16. Digits 1-10 are kept, so the standard
// identity the library derived from `hostility` survives the swap, and a hostile
// graphic stays hostile-framed whichever unit goes in.
const UNIT = {
    [TacticalGraphicName.Screen]: '121300',   // single diagonal — reconnaissance
    [TacticalGraphicName.Guard]: '121000',    // oval + diagonal  — armored cavalry
    [TacticalGraphicName.Cover]: '120500',    // oval             — armor
};
const UNIT_SIZE_PX = 34;   // bigger than the library's 25px default

function placeSecurityOperation(name, lonLat, hostility = TacticalGraphicHostility.friend) {
    const handler = getController(name, map.getView().getResolution()!);
    handler.setSymbolId(crypto.randomUUID());

    // This graphic's own provider, overriding whatever is registered globally.
    // milsymbol's `size` is the SVG's internal resolution — 2x for a crisp HiDPI
    // render. `sizePx` is what it actually draws at. Return a bare string instead
    // to take the library's size.
    handler.setSymbolProvider(({sidc}) => {
        const unit = sidc.slice(0, 10) + UNIT[name] + sidc.slice(16);
        const svg = new ms.Symbol(unit, {size: UNIT_SIZE_PX * 2}).asSVG();
        return {src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, sizePx: UNIT_SIZE_PX};
    });

    handler.setBaseFeature(new Feature(new Point(fromLonLat(lonLat))));

    // `hostility` is the only amplifier these three take. There is no user label:
    // the letter between the arms is `getLabel(name)`, fixed by doctrine as C/G/S.
    // `label: ''` is here only because the type requires the field.
    writeGraphicProperties(handler.getFeatures(), name, {label: '', hostility});

    source.addFeatures(handler.getFeatures());
    manager.watchResolution(handler);   // required — the geometry is screen-pixel sized
}

placeSecurityOperation(TacticalGraphicName.Screen, [-77.10, 38.89]);
placeSecurityOperation(TacticalGraphicName.Guard, [-77.04, 38.89], TacticalGraphicHostility.hostileFaker);
placeSecurityOperation(TacticalGraphicName.Cover, [-76.98, 38.89]);
```

The entity codes above are illustrative — FM 1-02.2 does not prescribe which unit
performs which security task, so substitute your own. The demo's **Draw all samples**
button uses exactly this mechanism.

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

The library is projection-agnostic in one specific way: **it works entirely in
EPSG:4326**, and hands you EPSG:4326 back. Reproject at your renderer's boundary, not
before you call it.

Sizes (`radius`, `size`) are in **meters**, and range-fan band ranges are in
**kilometers**.

---

## Supported graphics

The graphics below are **fully implemented and verified** — each can be drawn, labeled, repositioned and modified, and rotated and resized wherever the symbol admits it, with its shape and labels checked against FM 1-02.2. This is the library's real, proven capability.

*Some symbols are fixed by doctrine rather than sized to the ground, and refuse the gestures that would misrepresent them: the crossed mission tasks (Destroy, Suppress, …) are dropped at one size and one orientation, and Cover, Guard and Screen hold a constant on-screen size while still rotating to face the threat.*

(The [gallery at the top](#tactical-graphics) covers every graphic whose shape and labels are verified, so it shows a few still finishing their edit handles — slightly more than the table below lists. `listTacticalGraphicNames()` returns more again — the registry also carries variants still being finished, listed under [Upcoming graphics](#upcoming-graphics). The table below is the verified set: drawable, correctly shaped and labelled, and fully editable.)

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
| Alternate Supply Route | Mobility and Countermobility Control Measures |
| Alternate Supply Route, Alternating Traffic | Mobility and Countermobility Control Measures |
| Alternate Supply Route, One-Way Traffic | Mobility and Countermobility Control Measures |
| Alternate Supply Route, Two-Way Traffic | Mobility and Countermobility Control Measures |
| Assault Crossing | Mobility and Countermobility Control Measures |
| Block | Mobility and Countermobility Control Measures |
| Bridge | Mobility and Countermobility Control Measures |
| Disrupt | Mobility and Countermobility Control Measures |
| Ferry Crossing | Mobility and Countermobility Control Measures |
| Fix | Mobility and Countermobility Control Measures |
| Ford, Difficult | Mobility and Countermobility Control Measures |
| Ford, Easy | Mobility and Countermobility Control Measures |
| Gap | Mobility and Countermobility Control Measures |
| Main Supply Route | Mobility and Countermobility Control Measures |
| Main Supply Route, Alternating Traffic | Mobility and Countermobility Control Measures |
| Main Supply Route, One-Way Traffic | Mobility and Countermobility Control Measures |
| Main Supply Route, Two-Way Traffic | Mobility and Countermobility Control Measures |
| Obstacle Belt | Mobility and Countermobility Control Measures |
| Obstacle Free Area | Mobility and Countermobility Control Measures |
| Obstacle Group | Mobility and Countermobility Control Measures |
| Obstacle Line | Mobility and Countermobility Control Measures |
| Obstacle Restricted Area | Mobility and Countermobility Control Measures |
| Obstacle Zone | Mobility and Countermobility Control Measures |
| Passage Lane | Mobility and Countermobility Control Measures |
| Route | Mobility and Countermobility Control Measures |
| Route - Alternating Traffic | Mobility and Countermobility Control Measures |
| Route - One-Way Traffic | Mobility and Countermobility Control Measures |
| Route - Two-Way Traffic | Mobility and Countermobility Control Measures |
| Turn | Mobility and Countermobility Control Measures |
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
| Attack By Fire | Tactical Mission Tasks |
| Block | Tactical Mission Tasks |
| Breach | Tactical Mission Tasks |
| Bypass | Tactical Mission Tasks |
| Canalize | Tactical Mission Tasks |
| Clear | Tactical Mission Tasks |
| Contain | Tactical Mission Tasks |
| Control | Tactical Mission Tasks |
| Destroy | Tactical Mission Tasks |
| Disengage | Tactical Mission Tasks |
| Disrupt | Tactical Mission Tasks |
| Exfiltrate | Tactical Mission Tasks |
| Fix | Tactical Mission Tasks |
| Interdict | Tactical Mission Tasks |
| Isolate | Tactical Mission Tasks |
| Neutralize | Tactical Mission Tasks |
| Occupy | Tactical Mission Tasks |
| Retain | Tactical Mission Tasks |
| Secure | Tactical Mission Tasks |
| Support By Fire | Tactical Mission Tasks |
| Suppress | Tactical Mission Tasks |
| Turn | Tactical Mission Tasks |
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

## Upcoming graphics

Everything still being worked towards. A graphic is listed here until it is drawable, its shape and labels are signed off against FM 1-02.2, **and** its edit handles are finished — so this covers both graphics that have not been started and ones that are partly done. Several are already selectable in the demo app; treat anything here as work in progress rather than capability.

| Graphic | Category |
|---|---|
| Limited Access Area | Areas |
| Abatis | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch - Completed | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch - Under Construction | Mobility and Countermobility Control Measures |
| Anti-Tank Ditch Reinforced, With Anti-Tank Mines | Mobility and Countermobility Control Measures |
| Explosives, Planned State Of Readiness | Mobility and Countermobility Control Measures |
| Explosives, State Of Readiness 1 (safe) | Mobility and Countermobility Control Measures |
| Explosives, State Of Readiness 2 (armed But Passable) | Mobility and Countermobility Control Measures |
| Halted Convoy | Mobility and Countermobility Control Measures |
| Moving Convoy | Mobility and Countermobility Control Measures |
| Roadblock Complete (executed) | Mobility and Countermobility Control Measures |
| Wire, Double Apron Fence | Mobility and Countermobility Control Measures |
| Wire, Double Fence | Mobility and Countermobility Control Measures |
| Wire, Double Strand Concertina | Mobility and Countermobility Control Measures |
| Wire, High Wire Fence | Mobility and Countermobility Control Measures |
| Wire, Low Wire Fence | Mobility and Countermobility Control Measures |
| Wire, Single Concertina | Mobility and Countermobility Control Measures |
| Wire, Single Fence | Mobility and Countermobility Control Measures |
| Wire, Triple Strand Concertina | Mobility and Countermobility Control Measures |
| Wire, Unspecified | Mobility and Countermobility Control Measures |
| Follow And Assume | Tactical Mission Tasks |
| Follow And Support | Tactical Mission Tasks |
| Seize | Tactical Mission Tasks |

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

src/components/
  openlayers/                  # Published as @zaes/tactical-graphics/openlayers:
                               #   styling, the 4326→3857 adapter, draw/edit
  MapControls.tsx, …           # The React demo — not published.
```

The demo application is built on **OpenLayers** — it shows drawing, editing, rotating, resizing, modifying, and a Feature Properties dialog, on a keyless OpenStreetMap basemap (no API key needed). Start it with `npm start`.

The geometry layer is renderer-agnostic — it emits GeoJSON, so any renderer that reads GeoJSON can draw it (see [Rendering](#rendering)) — and it never imports `ol`, which the build asserts. The OpenLayers styling ships beside it as an optional entry point; matching that styling pixel-for-pixel on another renderer is a per-renderer effort left to consumers.

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
- A Cesium 2D/3D view is planned once the OpenLayers graphics are complete. The OpenLayers style functions already read their amplifiers (label, hostility, status, DTGs) from `properties.tacticalGraphic`, but the styling *logic* is still OpenLayers-specific code — a second renderer would first need that logic expressed as portable, renderer-agnostic data.

---

## References

- [FM 1-02.2, Military Symbols](https://www.battleorder.org/post/symbolsfm) — US Army
- [DoD Joint Military Symbology (MIL-STD-2525E)](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=114934)
- [TurfJS](https://turfjs.org/) — the geospatial math underneath

## Contributors

- **Edwin Sanchez** — maintainer
- **Eric Marks**
- **Navie Huynh** — past contributor

Commit-level credit lives in the [contributors graph](https://github.com/zaes-code/tactical-graphics/graphs/contributors).

## License

MIT
