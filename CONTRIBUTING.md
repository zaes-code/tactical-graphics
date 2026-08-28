# Contributing

Thanks for helping build out MIL-STD-2525E / FM 1-02.2 coverage.

## The two layers

Understanding this split is the single most important thing before you write code.

- **`src/tacticalgraphics/`** is the library — the thing published to npm. Pure GeoJSON geometry, no map library. It depends only on the individual `@turf/*` modules it calls and the `geojson` types, and it must **never** import from `src/components/`. (Import the module, not the `@turf/turf` meta-package — that dragged an AGPL-3.0 transitive dependency in, and 2.1.0 removed it.)
- **`src/components/`** is a *sample implementation* showing how to consume the library. Two renderers live there — OpenLayers and MapLibre — and both are published as subpath entry points; the React demo around them is not. A Cesium view is a planned addition.

  Anything that decides **what a symbol looks like or how it edits** belongs in `src/tacticalgraphics/`, not in a renderer: both read it from there, and that is what keeps them identical. A rule written into one renderer is invisible to the other and to every test.

Styling is sample-app code. Geometry, the `TacticalGraphicName` enum, and the `properties.tacticalGraphic` schema are library code.

## Setup

```bash
npm install
npm start            # demo app at http://localhost:3000
```

## Branching

`develop` is the trunk and the default branch — branch off it and target it with your pull request. `master` carries tagged releases only, merged from `develop` at release time; nothing lands on it directly.

```bash
git switch develop && git pull
git switch -c feature/short-description   # feature/ · fix/ · chore/ · docs/
```

Both branches are protected: no direct pushes, no deletions. Everything arrives by pull request.

## Getting credit for your work

Your commits are the record, so make sure they carry your name. Set your identity once per machine, before your first commit:

```bash
git config user.name  "Your Name"
git config user.email "you@zaes.com"
```

Use the **same address everywhere** — one person committing under two addresses becomes two contributors, and neither shows the full picture.

For your work to appear under your profile on GitHub, add that address to your GitHub account and verify it (Settings → Emails). GitHub matches commits to profiles by author email and by nothing else; an unverified address shows a grey silhouette instead of you. Verifying is retroactive — every commit you have already made links up at once. Adding an address does not make it public; only setting it as your public profile email does that.

Two more things that quietly cost people credit:

- **Nobody should re-commit your diff.** `git cherry-pick` and `git rebase` preserve authorship; re-applying your changes by hand does not. If a maintainer has to commit on your behalf, they should pass `--author="Your Name <you@zaes.com>"`.
- **Merge commits made through a web UI are authored by the merger**, sometimes under a synthesized address. Your own commits are unaffected, and the release mirror normalizes the rest.

## Before you open a PR

```bash
npm run typecheck    # tsc --noEmit — the main correctness gate
npm test             # Jest
npm run lint         # eslint --fix
npm run build        # library build must still emit
```

And, for anything that changes rendering:

```bash
npm start            # terminal 1
npm run drive        # terminal 2 — Playwright drives the real app
```

`npm run drive` draws graphics, edits them through the Feature Properties dialog, and asserts on the live OpenLayers features. Screenshots land in `.playwright-out/`.

```bash
npm run compare:engines   # same bases through both renderers, differences reported
```

**Validate a rendering change on both engines.** The two read the same symbology, so an asymmetry means a fact ended up in a renderer instead of in `src/tacticalgraphics/` — which no unit test can see.

## Rules that will bite you

These are the conventions the codebase depends on. Skipping them produces graphics that look right at one zoom level and wrong at every other:

- **Never use turf or `GeometryService` inside an OpenLayers `StyleFunction`.** Style functions receive projected EPSG:3857 meters; turf expects geographic degrees. Use plain Euclidean vector math.
- **Zoom-invariant gaps and offsets belong in the style function**, computed from the live `resolution`. A metric offset baked into the GeoJSON will not stay a constant number of screen pixels.
- **Style functions read amplifiers from the feature**, via `readGraphicLabels(feature)` — never from a closure argument.
- **Stroke widths come from the exported `LINE_WIDTH()` accessor**, never an inline `width: 2|3|4`. It is a *function* backed by the config — call it at paint time. Caching it in a module-level const freezes whatever the config held at import, and a host's change can never reach that stroke.

## Adding a graphic

1. Add the name to `TacticalGraphicName` in `src/tacticalgraphics/core/type.ts`.
2. Write a generator in `src/tacticalgraphics/graphics/`, extending `TacticalGraphicsBase`.
3. Register it in `src/tacticalgraphics/core/TacticalGraphicsRegistry.ts`.
4. Fill in the five exhaustive tables the compiler will now be failing on:

   | Table | File | What it says |
   |---|---|---|
   | `GRAPHIC_CATEGORIES` | `core/categories.ts` | which menu group it belongs to |
   | `GRAPHIC_SPECIFICATIONS` | `core/specifications.ts` | which of FM 1-02.2 / APP-06 defines it |
   | `GRAPHIC_ENTITY_CODES` | `core/entityCodes.ts` | its six-digit APP-06 code, or `null` |
   | `CONTROLLER_REGISTRY` | `openlayers/controllerRegistry.ts` | which holder and controller drive it |
   | `GRAPHIC_FIELDS` | `openlayers/graphicFieldRegistry.ts` | which inputs its properties dialog offers |

Every one of the five is a `Record<TacticalGraphicName, …>`, so none of this is optional and none of it is a thing to remember: add the enum member and TypeScript walks you through the rest.

5. If — and only if — APP-06 numbers the new graphic's anchor points from its arrowhead, and your generator builds that end last, add it to `TIP_FIRST_GRAPHICS` in `core/drawOrder.ts`. That list is not exhaustive and not a default: a graphic whose draw rule already agrees, or that has no arrowhead, stays off it. `GRAPHIC_ENTITY_CODES` and `GRAPHIC_SPECIFICATIONS` are asserted against each other — a `null` code means exactly "FM 1-02.2 only" — so look the symbol up rather than guessing.

A graphic is **done** when a user can draw it, label it, and reposition, modify, rotate and resize it *wherever those gestures mean something for that symbol*. Some refuse a gesture on purpose — a fixed-size symbol has no resize — and that refusal belongs in the shared tables, not in one renderer.

Doctrinal reference is [FM 1-02.2](https://www.battleorder.org/post/symbolsfm). Cite the figure or table number in your PR so a reviewer can check the shape.

## Style

Prettier (`.prettierrc.json`): 4-space indent, single quotes, no bracket spacing (`{foo}`, not `{ foo }`), 150-column lines, trailing commas. ESLint is minimal — it only strips unused imports.

Match the surrounding code's comment density and naming. Write a comment to state a constraint the code cannot show, not to narrate what the next line does.

## Licensing of contributions

By contributing you agree your work is licensed under the [MIT License](LICENSE).

Do not add third-party icons, SVG paths, fonts, or doctrinal excerpts without checking their license first — the repo has already had to replace one set of Apache-2.0 icons that arrived with no attribution.
