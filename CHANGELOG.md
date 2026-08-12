# Changelog

All notable changes to `@zaes/tactical-graphics`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Dates are
the npm publish dates — when a version actually became installable.

> **Versions 1.0.0 – 2.0.0 were reconstructed from the commit history after the fact.**
> This file was added afterwards, so those entries summarise what each release contained
> rather than being written alongside it. They are accurate but not exhaustive; the
> commit range between two tags is the complete record.

---

## [Unreleased]

### Changed — BREAKING

- **`TacticalGraphicCategory.OffenceOperationsPlanning` is now `OffenseOperationsPlanning`**, and its value changed from `'Offence Operations Planning'` to `'Offense Operations Planning'`. Both the member name and the string read out of `GRAPHIC_CATEGORIES` change. The library implements a US Army field manual and every neighbouring member already used US spelling.

  **The next release must therefore be a major.** Anything referencing the old member or comparing against the old string needs updating.

### Added

- `scripts/gen-catalog-svgs.js` — generates one SVG per graphic by asking the library to paint it and transcribing the resulting marks, rather than drawing anything by hand. Internal tooling; not part of the published package.
- The progress tracker gained a `Graphic Key` column linking each row to its `TacticalGraphicName` member, so the README generator can validate itself against the enum and report graphics separately from doctrinal variants.

---

## [2.0.0] — 2026-08-11

The MapLibre renderer ships. A second engine draws every graphic from the same
map-agnostic symbology, so choosing a map library is no longer a choice about which
symbols you can have.

### Added

- **`@zaes/tactical-graphics/maplibre`** — a third entry point exposing the same `createTacticalGraphics` as the OpenLayers one, with native GeoJSON layers, draw and edit interactions, and the same editor chrome. `maplibre-gl` is an optional peer.
- Range-fan band descriptions, including per-band altitude amplifiers and the resolvers a renderer needs to place its own band labels.
- `maplibre` added to the npm keywords.

### Changed

- **BREAKING:** the package's second major. Symbology facts that had lived inside OpenLayers holders moved into the map-agnostic half so both engines read one source; consumers reaching past the façade into renderer internals may be affected.
- The centre-symbol provider is handed the amplifiers and asked for one symbol rather than two, and rasters are keyed on the image so they are not rescaled.
- The sample gallery dims the basemap rather than hiding it.

### Fixed

- Neither view can come up blank — a first frame is forced.
- A canvas is never sized smaller than the box it fills.
- Route lines are identified by their coordinates rather than by object identity, which a port had made unreliable.
- A sector fan's range block no longer sits on its own centre axis.

---

## [1.13.0] — 2026-08-07

Sixteen new graphics, mostly obstacles.

### Added

- **Nine wire obstacles** — single, double and high/low wire fence, double apron fence, and the single, double and triple strand concertinas.
- **Three explosives states of readiness**, plus the planned state.
- **Three anti-tank ditches** — under construction, completed, and reinforced with mines — reworked as line graphics.
- **Roadblock complete (executed)**.

### Fixed

- Anti-tank ditch teeth are equilateral and meet exactly; the mines are legible.
- The two-rail wire graphics stay genuinely parallel.
- Readiness bars take a fixed heading with level ends and left hashing, and drop in one click.

---

## [1.12.0] — 2026-08-05

### Added

- The FM table 5-19 obstacle effects, as twins of their mission tasks.

### Changed

- Envelopment is point-anchored, with its circle derived from the approach, its handle at the arrow tip, and a two-click draw.
- Solid arrowheads hold a screen size rather than scaling with the ground.
- Broader npm keywords.

### Fixed

- The retrograde cane hook, the airfield symbol size, and envelopment's label gap.
- Infiltration's `IN` takes the same flat label gap as envelopment.

---

## [1.11.0] — 2026-08-05

### Fixed

- Every size-proportional label is capped, and the arc circles' gap is cut from the rendered glyph rather than estimated.

---

## [1.10.0] — 2026-08-04

### Fixed

- **Security operations hold their on-screen size**, and every graphic is subscribed to zoom changes — previously some paths put graphics on the map without subscribing, so they scaled with the ground instead of the screen.
- Repeating decorations shrink once they exceed a share of the graphic's own on-screen size, and drop out entirely below a floor, so a small shape is not swamped by its own teeth.
- The line of contact scales with the rest and keeps its pair apart.

---

## [1.9.0] — 2026-08-03

### Fixed

- Obstacle teeth, and fortified and wave decoration, are drawn in screen space.

---

## [1.8.0] — 2026-08-03

### Changed

- The config surface is pared to **one palette**.
- Hostility is read from the amplifier bag everywhere, rather than from a loose feature key.
- DTGs are written with a two-digit year.
- The README's generated numbers are genuinely generated.

### Fixed

- Obstacle teeth direction, and the obstacle line's label placement, segment association and colour on restore.
- The obstacle areas get their DTGs.

### Removed

- The `status` field on the obstacle line.

---

## [1.7.0] — 2026-08-02

Configuration moves to the map-agnostic half, so a host configures the library once
however many renderers it has.

### Added

- **`TacticalGraphicsConfig`** and `configureTacticalGraphics`, living beside the geometry rather than in a renderer. Label size, line width, affiliation colours and the default palette.
- The route traffic-direction figure, carried onto the configurable line width.

### Removed — BREAKING in effect

- **The dark-mode flag and the library-side dark palette.** A boolean choosing between two hardcoded colour literals is a worse version of the config, and only the host can see its own basemap. Editor chrome became config instead.
- The `name` field on the crossing-site graphics.
- The convoy symbols are excluded.

> Shipped as a minor despite removing five exports — a deliberate call at the time, and
> not one to repeat. Removals belong in a major.

---

## [1.6.0] — 2026-07-31

### Added

- `PointDropController` is exported from the OpenLayers entry point.

### Changed

- Five tactical mission tasks reshaped; excluded graphics are now tracked explicitly.

---

## [1.5.1] — 2026-07-30

### Fixed

- The always-visible centre dot, which now also moves the graphic.

---

## [1.5.0] — 2026-07-30

### Added

- **Save and restore.** Graphics serialise to GeoJSON and come back *editable*, not merely visible. Snapshot properties are split into `tacticalGraphic` (the portable description) and a renderer object.

### Fixed

- `MovementToContact`'s side arrows lock to the graphic rather than the screen.
- The dark-mode palette reads blue rather than purple, and pending yellow stays bright.

---

## [1.4.0] — 2026-07-30

### Added

- Doctrinal fire-position symbols and the exfiltrate route, with label parity across them.
- Contributors credited on both public surfaces.

### Fixed

- Label scale is clamped to a readable range and updates during the zoom.

---

## [1.3.1] — 2026-07-29

### Fixed

- **The ESM build.** Bare deep imports are resolved, and the build now smoke-loads what it ships — the previous ESM output failed to load for consumers.

---

## [1.3.0] — 2026-07-29

The renderer ships. Styling and interaction had been unreachable for consumers, so a
fix like "hostile line work goes red" could never leave the demo.

### Added

- **`@zaes/tactical-graphics/openlayers`** — a second entry point carrying the adapter, feature holders, controllers, and the draw and edit interactions. `ol` and `milsymbol` are optional peers.

### Fixed

- Hostile line work goes red on the last seven graphics.

---

## [1.2.1] — 2026-07-28

### Changed

- README only, to correct the live demo link.

---

## [1.2.0] — 2026-07-28

### Added

- The README's *Upcoming graphics* table.
- Range fans get one drag handle per band, clamped between neighbours.

### Changed

- Circle graphics resize on edit, with the centre as an inert anchor.
- Edit mode stretches fixed-vertex graphics instead of panning the map.
- Width handles sit on the graphic, with the drag scale corrected to match.
- Movement arrowheads land on the user's last vertex.
- Handles moved onto the graphic for ambush, pursuit and exploitation.

### Fixed

- Hostility follows FM Field N: on for 174 graphics, off for the 24 mission tasks that take no identity.
- Labels stay black under hostility; only strokes take the colour.

---

## [1.1.0] — 2026-07-24

### Fixed

- Handle and interaction fixes across the graphic families, including handle geometry across the block family and the movement graphics.

---

## [1.0.1] — 2026-07-24

### Changed

- Documentation: the doctrinal source is named (MIL-STD-2525E / FM 1-02.2), and references to internal directories are removed from the public tree.

---

## [1.0.0] — 2026-07-14

First public release: MIL-STD-2525E / FM 1-02.2 tactical graphics as plain GeoJSON.

### Added

- `renderTacticalGraphic(feature)` — the public API. Describe a graphic with a `tacticalGraphic` object on any GeoJSON feature and get back the drawn symbol, label anchors and edit handles, all in EPSG:4326.
- `toFeatureCollection()`, `listTacticalGraphicNames()`, `getLabel()`, `getDisplayName()`, and the `TacticalGraphicName` enum.
- A sample gallery drawing one of every proven graphic.

### Fixed

- Unspecified hostility no longer turns friendly-blue on edit.
- `withOpacity` accepts hex colours, not only `rgb()`.

### Removed

- SIDC codes.

---

[Unreleased]: https://github.com/zaes-code/tactical-graphics/compare/v2.0.0...develop
[2.0.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.13.0...v2.0.0
[1.13.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/zaes-code/tactical-graphics/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/zaes-code/tactical-graphics/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/zaes-code/tactical-graphics/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zaes-code/tactical-graphics/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/zaes-code/tactical-graphics/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zaes-code/tactical-graphics/releases/tag/v1.0.0
