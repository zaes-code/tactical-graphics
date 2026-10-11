# Configuring colors and sizes

Everything re-styleable lives on one all-optional config. Omit a field and you get
the default, which is the doctrinal value wherever doctrine sets one, so an unconfigured consumer needs none of this.

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
    obstacleColors: true,          // default true — see below
    obstacleColor: '#00AC00',      // the green itself
    smoothLines: false,            // default false — see below
});

graphics.refreshStyles();   // repaint what is already drawn
```

That last line matters: neither engine repaints what it has already drawn when the
config changes. OpenLayers keeps each feature's cached render until the feature's
revision is bumped, and MapLibre keeps drawing the paint results it baked into its
GeoJSON source. `refreshStyles()` on the [`createTacticalGraphics`](/guide/rendering)
handle does the right thing for either engine; on OpenLayers without the façade,
`source.forEachFeature(f => f.changed())` does the same.

## Smooth lines

`smoothLines: true` draws every graphic the user traces as a free path with its corners
rounded: the control lines and boundaries, the obstacle, wire and fortified lines, the
irregular areas, and the arrows, both the thin direction-of-attack lines and the axis
arrows with a body. `SMOOTHED_GRAPHICS` lists them, and `smoothingKindOf(name)` says how
each is treated.

- **Only the line work changes.** The points the user placed are what is saved, edited and
  exported, exactly as before, so a file says nothing about the setting and opens hard or
  smooth depending on the host that reads it.
- **The curve rounds the corners rather than passing through them** (Chaikin corner
  cutting). The ends of a line stay where they were drawn, and while a graphic is selected
  every engine draws a dashed line through its points, so it is clear what a drag moves.
- **An arrow keeps the segment its head is built on.** The last drawn segment stays
  straight, so the head and anything on it (the aviation twist, the frontal attack's bar)
  are drawn exactly as on a hard line. An axis arrow's two sides are rounded after they are
  offset, so a tight bend cannot fold the body over on itself.
- Graphics whose points are fixed anchors are never touched: the mission tasks, the two-
  and three-point symbols, the rectangles and circles, and the air corridors and overhead
  wire, which mark every vertex.

It reshapes geometry, so `refreshStyles()` rebuilds the graphics it reaches instead of only
repainting them. Every engine does this, the add-ons included. On OpenLayers without the
façade, call `rebuildGraphicsForConfig(manager)` from `@zaes/tactical-graphics/openlayers`
before invalidating the features.

## Obstacles are green, and that beats affiliation

APP-06 8.1.4.3 is unusually direct about this:

> Obstacles and obstructions as shown in this chapter (friendly, hostile, neutral,
> unknown, or factional) are to be drawn using the colour green. However, if the colour
> green is not available obstacles are to be drawn using black.

So the 35 obstacle graphics — the belts and zones, the four obstacle effects, the mines
and wire, the anti-tank ditches, abatis, the explosives states of readiness — draw green
by default, and **they do it for every affiliation**. A hostile obstacle is green, not
red. That is not an oversight: the parenthesis above is exhaustive, and the same
paragraph adds that *"The use of green and yellow for obstacles and CBRN is in
contradiction to the Standard Identities."* The plates carry the affiliation on a red
enemy diamond drawn beside the symbol rather than in it.

Two settings, because *whether* and *which* are different questions:

```ts
configureTacticalGraphics({
    obstacleColors: false,          // fall back to the affiliation color
    obstacleColor: 'rgb(84,196,120)',  // or keep the rule and soften the green
});
```

- **`obstacleColors`** (default `true`) turns the rule on and off. Off, obstacles take
  their affiliation color again — black normally, red when hostile — which is the
  fallback 8.1.4.3 names itself, not a compromise.
- **`obstacleColor`** (default `#00AC00`) is the green. 8.1.4.3 says obstacles are green and
  names no value; 270501's Example cell prints pure `#00FF00`, which is exact as a sample and
  reads as a highlight rather than as line work once it is drawn over a map. The default is
  the same hue at about two thirds the value. A host that wants the plate's literal green, or
  something softer again for a night display, sets it here rather than switching the rule off.

`obstacleColor` is part of `DEFAULT_PALETTE`, so a host spreading that into its own set
gets it like any other color. `obstacleColors` is not — it is a rule, not a color.

Two things it does **not** touch. The planned-status ring stays the affiliation color,
because 290400's plate draws a green mine cluster inside a *black* dash-dot circle: the
ring says *planned*, not *obstacle*. And the CBRN yellow hatching, the cued-acquisition
gray, the radar-search dark cyan and the sector-2 terrain colors are separate rules and
are unmoved by either setting.

Which graphics does it govern? Ask, rather than keeping a list:

```ts
import {OBSTACLE_GRAPHICS, TacticalGraphicName, drawsAsObstacle} from '@zaes/tactical-graphics';

drawsAsObstacle(TacticalGraphicName.ObstacleZone);   // true
drawsAsObstacle(TacticalGraphicName.Route);          // false — a route is not an obstacle
OBSTACLE_GRAPHICS.size;                              // 35
```

The category is deliberately *not* the answer: `MobilityAndCountermobility` holds 51,
of which 17 are mobility measures drawn black — routes, supply routes, the crossings,
the bypasses, the convoys — while unexploded explosive ordnance area is green and filed
under Areas.

## There is one palette

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
graphics.refreshStyles();
```

Spread `DEFAULT_PALETTE` into your set as above. `configureTacticalGraphics` merges,
so a set that names only the colors it changes can never undo the previous one —
going back to light has to actively re-send the light values, not merely stop sending
the dark ones.

`DEFAULT_PALETTE` covers the *unaffiliated* neutrals — the default line color, the
label text that follows it, the halo behind that text — the obstacle green, and the
editor chrome (handle dots, the inert center, the draw marker and its outline). It deliberately carries no
`hostilityColors`: the four affiliation colors are doctrine, and shifting them for a
display setting makes a symbol read differently depending on how the app is
configured. Pass `hostilityColors` yourself if you disagree.

Building your own settings UI? Use `getDoctrinalHostilityColor(hostility)` for the
swatch, not `getColorByHostility`. The latter reads the live config, so a control that
edits an override renders one frame stale — clearing an override shows you the value
you just cleared. The former is a pure function of the enum.
