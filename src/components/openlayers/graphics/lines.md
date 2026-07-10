---
How Line Graphic Labels Are Decided and Drawn

The wiring: LineGraphicBase.ts (lines 41–75)

The LineGraphicBase constructor contains a switch that maps each TacticalGraphicName to a specific style function. This is where each graphic's label strategy is chosen. Everything not explicitly matched falls through to
fireLineStyle as the default.

  ---
The four label patterns

1. Labels along the line ends (to either side) — phaseLineStyle

Used by: PhaseLine only.

- The label feature geometry is a LineString (the actual line drawn by the user).
- Two labels are placed at start and end of the line, rotated to follow the line direction.
- Start label: textAlign: 'left', offset left by -(GAP_PX + textWidth) — puts text to the left of the start point.
- End label: textAlign: 'right', offset right by +(GAP_PX + textWidth) — puts text to the right of the end point.
- Result: both labels sit beside the line, flanking it at each end.
- Label content: getFullLabel(name, labels.label) → "PL <name>" (prefix always included; name property always shown).

Direction-aware offsetX (fix 2026-04-09):
OL Text.offsetX is screen-space and is NOT rotated with the text. The "keep-upright" normalization
(rot += π when |rot| > π/2) makes rotation = 0 for both left-going and right-going ends.
Therefore the sign of offsetX is determined by checking the x-component of the segment:

  const startOutsideRight = (start[0] - startNext[0]) >= 0;
  const endOutsideRight   = (end[0]   - endPrev[0])   >= 0;
  // START label: offsetX = startOutsideRight ? GAP_PX : -GAP_PX - textWidth
  // END label:   offsetX = endOutsideRight   ? GAP_PX + textWidth : -GAP_PX

2. Labels above/below the line at both ends — getFireLineStyles (default)

Direction-safe anchor & alignment (fix 2026-04-09):
Two bugs affected right-to-left and mixed-direction lines:
a) offsetCoordinatesUp flips the perpendicular side when the segment goes right-to-left.
   Fix: use offsetAbove(anchor, a, b, res, px) / offsetBelow(...) which normalize ny to always
   point north: if (ny < 0) { nx=-nx; ny=-ny }.
b) textAlign was chosen from a single "goesRight" flag shared between both endpoints.
   After keep-upright normalization rotation is always ~0, so textAlign is a screen-left/right
   decision. Each endpoint must check its own local segment:
     const startGoesRight = afterStart[0] >= start[0];
     const endGoesRight   = end[0] >= beforeEnd[0];
     startAlign = startGoesRight ? 'left' : 'right';
     endAlign   = endGoesRight   ? 'right' : 'left';

2. Labels above/below the line at both ends — getFireLineStyles (default)

Used by: all the named offensive/fire phase lines (LOA, LD, FEBA, FSCL, RFL, CSB, ICL, etc.) via fireLineStyle and the default case.

- The label feature geometry is a MultiPoint with the start and end points of the line (from Phaseline.generateLabels()).
- Uses offsetCoordinatesUp() to place identifier label above the line at each end (perpendicular offset up), and date label below the line at each end.
- textBaseline: 'bottom' for identifier (above line), textBaseline: 'top' for date (below line).
- Start: left-aligned; End: right-aligned.
- Result: two labels stacked above and below the line, at both ends.
- Label content: getFullLabel(name, labels.label) → combines type prefix (e.g. "FSCL") with the user's label field. The name property is always included as the prefix.

3. Labels above/below the line at the midpoint — coordinatedFireLineStyle

Used by: CoordinatedFireLine, EngineerWorkLine.

- Also reads a MultiPoint geometry.
- Finds the projected midpoint of the line and carves a gap there.
- Places topLabel above (perpendicular offset +, textBaseline: 'bottom') and bottomLabel below (textBaseline: 'top') at that midpoint.
- The top label is getFullLabel(name, labels.label), the bottom is getDateLabel(labels).
- Result: labels straddle the line at the center, not at the ends.

4. Segment-midpoint labels repeated along the line — boundariesStyleFunc

Used by: Boundary (in a separate Boundary.ts file, not LineGraphicBase).

- Draws topLabel above and botLabel below at each segment midpoint.
- topLabel = formatFullLabel(labels.label, labels.countryCode), botLabel = formatFullLabel(labels.secondId, labels.secondCountryCode).
- No fixed prefix from getLabel() — does not include a graphic-type name.

  ---
The label content: getFullLabel / getDateLabel

// openlayerStyles.ts:2297
export function getFullLabel(graphicName: TacticalGraphicName, customName: string): string {
const prefix = getLabel(graphicName);         // e.g. "PL", "FSCL", "CFL"
return formatFullLabel(prefix, customName);   // → "PL MyName" or just "MyName" if no prefix
}

export function formatFullLabel(prefix: string, name: string): string {
return prefix ? `${prefix} ${name}`.trim() : name;
}

- getLabel(name) (in type.ts) returns the fixed MIL-STD abbreviation for the graphic type. For graphics that don't need a prefix (most movement graphics, forms of maneuver), it returns ''.
- The label field in GraphicLabels is the user-editable name/identifier shown alongside the prefix.
- So "PL ALPHA" = prefix "PL" + user label "ALPHA".

  ---
Where to control "show/hide the name" and other Feature Properties fields

Each graphic's field visibility is declared in src/components/openlayers/graphicFieldRegistry.ts.

Call getGraphicFields(name: TacticalGraphicName) to get a GraphicFieldSet (10 booleans). The
Feature Properties dialog reads feature.get('graphicName') and calls getGraphicFields() at render time.

To suppress the identifier1 field for a specific graphic (preventing the user from entering a name):
  set identifier1: false in its entry in GRAPHIC_FIELDS.

To suppress the abbreviation prefix in the rendered label:
  change what getLabel() returns for that name (return ''), or bypass getFullLabel() and pass labels.label directly.

GRAPHIC_FIELDS is typed Record<TacticalGraphicName, GraphicFieldSet> — TypeScript enforces that every
graphic name has an entry. To add or change a graphic's fields, edit one line in GRAPHIC_FIELDS.

Do NOT use feature.set('hasEchelon'), feature.set('hasCountryCode'), or graphicType feature flags —
that pattern was fully removed (2026-04-09) and replaced by the registry.
