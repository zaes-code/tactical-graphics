/**
 * # Fixed text the plates print, letter for letter
 *
 * Each row was wrong until the 2026-10-31 QA pass, checked against MIL-STD-2525E Change 1
 * Appendix L, which decides where FM 1-02.2 and APP-06 disagree.
 */

import {TacticalGraphicName as N, getLabel} from './type';

it.each([
    // 141100: LD/LC at both ends. It read LD/DC.
    [N.LineOfDepartureOrLineOfContact, 'LD/LC'],
    // 242800: KILL ZONE, not the enum's capitals.
    [N.KillZone, 'KILL ZONE'],
    // 310400: REFUGEE / HOLDING AREA, as 310200 prints EPW / HOLDING AREA.
    [N.RefugeeHoldingArea, 'REFUGEE HOLDING AREA'],
    // 2411xx: ATIZ. FM says ATI ZONE and APP-06 ATI.
    [N.ArtilleryTargetIntelligenceZoneIrregular, 'ATIZ'],
    [N.ArtilleryTargetIntelligenceZoneRectangular, 'ATIZ'],
    [N.ArtilleryTargetIntelligenceZoneCircular, 'ATIZ'],
] as const)('%s prints %s', (name, literal) => {
    expect(getLabel(name)).toBe(literal);
});
