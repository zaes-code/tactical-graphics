# Contributing

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
OpenStreetMap basemap (no API key needed). Its graphic picker shows each symbol's
[thumbnail](/guide/rendering#a-picture-for-a-menu), and on MapLibre a 2D/3D toggle tilts the map over keyless
terrain, with drawing and editing still working tilted. Start it with `npm start`.

**Where the shared code lives, and why it matters.** The geometry layer never
imports `ol` or `maplibre-gl` — the build asserts it — but it carries more than
geometry: `symbology/` holds the paint functions that say what marks to draw, and
`core/symbology.ts` and `core/handles.ts` hold the per-graphic rules that decide a
label's font, a decoration's size, which handle sets a width and where a rotate
pivots. Both renderers read all of it. A rule that lives in one renderer instead
is how the two silently drift apart, which is a mistake this repo has made more than
once. So the rule is that a symbology fact never lives in a renderer.

---

## Development

```bash
npm start                  # run the demo app
npm test                   # run the test suite
npx tsc --noEmit           # typecheck (the main correctness gate)
npm run lint               # eslint --fix
npm run gen:thumbnails     # redraw the picker thumbnails, then rebuild
npm run check:thumbnails   # report whether the committed thumbnails are stale
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

5. `npm run build && npm run gen:thumbnails` — the [picker thumbnail](/guide/rendering#a-picture-for-a-menu).
   Nothing fails to compile without it; the graphic simply has no picture, and the
   thumbnails suite fails on coverage. The generator reads `dist/` and writes source, so it
   needs a build before it and one after — `gen:thumbnails` runs the second for you.

A graphic is "done" when a user can draw it, label it, reposition and modify it,
and rotate and resize it wherever those gestures mean something for that symbol —
a crossed task like Destroy resizes, but has no rotation to offer, because its X turned
45° is a different symbol. `allowedGestures(name)` is the authority.
