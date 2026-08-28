import {getLabel} from './type';
import {TacticalGraphicName} from './type';

/**
 * On-symbol abbreviations, pinned against the source documents.
 *
 * These are the one class of defect no other test in the repository can catch:
 * nothing but doctrine says which letters belong on a symbol, so a wrong
 * abbreviation renders cleanly, round-trips through save and restore, and passes
 * every geometry assertion. `HighDensityAirspaceControlZone` shipped as `HDACZ`
 * until a plate-by-plate comparison against APP-06 Edition E caught it -- FM
 * 1-02.2 prints `HIDACZ` in that symbol's own example block and contains no
 * occurrence of `HDACZ` anywhere.
 *
 * Every entry below was read off a source document, not inferred. Add to it the
 * same way; a guessed abbreviation pinned here is worse than no test.
 */
const DOCTRINAL_LABELS: [TacticalGraphicName, string][] = [
    // FM 1-02.2, and spelled out in full as "HIGH-DENSITY AIRSPACE CONTROL ZONE"
    // by APP-06 Ed E table 8-11 (control measure 170900).
    [TacticalGraphicName.HighDensityAirspaceControlZone, 'HIDACZ'],

    // Read off the APP-06 Ed E Chapter 8 templates.
    [TacticalGraphicName.RestrictedOperationsZone, 'ROZ'],
    [TacticalGraphicName.MissileEngagementZone, 'MEZ'],
    [TacticalGraphicName.JointEngagementZone, 'JEZ'],
    [TacticalGraphicName.WeaponEngagementZone, 'WEZ'],
    [TacticalGraphicName.PhaseLine, 'PL'],
    [TacticalGraphicName.LimitOfAdvance, 'LOA'],
    [TacticalGraphicName.LineOfDeparture, 'LD'],
    [TacticalGraphicName.ProbableLineOfDeployment, 'PLD'],
    [TacticalGraphicName.BridgeheadLine, 'BL'],
    [TacticalGraphicName.ReleaseLine, 'RL'],
    [TacticalGraphicName.CoordinatedFireLine, 'CFL'],
    [TacticalGraphicName.FireSupportCoordinationLine, 'FSCL'],
    [TacticalGraphicName.RestrictiveFireLine, 'RFL'],
    [TacticalGraphicName.IntelligenceCoordinationLine, 'ICL'],
    [TacticalGraphicName.EngineerWorkLine, 'EWL'],
    [TacticalGraphicName.MainSupplyRoute, 'MSR'],
    [TacticalGraphicName.AlternateSupplyRoute, 'ASR'],
    [TacticalGraphicName.NamedAreaOfInterest, 'NAI'],
    [TacticalGraphicName.TargetAreaOfInterest, 'TAI'],
    [TacticalGraphicName.AreaOfOperations, 'AO'],
];

describe('doctrinal on-symbol abbreviations', () => {
    it.each(DOCTRINAL_LABELS)('labels %s as "%s"', (name, expected) => {
        expect(getLabel(name)).toBe(expected);
    });

    it('never regresses HighDensityAirspaceControlZone to HDACZ', () => {
        // Called out separately because it is the one that actually shipped wrong.
        expect(getLabel(TacticalGraphicName.HighDensityAirspaceControlZone)).not.toBe('HDACZ');
    });
});
