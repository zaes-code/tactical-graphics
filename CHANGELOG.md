# Changelog

All notable changes to `@zaes/tactical-graphics`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Dates are
the npm publish dates — when a version actually became installable.

> **Versions 1.0.0 – 2.0.0 were reconstructed from the commit history after the fact.**
> This file was added afterwards, so those entries summarize what each release contained
> rather than being written alongside it. They are accurate but not exhaustive; the
> commit range between two tags is the complete record.

---

## [Unreleased]

**A plate-by-plate audit of the amplifier fields against APP-06 Chapter 8, and the
corrections it turned up.** All 84 graphics that carry a distinctive field were read
against their Chapter 8 row — name, template, draw rules and worked example — and compared
with `graphicFieldRegistry`. The method and the full findings are in
`docs/app6-field-validation.md`.

Breaking, so this is a major. Two changes alter stored data and one alters a symbol's
anchor count; everything else is additive.

### Breaking

- **`RangeFanBand.range` is metres, not kilometres.** Both range fan plates say so in as
  many words — 242200 "All ranges in metres", 242100 "All units in metres" — and their
  examples read `RG 5000` and `MAX RG(1) 28,500`. A 5 km band used to render `RG 5`. The
  label now groups thousands, which answers the argument the old schema comment made for
  kilometres without keeping the divergence. **There is no migration:** a fan saved before
  4.0.0 carries a kilometre number and will draw a thousand times too small.
- **The rectangular target is built from one anchor point.** APP-06 240802 "requires one
  (1) anchor point" and states the shape outright — target length (AM1), target width (AM)
  and target attitude (AN). It was a two-point drawn rectangle, so **a saved rectangular
  target will not restore as the same shape.** It is no longer `isRectangular`, and the
  new `RectangularTarget` generator takes a `Point` base.
- **Mobility corridor's free text moved from `identifier1` to `additionalInfo`.** Its
  template is `H` over `B` with no `T`, and its example is a description of the going
  rather than a name. The paint already called it field H in a comment while reading
  `designation`, which is kept as a read fallback so saved corridors keep their text — but
  the dialog now offers the additional-info input instead of a designation.

### Added

- **`validateTacticalGraphic(name, properties)`** reports what a graphic still needs to be
  doctrinally complete, with the plate each rule came from. A mobility corridor without its
  echelon, restricted terrain without the cause of the restriction, a minefield whose field
  H is neither `S` nor `+S`. `isTacticalGraphicComplete` is the boolean form, and
  `getDoctrinalRequirements` exposes the rules. Deliberately sparse rather than an
  exhaustive record: most of the standard requires nothing.
- **The free, no and restrictive fire areas offer a country code.** Their plates letter the
  pair `T2 ( AS )`, e.g. `FFA / 2AD (DEU)`. Nine graphics.
- **The airspace coordination areas offer a second designation.** Both publications give
  them two name fields and merely letter them differently — APP-06 `T2`, FM `T1`.
- **The rectangular target offers an attitude** (amplifier AN), backed by `rotation` in
  degrees, and its **`length` now reaches the generator** — it was offered and accepted a
  value that changed nothing.

### Fixed

- **Country codes render in parentheses** — `326 EN BN (USA)`, not `326 EN BN USA`. APP-06
  draws the brackets as part of the template, so they are the standard's punctuation rather
  than something the operator types; a code that already carries them is passed through
  unchanged. New `formatDesignationWithCountry` replaces two call sites that joined with a
  bare space, one of them misusing `formatFullLabel`.
- **The circular range fan stops printing `MIN RG` on every ring.** 242100 labels the
  innermost band `MIN RG` and each band outside it `MAX RG(1)`, `MAX RG(2)`. The sector's
  bare `RG` matches its own plate and is unchanged.
- **`length` survives a save and restore.** It was missing from the persisted geometry keys.

### Changed

- `FIRE_SUPPORT_AREA` and `AIRSPACE_COORDINATION_AREA` were both named for graphics they do
  not serve — the first is the fire *coordination* areas and not position area for
  artillery, the second the engagement zones and not the ACAs. Split and renamed; position
  area for artillery keeps a plain `T`, which its plate does show.

## [3.1.0] — 2026-08-31

**Two fixes a consumer could not work around, and a field that was offered where nothing
would draw it.** Additive throughout: nothing renamed, nothing removed.

### Fixed

- **`process` is no longer read at module load.** `const BASEMAP_ENABLED =
  process.env.REACT_APP_BASEMAP !== 'off'` sat at module scope in the OpenLayers and
  MapLibre entry points. `process` does not exist in a browser bundle, so importing either
  one threw `process is not defined` for any consumer whose bundler does not shim it — and
  `createBasemapStyle` is exported from the MapLibre barrel, so that half was unimportable
  outright. Both reads are lazy and guarded now.

  It survived nineteen releases because every check we run has a `process`: the consumer
  tarball install, the build's smoke loads and the whole suite all pass in Node. The build
  now asserts that no emitted file reads `process` at module scope.

- **A lone range band's label stayed inside its ring.** The block was measured against its
  neighbour's anchor, so a fan with one band was measured against nothing and held its size
  while the ring shrank under it. Two or more bands never showed the bug, because the second
  band is what holds the first one in.

- **A sector's bearings stay on their arc.** They were anchored at `radius * 1.05` — a
  metric offset baked into the geometry, so 5% of a 180 km band is 9 km of ground and the
  bearing crept further off its edge the further you zoomed in. Anchored on the arc; the
  clearance is the paint's own pixel nudge, which is constant at every zoom. Their scale is
  capped against that arc too, where before it was not capped at all.

### Added

- **`countryCodes` on `GraphicFieldSet`.** `identifier2` meant "second identifier *and*
  country codes", which is two different things: only boundary and engineer work line paint
  a country code, and each pairs the **first** designation with `countryCode` and the second
  with `secondCountryCode`. Final protective fire takes a second designation and no code at
  all, so it was offered two inputs nothing would ever draw.

  Read it from `getGraphicFields(name)` as before. If you *construct* a `GraphicFieldSet`
  yourself — a mock, a fixture — it now needs the new key; every other consumer only
  receives one and is unaffected.

## [3.0.0] — 2026-08-30

**A major, and it earns it.** Eight breaking changes, of which the four that reach data
you have already **saved** are the ones worth planning for: the point order of
thirty-two graphics, the base geometry of the eighteen rectangular zones, the base
geometry of cover, guard and screen, and the amplifiers — both the two designations
renamed, and the values four enums hold.

Three of those four are handled on read. The zones migrate, the old amplifier names are
aliased, and the recased enum values are translated. **The point order is not**, so it is
the one that needs a migration on your side.

The rest are compile-time: two enum members renamed along with their values, the members
of two more enums recased to `lowerCamel`, and five exported identifiers respelled to US
English. Your compiler finds all of them.

### Changed — BREAKING

- **Cover, guard and screen are drawn, not dropped.** APP-06 342201/342202/342203 are four-point symbols — *"Point 1 and Point 2 define the ends of one arrow and Point 3 and Point 4 define the ends of the other"* — and these were placed on a single anchor at a fixed screen size, marking a point on the display rather than a span of ground. The operator now draws **one arrow**, point 1 at the arrowhead and point 2 at its inner end, and the second arrow is derived from it: the standard's own symmetry, so the pair always agree in length and lie on one axis, which four hand-placed points cannot be relied on to do.

  **No handles, and resize scales the whole symbol.** Every point but the two drawn ones is derived, and dragging one of those alone would break the symmetry the symbol is built on — so the generator publishes no handle points and the edit-mode resize scales the base, which is what these want. The centre symbol is capped at the same 96 px ceiling the escort and the follow tasks stop at, so zooming in does not inflate it.

  Everything is a ratio of the drawn arm, recovered from the pixel constants the badge was built from, so the symbol looks as it did at whatever size it is drawn. One deliberate departure, the user's call after seeing it: the arms now sit close to what they surround — the gap is 0.42 of an arm, measured off the Template, where the badge's constants left a hole as wide as an arm was long. The fold in each arm, and the mirroring of the second, are the shipped shape and the plate's, unchanged.

  The portable statements moved with it: `BASE_VERTEX_COUNT` says two points, `DROP_SIZE_PX` no longer names them (which is what tells a renderer to wait for the second click), and `ROTATE_ONLY_SYMBOLS` is empty — the library has no fixed-size symbol left.

- **Every enum value a host can store is spelled one way.** Thirteen exported enums held their values in three conventions at once, and a single saved property bag could read `{hostility: 'Hostile/Faker', status: 'present', direction: 'ONE_WAY'}` — Title Case, lower case and UPPER_SNAKE in three adjacent fields. The dialogs print `Object.values(...)` straight into the menu, so the operator was shown all three side by side.

  An enum value is either **what the operator reads** or **a literal somebody else wrote**, and there is no third kind. `TacticalGraphicStatus`, `TacticalGraphicConfidence`, `RouteDirection` and `AltitudeUnit` were the four holding neither, and now read as the words in the list: `Present`, `Planned`, `Known`, `Suspected`, `General`, `One Way`, `Two Way`, `Alternating`, `Meters`, `Feet`. Their members are `lowerCamel` like the other nine, so `RouteDirection.ONE_WAY` is `RouteDirection.oneWay` and `AltitudeUnit.Meters` is `AltitudeUnit.meters`.

  Three enums are deliberately exempt, each for a stated reason. `TacticalGraphicName` is the dispatch key, a PascalCase identifier equal to its own key, with `getDisplayName()` as the label — the rule this library already followed. `AltitudeDatum` and `TacticalGraphicSpecification` hold someone else's literal: `MSL` / `AGL` / `FL` are printed on the plate exactly so, and `'FM 1-02.2'` is a document number.

  **A graphic saved before this still loads.** `applyAmplifierAliases` gained `RECASED_AMPLIFIER_VALUES`, the sibling of the key-rename table one level down, applied at the same three read points. One direction only: nothing writes an old value back. `enumValueCasing.test.ts` asserts the rule by shape rather than by listing today's values, so a new enum is covered the day it is added.

- **Thirty-two graphics store their drawn points in APP-06's order: the arrowhead is point 1.** The standard numbers an arrow symbol's anchor points from its tip — *"Point 1 defines the tip of the arrowhead. Point N-1 defines the rear of the symbol"* (152300 Avenue of Approach, and the same sentence across the offensive-maneuver family) — and this library filed them rear-first, so the head landed on the user's *last* click.

  The affected graphics are the axis-of-advance family, avenue of approach, both counterattacks, advance to contact, frontal attack, turning movement, mobile defense, the seven retrograde canes, exploit, both fixes, breach, bypass, canalize, clear, both blocks, penetrate, relief in place, and fields of fire. `TIP_FIRST_GRAPHICS` is the list.

  **Nothing about a rendered symbol changes** — the shape, its decorations, its handles and its labels are what they were. What changes is the order of `geometry.coordinates` on the base a consumer draws, saves and restores, and therefore which end of a drag the arrow points at.

  **Graphics saved by an earlier version are not migrated** and will render with their arrow at the opposite end. There is no version marker in `properties.tacticalGraphic` to detect them by; if you hold saved data for any of the thirty-two, reverse those coordinate arrays on load.

  Twenty-two graphics whose point order the standard already agreed with are untouched — the six drawn from anchor points, demonstration, the obstacle bypasses, the swept-arc tasks, exfiltrate and infiltrate (numbered *to* the tip), the ferry and raft site, and the four direction-of-attack graphics, which APP-06 leaves free.

  APP-06 also spends its **last** anchor point on an arrow's width; this library still carries width as a `width` / `radius` amplifier in meters. That divergence is unchanged.

- **`TacticalGraphicCategory.OffenceOperationsPlanning` is now `OffenseOperationsPlanning`**, and its value changed from `'Offence Operations Planning'` to `'Offense Operations Planning'`. Both the member name and the string read out of `GRAPHIC_CATEGORIES` change.
- **The two designation amplifiers are renamed: `label` is `designation`, `secondId` is `secondDesignation`.** Both `TacticalGraphicProperties` and `GraphicLabels` change, so the rename reaches the saved bag, the style functions, the Feature Properties dialog and any host reading amplifiers off a feature.

  They are fields **T** and **T1** — FM 1-02.2: *"T — Identifies a unique designation"* — and the old names said neither what they were nor which was which. `label` also collided with the three other senses of that word in this library: the anchor features `renderTacticalGraphic` returns, the `role: 'label'` tag, and `GraphicLabels`, the bag it is a member of. `readGraphicLabels(f).label` read as the label of the labels and was none of them.

  They are deliberately **not** `identifier1` / `identifier2`. Doctrine numbers these T and T1, so `identifier1` would be field T and `identifier2` would be field T1 — off by one against the plate a reader would check them against. `designation` / `secondDesignation` also matches the `countryCode` / `secondCountryCode` pair already in the schema.

  **Saved data is not broken.** Unlike the point-order change above, this one is aliased: `applyAmplifierAliases` (exported) fills the current names in from the old ones, and it is applied wherever a stored bag is read — `readTacticalGraphicProperties` and therefore `renderTacticalGraphic`, both renderers' style paths, and both engines' `restore`. Nothing writes the old names back, they are absent from the types, and a bag carrying both keeps the current one. A file written by 1.x or 2.x opens with its designations intact and migrates the next time it is saved.

  `RangeFanBand.label` is untouched — a band's own label is not field T.

- **`AltitudeUnit.Metres` is now `AltitudeUnit.Meters`**, and its value changed from `'metres'` to `'meters'`. Both the member and the string it resolves to change, so anything persisting or comparing the value needs updating.

  Both renames are for the same reason: the library implements a US Army field manual for US programs, and the neighboring members already used US spelling — `DefenseOperationsPlanning` sat three lines from `OffenceOperationsPlanning`.

- **Five exported identifiers were respelled to US English**, as part of a sweep of the whole source tree:

  | Was | Is |
  |---|---|
  | `decorationMetres` | `decorationMeters` |
  | `arrowheadMetres` | `arrowheadMeters` |
  | `crossedMissionTaskMetres` | `crossedMissionTaskMeters` |
  | `centreSegmentIndex` | `centerSegmentIndex` |
  | `centreOf` *(MapLibre entry point)* | `centerOf` |

  These are the only renames that reach a consumer. The sweep changed roughly 1,350 further occurrences across 134 files — internal identifiers, comments and documentation — none of which is importable.

- **The eighteen rectangular zones take a two-point base and a `width`, not a drawn box.** APP-06 says so in the same words eighteen times — *"This symbol requires two anchor points and a width, defined in metres, to define the boundary of the area. Points 1 and 2 will be located in the centre of two opposing sides of the rectangle"* (240202, and seventeen more).

  `renderTacticalGraphic` now **throws** if one of them is handed a `Polygon`:

  ```
  Graphic "FreeFireAreaRectangular" expects a LineString base geometry, got Polygon.
  ```

  The eighteen are the rectangular variants of free fire area, no fire area, restrictive fire area, position area for artillery, artillery target intelligence zone, call for fire zone, target build-up area, target value area, zone of responsibility, censor zone, critical friendly zone, dead space area, blue and purple kill boxes, target area, fire support area, airspace coordination area, and the PsyOps zone. `isRectangular(name)` is the test.

  **Saved data is migrated, on both engines.** `restore` reads the ring, recovers the axis and the width, and rebuilds the zone editable. A consumer calling the generator directly can do the same: `axisFromRectangleRing(ring)` is exported from the root entry point and returns the two anchor points and the half-width in meters.

  What this buys is the reason to accept it: the width can now be **dragged**, the zone can be **turned**, and points 1 and 2 exist in the saved description instead of nowhere. Each gesture owns exactly one dimension — a side handle changes length, the bottom handle changes width, rotate changes neither.

### Added

- **`stylesFor(name)`: which style functions draw a graphic.** A host that renders saved graphics into its own layer — its own features, its own ids — needed the style pair each graphic uses, and that fact lived only in the holder classes, which are internal. So consumers guessed, and the guess is always `getStyle`, because it is exported, takes a name and returns styles.

  `getStyle` is the **area outline** dispatcher. Its fallback is `areaOutlinePaint`, it draws no text at all, and for the two hundred graphics that are not areas it is simply the wrong function. A downstream integration shipped with every area unlabelled and every arc mission task missing the letter that identifies it — `R`, `I`, `AD` — because `getStyle` was applied to the label feature too. Nothing errored; the symbols were quietly wrong, which is the failure mode a missing API produces.

  `stylesFor(name)` returns `{graphic, labels}`, read off the holder the controller registry would build rather than restated in a second table that would drift from it. **`labels` is `undefined` for the 84 graphics that keep every glyph on the graphic feature** — a phase line's `PL ALPHA` rides its own line work — so a host knows not to style their label geometry and draw the designation twice.

  Exported from `@zaes/tactical-graphics/openlayers`. `getStyle` is unchanged and still correct for what it always was.

- **`hideAmplifiers`: draw a graphic and its name, and hide the rest.** A planning map carries a lot of graphics, and most of what an operator types on one is reference detail rather than something to read at a glance. Set it and dates, altitudes, widths, field H and a corridor's information block stop drawing.

  **The symbol itself is never hidden.** A cover's `C`, a mission task's letter, a `PL` prefix and a corridor's `ACP 2` are the graphic rather than an annotation on it. `TextSpec.kind` is where a paint says which a mark is — `doctrinal`, `designation` or `amplifier` — and a mark that says nothing counts as doctrinal, because a stray date is noise and a missing letter is a different symbol. Both renderers apply the same function where paints become marks, so a new paint inherits the behaviour without knowing the toggle exists.

  **It is a renderer input, not part of the graphic.** `PaintFeature.hideAmplifiers`, supplied at render time the way `graphicSize` is — set it on the OpenLayers feature or on the MapLibre `PaintFeature`. It is deliberately not a field on `TacticalGraphicProperties`: it says nothing about what the symbol *is*, two identical graphics side by side may reasonably differ, and none of it should travel in a file another operator opens. A host keeps the choice wherever its other view state lives; the demo keeps a set of ids in local storage, which is the worked example.

- **The two follow tasks take a host-supplied unit symbol where field T goes.** Same seam as the security operations and the escort — `setSecuritySymbolProvider` / `setGraphicSecuritySymbolProvider`, and nothing in this package imports milsymbol, so a host that registers nothing gets the designation the user typed. When a provider answers, the symbol **replaces** the designation and the body widens to hold it: a picture of the unit says more than its name.

  `followTaskSymbol` is the single statement of where it goes and how big it is, exported from the root entry point and read by the paint — which cuts the body to fit and skips the text — and by both renderers, which draw the image. Placing it from a second calculation is how a symbol ends up not sitting in its own hole, which is the lesson `escortSymbolStyle` already carries.

- **Three tactical mission tasks: seize (342300), follow and assume (341200), follow and support (341300).** All three are defined by FM 1-02.2 *and* APP-06, so they carry both specifications and their entity codes.

  **Seize** is the swept arc its family already draws, lettered `S` — FM 1-02.2 draws a circled unit with an arc arrow to the objective, and APP-06 342300 agrees. It differs from capture (343000) only in that letter, which is also why capture is APP-06 only and seize is not: seize is an FM 3-90 mission task and capture is not.

  **The two follow tasks** are one shape read from the rear point to the tip — a hollow body carrying field T, a connector, and a head — and they differ in exactly two ways: assume dashes its connector and ends in an open chevron, support runs solid into a filled head and notches its rear edge. Both take two anchor points with point 1 at the arrowhead, so both are in `TIP_FIRST_GRAPHICS`, and both are drawn at paint time because the rule says the symbol "varies only in length".

  Two details worth recording. APP-06 341200 notes that *"the dashed lines in this symbol shall be displayed in present and anticipated status"*, so the connector's dash is its own rather than the status dash — a planned follow-and-assume dashes for both reasons and the two must not cancel. And the standards disagree on the support variant's head: FM 1-02.2 draws it open, APP-06's example fills it. The fill is drawn; the divergence is recorded in `followTaskPaints.ts` rather than resolved silently.

- **`prepareFeatures(rendered)` on the `/openlayers` entry point — one call from rendered GeoJSON to features you can put on a map.** Three steps had to happen in the right order: project the GeoJSON, ask `stylesFor` which style functions draw this graphic, and publish the shape's extent to the label feature. Miss the second and a designation is drawn twice; miss the third and every fitted symbol comes out at a fixed size in metres.

  Missing the third fails **silently** — nothing throws, nothing warns, and the map looks plausible until somebody notices a symbol that does not grow with its shape. A host should not have to know a checklist to avoid that, so this is the checklist. No new capability: the same three calls, in the order they have to happen, and every part stays exported for a host that wants to do it by hand.

- **`publishGraphicExtent(labels, graphic)` on the `/openlayers` entry point.** Several symbols are *fitted to the area they land in* rather than drawn at a fixed size — the CBRN triangle, the airfield zone's crossed runways, the sector-1 modifier glyphs, and every label held to a share of its own shape. The fit reads `bounds` and `ring`, and those ride the **label** feature, which is a bare anchor point with no shape of its own to measure.

  A holder built by this package publishes them as a side effect of drawing. A host that builds its own features — the shape `stylesFor` exists to serve — published nothing, so `fitSymbolScale` fell back to its no-bounds answer and every fitted symbol came out at a fixed size in metres. Measured in a consuming app, a CBRN triangle drew **12 px across** at a zoom where its area was over 500: right while the graphic was being drawn, because the draw is holder-backed, and tiny the moment it was committed.

  The keys therefore stop being private to the holders. This is the same stamp `AreaGraphicBase` makes, exported so a host can make it too, and so that what the keys are called stays this package's business rather than something a consumer reverse-engineers. A graphic with no interior — a line, a point — publishes an extent and no ring, because a ring invented from a bounding box reports room that is not there.

- **Seventy-three graphics, taking the registry from 216 to 289.** APP-06 Chapter 8 is closed: everything in scope is built, drawn on both engines, and carries its entity code. By family:

  | Family | Graphics |
  |---|---|
  | Lines | avenue of approach, counterattack by fire, light line, generic line, handover line, named area of interest line, holding line, no fire line, battlefield coordination line, decision line, mobility corridor, radiation dose rate contour line |
  | Areas | generic area, bomb area, bridgehead, penetration box, joint tactical action area, submarine action area, submarine generated action area, enemy prisoner of war holding area, regimental support area, human terrain, extraction zone, fighter engagement zone, terminally guided munition footprint, airfield zone, zone of fire, restricted and severely restricted terrain, artillery maneuver area, artillery reserved area |
  | Target acquisition | target build-up area, target value area and zone of responsibility, each in its irregular, rectangular and circular form |
  | CBRN | the four contaminated areas, the three toxic-industrial-material variants, the three contour lines, and the two minimum safe distance zones |
  | Protection | mineline, mine cluster, trip wire, raft site, fortified position, minefield dynamic depiction, mined area fenced, and the three obstacle bypasses |
  | Mission tasks | capture, deny, escort, demonstration, evacuate, recover, cordon and knock, locate, advance to contact, battle position prepared but not occupied |
  | PsyOps | the three PsyOps zones |

- **`GRAPHIC_ENTITY_CODES`** — a graphic addressed by the six-digit identifier the standard gives it. 280 of the 288 enum members carry one; the eight that do not are the FM 1-02.2 graphics APP-06 does not publish, and `null` means exactly that. `GRAPHIC_SPECIFICATIONS` says which standard defines each: 211 in both, 69 APP-06 only, 8 FM 1-02.2 only.

- **APP-06's Sector 1 and Sector 2 modifiers**, drawn rather than spelled. Sector 1 carries Table 8-24's seven mine glyphs, the mobility and terrain types; `MINE_GLYPH_EXTENT` states each glyph's own reach, so a row of them is spaced by what is in the slot rather than by the slot.

- **Field H (`additionalInfo`)** on the graphics whose plates carry it.

- **One edit mode, on both engines.** Four global gesture modes became a single `edit` button with per-graphic selection and a dashed selection box. The affordances are DOM above both maps, so an engine owes only `selectionBox()` and `beginGesture()`.

- **A live draw preview on both engines** — the symbol is drawn while it is being drawn, not only when the sketch closes.

- **`DERIVED_ANCHOR_GRAPHICS`** — a symbol whose anchor points describe one shape at one set of proportions. The operator places the first point and the rest are re-derived on every build, so a file whose points had drifted resolves to the canonical shape. Demonstration is the first member.

- **`npm run check:readme-samples`** compiles every README code sample against `dist/`, so an example cannot outlive the API it demonstrates.

- **`CORRIDOR_GRAPHICS`** — the eight air-coordinating corridors that share one shape: air corridor, low level transit route, minimum risk route, safe lane, special corridor, standard use Army aircraft flight route, transit corridor, unmanned aircraft corridor. Exported for the same reason as the other symbology tables: which graphics carry the corridor's rails, ACP markers and amplifier block is a fact about the symbols, and anything drawing them has to agree on the membership.

- **`npm run drive` covers Export and Import.** The serialization under them was already covered exhaustively in jest; the layer either side was covered by nothing — the Blob and the `<a download>` click going out, `JSON.parse(await file.text())` coming back. The driver now presses Export, catches the download, clears the map, feeds the file back through the Import input, and compares whole `tacticalGraphic` bags rather than named fields, so it keeps working across a schema rename. Internal tooling.

- **`npm run shoot-gallery` frames the shot on the graphics.** It used to capture the app's default view, which left a third of the frame as empty ocean; it now zooms to fill the visible map from the drawn extent. Internal tooling; the committed `docs/images/sample-gallery.png` is regenerated from it.

- `scripts/gen-catalog-svgs.js` — generates one SVG per graphic by asking the library to paint it and transcribing the resulting marks, rather than drawing anything by hand. Internal tooling; not part of the published package.

- The progress tracker gained a `Graphic Key` column linking each row to its `TacticalGraphicName` member, so the README generator can validate itself against the enum and report graphics separately from doctrinal variants.

### Changed

- **The README documents every selector enum in full.** `hostility` trailed off after four of its seven values and `direction`, `mineType`, `mobility` and `terrain` named none at all — a consumer cannot guess a string enum's members, and a value outside the set is ignored rather than rejected, so an incomplete list shows up as an amplifier that silently does not draw. Each field now names its enum, a table lists every accepted value, and a test asserts the table against the enums so it cannot drift.

- **A label is the size the host configured, capped by the graphic — and no longer by the zoom it was drawn at.** `labelScale` multiplied the configured size by how far the map had moved since the graphic was drawn, clamped to [0.3, 1.5]. That clamp was what stopped a label swamping a small symbol, and `capLabelToGraphic` does that job properly now — against the graphic itself rather than against a moment in time.

  What the old rule cost: two identical graphics could carry labels five times apart because of *when* someone drew them, and a saved map came back with different label sizes, because the drawing zoom is live view state and is deliberately not written to the file — a restore stamps whatever zoom the loading session opens at. Measured on the sample sweep, **116 of 224 labels changed size** when that remembered zoom changed. It is **0** now, at every zoom.

  Nothing moves at the zoom a graphic was drawn at, where the old multiplier was 1. Zoomed out the cap was already deciding. Zoomed in, labels stop growing to 1.5x and stay the size that was asked for. `labelScale` remains as the fallback for a graphic that publishes no extent — none of the 202 labelled features in the sweep are in that position, but a consumer building features by their own path could be.

- **`WIDTH` alone no longer brings a corridor's amplifier block into being.** The block's other five lines are things somebody typed. `width` is not: the holder mirrors the corridor's drawn half-width into the amplifier on every rebuild, and typing a width resizes the corridor to match, so the value can never disagree with the shape. A freshly drawn corridor got a block anyway, reading `WIDTH: 391 km` back at the person who had just dragged it — the only thing in it, on the preview and after the draw finished.

  The width is now a *supporting* line: printed in its doctrinal place under the name whenever the block is drawn, never the cause of it. Enter a name, an altitude or a DTG and the block appears with the width alongside.

- **A corridor draws its name at one size, on the legs that can hold it.** Each leg was sized independently, because legs differ in length and a label must not overrun the one it lies along. The consequence was that a corridor's own name rendered at as many sizes as it had legs: measured in a consuming app at a single zoom, one four-leg corridor drew `AC CORRIDOR BLUE` at 53, 78, 121 and 163 px. Four labels each politely fitting reads, on the map, as a rendering fault.

  A corridor has one name, so it gets one size — the largest any leg can carry, held to the corridor's width — and a leg that cannot hold the label at that size is **skipped**, the way a road name appears only where the road has room for it. Sizing to the *shortest* leg was the alternative and it is worse: one stub leg would shrink the name along the whole corridor.

  At least one leg always draws, by construction: the size is capped by the widest leg's own allowance, so that leg passes the test. The amplifier block is unaffected — it was already held to the largest of the per-leg answers, which is the same number this now draws with.

- **A resize scales the sizes a graphic carries beside its vertices** — a corridor's rails and a line graphic's chevrons grow with the line instead of staying where they were. An area's `decorationSize` is deliberately exempt: on a hostile encirclement it is the width of the *gaps* the outline is cut into for the `ENY` amplifiers, a hole sized to hold text rather than a decoration sized to match the shape.

- **Every screen-sized quantity is measured where the graphic is**, not at the equator, so a symbol drawn at 60° north is the size it looks.

- **Turn and scale happen on the screen, not on the sphere.** Measuring a rotation in EPSG:3857 at world zoom shows several degrees of pure Mercator distortion that is not in the gesture.

### Removed

- **The MapLibre half's last two beliefs that cover, guard and screen are screen-sized.** They were fixed-size badges pinned to a screen constant until the four-anchor change above. Two pieces survived it: `securityOperationSize`, which overwrote the caller's `radius` with `SECURITY_OPERATION_HALF_EXTENT_PX × drawingResolution`, and their entry in `isScreenSized`, which rebuilt their geometry on every zoom.

  Neither changed the picture — the generator builds the arms from the base and ignores `radius`, so rendering a cover with the override and without gives byte-identical geometry, and the per-zoom rebuild re-derived exactly what was already there. **Inert rather than wrong, which is worse in one way:** they put a bogus ground distance in the saved bag, spent work on every zoom for nothing, and left this half of the codebase asserting that MapLibre treats these three as screen-sized while OpenLayers routes them through `line(2)`. Read side by side, the two engines appeared to disagree about what a cover is. They did not.

  `securityOperationsAreNotScreenSized.test.ts` pins the property that made the removal safe rather than the removal itself: a radius is ignored, and the size follows the base. Nothing in the library is screen-sized *geometry* now; what `isScreenSized` still answers for is a baked decoration, which is a decoration size and not the shape.

- **`SecurityOperationsController` and `SecurityOperationGraphicBase`** (`/openlayers`). They placed a security operation on one anchor and sized it from the live map resolution; with the graphic drawn from two points there is nothing for them to do, and the generator they depend on no longer accepts a point base — so they could not work, not merely go unused. The three graphics are ordinary line holders now. A host that referenced either directly needs `getController(name, resolution)`, which is what the app has always used.

### Fixed

- **An area's centred label is capped against its shape too, at a larger share (0.4) than an outside label's 0.25.** A centred label is the shape's name and is meant to fill some of it; an outside label is an annotation beside it. The ring fit still has the last word, because only it can keep text off a concave outline — but the ring fit stops a label *overflowing* a shape and says nothing about one that fills it, which is what the zoom anchor had quietly been doing. Measured: the rectangular fire areas held 0.41 of their box at the drawing zoom and grew to 0.52 zoomed out; they now hold **0.40 at every zoom**.

- **A label may no longer outgrow its own symbol.** `labelScale` floors its zoom multiplier at 0.3 so text stays readable, and the graphic under it has no floor at all — it is ground, and ground shrinks with the zoom. Far enough out, every zoom-anchored label was standing on a symbol smaller than itself: measured on the sample sweep three levels out, the envelopment's `E` reached 0.80 of the graphic it sits on and the turning movement's `T` 0.34, against the avenue of approach's steady 0.23.

  Every label is now capped at **0.25 of the graphic's own on-screen size** — `LABEL_GRAPHIC_SHARE`, applied in `scaleOf` and at the handful of paints that source a scale for themselves. Against the same dimension the share *is* the ratio you see, so this number is not a knob: it is the measured ratio of the two graphics that already read correctly. It is a cap, never a raise, so nothing moves at the zoom a graphic was drawn at.

  Turning movement, capture, seize, recover, evacuate, disengage, penetration, pursuit, the block family, the withdrawal family, the artillery areas' on-line labels and the boundary-break lines all now hold a constant ratio at every zoom, where each of them climbed before.

- **A label's cap is told the size it actually renders at.** A scale is a multiplier on a font, and this library renders two: 16 px for most labels and 24 px for the ratio-locked families. The cap assumed 16 everywhere, so every 24 px label — the relief in place, the retrogrades, the block family, the crossed mission tasks — was capped half again too high and several never bit at all. The relief in place, reported as still growing, now holds 0.25 at every zoom where it climbed from 0.27 to 0.34.

- **The corridors' amplifier block is held to the designation drawn on the corridor.** It sits outside the graphic and the designation sits on it, so the designation is what a reader measures everything else against; an amplifier larger than the symbol's own name reads as the more important of the two, which it is not. Capped at the largest of the per-leg designations, so one short leg cannot shrink the block to nothing.

- **The area families' outside labels take the cap too** — the date-time group hung off the upper-left corner of a rectangular, circular or irregular zone, a position area's four `PAA` markers, and a group of targets' designation on its northern edge. Their centred labels are deliberately left alone: those are already held by the ring fit, which shrinks a label until it genuinely fits the outline, and capping them again would only make a label smaller than the shape it comfortably sits in.

- **The corridors' amplifier block sits outside the corridor at every zoom.** It anchored on the bounding box of the *turning points* — which are the center line, with the rails half a width either side — so zooming in grew that half width until the block was printed inside the corridor. Lifting it by the corridor's own radius fixed a straight corridor and not a bent one: a corridor that turns north climbs past whatever a local lift can clear, by fifteen thousand pixels at six zoom levels in. The block now sits **west of the graphic's whole extent**, level with the north-west-most turning point — outside for any shape at any zoom, and still beside the vertex it belongs to. Its designation is capped by the leg it lies along *and* by the corridor's width, so it cannot print over its own rails.

- **OpenLayers publishes a graphic's extent to its label features**, which MapLibre's adapter has always done. It came from four keys that only `AreaGraphicBase` stamps, so any rule measured against a graphic's size worked on one engine and quietly did nothing on the other. It now falls back to the holder's own drawn feature through the registry that already maps features to holders — nothing to stamp, and nothing for a new holder to remember.

- **The follow tasks' unit symbol stops growing at 96 px.** Everything else about these two is drawn in metres, so zooming in makes all of it bigger — right for the body and the arrowhead, wrong for the symbol inside them: measured in the browser, it reached 279 px in a 436 px body. It now stops at the ceiling the escort already used and `setSecuritySymbolSize` is clamped to, so every centre symbol agrees on how large it ever draws. The escort's *floor* is deliberately not copied: its size comes from the span of a bar that can be short while the graphic is still perfectly visible, where this one comes from the body it sits inside, and a symbol held at 8 px inside a 4 px body is bigger than its own container.

- **The escort and the two follow tasks offer an affiliation.** All three are tactical mission tasks, which carry no amplifiers, so hostility was switched off for them — and all three draw a host-supplied unit symbol, whose frame *is* its standard identity. The one amplifier that decides what the symbol looks like was the one that could not be set, so it drew `pending` for ever. The exemption reads `CENTER_SYMBOL_GRAPHICS` rather than naming them again: a graphic cannot gain a centre symbol without gaining the identity that frames it. Their line work follows the affiliation too, as `Exfiltrate` already did.

- **The follow tasks' unit symbol fits the body it sits in.** Two ways it did not. The support variant's rear edge is a notch cut forward into the body, and the content was centred on the whole body — so the notch ran through the middle of the symbol, and through field T before it. And both renderers size an icon by its *width*, letting the height follow the image's own aspect, so a box measured as though the image were square was not a box: a 2525E land unit runs from 0.86 tall per unit wide to 1.23, and the hostile frame is 1.18. The symbol is asked for at a width that fits whatever comes back, and both it and field T are centred on the interior the body actually offers.

- **A corridor's name never runs into an `ACP n` circle.** Every turning point carries one, and the designation is centred on the leg between two of them — but it was measured against the *whole* leg, so it grew straight through the circles at either end, and the closer together they were the more of the name they covered. It is now measured against the clear run between them, `leg − 2 × radius`.

  A leg whose circles already meet carries no label at all, which is the only honest answer: there is no size at which the name would not collide. The amplifier block is deliberately exempt from that zero — it sits outside the graphic, cannot collide with anything, and when no leg can carry the name it is the only thing left saying what the corridor is.

- **A label's size no longer depends on who built the feature.** `scaleOf` asks the host how big a label should be and the symbol how big it may be — and it used to ask a third thing whenever the graphic's extent was missing: the zoom the operator happened to be at when they drew it.

  That fallback made the answer depend on the *renderer's bookkeeping*. A holder-backed feature carries bounds, which the OpenLayers layer recovers through the registry that maps features to holders; a host that builds its own features carries none. So the same corridor at the same zoom drew its designation at **1.00** in this library's own app and **0.55** in a consuming one, with nothing in the configuration to explain the difference.

  The zoom anchor is the thing `scaleOf` was changed to stop using — it is not saved with the graphic, so a label sized by it cannot be reproduced — and leaving it as the fallback kept it in use for exactly the consumers who had no way to see why. A missing extent now means **no cap**, not a different rule.

- **The ambush's arrowhead line kinked where the hashes ended.** APP-06 141700's Draw Rules make it one line — *"the rear of the arrowhead line shall connect to the midpoint of the line between points 2 and 3"* — and on a 120 degree arc that midpoint is `r·cos(60°)` = 0.5r out along the axis, exactly where the hashes start. The generator emitted it as two: a seventh hash from 0.5r to r, then an arrow from the bulge at r out to the tip.

  Both halves are walked from the centre on the same bearing, so they are collinear in the plane the generator works in and every measurement of *its* numbers agreed. But each was emitted as a bare pair of endpoints, and a chord does not follow the great circle it subtends — so the whole of the curvature landed on the join, as a corner. Drawn at the demo's opening zoom the two halves met at **7.1 degrees**, plainly at different angles; the pieces that read as one line have to be one line for the corner to have nowhere to go.

  It is now a single run from the chord to the tip, and the hash on the axis is gone with it — which is also what APP-06's Template and Example draw, six hashes with none on the axis and the arrowhead line passing between them. The arrowhead's barbs now lean off the run as rendered rather than off the shorter piece. `Ambush.generateGraphics` emits nine sub-lines where it emitted ten.

- **A draw's double-click zoomed the map for a host that builds an engine per draw.** The map's `DoubleClickZoom` is pulled off for the duration of a draw and put back on the next press that is not the second half of the double-click that ended it. That state was held **per manager**, and a host may build more than one manager on one map — a fresh engine for each draw, another for an edit session.

  So the second manager looked for a `DoubleClickZoom`, found none because the first had already removed it, and recorded that it had nothing to restore — while the first manager's armed listener was still on the viewport and reinstalled the zoom on the next press. For a host that destroys its engine at `drawend`, that press is the first click of the *next* draw, which then ran with the zoom installed and jumped when the double-click ended it.

  The suspension is keyed on the map now, so every manager on it sees the same one, and `destroy()` gives the interaction back rather than leaving it detached with a listener behind to reattach it at some later moment. `doubleClickZoom.test.ts` walks the reported sequence — draw, destroy, draw again — and three of its five fail against the old code.

- **A stored metre is a ground metre, and the paints were treating it as a projected one.** The portable description states *real* distances — a radius, a corridor's half-width — while a map resolution is projected metres per pixel, and Web Mercator inflates those by `1 / cos(latitude)`. `metres / resolution` is therefore the symbol's on-screen size only on the equator; everywhere else it under-reports, by 1.6x at 50 degrees and **5.8x at 80**.

  `mercator.ts` already states this rule for the generators, which convert the other way when a symbol is drawn — a corridor dragged out at 60 degrees came out 79 px wide instead of 40 until they did. The paints had the same defect on the way back out, at the three sites that read a stored size: a corridor's ACP circle radius, the crossed mission tasks' label width, and the base defence zone's radius.

  The consequence was a cap fed a wrong number. On a plan near 80 degrees north a corridor 40 px wide measured as 7, and its designation was shrunk to fit the 7 — scale 0.30 where the same corridor on the equator got 1.50.

  **It was invisible because every test and every demo screenshot was taken near the equator.** `paintLatitude.test.ts` now draws the same graphic at 0, 35, 60 and 80 degrees and asserts the on-screen size does not move; `groundPixels` is the one conversion, beside `featureLatitude`, which recovers the latitude from the geometry rather than reprojecting through a map library.

- **Thirteen graphics kept an amplifier when told to show their name only.** `hideAmplifiers` is enforced per *mark* — `withHiddenAmplifiers` drops a paint whose `text.kind` is `amplifier` — but several paints stack an annotation and a designation into one mark, which cannot be filtered apart. The amplifier line has to be emptied inside the stack instead, which is what `amplifierText` is for, and nothing made a paint author choose between the two.

  So the date range survived under a coordinated fire line, a munition flight path and a passage lane; field H survived on human terrain, both restricted terrains, all three psyops zones and the limited access area; the start date survived under the dynamic minefield and the fenced mined area; and the weapon survived under a final protective fire.

  Found by sweeping all 291 paintable graphics at once rather than checking them one at a time — each looked right on its own, because the toggle was never asked about it. `amplifierSweep.test.ts` is that sweep, kept: it paints every graphic twice with every amplifier the schema offers, and asserts that nothing an amplifier could have written survives while the doctrinal abbreviation and the designation both do. The sweep also caught the helper in `midLabelLinePaints.ts` named `amplifier` that set no kind at all; it is `textMark` now, and takes one.

- **A corridor's designation shrank with every character typed.** The label runs along a leg, rotated, so two things bound it: its length against the leg, and its **height** against the gap between the rails. The height bound was applied as a *width* cap — the label's natural width held to 1.4 of the corridor's width — on the reasoning that a bounded aspect ratio makes one a proxy for the other.

  It is not. A width cap divides by the text's natural width, so the answer falls as the name grows. `AC BLUE` came out at scale 0.79 and `AC CORRIDOR ONE`, on the same corridor at the same zoom, at 0.36 — and on a corridor 25 px wide, at 0.23, which is a four-pixel-tall label: correctly inside its rails and impossible to read.

  The height is what the rule was always about, so it is what is measured now. A long name and a short one get the same scale on a corridor that has room for either, and both give way together when it does not.

- **The airfield's designation is measured off the drawn runway, not off a stamped size.** APP-06 131900's Template boxes the `T` immediately past the end of the horizontal line, and the runway is the wider of the two arms — so the graphic's own eastern edge is that end. Deriving it from `graphicSize` assumes that number is the runway's half length, which holds only on the path that stamps it: the catalog generator hands the paint the sample's `radius`, which is smaller, and the designation printed 17 px *inside* the runway it was supposed to clear. Visible on the published catalog rather than in the app, which is why no test caught it.

- **`gen-catalog-svgs.js --only` no longer rewrites the catalog manifest.** It was built from whatever the run drew, so regenerating one tile left `catalog.json` and `catalog.js` holding a single entry — and the catalog page reads `catalog.js`, so the site would have listed one graphic out of 291. `--only` is the obvious way to check a thumbnail after changing its paint, which is exactly when it did the most damage.

- **Setting the affiliation on a hand-drawn Cover, Guard or Screen did nothing.** The centre symbol is the largest thing these three draw and the natural place to click — and its feature belonged to the controller rather than the holder, so it was outside every write the holder makes by iterating its own features. It carried no `symbolId`, and the properties dialog identifies its graphic by exactly that: the form opened on an empty selection, showed defaults, and dropped the edit on OK. Drawn into the sample sheet the same graphic honoured its affiliation, because that path never goes through a click.

  The feature belongs to the holder now, so `setSymbolId`, the amplifier bag and the rotation all reach it the way they reach everything else. MapLibre had the same hole and had already closed it on its side.

- **`axis of attack` is gone from the tracker, and so from the Upcoming table.** It is registered in the core registry without a `TacticalGraphicName` member and is named by neither standard; the row asserted work that has no graphic to do.

- The **Supported** and **Upcoming** graphics sections credit the standard that actually defines each graphic. Both said "checked against FM 1-02.2", which stopped being the whole truth when APP-06 became a first-class source: 211 graphics are defined by both, 69 by APP-06 alone, 8 by FM 1-02.2 alone.

- **The aviation direction of attack keeps its bow-tie on its own line.** The mark is baked into the geometry at a fixed multiple of the decoration size along the first segment, so a base shorter than that multiple placed it *past* the end of the line — at a quarter of the length it needs, the furthest bow-tie vertex sat six times the line's own length beyond it. It is now clamped to the segment and held clear of the arrowhead: it slides back while there is room to slide, shrinks when there is not, and is omitted rather than misplaced when there is no room at all. The clamp is in the generator, so it holds for an imported file and for a host calling `renderTacticalGraphic` directly, not only for the two renderers.

- **`minimumFirstSegmentPx` — the draw-time floor that keeps that from happening in the first place, now applied by both engines.** Aviation direction of attack (80 px) and both fixes (145 px) carry a mark near the start of the line and need room for it and for the arrowhead. The rule lived as two hard-coded literals inside an OpenLayers holder, so MapLibre had none: measured, the same 40-pixel drag gave a line held to 80 px on OpenLayers and left at 40 px on MapLibre, where the bow-tie then sat off the end of the graphic. Both engines read the shared table now, on the draw *and* on a vertex drag, and a parity test guards the pair.

- A movement label's alignment now flips with its rotation, so a westward graphic's text is not upside down, and its span scale is capped.
- The counterattack label sits behind the arrowhead; the avenue of approach no longer offers date fields it does not carry.
- Exfiltrate and infiltrate are built on their own draw rule rather than reconciled against each other.
- The envelopment's handle is on point 3, where its own drag already looked.
- The mined anti-tank ditch is drawn mined — it had been rendering identically to the unmined one.
- The CBRN contamination mark is a crossing X, transcribed from a vector reference.
- MapLibre's hatch layer draws under its solid fills.
- Twenty-two graphics gained the fixed-vertex draw limit only OpenLayers knew about; without it a fields-of-fire could not be drawn on MapLibre at all.
- The catalog no longer projects an empty coordinate array as `NaN`.
- **A retrograde task's mirror handle flips it on OpenLayers again**, as it always has on MapLibre. The handle is a one-point feature, and the manager's hit test answered "no handle" for anything that was not a multi-point one, so the drag fell through to the width path: dragging a withdraw's mirror handle left `mirrored` untouched and *resized* the symbol instead — 195 km to 1,522 km of decoration in three drags.
- **A width drag flips a graphic to the side the cursor is on, on both engines.** The side handed to the generator is absolute, and OpenLayers measured it against the stored point order while MapLibre measured it against the generator's; for the graphics whose points were renumbered, those are opposite.
- US English throughout the README prose and the whole source tree, and a broader word list in the spelling test that guards it. The previous list had eleven terms and did not include `synthesise` or `realise`, which is how both reached the published README.

---

## [2.1.0] — 2026-08-12

### Changed

- **Depends on the individual `@turf/*` modules instead of the `@turf/turf` meta-package.** No public API changes — `@turf/turf` was never re-exported, so nothing a consumer can import is affected. This is a patch-level change shipped as a minor only because the dependency list itself changed.

  It removes **`marchingsquares`, which is AGPL-3.0**, from the production dependency tree. It was reachable only through `@turf/isobands` and `@turf/isolines`, neither of which this library has ever used; they arrived because the source imported the meta-package rather than the 26 functions it calls. **It was present in every release from 1.0.0 through 2.0.0.**

  | | Before | After |
  |---|---|---|
  | Components | 142 | 32 |
  | Licenses | 126 MIT, 7 ISC, 3 BSD-3-Clause, 2 Unlicense, 3 unreported, 1 AGPL-3.0 | 31 MIT, 1 Unlicense |

  Three components that reported no license at all — `jsts`, `@turf/jsts`, `splaytree-ts` — went with it, so the tree is now fully attributable as well as fully permissive.

  **If you vendor, audit or redistribute this package, this is the entry to read.** Copyleft in a dependency tree is what software-composition scanners raise first, and several organizations' approved-software policies reject AGPL outright. Upgrading from any 1.x or 2.0.0 clears it.

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
- The center-symbol provider is handed the amplifiers and asked for one symbol rather than two, and rasters are keyed on the image so they are not rescaled.
- The sample gallery dims the basemap rather than hiding it.

### Fixed

- Neither view can come up blank — a first frame is forced.
- A canvas is never sized smaller than the box it fills.
- Route lines are identified by their coordinates rather than by object identity, which a port had made unreliable.
- A sector fan's range block no longer sits on its own center axis.

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

- Obstacle teeth direction, and the obstacle line's label placement, segment association and color on restore.
- The obstacle areas get their DTGs.

### Removed

- The `status` field on the obstacle line.

---

## [1.7.0] — 2026-08-02

Configuration moves to the map-agnostic half, so a host configures the library once
however many renderers it has.

### Added

- **`TacticalGraphicsConfig`** and `configureTacticalGraphics`, living beside the geometry rather than in a renderer. Label size, line width, affiliation colors and the default palette.
- The route traffic-direction figure, carried onto the configurable line width.

### Removed — BREAKING in effect

- **The dark-mode flag and the library-side dark palette.** A boolean choosing between two hardcoded color literals is a worse version of the config, and only the host can see its own basemap. Editor chrome became config instead.
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

- The always-visible center dot, which now also moves the graphic.

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
- Range fans get one drag handle per band, clamped between neighbors.

### Changed

- Circle graphics resize on edit, with the center as an inert anchor.
- Edit mode stretches fixed-vertex graphics instead of panning the map.
- Width handles sit on the graphic, with the drag scale corrected to match.
- Movement arrowheads land on the user's last vertex.
- Handles moved onto the graphic for ambush, pursuit and exploitation.

### Fixed

- Hostility follows FM Field N: on for 174 graphics, off for the 24 mission tasks that take no identity.
- Labels stay black under hostility; only strokes take the color.

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
- `withOpacity` accepts hex colors, not only `rgb()`.

### Removed

- SIDC codes.

---

[Unreleased]: https://github.com/zaes-code/tactical-graphics/compare/v3.0.0...develop
[3.1.0]: https://github.com/zaes-code/tactical-graphics/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/zaes-code/tactical-graphics/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/zaes-code/tactical-graphics/compare/v2.0.0...v2.1.0
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
