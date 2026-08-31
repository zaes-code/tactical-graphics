# APP-06 field validation

Does each graphic offer the amplifiers APP-06 says it carries? **Sweep complete** — all 84
graphics that carry a distinctive field have had their APP-06 Chapter 8 plate read against the
registry.

This is the third leg of the audit. The other two are automated and already done: the
registry says which fields a graphic *offers*, and the catalog sweep says which it *draws*.
Neither can tell you whether doctrine agrees, or whether the amplifier is in the place the
plate puts it.

## Method

APP-06 Chapter 8 puts amplifier eligibility in the **Template** column as labelled boxes —
`Name: T`, `Width: AM`, `Min Alt: X` — and the **Draw Rules** column often states units and
constraints in prose. Both are images or table text, which is why no grep found them: of 649
symbol-set-25 entries, only 19 name an amplifier letter in extractable text.

`tmp/pdfs/crop_app6_rows.py` crops one whole table row per entity code to PNG — name,
template, draw rules and example together, which is the unit a person reads.
`tmp/pdfs/sheet_app6_rows.py` then stacks four to a review sheet, which is what made 84 plates
readable in one pass. Both use PyMuPDF rather than the pdfplumber path in
`build_app6_only_reference.py`, which cannot run here: pdfplumber and reportlab are not installed.

**Read the registry, not the caption.** The `[...]` in each sheet caption is the *distinctive-field
subset* — the fields that made the graphic interesting enough to crop. It is not the full field
set, so a letter missing from a caption is not evidence of a gap. Every finding below was
confirmed against `graphicFieldRegistry.ts` directly. One candidate finding
(`MinefieldDynamicDepiction` missing `W`) died exactly there: `dtg1` was already set.

**Not every row is self-contained.** Boundary's row reads only *"See Table 8-1 and examples
below"*, so its amplifiers have to be read from that table instead.

## Field letters

| APP-06 | ours | notes |
| --- | --- | --- |
| T | `designation` | |
| T1 | `secondDesignation` | |
| T2 | `secondDesignation` | on the fire-support areas, which carry T2 *instead of* T |
| AP | `designation` | on the target graphics, where APP-06 uses AP rather than T |
| AS / AS1 | `countryCode` / `secondCountryCode` | rendered **in parentheses** after its designation |
| V | `weapon` | |
| W / W1 | `startDate` / `endDate` | |
| X / X1 | `minAltitude` / `maxAltitude` | |
| AM / AM1 | `width` / `length` | metres |
| AN | `rotation` | target attitude. The plate quotes mils; we carry degrees, like every other angle |
| B | `echelon` | |
| H | `additionalInfo` | |
| Sector 1 / Sector 2 | `mineType` / `mobility` / `terrain` | which one depends on the graphic |

## Status

**All six defects are fixed**, on `feature/app6-field-conformance`, targeting 4.0.0. The
decisions that shaped the fixes were the user's, 2026-08-31, and are recorded inline below.
The sections that follow describe each defect as found; what shipped is noted under it.

## Defects

### 1. Nine fire-support areas offer the wrong designation field

**Fixed.** The nine now offer `countryCodes` and keep `identifier1`. Where a plate letters a
lone `T2` with no `T1`, the text goes in the *first* designation: a second designation with no
first makes no sense to an operator, and field `AP` already routes to the designation on the
target graphics, so this is the existing convention rather than a new one. `FIRE_SUPPORT_AREA`
was split — position area for artillery has its own constant and keeps its plain `T`.

`FIRE_SUPPORT_AREA` (`graphicFieldRegistry.ts:282`) is `f(true, false, true, true, true)` —
`identifier1` on, `identifier2` and `countryCodes` off. Twelve graphics share it. The plates
split those twelve in two:

| Graphics | Plate template | Example | Our fields |
| --- | --- | --- | --- |
| Free Fire Area ×3 (240203/240202/240201) | `T2 ( AS )` — **no `T`** | `FFA / 2AD (DEU)` | `identifier1` |
| No Fire Area ×3 (240303/240302/240301) | `T2 ( AS )` — **no `T`** | `NFA / 52ID (GBR)` | `identifier1` |
| Restrictive Fire Area ×3 (240403/240402/240401) | `T2 ( AS )` — **no `T`** | `RFA / 1ID (FRA)` | `identifier1` |
| Position Area for Artillery ×3 (240502/240501/…) | `T` | `3BCT` | `identifier1` ✅ |

So the constant is right for PAA and wrong for the other **nine**: they should offer
`identifier2` + `countryCodes` and not `identifier1`. The establishing formation and its
country are the whole content of an FFA/NFA/RFA label.

Fire Support Area itself is *not* in this group — it uses its own inline
`f(true, false, true, true, false)` at `graphicFieldRegistry.ts:720-722`, and its plate does show
plain `T` (`FSA / GREEN`). The constant is misnamed for what it serves.

### 2. Country codes render without their parentheses

**Fixed.** `formatDesignationWithCountry` adds the brackets, passes through a code that
already carries them, and contributes nothing when there is no code. Exported from both
barrels, since a host composing its own labels needs the same rule.

APP-06 draws the parentheses **as part of the template** — the box is `T2` and the literal
glyphs `(` `)` sit outside the `AS` box — and every example follows:

```
EWL   326 EN BN (USA)   EWL        FFA / 2AD (DEU)
NFA / 52ID (GBR)                   RFA / 1ID (FRA)
```

Our `joinParts` / `formatFullLabel` join designation and country code with a bare space, so we
render `326 EN BN USA`. Four independent plates agree on the parentheses.

### 3. Circular range fan repeats `MIN RG` on every band

**Fixed.** The innermost band is `MIN RG`; each band outside it is `MAX RG(n)`. The test that
pinned the old behaviour states the new rule and cites the plate.

242100 labels the innermost band `MIN RG` and each band outside it `MAX RG(1)`, `MAX RG(2)`, …
`boundaryPaints.ts:298` prints `MIN RG` for every band on a circular fan, which
`rangeFanLabelPaints.test.ts:113` currently pins as expected
(`['MIN RG 100', 'MIN RG 200', 'MIN RG 300']`). The sector variant's bare `RG` matches its own
plate and is fine.

### 4. Range fan ranges are kilometres; APP-06 says metres

**Fixed — metres, with no migration.** The user's call: a fan saved before 4.0.0 carries a
kilometre number and will draw a thousand times too small, taken deliberately rather than
carrying a schema version for one field. The label groups thousands (`5,000`), which answers
the argument the old comment made for kilometres. Four call sites carried the conversion — the
generator, both engines' band drags, and the demo's editor — plus a dead duplicate formatter in
`openlayerStyles.ts`.

Both range fan plates state it outright — 242200 (sector) *"All ranges in metres"*, 242100
(circular) *"All units in metres"* — and the examples read `RG 5000`, `MAX RG(1) 28,500`,
`MAX RG(2) 34,400`. `RangeFanBand.range` is kilometres and `formatKm` prints the number bare, so
a 5 km band renders `RG 5` where the standard renders `RG 5000`.

This is deliberate in our code — `core/type.ts` defends km because "a weapon or sensor envelope
is quoted that way" — but it was never recorded as a divergence, and changing it now rescales
every saved fan by a thousand. **Worth a decision rather than a silent difference.** The examples
also carry thousands separators, which we do not emit.

### 5. Mobility corridor maps its free text to the wrong letter

**Fixed.** The field is `additionalInfo` now. `designation` is still read as a fallback so
saved corridors keep their text. The paint also routes it through `amplifierText`, which it
should always have done: a designation survives "show name only" because it is the graphic's
name, and field H is an annotation that has to drop with the rest.

142100's template is `H` over `B` with **no `T`**; the example renders `SMALL DITCHES` (a
description) beside an echelon. `MOBILITY_CORRIDOR` is `f(true, …, {echelon: true})` —
`identifier1` + `echelon`, no `additionalInfo`.

The user can still type free text, so this is a letter-mapping divergence rather than a missing
control — but it decides which field the text serialises into, which matters for interchange.
Worth noting that `StrongPoint` (151203) has the **identical field set** and its plate genuinely
is `T` + `B` (`TWO` + echelon), so the two are indistinguishable in the registry today.

### 6. Rectangular target: length unwired, attitude absent

**Fixed, and rebuilt.** The user's call was to follow the plate fully: one anchor point.
`RectangularTarget` takes a `Point` base and builds the box from length, width and attitude, so
it is no longer `isRectangular` and **a saved two-point target will not restore**. `length` now
reaches the generator and persists. The attitude is `rotation` in degrees rather than a field of
its own — the plate quotes AN in mils, but it is the same angle, and a parallel field would be
the mistake `isDarkMode` was. `AP` maps to `identifier1`, as it already did elsewhere.

240802 defines the target by an anchor point plus **AM1** (length, m), **AM** (width, m) and
**AN** (target attitude, mils).

- `length` **is** a doctrinal amplifier. The registry offers it, but `render.ts` never maps it
  onto the generator and nothing paints it, so it accepts a value and changes nothing. A gap to
  close, not a field to drop.
- **`AN` has no field at all.** Orientation is doctrinally an amplifier in mils here; we carry
  `rotation` in degrees as geometry and do not offer it.

`output/reports/APP-06E2-vs-FM-1-02.2-tactical-graphics.md` already listed this graphic as the one
confirmed non-1:1 shared symbol. This confirms it at field level.

## Deliberate divergences — confirmed, no action

**Airspace coordination areas ×3 (240101/240102/240103) omit `T2`.** The APP-06 template carries
it; we do not offer `identifier2`. This is not an oversight — `graphicFieldRegistry.ts:286-291`
documents the call and its source: *"FM 1-02.2 Table 5-23 template lists T, X, X1, W, W1 only —
no second identifier (Field AS is not specified for engagement zones or ACAs)."* A real FM/APP-06
divergence someone already adjudicated.

**`direction` is FM-sourced, not APP-06.** APP-06 330300 (MSR) and 330500 (Route) show `T` only.
The FM instead defines *separate named symbols* — `main supply route, one-way traffic`,
`two-way`, `alternating` (`docs/FM_1-02.2.txt:6966-6995`) — which we collapse into one graphic
plus a `direction` selector. A defensible modeling choice; the field is legitimate. This closes
the open question raised at 330400.

**Radius on the circular fire-support areas is exchange-only.** 240203/240303/240403/240502 all
carry *"The radius (AM) is for exchange only and is not to be displayed"*. We comply — the radius
sizes the circle and is not painted.

## Constraints worth pinning in tests

**Done** — these are now enforced by `validateTacticalGraphic(name, properties)`, which reports
what a graphic still needs to be doctrinally complete and cites the plate each rule came from.
Sparse rather than exhaustive: most of the standard requires nothing, so a graphic absent from
the table is reported complete, and adding one is a deliberate act with a citation attached.

| Graphic | Constraint |
| --- | --- |
| MinedAreaFenced (270801), MinefieldDynamicDepiction (270707) | `H` is `"S"` when the field holds only scatterable mines, `"+S"` for a mix |
| MinefieldDynamicDepiction (270707) | `W` is the **self-destruct** DTG specifically |
| RestrictedTerrain (152400), SeverelyRestrictedTerrain (152500) | `H` is **mandatory** and must contain the cause of the restriction |
| MobilityCorridor (142100) | `B` is **mandatory** — it articulates the size of force that could exploit the corridor |
| Isolate (341500), Occupy (341700), Secure (342100) | opening is a **30° arc**, placed on the **friendly side** |
| StrongPoint (151203), Retain (151205) | tic length and spacing = the height of the identifying letter, and must follow it when the user resizes it |

## Validated exactly

The remaining plates match the registry field-for-field. Grouped by the pattern they share:

- **Airspace zones** `T / X / X1 / W / W1` — HIMEZ, HIDACZ, JEZ, MEZ, LOMEZ, ROZ, SHORADEZ,
  UA-ROZ, WEZ, FEZ, WFZ
- **Air corridors** `T / AM / X / X1 / W / W1` — Air Corridor, LLTR, MMR, SafeLane, SAAFR,
  SpecialCorridor, TransitCorridor
- **Zone areas** `W-W1 / T / AM` — Dead Space ×2, Fire Support Area ×3, Critical Friendly Zone ×2,
  Target Build-Up Area, Target Value Area, Zone of Responsibility, Purple Kill Box ×3,
  Position Area for Artillery ×3
- **Terrain and minefield selectors** — LimitedAccessArea (`Sector 1` + `H`), RestrictedTerrain
  and SeverelyRestrictedTerrain (`Sector 1` + `Sector 2` + `H`), MinedAreaFenced,
  MinefieldDynamicDepiction, Mineline
- **Others** — HumanTerrain (`H`), PsyOpsZone ×3 (`T` + `H` + `W-W1`, layout documented in the
  constant), StrongPoint (`T` + `B`), EngineerWorkLine (`T/AS`, `T1/AS1` — pairing correct,
  see defect 2 for the rendering), FinalProtectiveFire (`AP`, `T1`, `V` — confirms the
  country-code removal was right), TargetAreaCircular (`AP` + `AM`), Control, CordonAndSearch,
  Isolate, Occupy, Secure, Retain (no amplifier boxes)

## What is left

Nothing from this sweep. Two things it deliberately did not cover:

- **Placement.** This audit asks whether the right *fields* are offered and drawn, not whether
  each amplifier sits where the plate puts it. The free fire areas are the visible example: their
  plate stacks `FFA` on its own line above the designation, and we render the literal as a prefix
  on the same line. That is a layout question across the whole area family, not a field one.
- **The seven graphics with no APP-06 counterpart.** FM 1-02.2 only; nothing in Chapter 8 to read
  them against. @see `ai/app-6.md`
