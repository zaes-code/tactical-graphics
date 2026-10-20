import {TacticalGraphicName} from './type';

/**
 * The published symbology specifications this library implements.
 *
 * A graphic belongs to one, the other, or both. The two catalogs of control
 * measures are very close to identical -- what differs is mostly naming, so the
 * common case is {@link TacticalGraphicSpecification.APP6} and
 * {@link TacticalGraphicSpecification.FM1_02_2} together.
 *
 * Enum keys are the document numbers, and the values are the short titles as the
 * issuing bodies write them. Note NATO renumbered APP-6 to APP-06 at Edition E;
 * the key keeps the form people still search for.
 */
export enum TacticalGraphicSpecification {
    /**
     * MIL-STD-2525E Change 1 (2 March 2025), *Joint Military Symbology*. Membership is read
     * from its Appendix A control-measure table by entity code, with the names compared.
     *
     * First because it is the governing standard: FM 1-02.2 "compiles ... MIL-STD-2525E approved
     * military symbols" for land operations, and APP-06 is NATO's counterpart, harmonized with it.
     * @see NOT_IN_MIL_STD_2525
     */
    MIL_STD_2525 = 'MIL-STD-2525',
    /** US Army FM 1-02.2, *Military Symbols*. The catalog this library was built from. */
    FM1_02_2 = 'FM 1-02.2',
    /** NATO APP-06, *NATO Joint Military Symbology*, Edition E Version 2 (October 2025). */
    APP6 = 'APP-06',
}

const BOTH = [TacticalGraphicSpecification.FM1_02_2, TacticalGraphicSpecification.APP6] as const;
/**
 * NATO defines these and FM 1-02.2 does not — the mirror image of `FM_ONLY`, and the
 * reason this axis is worth having at all. Searched for by name in the manual's text
 * before being added; none of them appears.
 *
 * **Searching by name is not sufficient, and eight entries were wrong because of it.**
 * FM 1-02.2 tables name a symbol by its position under a heading, not by the phrase this
 * library uses. Table 5-28's four contaminated areas are rows reading `biological`,
 * `chemical`, `nuclear` and `radiological` beneath a heading `Contaminated area` — so no
 * search for "biological contaminated area" can find them, and all four sat here until
 * 2026-09-03. Table 5-20 does the same to the minefield family (`dynamic depiction
 * minefield`, `mined area, fenced`) and table 5-15 to `demonstration`.
 *
 * So: **read the manual's table, not a grep of its text**, before putting a graphic here.
 * `specifications.test.ts` pins the eight that were corrected, by table.
 */
const APP6_ONLY = [TacticalGraphicSpecification.APP6] as const;
const FM_ONLY = [TacticalGraphicSpecification.FM1_02_2] as const;
/** In MIL-STD-2525 and neither of the other two: antitank wall and three fields-of-fire variants. */
const MIL_STD_2525_ONLY = [TacticalGraphicSpecification.MIL_STD_2525] as const;

/**
 * Which of FM 1-02.2 and APP-06 define each graphic, as tagged by hand. MIL-STD-2525 is
 * added on top of this by {@link GRAPHIC_SPECIFICATIONS}; only a graphic in neither of
 * these two names it here.
 *
 * Exhaustive by construction, like `GRAPHIC_CATEGORIES` -- adding a
 * `TacticalGraphicName` member will not compile until it is classified here.
 *
 * The trailing comment on each APP-06 entry is its entity code from Annex A,
 * Table A-32, so a claim can be checked against the standard rather than taken on
 * trust. Where APP-06 has no code and MIL-STD-2525 does, the comment says so.
 *
 * **323 graphics: 225 in both catalogs, 8 FM 1-02.2 only, 85 APP-06 only, 5 MIL-STD-2525 only**
 * (2026-10-20). The axis runs both ways, which it did not when it was first added -- every
 * graphic was then in FM 1-02.2, so filtering by that specification hid nothing. Count it,
 * don't trust it. See `ai/app-6.md` for the source document and how the mapping was derived.
 */
const FM_AND_APP6: Record<TacticalGraphicName, readonly TacticalGraphicSpecification[]> = {
    [TacticalGraphicName.BaseDefenseZone]:                              BOTH,      // APP-06 170800 Base Defence Zone
    [TacticalGraphicName.MainAxisOfAdvance]:                            BOTH,      // APP-06 151403 Main Attack
    [TacticalGraphicName.MainAxisOfAdvanceFeint]:                       BOTH,      // APP-06 151406 Feint
    [TacticalGraphicName.SupportingAxisOfAdvance]:                      BOTH,      // APP-06 151404 Supporting Attack
    [TacticalGraphicName.AviationAxisOfAdvance]:                        BOTH,      // APP-06 151401 Airborne/Aviation
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]:                BOTH,      // APP-06 151402 Attack Helicopter
    [TacticalGraphicName.Counterattack]:                                BOTH,      // APP-06 340600 Counter-Attack
    [TacticalGraphicName.PhaseLine]:                                    BOTH,      // APP-06 140300 Phase Line
    [TacticalGraphicName.ForwardEdgeOfBattleArea]:                      BOTH,      // APP-06 140400 Forward Edge of the Battle Area
    [TacticalGraphicName.ReleaseLine]:                                  BOTH,      // APP-06 141600 Release Line
    [TacticalGraphicName.BridgeheadLine]:                               BOTH,      // APP-06 141400 Bridgehead Line (BL)
    [TacticalGraphicName.BattlefieldHandoverLine]:                      BOTH,      // APP-06 141900 Battle Handover Line (BHL)
    [TacticalGraphicName.DelayLine]:                                    FM_ONLY,
    [TacticalGraphicName.FinalCoordinationLine]:                        BOTH,      // APP-06 140700 Final Coordination Line
    [TacticalGraphicName.LimitOfAdvance]:                               BOTH,      // APP-06 140900 Limit of Advance
    [TacticalGraphicName.LineOfDeparture]:                              BOTH,      // APP-06 141000 Line of Departure
    [TacticalGraphicName.LineOfDepartureOrLineOfContact]:               BOTH,      // APP-06 141100 Line of Departure/Line of Contact
    [TacticalGraphicName.ProbableLineOfDeployment]:                     BOTH,      // APP-06 141200 Probable Line of Deployment
    [TacticalGraphicName.IdentificationFriendOrFoeOff]:                 BOTH,      // APP-06 190100 Identification Friend or Foe (IFF) Off Line
    [TacticalGraphicName.IdentificationFriendOrFoeOn]:                  BOTH,      // APP-06 190200 Identification Friend or Foe (IFF) On Line
    [TacticalGraphicName.Route]:                                        BOTH,      // APP-06 330500 Route
    [TacticalGraphicName.MainSupplyRoute]:                              BOTH,      // APP-06 330300 Main Supply Route (MSR)
    [TacticalGraphicName.AlternateSupplyRoute]:                         BOTH,      // APP-06 330400 Alternate Supply Route (ASR)
    [TacticalGraphicName.CommonSensorBoundary]:                         FM_ONLY,
    [TacticalGraphicName.FireSupportCoordinationLine]:                  BOTH,      // APP-06 260100 Fire Support Coordination Line (FSCL)
    [TacticalGraphicName.RestrictiveFireLine]:                          BOTH,      // APP-06 260500 Restrictive Fire Line
    [TacticalGraphicName.IntelligenceCoordinationLine]:                 BOTH,      // APP-06 300100 Intelligence Coordination Line (ICL)
    [TacticalGraphicName.Boundary]:                                     BOTH,      // APP-06 110100 Boundary
    [TacticalGraphicName.CoordinatedFireLine]:                          BOTH,      // APP-06 260200 Coordinated Fire Line (CFL)
    [TacticalGraphicName.EngineerWorkLine]:                             BOTH,      // APP-06 110300 Engineer Work Line
    [TacticalGraphicName.AirfieldZone]: APP6_ONLY, // APP-06 120400 Airfield Zone
    [TacticalGraphicName.Airfield]:                                     BOTH,      // APP-06 131900 Airfield
    [TacticalGraphicName.AreaOfOperations]:                             BOTH,      // APP-06 120100 Area of Operations
    [TacticalGraphicName.BombArea]: APP6_ONLY, // APP-06 240808 Bomb Area
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]: APP6_ONLY, // APP-06 242000 Terminally Guided Munition Footprint (TGMF)
    [TacticalGraphicName.Bridgehead]: APP6_ONLY, // APP-06 120800 Bridgehead
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]: APP6_ONLY, // APP-06 310200 Enemy Prisoner of War Holding Area
    [TacticalGraphicName.HumanTerrain]: APP6_ONLY, // APP-06 370100 Human Terrain
    [TacticalGraphicName.PenetrationBox]: APP6_ONLY, // APP-06 151900 Penetration Box
    [TacticalGraphicName.Area]: APP6_ONLY, // APP-06 150100 Area
    [TacticalGraphicName.SubmarineActionArea]: APP6_ONLY, // APP-06 150502 Submarine Action Area (SAA)
    [TacticalGraphicName.SubmarineGeneratedActionArea]: APP6_ONLY, // APP-06 150503 Submarine-Generated Action Area (SGAA)
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial]: APP6_ONLY, // APP-06 271701 Toxic Industrial Material
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial]: APP6_ONLY, // APP-06 271801 Toxic Industrial Material
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial]: APP6_ONLY, // APP-06 272001 Toxic Industrial Material
    [TacticalGraphicName.JointTacticalActionArea]: APP6_ONLY, // APP-06 150501 Joint Tactical Action Area (JTAA)
    [TacticalGraphicName.AreaGeneric]: APP6_ONLY, // APP-06 120700 Area, Generic
    [TacticalGraphicName.ZoneOfFire]: APP6_ONLY, // APP-06 242600 Zone of Fire
    [TacticalGraphicName.RestrictedTerrain]: APP6_ONLY, // APP-06 152400 Restricted Terrain
    [TacticalGraphicName.SeverelyRestrictedTerrain]: APP6_ONLY, // APP-06 152500 Severely Restricted Terrain
    [TacticalGraphicName.BiologicalContaminatedArea]: BOTH, // APP-06 271700 Biological Contaminated Area -- FM table 5-28 "biological"
    [TacticalGraphicName.ChemicalContaminatedArea]: BOTH, // APP-06 271800 Chemical Contaminated Area -- FM table 5-28 "chemical"
    [TacticalGraphicName.NuclearContaminatedArea]: BOTH, // APP-06 271900 Nuclear Contaminated Area -- FM table 5-28 "nuclear"
    [TacticalGraphicName.RadiologicalContaminatedArea]: BOTH, // APP-06 272000 Radiological Contaminated Area -- FM table 5-28 "radiological"
    [TacticalGraphicName.ArtilleryManeuverArea]: APP6_ONLY, // APP-06 242400 Artillery Manoeuvre Area (AMA)
    [TacticalGraphicName.ArtilleryReservedArea]: APP6_ONLY, // APP-06 242500 Artillery Reserved Area (ARA)
    [TacticalGraphicName.AssemblyArea]:                                 BOTH,      // APP-06 150200 Assembly Area (AA)
    [TacticalGraphicName.BaseCamp]:                                     BOTH,      // APP-06 120500 Base Camp
    [TacticalGraphicName.EngagementArea]:                               BOTH,      // APP-06 151300 Engagement Area (EA)
    [TacticalGraphicName.GuerrillaBase]:                                BOTH,      // APP-06 120600 Guerrilla Base
    [TacticalGraphicName.NamedAreaOfInterest]:                          BOTH,      // APP-06 120200 Named Area of Interest
    [TacticalGraphicName.ObjectiveArea]:                                BOTH,      // APP-06 151700 Objective Area
    [TacticalGraphicName.TargetAreaOfInterest]:                         BOTH,      // APP-06 120300 Target Area of Interest
    [TacticalGraphicName.AssaultPosition]:                              BOTH,      // APP-06 151500 Assault Position
    [TacticalGraphicName.AttackPosition]:                               BOTH,      // APP-06 151600 Attack Position
    [TacticalGraphicName.DetaineeHoldingArea]:                          BOTH,      // APP-06 310100 Detainee Holding Area
    [TacticalGraphicName.RefugeeHoldingArea]:                           BOTH,      // APP-06 310400 Refugee Holding Area
    [TacticalGraphicName.ForwardArmingAndRefuelingPoint]:               BOTH,      // APP-06 310300 Forward Arming and Refuelling Point (FARP)
    [TacticalGraphicName.BrigadeSupportArea]:                           BOTH,      // APP-06 310600 Brigade Support Area
    [TacticalGraphicName.DivisionSupportArea]:                          BOTH,      // APP-06 310700 Division Support Area
    [TacticalGraphicName.CorpsSupportArea]:                             BOTH,      // APP-06 310800 Corps Support Area
    [TacticalGraphicName.DropZone]:                                     BOTH,      // APP-06 150600 Drop Zone (DZ)
    [TacticalGraphicName.LandingZone]:                                  BOTH,      // APP-06 150800 Landing Zone (LZ)
    // Not in APP-06 Edition E; MIL-STD-2525E codes it 242800, so it carries that code.
    [TacticalGraphicName.KillZone]:                                     FM_ONLY,   // MIL-STD-2525 242800 Kill Zone
    [TacticalGraphicName.PickupZone]:                                   BOTH,      // APP-06 150900 Pick-Up Zone (PZ)
    [TacticalGraphicName.BattlePosition]:                               BOTH,      // APP-06 151200 Battle Position
    [TacticalGraphicName.StrongPoint]:                                  BOTH,      // APP-06 151203 Strong Point
    [TacticalGraphicName.AirCorridor]:                                  BOTH,      // APP-06 170100 Air Corridor
    [TacticalGraphicName.LowLevelTransitRoute]:                         BOTH,      // APP-06 170200 Low Level Transit Route
    [TacticalGraphicName.MinimumRiskRoute]:                             BOTH,      // APP-06 170300 Temporary Minimum- Risk Route
    [TacticalGraphicName.SafeLane]:                                     BOTH,      // APP-06 170400 Safe Lane
    [TacticalGraphicName.SpecialCorridor]:                              BOTH,      // APP-06 170700 Special Corridor (SC)
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]:           BOTH,      // APP-06 170500 Standard Use Army Aircraft Flight Route
    [TacticalGraphicName.TransitCorridor]:                              BOTH,      // APP-06 170600 Transit Corridor
    [TacticalGraphicName.UnmannedAircraftCorridor]:                     FM_ONLY,
    [TacticalGraphicName.Secure]:                                       BOTH,      // APP-06 342100 Secure
    [TacticalGraphicName.Isolate]:                                      BOTH,      // APP-06 341500 Isolate
    [TacticalGraphicName.Retain]:                                       BOTH,      // APP-06 151205 Retain
    [TacticalGraphicName.Control]:                                      BOTH,      // APP-06 343200 Control
    [TacticalGraphicName.CordonAndKnock]: APP6_ONLY, // APP-06 342600 Cordon and Knock
    [TacticalGraphicName.MinefieldDynamicDepiction]: BOTH, // APP-06 270707 Minefield, Dynamic Depiction -- FM table 5-20 "dynamic depiction minefield"
    [TacticalGraphicName.MinedArea]: BOTH, // APP-06 270800 Mined Area -- FM table 5-20 "mined area"
    [TacticalGraphicName.MinedAreaFenced]: BOTH, // APP-06 270801 Mined Area, Fenced -- FM table 5-20 "mined area, fenced"
    [TacticalGraphicName.PsyOpsZoneIrregular]: APP6_ONLY, // APP-06 242701 PsyOps Zone, Irregular
    [TacticalGraphicName.PsyOpsZoneRectangular]: APP6_ONLY, // APP-06 242702 PsyOps Zone, Rectangular
    [TacticalGraphicName.PsyOpsZoneCircular]: APP6_ONLY, // APP-06 242703 PsyOps Zone, Circular
    [TacticalGraphicName.AvenueOfApproach]: APP6_ONLY, // APP-06 152300 Avenue of Approach
    [TacticalGraphicName.CounterattackByFire]: APP6_ONLY, // APP-06 340700 Counter-Attack by Fire
    [TacticalGraphicName.Deny]: APP6_ONLY, // APP-06 343400 Deny
    [TacticalGraphicName.Locate]: APP6_ONLY, // APP-06 343900 Locate
    [TacticalGraphicName.CordonAndSearch]:                              BOTH,      // APP-06 342700 Cordon and Search
    [TacticalGraphicName.Contain]:                                      BOTH,      // APP-06 151204 Contain
    [TacticalGraphicName.Occupy]:                                       BOTH,      // APP-06 341700 Occupy
    [TacticalGraphicName.AreaDefense]:                                  BOTH,      // APP-06 152600 Area Defence
    [TacticalGraphicName.Cover]:                                        BOTH,      // APP-06 342201 Cover
    [TacticalGraphicName.Guard]:                                        BOTH,      // APP-06 342202 Guard
    [TacticalGraphicName.Screen]:                                       BOTH,      // APP-06 342203 Screen
    [TacticalGraphicName.TacticalBlock]:                                BOTH,      // APP-06 340100 Block
    [TacticalGraphicName.Breach]:                                       BOTH,      // APP-06 340200 Breach
    [TacticalGraphicName.Bypass]:                                       BOTH,      // APP-06 340300 Bypass
    [TacticalGraphicName.Canalize]:                                     BOTH,      // APP-06 340400 Canalize
    [TacticalGraphicName.Clear]:                                        BOTH,      // APP-06 340500 Clear
    [TacticalGraphicName.TacticalDisrupt]:                              BOTH,      // APP-06 341000 Disrupt
    [TacticalGraphicName.Penetration]:                                  BOTH,      // APP-06 341800 Penetrate
    [TacticalGraphicName.Exploitation]:                                 BOTH,      // APP-06 343100 Exploit/Exploitation
    [TacticalGraphicName.Disengage]:                                    BOTH,      // APP-06 344400 Disengage
    [TacticalGraphicName.Delay]:                                        BOTH,      // APP-06 340800 Delay
    [TacticalGraphicName.Retirement]:                                   BOTH,      // APP-06 342000 Retire/Retirement
    [TacticalGraphicName.Withdraw]:                                     BOTH,      // APP-06 342400 Withdraw
    [TacticalGraphicName.WithdrawUnderPressure]:                        BOTH,      // APP-06 342500 Withdraw Under Pressure
    [TacticalGraphicName.ForwardPassageOfLines]:                        BOTH,      // APP-06 344100 Forward Passage of Lines
    [TacticalGraphicName.RearwardPassageOfLines]:                       BOTH,      // APP-06 344200 Rearward Passage of Lines
    [TacticalGraphicName.FreeFireAreaIrregular]:                        BOTH,      // APP-06 240201 Irregular
    [TacticalGraphicName.FreeFireAreaRectangular]:                      BOTH,      // APP-06 240202 Rectangular
    [TacticalGraphicName.FreeFireAreaCircular]:                         BOTH,      // APP-06 240203 Circular
    [TacticalGraphicName.NoFireAreaIrregular]:                          BOTH,      // APP-06 240301 Irregular
    [TacticalGraphicName.NoFireAreaRectangular]:                        BOTH,      // APP-06 240302 Rectangular
    [TacticalGraphicName.NoFireAreaCircular]:                           BOTH,      // APP-06 240303 Circular
    [TacticalGraphicName.RestrictiveFireAreaIrregular]:                 BOTH,      // APP-06 240401 Irregular
    [TacticalGraphicName.RestrictiveFireAreaRectangular]:               BOTH,      // APP-06 240402 Rectangular
    [TacticalGraphicName.RestrictiveFireAreaCircular]:                  BOTH,      // APP-06 240403 Circular
    [TacticalGraphicName.PositionAreaArtilleryIrregular]:               BOTH,      // APP-06 240503 Irregular
    [TacticalGraphicName.PositionAreaArtilleryRectangular]:             BOTH,      // APP-06 240501 Rectangular
    [TacticalGraphicName.PositionAreaArtilleryCircular]:                BOTH,      // APP-06 240502 Circular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]:     BOTH,      // APP-06 241101 Irregular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]:   BOTH,      // APP-06 241102 Rectangular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]:      BOTH,      // APP-06 241103 Circular
    [TacticalGraphicName.CallForFireZoneIrregular]:                     BOTH,      // APP-06 241201 Irregular
    [TacticalGraphicName.CallForFireZoneRectangular]:                   BOTH,      // APP-06 241202 Rectangular
    [TacticalGraphicName.CallForFireZoneCircular]:                      BOTH,      // APP-06 241203 Circular
    [TacticalGraphicName.TargetBuildUpAreaIrregular]:   APP6_ONLY, // APP-06 241701 Irregular
    [TacticalGraphicName.TargetBuildUpAreaRectangular]: APP6_ONLY, // APP-06 241702 Rectangular
    [TacticalGraphicName.TargetBuildUpAreaCircular]:    APP6_ONLY, // APP-06 241703 Circular
    [TacticalGraphicName.TargetValueAreaIrregular]:   APP6_ONLY, // APP-06 241801 Irregular
    [TacticalGraphicName.TargetValueAreaRectangular]: APP6_ONLY, // APP-06 241802 Rectangular
    [TacticalGraphicName.TargetValueAreaCircular]:    APP6_ONLY, // APP-06 241803 Circular
    [TacticalGraphicName.ZoneOfResponsibilityIrregular]:   APP6_ONLY, // APP-06 241901 Irregular
    [TacticalGraphicName.ZoneOfResponsibilityRectangular]: APP6_ONLY, // APP-06 241902 Rectangular
    [TacticalGraphicName.ZoneOfResponsibilityCircular]:    APP6_ONLY, // APP-06 241903 Circular
    [TacticalGraphicName.CensorZoneIrregular]:                          BOTH,      // APP-06 241301 Irregular
    [TacticalGraphicName.CensorZoneRectangular]:                        BOTH,      // APP-06 241302 Rectangular
    [TacticalGraphicName.CensorZoneCircular]:                           BOTH,      // APP-06 241303 Circular
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]:                BOTH,      // APP-06 241401 Irregular
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]:              BOTH,      // APP-06 241402 Rectangular
    [TacticalGraphicName.CriticalFriendlyZoneCircular]:                 BOTH,      // APP-06 241403 Circular
    [TacticalGraphicName.DeadSpaceAreaIrregular]:                       BOTH,      // APP-06 241501 Irregular
    [TacticalGraphicName.DeadSpaceAreaRectangular]:                     BOTH,      // APP-06 241502 Rectangular
    [TacticalGraphicName.DeadSpaceAreaCircular]:                        BOTH,      // APP-06 241503 Circular
    [TacticalGraphicName.BlueKillBoxIrregular]:                         BOTH,      // APP-06 242301 Irregular, Blue
    [TacticalGraphicName.BlueKillBoxRectangular]:                       BOTH,      // APP-06 242302 Rectangular, Blue
    [TacticalGraphicName.BlueKillBoxCircular]:                          BOTH,      // APP-06 242303 Circular, Blue
    [TacticalGraphicName.PurpleKillBoxIrregular]:                       BOTH,      // APP-06 242304 Irregular, Purple
    [TacticalGraphicName.PurpleKillBoxRectangular]:                     BOTH,      // APP-06 242305 Rectangular, Purple
    [TacticalGraphicName.PurpleKillBoxCircular]:                        BOTH,      // APP-06 242306 Circular, Purple
    [TacticalGraphicName.FireSupportAreaIrregular]:                     BOTH,      // APP-06 241001 Irregular
    [TacticalGraphicName.FireSupportAreaRectangular]:                   BOTH,      // APP-06 241002 Rectangular
    [TacticalGraphicName.FireSupportAreaCircular]:                      BOTH,      // APP-06 241003 Circular
    [TacticalGraphicName.TargetAreaIrregular]:                          BOTH,      // APP-06 240801 Area Target
    [TacticalGraphicName.TargetAreaRectangular]:                        BOTH,      // APP-06 240802 Rectangular Target
    // AEGIS is naval fire support, and the FM has no counterpart. `aegis`, `NSFS` and
    // `naval surface fire` return zero hits; `naval gunfire` returns four, and none of them
    // is this symbol -- it is an FM *section heading*, and what sits under it is the fire
    // support area (irregular / rectangular / circular) plus the fire support station, all
    // of which this library already covers under their own codes. A heading is not a plate.
    [TacticalGraphicName.TargetAreaSingleTargetAegis]:                  APP6_ONLY, // APP-06 240804 Rectangular Target - Single Target (AEGIS only)
    [TacticalGraphicName.TargetAreaCircular]:                           BOTH,      // APP-06 240803 Circular Target
    [TacticalGraphicName.HighDensityAirspaceControlZone]:               BOTH,      // APP-06 170900 High-Density Airspace Control Zone
    [TacticalGraphicName.RestrictedOperationsZone]:                     BOTH,      // APP-06 171000 Restricted Operations Zone (ROZ)
    [TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone]:    BOTH,      // APP-06 171100 Air-to-Air Restricted Operating Zone (AARROZ)
    [TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone]:     BOTH,      // APP-06 171200 Unmanned Aircraft Restricted Operating Zone (UA-ROZ)
    [TacticalGraphicName.WeaponEngagementZone]:                         BOTH,      // APP-06 171300 Weapon Engagement Zone (WEZ)
    [TacticalGraphicName.JointEngagementZone]:                          BOTH,      // APP-06 171500 Joint Engagement Zone (JEZ)
    [TacticalGraphicName.MissileEngagementZone]:                        BOTH,      // APP-06 171600 Missile Engagement Zone (MEZ)
    [TacticalGraphicName.LowAltitudeMissileEngagementZone]:             BOTH,      // APP-06 171700 Low (Altitude) Missile Engagement Zone (LOMEZ)
    [TacticalGraphicName.HighAltitudeMissileEngagementZone]:            BOTH,      // APP-06 171800 High (Altitude) Missile Engagement Zone (HIMEZ)
    [TacticalGraphicName.ShortRangeAirDefenseEngagementZone]:           BOTH,      // APP-06 171900 Short Range Air Defence Engagement Zone (SHORADEZ)
    [TacticalGraphicName.WeaponsFreeZone]:                              BOTH,      // APP-06 172000 Weapons Free Zone
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]:            BOTH,      // APP-06 240101 Irregular
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]:          BOTH,      // APP-06 240102 Rectangular
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]:             BOTH,      // APP-06 240103 Circular
    [TacticalGraphicName.Encirclement]:                                 BOTH,      // APP-06 151800 Encirclement
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]:              BOTH,      // APP-06 271000 Unexploded Explosive Ordnance (UXO) Area
    [TacticalGraphicName.FortifiedArea]:                                BOTH,      // APP-06 151000 Fortified Area
    [TacticalGraphicName.AirheadLine]:                                  BOTH,      // APP-06 141300 Airhead Line
    [TacticalGraphicName.MunitionFlightPath]:                           BOTH,      // APP-06 260600 Munition Flight Path
    [TacticalGraphicName.FieldsOfFire]:                                 BOTH,      // APP-06 140500 Field of Fire
    [TacticalGraphicName.ForwardLineOfOwnTroops]:                       BOTH,      // APP-06 140100 Forward Line of Troops
    [TacticalGraphicName.Bridge]:                                       BOTH,      // APP-06 271100 Bridge
    [TacticalGraphicName.AssaultCrossing]:                              BOTH,      // APP-06 271300 Assault Crossing
    [TacticalGraphicName.Gap]:                                          FM_ONLY,   // 290600 'safe lane or gap' is a different symbol -- see the note in specifications.test.ts
    [TacticalGraphicName.FordEasy]:                                     BOTH,      // APP-06 271500 Ford Easy
    [TacticalGraphicName.FordDifficult]:                                BOTH,      // APP-06 271600 Ford Difficult
    [TacticalGraphicName.FerryCrossing]:                                BOTH,      // APP-06 290700 Ferry
    [TacticalGraphicName.PassageLane]:                                  FM_ONLY,
    [TacticalGraphicName.SafeLaneOrGap]:                                APP6_ONLY, // APP-06 290600 Safe Lane or Gap
    [TacticalGraphicName.ObstacleBelt]:                                 BOTH,      // APP-06 270100 Obstacle Belt
    [TacticalGraphicName.ObstacleGroup]:                                FM_ONLY,
    [TacticalGraphicName.ObstacleZone]:                                 BOTH,      // APP-06 270200 Obstacle Zone
    [TacticalGraphicName.ObstacleFreeArea]:                             BOTH,      // APP-06 270300 Obstacle Free Zone
    [TacticalGraphicName.ObstacleRestrictedArea]:                       BOTH,      // APP-06 270400 Obstacle Restricted Zone
    [TacticalGraphicName.Abatis]:                                       BOTH,      // APP-06 280100 Abatis
    [TacticalGraphicName.OverheadWire]:                                 APP6_ONLY, // APP-06 282003 Overhead Wire
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]:            BOTH,      // APP-06 271201 Planned
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]:              BOTH,      // APP-06 271202 Explosives, State of Readiness 1 (Safe)
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]:  BOTH,      // APP-06 271203 Explosives, State of Readiness 2 (Armed but Passable)
    // Excluded — see ai/excluded-graphics.md
    [TacticalGraphicName.RoadblockCompleteExecuted]:                    BOTH,      // APP-06 271204 Roadblock Complete (Executed)
    [TacticalGraphicName.AntiTankDitchUnderConstruction]:               BOTH,      // APP-06 290201 Antitank Ditch Under Construction
    [TacticalGraphicName.AntiTankDitchCompleted]:                       BOTH,      // APP-06 290202 Antitank Ditch Completed
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]:             BOTH,      // APP-06 290203 Antitank Ditch Reinforced, with Antitank Mines
    [TacticalGraphicName.WireUnspecified]:                              BOTH,      // APP-06 290301 Unspecified
    [TacticalGraphicName.WireSingleFence]:                              BOTH,      // APP-06 290302 Single Fence
    [TacticalGraphicName.WireDoubleFence]:                              BOTH,      // APP-06 290303 Double Fence
    [TacticalGraphicName.WireDoubleApronFence]:                         BOTH,      // APP-06 290304 Double Apron Fence
    [TacticalGraphicName.WireLowWireFence]:                             BOTH,      // APP-06 290305 Low Wire Fence
    [TacticalGraphicName.WireHighWireFence]:                            BOTH,      // APP-06 290306 High Wire Fence
    [TacticalGraphicName.WireSingleConcertina]:                         BOTH,      // APP-06 290307 Single Concertina
    [TacticalGraphicName.WireDoubleStrandConcertina]:                   BOTH,      // APP-06 290308 Double Strand Concertina
    [TacticalGraphicName.WireTripleStrandConcertina]:                   BOTH,      // APP-06 290309 Triple Strand Concertina
    [TacticalGraphicName.ObstacleLine]:                                 BOTH,      // APP-06 290100 Obstacle Line
    [TacticalGraphicName.BattlePositionPreparedButNotOccupied]:            BOTH,      // APP-06 151202 Battle Position Prepared (P) but Not Occupied
    [TacticalGraphicName.Capture]:                                      APP6_ONLY, // APP-06 343000 Capture
    [TacticalGraphicName.Seize]:                                        BOTH,      // APP-06 342300 Seize
    [TacticalGraphicName.FollowAndAssume]:                              BOTH,      // APP-06 341200 Follow and Assume
    [TacticalGraphicName.FollowAndSupport]:                             BOTH,      // APP-06 341300 Follow and Support
    [TacticalGraphicName.Escort]:                                       APP6_ONLY, // APP-06 343600 Escort
    [TacticalGraphicName.Demonstration]:                                BOTH,      // APP-06 343300 Demonstration/Demonstrate -- FM table 5-15, labelled DEM
    [TacticalGraphicName.Evacuate]:                                     APP6_ONLY, // APP-06 344500 Evacuate
    [TacticalGraphicName.Recover]:                                      APP6_ONLY, // APP-06 344600 Recover
    [TacticalGraphicName.DecisionLine]:                                 APP6_ONLY, // APP-06 110500 Decision Line
    [TacticalGraphicName.MobilityCorridor]:                             APP6_ONLY, // APP-06 142100 Mobility Corridor
    // FM 1-02.2 table 5-28 draws both under "CBRN Contour Lines".
    [TacticalGraphicName.MinimumSafeDistanceZone]:                      BOTH,      // APP-06 272100 Minimum Safe Distance Zone
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]:            BOTH,      // APP-06 272101 Multiple Strike (STRIKWARN)
    [TacticalGraphicName.RadiationDoseRateContourLine]:                 BOTH,      // APP-06 272200 Radiation Dose Rate Contour Lines
    [TacticalGraphicName.ObstacleBypassEasy]:                           APP6_ONLY, // APP-06 270601 Obstacle Bypass Easy
    [TacticalGraphicName.ObstacleBypassDifficult]:                      APP6_ONLY, // APP-06 270602 Obstacle Bypass Difficult
    [TacticalGraphicName.ObstacleBypassImpossible]:                     APP6_ONLY, // APP-06 270603 Obstacle Bypass Impossible
    [TacticalGraphicName.Mineline]:                                     APP6_ONLY, // APP-06 290101 Mineline
    [TacticalGraphicName.MineCluster]:                                  APP6_ONLY, // APP-06 290400 Mine Cluster
    [TacticalGraphicName.TripWire]:                                     BOTH,      // APP-06 290500 Trip Wire -- FM table 5-20 "tripwire"
    [TacticalGraphicName.RaftSite]:                                     APP6_ONLY, // APP-06 290800 Raft Site
    [TacticalGraphicName.FortifiedPosition]:                            BOTH,      // APP-06 291000 Fortified Position
    [TacticalGraphicName.TacticalFix]:                                  BOTH,      // APP-06 341100 Fix
    [TacticalGraphicName.TacticalTurn]:                                 BOTH,      // APP-06 344700 Turn
    [TacticalGraphicName.Block]:                                        BOTH,      // APP-06 270501 Block
    [TacticalGraphicName.Disrupt]:                                      BOTH,      // APP-06 270502 Disrupt
    [TacticalGraphicName.Fix]:                                          BOTH,      // APP-06 270503 Fix
    [TacticalGraphicName.Turn]:                                         BOTH,      // APP-06 270504 Turn
    [TacticalGraphicName.DirectionOfMainAttack]:                        BOTH,      // APP-06 140602 Main Attack
    [TacticalGraphicName.DirectionOfSupportingAttack]:                  BOTH,      // APP-06 140603 Supporting Attack
    [TacticalGraphicName.DirectionOfMainAttackFeint]:                   BOTH,      // APP-06 140605 Feint
    [TacticalGraphicName.AviationDirectionOfAttack]:                    BOTH,      // APP-06 140601 Aviation
    [TacticalGraphicName.Infiltration]:                                 BOTH,      // APP-06 343800 Infiltrate
    [TacticalGraphicName.InfiltrationLane]:                             BOTH,      // APP-06 140800 Infiltration Lane
    // FM only. APP-06's advance to contact names the same operation but is a
    // different symbol -- see AdvanceToContact below, and ai/app-6.md.
    [TacticalGraphicName.MovementToContact]:                            FM_ONLY,
    [TacticalGraphicName.AdvanceToContact]:                             APP6_ONLY, // APP-06 342900 Advance to Contact
    [TacticalGraphicName.FrontalAttack]:                                BOTH,      // APP-06 152700 Frontal Attack
    [TacticalGraphicName.TurningMovement]:                              BOTH,      // APP-06 152900 Turning Movement
    [TacticalGraphicName.Pursuit]:                                      BOTH,      // APP-06 344000 Pursue
    [TacticalGraphicName.Envelopment]:                                  BOTH,      // APP-06 343500 Envelop
    [TacticalGraphicName.MobileDefense]:                                BOTH,      // APP-06 152800 Mobile Defence
    [TacticalGraphicName.Ambush]:                                       BOTH,      // APP-06 141700 Ambush
    [TacticalGraphicName.ReliefInPlace]:                                BOTH,      // APP-06 341900 Relieve in Place / Relief in Place (RIP)
    [TacticalGraphicName.LimitedAccessArea]:                            BOTH,      // APP-06 151100 Limited Access Area
    [TacticalGraphicName.LinearTarget]:                                 BOTH,      // APP-06 240701 Linear Target
    [TacticalGraphicName.FinalProtectiveFire]:                          BOTH,      // APP-06 240703 Final Protective Fire (FPF)
    [TacticalGraphicName.LinearSmokeTarget]:                            BOTH,      // APP-06 240702 Linear Smoke Target
    [TacticalGraphicName.SmokeObscurant]:                               BOTH,      // APP-06 240806 Smoke
    [TacticalGraphicName.GroupOrSeriesOfTargets]:                       BOTH,      // APP-06 240805 Series or Groups of Targets
    [TacticalGraphicName.WeaponSensorRangeFanCircular]:                 BOTH,      // APP-06 242100 Weapon/Sensor Range Fan, Circular
    [TacticalGraphicName.WeaponSensorRangeFanSector]:                   BOTH,      // APP-06 242200 Weapon/Sensor Range Fan, Sector
    // APP-06 and MIL-STD-2525E both describe Line of Contact with no code (drawn as the two
    // FLOTs together); MIL-STD-2525D coded it 140200, so that is the code it carries.
    [TacticalGraphicName.LineOfContact]:                                BOTH,      // MIL-STD-2525 140200 Line of Contact
    [TacticalGraphicName.AttackByFire]:                                 BOTH,      // APP-06 152000 Attack by Fire
    [TacticalGraphicName.Defeat]:                                       APP6_ONLY, // APP-06 344300 Defeat
    [TacticalGraphicName.Destroy]:                                      BOTH,      // APP-06 340900 Destroy
    [TacticalGraphicName.Exfiltrate]:                                   BOTH,      // APP-06 343700 Exfiltrate
    [TacticalGraphicName.Interdict]:                                    BOTH,      // APP-06 341400 Interdict
    [TacticalGraphicName.Neutralize]:                                   BOTH,      // APP-06 341600 Neutralize
    [TacticalGraphicName.SupportByFire]:                                BOTH,      // APP-06 152100 Support by Fire
    [TacticalGraphicName.Suppress]:                                     BOTH,      // APP-06 342800 Suppress
    [TacticalGraphicName.BearingLine]: APP6_ONLY, // APP-06 220100 Bearing Line
    [TacticalGraphicName.BearingLineElectronic]: APP6_ONLY, // APP-06 220101 Bearing Line, Electronic
    [TacticalGraphicName.BearingLineElectromagneticWarfare]: APP6_ONLY, // APP-06 220102 Bearing Line, Electromagnetic Warfare (EW)
    [TacticalGraphicName.BearingLineAcoustic]: APP6_ONLY, // APP-06 220103 Bearing Line, Acoustic
    [TacticalGraphicName.BearingLineAcousticAmbiguous]: APP6_ONLY, // APP-06 220104 Bearing Line, Acoustic (Ambiguous)
    [TacticalGraphicName.BearingLineTorpedo]: APP6_ONLY, // APP-06 220105 Bearing Line, Torpedo
    [TacticalGraphicName.BearingLineElectroOpticalIntercept]: APP6_ONLY, // APP-06 220106 Bearing Line, Electro-Optical Intercept
    [TacticalGraphicName.BearingLineJammer]: APP6_ONLY, // APP-06 220107 Bearing Line, Jammer
    [TacticalGraphicName.BearingLineRadioDirectionFinder]: APP6_ONLY, // APP-06 220108 Bearing Line, Radio Direction Finder (RDF)
    [TacticalGraphicName.NavigationalRhumbLine]: APP6_ONLY, // APP-06 220109 Navigational Rhumb Line
    /*
     * APP-06 §8.10 Table 8-12, the maritime control areas.
     *
     * **APP-06 only, and the FM search is recorded rather than asserted.** FM 1-02.2 is a
     * land manual with no maritime chapter: `launch area`, `defended area`, `no attack`,
     * `NOTACK`, `ship area` and `cued acquisition` return nothing at all. `radar search`
     * returns four hits and every one of them is the *prose* definition of an artillery
     * target intelligence zone or a call for fire zone -- "a weapons locating radar search
     * area in enemy territory" -- which are two graphics this library already carries under
     * their own codes. A definition is not a plate, and the words overlapping is the same
     * trap `mine cluster` set. @see specifications.test.ts
     */
    [TacticalGraphicName.LaunchAreaEllipse]: APP6_ONLY, // APP-06 200101 Launch Area, Ellipse/Circle
    [TacticalGraphicName.DefendedAreaEllipse]: APP6_ONLY, // APP-06 200201 Defended Area, Ellipse/Circle
    [TacticalGraphicName.DefendedAreaRectangle]: APP6_ONLY, // APP-06 200202 Defended Area, Rectangle
    [TacticalGraphicName.NoAttackZone]: APP6_ONLY, // APP-06 200300 No Attack (NOTACK) Zone
    [TacticalGraphicName.ShipAreaOfInterestEllipse]: APP6_ONLY, // APP-06 200401 Ship Area of Interest, Ellipse/Circle
    [TacticalGraphicName.ShipAreaOfInterestRectangle]: APP6_ONLY, // APP-06 200402 Ship Area of Interest, Rectangle
    [TacticalGraphicName.ActiveManeuverArea]: APP6_ONLY, // APP-06 200500 Active Manoeuvre Area
    [TacticalGraphicName.CuedAcquisitionDoctrine]: APP6_ONLY, // APP-06 200600 Cued Acquisition Doctrine
    [TacticalGraphicName.RadarSearchDoctrine]: APP6_ONLY, // APP-06 200700 Radar Search Doctrine
    [TacticalGraphicName.NavigationalLine]: APP6_ONLY, // APP-06 218400 Navigational
    /*
     * APP-06 152200. `search area` appears six times in FM 1-02.2 and not once as a symbol:
     * every hit is the glossary phrase "target acquisition search areas" or "weapons
     * locating radar search area", and `reconnaissance area` appears nowhere. Its Table
     * 8-10 neighbours -- 151900, 152400, 152500, 152300 -- are all APP-06 only too.
     */
    [TacticalGraphicName.SearchArea]: APP6_ONLY, // APP-06 152200 Search Area/Reconnaissance Area
    /*
     * The convoys are in **both**: FM 1-02.2 table 5-18 "Convoy symbols" lists `moving
     * convoy` and `halted convoy` on consecutive rows, with the manual's own note "the
     * arrow points in the direction the convoy is moving" -- word for word APP-06 330100's.
     */
    [TacticalGraphicName.MovingConvoy]: BOTH, // APP-06 330100 Moving Convoy -- FM table 5-18 "moving convoy"
    [TacticalGraphicName.HaltedConvoy]: BOTH, // APP-06 330200 Halted Convoy -- FM table 5-18 "halted convoy"
    [TacticalGraphicName.LightLine]: APP6_ONLY,  // APP-06 110200 Light Line
    [TacticalGraphicName.LineGeneric]: APP6_ONLY, // APP-06 110400 Line, Generic
    [TacticalGraphicName.HandoverLine]: APP6_ONLY, // APP-06 141800 Handover Line (HOL)
    [TacticalGraphicName.NamedAreaOfInterestLine]: APP6_ONLY, // APP-06 142000 Named Area of Interest Line (NAI)
    [TacticalGraphicName.HoldingLine]: APP6_ONLY,  // APP-06 141500 Holding Line (HL)
    [TacticalGraphicName.NoFireLine]: APP6_ONLY,  // APP-06 260300 No Fire Line
    [TacticalGraphicName.BattlefieldCoordinationLine]: APP6_ONLY,  // APP-06 260400 Battlefield Coordination Line
    [TacticalGraphicName.FighterEngagementZone]: APP6_ONLY,  // APP-06 171400 Fighter Engagement Zone (FEZ)
    [TacticalGraphicName.ExtractionZone]: APP6_ONLY,  // APP-06 150700 Extraction Zone (EZ)
    [TacticalGraphicName.RegimentalSupportArea]: APP6_ONLY,  // APP-06 310500 Regimental Support Area
    [TacticalGraphicName.FortifiedLine]:                                BOTH,      // APP-06 290900 Fortified Line
    // MIL-STD-2525D Table H-XIX; in neither FM 1-02.2 nor APP-06 Edition E.
    [TacticalGraphicName.AntiTankWall]:                                 MIL_STD_2525_ONLY, // MIL-STD-2525 290204 Antitank Wall
    // MIL-STD-2525E Change 1 Table L-VII; added March 2025, so in neither of the others yet.
    [TacticalGraphicName.FinalProtectiveFireLeft]:                      MIL_STD_2525_ONLY, // MIL-STD-2525 140501 Final Protective Fire (Left)
    [TacticalGraphicName.FinalProtectiveFireRight]:                     MIL_STD_2525_ONLY, // MIL-STD-2525 140502 Final Protective Fire (Right)
    [TacticalGraphicName.PrincipalDirectionOfFire]:                     MIL_STD_2525_ONLY, // MIL-STD-2525 140503 Principal Direction of Fire
    [TacticalGraphicName.SecondaryDirectionOfFire]:                     MIL_STD_2525_ONLY, // MIL-STD-2525 140504 Secondary Direction of Fire
};

/**
 * The graphics MIL-STD-2525E Change 1 does not have. Every other graphic is in it.
 *
 * Derived 2026-10-20 from the control-measure table (symbol set 25) in Appendix A of
 * MIL-STD-2525E Change 1, by entity code with the names compared. mil-sym-java's `mse.txt`
 * (rows tagged version 15) agrees on every graphic but line of contact: Change 1 describes
 * that symbol under the forward line of troops with no code of its own, so it is in 2525E
 * while its `140200` is a 2525D code. Shorter to pin the 35 absences than the 288 members,
 * and a new graphic defaults to "in 2525", so check it against the table before leaving
 * it off.
 */
const NOT_IN_MIL_STD_2525: ReadonlySet<TacticalGraphicName> = new Set([
    // FM 1-02.2 only, with no code in any catalog.
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.Gap,
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.ObstacleGroup,
    TacticalGraphicName.PassageLane,
    TacticalGraphicName.UnmannedAircraftCorridor,
    // APP-06 codes with no 2525E row. The two feints are in 2525D and were dropped in E.
    TacticalGraphicName.MainAxisOfAdvanceFeint, // 151406
    TacticalGraphicName.DirectionOfMainAttackFeint, // 140605
    TacticalGraphicName.Bridgehead, // 120800
    TacticalGraphicName.DecisionLine, // 110500
    TacticalGraphicName.NamedAreaOfInterestLine, // 142000
    TacticalGraphicName.MobilityCorridor, // 142100
    TacticalGraphicName.AvenueOfApproach, // 152300
    TacticalGraphicName.RestrictedTerrain, // 152400
    TacticalGraphicName.SeverelyRestrictedTerrain, // 152500
    TacticalGraphicName.NavigationalRhumbLine, // 220109
    TacticalGraphicName.ArtilleryManeuverArea, // 242400
    TacticalGraphicName.ArtilleryReservedArea, // 242500
    TacticalGraphicName.ZoneOfFire, // 242600
    TacticalGraphicName.PsyOpsZoneIrregular, // 242701
    TacticalGraphicName.PsyOpsZoneRectangular, // 242702
    TacticalGraphicName.PsyOpsZoneCircular, // 242703
    TacticalGraphicName.TargetAreaSingleTargetAegis, // 240804
    TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial, // 271701
    TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial, // 271801
    TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial, // 272001
    TacticalGraphicName.Capture, // 343000
    TacticalGraphicName.Control, // 343200
    TacticalGraphicName.Deny, // 343400
    TacticalGraphicName.Escort, // 343600
    TacticalGraphicName.Exfiltrate, // 343700
    TacticalGraphicName.Locate, // 343900
    TacticalGraphicName.Recover, // 344600
    TacticalGraphicName.HumanTerrain, // 370100
]);

/**
 * Which specifications define each graphic: MIL-STD-2525 for every graphic MIL-STD-2525E
 * Change 1 has, then FM 1-02.2 and APP-06 as tagged by hand. Listed in that order.
 *
 * **288 of 323 graphics are in MIL-STD-2525.** Count it, don't trust it.
 */
export const GRAPHIC_SPECIFICATIONS: Record<TacticalGraphicName, readonly TacticalGraphicSpecification[]> = (() => {
    // One frozen array per combination, shared like the consts above, so a caller that
    // mutated one could not corrupt every other graphic holding it.
    const withMilStd = new Map<readonly TacticalGraphicSpecification[], readonly TacticalGraphicSpecification[]>();
    const add = (specs: readonly TacticalGraphicSpecification[]) => {
        let found = withMilStd.get(specs);
        if (!found) withMilStd.set(specs, (found = Object.freeze([TacticalGraphicSpecification.MIL_STD_2525, ...specs])));
        return found;
    };
    return Object.fromEntries(
        (Object.entries(FM_AND_APP6) as [TacticalGraphicName, readonly TacticalGraphicSpecification[]][]).map(([name, specs]) => [
            name,
            specs.includes(TacticalGraphicSpecification.MIL_STD_2525) || NOT_IN_MIL_STD_2525.has(name) ? specs : add(specs),
        ]),
    ) as Record<TacticalGraphicName, readonly TacticalGraphicSpecification[]>;
})();

/** The specifications a graphic belongs to. Never empty. */
export function getSpecifications(name: TacticalGraphicName): readonly TacticalGraphicSpecification[] {
    return GRAPHIC_SPECIFICATIONS[name] ?? FM_ONLY;
}

/** Whether a graphic is defined in a given specification. */
export function hasSpecification(name: TacticalGraphicName, specification: TacticalGraphicSpecification): boolean {
    return getSpecifications(name).includes(specification);
}

/** Every graphic defined in a given specification, in enum declaration order. */
export function listNamesBySpecification(specification: TacticalGraphicSpecification): TacticalGraphicName[] {
    return (Object.keys(GRAPHIC_SPECIFICATIONS) as TacticalGraphicName[]).filter((name) => hasSpecification(name, specification));
}
