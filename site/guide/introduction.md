# Introduction

Render **MIL-STD-2525E / FM 1-02.2 / APP-06 tactical graphics** — axis-of-advance arrows, phase lines, mission tasks, range fans, boundaries — as plain **GeoJSON**.

Describe a graphic by adding a `tacticalGraphic` object to any GeoJSON feature's `properties`. Call one function. Get GeoJSON back. Draw it with OpenLayers, MapLibre, or anything else that reads GeoJSON.

This library complements [milsymbol](https://github.com/spatialillusions/milsymbol), which renders single-point unit symbols. Tactical Graphics handles the multi-point geometries milsymbol doesn't: arrows that bend along a drawn path, corridors with parallel rails, arcs and fans sized in meters.

**[▶ Try the live demo](https://zaes-code.github.io/tactical-graphics/)** — draw any graphic, edit its handles, and set its amplifiers in the browser. No install, no sign-up.

**318 graphics** are implemented and verified today, covering **331 doctrinal variants**, across 21 APP-06 entities — see [Supported graphics](/guide/graphics#supported-graphics) for the full catalog, and [Upcoming graphics](/guide/graphics#upcoming-graphics) for what's next. Release history is in the [changelog](https://github.com/zaes-code/tactical-graphics/blob/develop/CHANGELOG.md).

![The demo's sample sweep, framed on the middle of the block it draws](/images/sample-gallery.png)

*The demo's **Draw samples** button, drawing every verified graphic in one sweep — framed on the middle of the block, so the rows above and below run past the edge of the frame. Press it yourself in the [live demo](https://zaes-code.github.io/tactical-graphics/) — nothing here is a mock-up, it is the library rendering through the same path your code would. Both renderers draw this from the identical GeoJSON, so switching engines in the demo redraws the same grid.*
