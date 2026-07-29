# Contributing

Thanks for helping build out MIL-STD-2525E / FM 1-02.2 coverage.

## The two layers

Understanding this split is the single most important thing before you write code.

- **`src/tacticalgraphics/`** is the library — the thing published to npm. Pure GeoJSON geometry, no map library. It depends only on `@turf/turf` and the `geojson` types, and it must **never** import from `src/components/`.
- **`src/components/`** is a *sample implementation* showing how to consume the library. The OpenLayers renderer is the reference; MapLibre and Cesium are secondary. None of it is published.

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
- **Merge commits made through a web UI are authored by the merger**, sometimes under a synthesised address. Your own commits are unaffected, and the release mirror normalises the rest.

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

## Rules that will bite you

These are the conventions the codebase depends on. Skipping them produces graphics that look right at one zoom level and wrong at every other:

- **Never use turf or `GeometryService` inside an OpenLayers `StyleFunction`.** Style functions receive projected EPSG:3857 metres; turf expects geographic degrees. Use plain Euclidean vector math.
- **Zoom-invariant gaps and offsets belong in the style function**, computed from the live `resolution`. A metric offset baked into the GeoJSON will not stay a constant number of screen pixels.
- **Style functions read amplifiers from the feature**, via `readGraphicLabels(feature)` — never from a closure argument.
- **Stroke widths come from the exported `LINE_WIDTH` constant**, never an inline `width: 2|3|4`.

## Adding a graphic

1. Add the name to `TacticalGraphicName` in `src/tacticalgraphics/core/type.ts`.
2. Write a generator in `src/tacticalgraphics/graphics/`, extending `TacticalGraphicsBase`.
3. Register it in `src/tacticalgraphics/core/TacticalGraphicsRegistry.ts`.
4. Add it to `GRAPHIC_CATEGORIES` in `src/tacticalgraphics/core/categories.ts`.

Steps 1 and 4 are compiler-enforced — `GRAPHIC_CATEGORIES` is an exhaustive `Record<TacticalGraphicName, …>`, so TypeScript tells you what's missing. To wire the graphic into the demo app you also need entries in `controllerRegistry.ts` and `graphicFieldRegistry.ts`.

A graphic is **done** when a user can draw it, label it, and rotate, resize, reposition, and modify it.

Doctrinal reference is [FM 1-02.2](https://www.battleorder.org/post/symbolsfm). Cite the figure or table number in your PR so a reviewer can check the shape.

## Style

Prettier (`.prettierrc.json`): 4-space indent, single quotes, no bracket spacing (`{foo}`, not `{ foo }`), 150-column lines, trailing commas. ESLint is minimal — it only strips unused imports.

Match the surrounding code's comment density and naming. Write a comment to state a constraint the code cannot show, not to narrate what the next line does.

## Licensing of contributions

By contributing you agree your work is licensed under the [MIT License](LICENSE).

Do not add third-party icons, SVG paths, fonts, or doctrinal excerpts without checking their license first — the repo has already had to replace one set of Apache-2.0 icons that arrived with no attribution.
