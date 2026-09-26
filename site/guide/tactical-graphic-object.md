# The `tacticalGraphic` object

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

`name` is always required, and **38 of the 318 graphics need a geometry input as well**:
the one-point mission tasks, the circular areas and the other symbols sized from a center
(movement to contact, the airfield) take their size from `radius`, since a single point
has none. Without it you get a `TacticalGraphicError` naming the field rather
than an invented size — see [Errors](/guide/errors). Every other field is optional, and each graphic ignores the ones that
do not apply to it, so there is no per-graphic options type to look up:

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
    eff: '021200Z-021800Z',   // accepted and saved, but no graphic draws it: the
                              // airspace coordination areas' EFF line is built from
                              // startDate and endDate
    minAltitude: 500,         // a NUMBER, in the configured altitude unit — see below
    maxAltitude: 2000,
    altitudeDatum: 'AGL',     // AltitudeDatum — what those numbers are measured from
    weapon: 'M252 81mm',      // FinalProtectiveFire's weapon, and the two convoys'
                              // equipment type (field V)
    grid: '18SUJ2345',        // the airspace coordination areas

    // Symbology — affects color and dash pattern. Every field below is backed by an
    // exported enum; the table after this block lists each one's complete set of values.
    hostility: 'Friend',      // TacticalGraphicHostility
    status: 'Present',        // TacticalGraphicStatus — Planned ⇒ dashed
    confidence: 'Known',      // TacticalGraphicConfidence — Suspected on a hostile
                              // graphic dashes its line work, as Planned does
    echelon: 'Battalion/Squadron', // TacticalGraphicEchelon
    direction: 'One Way',     // RouteDirection — route graphics
    mineType: 'Antitank Mine', // TacticalGraphicMineType — which mine the three mine
                              // areas draw inside themselves, and a mineline along itself
    mobility: 'Tracked',      // TacticalGraphicMobility — APP-06 Table 8-24 sector 1,
                              // the icon a limited access area, restricted terrain or
                              // severely restricted terrain carries to say what kind of
                              // movement the ground admits
    terrain: 'Ground',        // TacticalGraphicTerrain — APP-06 Table 8-25 sector 2,
                              // the word under that icon, and the color the area is
                              // hatched in

    // Geometry, in meters.
    radius: 1000,             // how far the symbol reaches from its own center:
                              // circle radius, or a point-anchored arrow's half-length.
                              // Only for graphics that HAVE a center. METERS, like a
                              // range fan's bands, see below.
    decorationSize: 300,      // how big to draw a line graphic's decorations — an
                              // arrowhead's barb length, a passage lane's teeth. Not a
                              // reach from anywhere, which is why it isn't `radius`.
    width: 600,               // FULL width across a drawn line — rail to rail on an axis
                              // of advance, edge to edge on a corridor, and the across
                              // dimension of a rectangular zone
    length: 1120,             // FULL length ALONG the graphic. Only the one-point boxes
                              // and ellipses carry both (the rectangular target, cued
                              // acquisition doctrine and the three maritime ellipses);
                              // every other rectangle takes its length from its anchor
                              // points instead
    rotation: 45,             // degrees, counter-clockwise from east (point graphics)
    mirrored: false,          // Abatis only: which side of the line its tooth is on.
                              // Set when the line is drawn, so the tooth starts out
                              // pointing north; see below
    bend: 0.8,                // Turn, the tactical turn and Envelopment — how sharply
                              // the curve bows, where the drawn points do not say
    labelGapDegrees: 15,      // arc mission tasks — HALF the angular hole left for the
                              // letter
    labelGap: 0,              // the same half-gap in meters, on Turn and the tactical
                              // turn
    rangeFan: {bands: [...]}, // weapon/sensor range fans — see below

    // APP-06 200700 radar search doctrine, which states its whole shape as values:
    // "a search axis azimuth, a start range, a stop range, and a stop relative bearing"
    searchAxisAzimuthDeg: 53,  // degrees clockwise from north — the axis the sector centers on
    startRange: 20000,         // meters from the radar to the near arc
    stopRange: 60000,          // meters from the radar to the far arc
    stopRelativeBearingDeg: 45,// degrees either side of the axis, so half the opening
}
```

## The selector fields, and every value they take

Each of these is a **string enum**, exported from the root entry point, so the member and
its value are the same string at run time — `TacticalGraphicHostility.friend` **is**
`'Friend'`. Pass the member; the literal works too, and is what a saved file holds.

| Field | Enum | Every accepted value |
|---|---|---|
| `hostility` | `TacticalGraphicHostility` | `Assumed Friend` · `Friend` · `Hostile/Faker` · `Neutral` · `Pending` · `Suspect/Joker` · `Unknown` |
| `status` | `TacticalGraphicStatus` | `Present` · `Planned` |
| `confidence` | `TacticalGraphicConfidence` | `Known` · `Suspected` |
| `echelon` | `TacticalGraphicEchelon` | `Squad` · `Section` · `Platoon/Detachment` · `Company/Battery/Troop` · `Battalion/Squadron` · `Regiment/Group` · `Brigade` · `Division` · `Corps/MEF` · `Unknown` |
| `direction` | `RouteDirection` | `General` · `One Way` · `Two Way` · `Alternating` |
| `mineType` | `TacticalGraphicMineType` | `Unspecified Mine` · `Antipersonnel Mine` · `Antipersonnel Mine with Directional Effects` · `Antitank Mine` · `Antitank Mine with Antihandling Device` · `Wide Area Antitank Mine` · `Mine Cluster` |
| `mobility` | `TacticalGraphicMobility` | `Unspecified` · `Standard Mobility/On-Road` · `High Mobility/Off-Road` · `Tracked` · `Tracked and Wheeled Combination` · `Towed` · `Railway` · `Over-Snow (Prime Mover)` · `Sled` · `Pack Animal` · `Barge` · `Amphibious` · `No Vehicles` · `Dismounted` |
| `terrain` | `TacticalGraphicTerrain` | `Unspecified` · `Urban` · `Water` · `Ground` · `Vegetation` · `Obstacles` |
| `altitudeDatum` | `AltitudeDatum` | `MSL` · `AGL` · `FL` |

`AltitudeUnit` (`Meters` · `Feet`) is not a per-graphic field — it is host configuration,
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
`configureTacticalGraphics({altitudeUnit: AltitudeUnit.meters})`.

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
and compare. See [Configuring colors and sizes](/guide/colors-and-sizes).

**`mirrored` belongs to the abatis alone.** When an abatis line is drawn, `drawnSide(name,
coords)` picks the side from the drawing direction so the tooth starts out pointing north
(west on a line drawn due north or south), and that choice is stored as `mirrored`. After
that it turns with the line when the graphic is rotated, and no grip flips it. Files saved
before 2026-09-06 may also carry `mirrored` on the seven cane arrows (delay, withdraw,
withdraw under pressure, disengage, retirement, forward and rearward passage of lines) and
mobile defense. Those graphics now state their side with a third anchor point, and the old
files still draw as they were saved.

## Range fans

The two weapon/sensor range fans read one extra object. Every other graphic ignores it,
except radar search doctrine, which reads it only from files saved in its old shape:

```ts
rangeFan: {
    // One entry per ring, innermost first — they are sorted, so the order you write
    // them in does not matter.
    bands: [
        {range: 5000,  label: 'MG',   altitude: 300},
        {range: 12000, label: 'ATGM', altitude: 1500, leftAzimuthDeg: 340, rightAzimuthDeg: 40},
    ],
    // Sector fan only: where the sector points, degrees clockwise from north.
    // Omit it and the fan uses the bearing the graphic was drawn at.
    centerAzimuthDeg: 15,
}
```

| Field | Meaning |
|---|---|
| `range` | how far the ring reaches, **in meters** — see the note below |
| `label` | optional name, drawn above the range line (`MG`, `ATGM`) |
| `altitude` | optional, a number in the configured unit — drawn as `ALT 300FT AGL`, measured from the graphic's own `altitudeDatum` |
| `leftAzimuthDeg` / `rightAzimuthDeg` | sector fan only: this band's own edges, degrees clockwise from north. Omit them and the band spans the sector |

**`range` is in meters**, like `radius`, `width`, `length` and `decorationSize`. Both
APP-06 range fan plates (242100 and 242200) give their ranges in meters. **It was
kilometers before 3.2.0, and there is no migration:** a fan saved before 3.2.0 carries a
kilometer number and renders a thousand times too small.

On a circular fan the innermost band renders as `MIN RG 5,000` and each band outside it
as `MAX RG(1) 12,000`, `MAX RG(2) …`; on a sector every band renders as `RG 5,000`. The
label groups thousands rather than changing the unit.

**A fan with no `bands` still draws.** It falls back to a single ring taken from the
graphic's own `radius` — so a `radius` of 180000 meters draws one ring labeled
`MIN RG 180,000`. That is the shape you get from the draw tool before any band is entered.

Because the description rides on the feature, a tactical graphic is **just GeoJSON**.
Save it, `POST` it, put it in PostGIS, diff it in git — then render it back with
`renderTacticalGraphic()`.

The rendered output carries the same `properties.tacticalGraphic` plus a `role` of
`graphic`, `label` or `handle`, so your styling code can read a graphic's amplifiers
straight off the feature it is drawing.

Seven graphics are dashed as part of the symbol itself, whatever their status: counterattack,
counterattack by fire, the two feints, exploitation's tail and both fords. Their `graphic`
feature also carries `dashedParts`, the indexes of the `MultiLineString` lines to draw dashed.
The dash is a style, not geometry, so the lines arrive whole. Both bundled renderers size every
dash to the graphic on screen, from 12/8 px down to 3/2 px (`withFittedDashes`).

## Sizing a graphic

Four fields size a graphic, and which one applies depends on what the symbol *is*. They
are all in meters and each means one thing. Most graphics read one of them; the one-point
boxes and ellipses read `width` and `length` together.

| Field | Means | Graphics |
|---|---|---|
| `radius` | reach from the symbol's own center | circles and point-anchored symbols |
| `width` | **full** width across a drawn line | axes of advance, corridors, rectangular zones, and the across dimension of the one-point boxes and ellipses |
| `length` | **full** length along the graphic | the one-point boxes and ellipses: the rectangular target, cued acquisition doctrine and the three maritime ellipses |
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

Omit `width`, `length` or `decorationSize` and the graphic falls back to its own default.
`radius` has no default on the 38 graphics that need it: omit it there and you get the
error described at the top of this page.

## Which base geometry does a graphic need?

Each graphic expects one geometry type. Pass the wrong one and you get a clear error
rather than a broken shape.

| Base geometry | Graphics | Example |
|---|---|---|
| `LineString` | arrows, phase lines, boundaries, corridors | `MainAxisOfAdvance`, `PhaseLine` |
| `LineString` **+ `width`** | the twenty rectangular zones | `FreeFireAreaRectangular`, `NoFireAreaRectangular` |
| `Point` | one-point mission tasks, circular areas, the one-point boxes and ellipses, range fans | `Secure`, `Occupy`, `BaseDefenseZone`, `TargetAreaRectangular` |
| `Polygon` | areas | `ObjectiveArea`, `NamedAreaOfInterest` |

`baseGeometryFor(name)` answers this at run time.

```ts
renderTacticalGraphic({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: 'Secure', radius: 1000, rotation: 0}},
});
```

**The arc mission tasks are drawn from two points and stored as one.** APP-06 describes
secure, isolate, retain, occupy, control, area defense, locate and the two cordons with two
anchor points: point 1 is the center, and point 2 is the arc's start point and sets the
radius. Deny follows the same rule, so there are ten. Both bundled renderers draw them
with two clicks the way APP-06 numbers them: the center, then point 2, the start point,
whose distance sets `radius`. What is stored is a `Point` base at the center plus `radius`
and `rotation`, not a two-point line; `rotation` is the axis the letter sits on, and the
start point is 175° counter-clockwise from it, so `rotationFromDrawnPoint(name, angle)`
turns the second click's direction into the stored `rotation`. The edit handle sits on
point 2, so it is where the second click was.

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

listTacticalGraphicNames();                                     // → ['Abatis', 'WireUnspecified', ...]
GRAPHIC_CATEGORIES[TacticalGraphicName.PhaseLine];              // → 'Lines'
getDisplayName(TacticalGraphicName.MainAxisOfAdvance);          // → 'main axis of advance'
getEntityCode(TacticalGraphicName.PhaseLine);                   // → '140300'
getSpecifications(TacticalGraphicName.PhaseLine);               // → ['FM 1-02.2', 'APP-06']
```

**Every graphic says which standard defines it, and carries the identifier that standard
gives it.** `getSpecifications(name)` answers with one or both — 225 graphics are in both
FM 1-02.2 and APP-06, 85 are APP-06 only, and 8 are FM 1-02.2 only. `getEntityCode(name)`
returns APP-06's six-digit entity code **as a string**, or `undefined` for those 8, since
FM 1-02.2 publishes no identifiers of its own. `getNameByEntityCode('140300')` goes the
other way, for reading a symbol out of a feed that addresses graphics by code — it takes
the code as a string too.

`TacticalGraphicName` is a string enum, so `TacticalGraphicName.PhaseLine` **is** `'PhaseLine'`
at run time — which is why `listTacticalGraphicNames()` returns plain strings and why a saved
`tacticalGraphic.name` is readable in a raw GeoJSON file. TypeScript still wants the member
rather than the literal, so pass the enum.

## Which end is the arrowhead?

**Arrow graphics number their points from the tip**, because APP-06 does: *"Point 1
defines the tip of the arrowhead. Point N-1 defines the rear of the symbol."* So on an
axis of advance the **first** coordinate is the head and the last is the tail.

**Twenty-seven graphics are listed in `TIP_FIRST_GRAPHICS`**: the ones whose stored order
the library turns around before its generator reads it. The list is the axis-of-advance
family, avenue of approach, both follow tasks, both counterattacks, advance to contact,
frontal attack, turning movement, mobile defense, the seven retrograde canes, both fixes,
fields of fire, search area and the two convoys. Fields of fire and search area are the
odd ones: APP-06 numbers their **vertex** first, so their first two points swap rather than
the whole line reversing. `generatorOrder(name, coords)` and `storedOrder(name, coords)`
apply the right one.

Exploit, breach, bypass, canalize, clear, both blocks, penetrate and relief in place also
number from the arrowhead, but they are not on the list: their bases store every anchor
point their plates name, in the plates' own order, and their generators read them as
stored.

```ts
import {TIP_FIRST_GRAPHICS, drawsTipFirst} from '@zaes/tactical-graphics';

drawsTipFirst(TacticalGraphicName.MainAxisOfAdvance);   // → true
TIP_FIRST_GRAPHICS.length;                              // → 27
```

Nothing about the rendered symbol changes — the shape, its decorations, its handles and
its labels are what they were. What changes is which end of your `coordinates` array the
arrow points at.

**3.0.0 changed this and saved data is not migrated.** There is no version marker in
`properties.tacticalGraphic` to detect an older graphic by, so if you hold data written by
1.x or 2.x, apply 3.0.0's list to it: reverse the coordinate array of every graphic
`drawsTipFirst` returns true for today (search area and the two convoys did not exist
then), and of the eight named above that have left the list since. The one exception is
fields of fire, whose first two points swap instead; `storedOrder` does that for you. The
multipoint graphics that were never on the list — the ones drawn from anchor points,
demonstration, the obstacle bypasses, the swept-arc tasks, exfiltrate and infiltrate, the
ferry and raft site, and the four direction-of-attack graphics — are untouched.
