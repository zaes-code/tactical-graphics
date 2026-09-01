import {TacticalGraphicName} from './type';

/**
 * The six-digit entity code each graphic carries in the published symbology.
 *
 * The number comes from APP-06 Edition E Annex A, Table A-32, and it is the same
 * code MIL-STD-2525 assigns the symbol: for the control-measure symbol set the two
 * standards are harmonised on one numbering, so `140300` is Phase Line in both. A
 * full MIL-STD-2525 SIDC prefixes the control-measure symbol set (`25`) and appends
 * affiliation and status digits; this is the entity portion, which is the part that
 * identifies *which* graphic.
 *
 * FM 1-02.2 publishes no identifier of its own -- it defers to MIL-STD-2525 for
 * machine codes and prints only the drawn symbol -- so the eight graphics FM defines
 * and APP-06 does not are `null` here. That is a real absence, not a gap in the
 * table: a graphic with no counterpart in either coded catalog has no code to carry.
 *
 * Exhaustive by construction, like `GRAPHIC_SPECIFICATIONS`. Adding a
 * `TacticalGraphicName` member will not compile until it is given a code or an
 * explicit `null`.
 *
 * **283 codes, 8 nulls.** Count it, don't trust it. The trailing comment on each
 * entry is the entity name as the standard writes it; `entityCodes.test.ts` asserts
 * every code here against the one recorded beside the same graphic in
 * `specifications.ts`, so the two cannot drift.
 */
export const GRAPHIC_ENTITY_CODES: Record<TacticalGraphicName, string | null> = {
    [TacticalGraphicName.BaseDefenseZone]:                             '170800',  // Base Defence Zone
    [TacticalGraphicName.MainAxisOfAdvance]:                           '151403',  // Main Attack
    [TacticalGraphicName.MainAxisOfAdvanceFeint]:                      '151406',  // Feint
    [TacticalGraphicName.SupportingAxisOfAdvance]:                     '151404',  // Supporting Attack
    [TacticalGraphicName.AviationAxisOfAdvance]:                       '151401',  // Airborne/Aviation
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]:               '151402',  // Attack Helicopter
    [TacticalGraphicName.Counterattack]:                               '340600',  // Counter-Attack
    [TacticalGraphicName.PhaseLine]:                                   '140300',  // Phase Line
    [TacticalGraphicName.ForwardEdgeOfBattleArea]:                     '140400',  // Forward Edge of the Battle Area
    [TacticalGraphicName.ReleaseLine]:                                 '141600',  // Release Line
    [TacticalGraphicName.BridgeheadLine]:                              '141400',  // Bridgehead Line (BL)
    [TacticalGraphicName.BattlefieldHandoverLine]:                     '141900',  // Battle Handover Line (BHL)
    [TacticalGraphicName.DelayLine]:                                   null,
    [TacticalGraphicName.FinalCoordinationLine]:                       '140700',  // Final Coordination Line
    [TacticalGraphicName.LimitOfAdvance]:                              '140900',  // Limit of Advance
    [TacticalGraphicName.LineOfDeparture]:                             '141000',  // Line of Departure
    [TacticalGraphicName.LineOfDepartureOrLineOfContact]:              '141100',  // Line of Departure/Line of Contact
    [TacticalGraphicName.ProbableLineOfDeployment]:                    '141200',  // Probable Line of Deployment
    [TacticalGraphicName.IdentificationFriendOrFoeOff]:                '190100',  // Identification Friend or Foe (IFF) Off Line
    [TacticalGraphicName.IdentificationFriendOrFoeOn]:                 '190200',  // Identification Friend or Foe (IFF) On Line
    [TacticalGraphicName.Route]:                                       '330500',  // Route
    [TacticalGraphicName.MainSupplyRoute]:                             '330300',  // Main Supply Route (MSR)
    [TacticalGraphicName.AlternateSupplyRoute]:                        '330400',  // Alternate Supply Route (ASR)
    [TacticalGraphicName.CommonSensorBoundary]:                        null,
    [TacticalGraphicName.FireSupportCoordinationLine]:                 '260100',  // Fire Support Coordination Line (FSCL)
    [TacticalGraphicName.RestrictiveFireLine]:                         '260500',  // Restrictive Fire Line
    [TacticalGraphicName.IntelligenceCoordinationLine]:                '300100',  // Intelligence Coordination Line (ICL)
    [TacticalGraphicName.Boundary]:                                    '110100',  // Boundary
    [TacticalGraphicName.CoordinatedFireLine]:                         '260200',  // Coordinated Fire Line (CFL)
    [TacticalGraphicName.EngineerWorkLine]:                            '110300',  // Engineer Work Line
    [TacticalGraphicName.AirfieldZone]:                                '120400',  // Airfield Zone
    [TacticalGraphicName.Airfield]:                                    '131900',  // Airfield
    [TacticalGraphicName.AreaOfOperations]:                            '120100',  // Area of Operations
    [TacticalGraphicName.BombArea]:                                    '240808',  // Bomb Area
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]:           '242000',  // Terminally Guided Munition Footprint (TGMF)
    [TacticalGraphicName.Bridgehead]:                                  '120800',  // Bridgehead
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]:               '310200',  // Enemy Prisoner of War Holding Area
    [TacticalGraphicName.HumanTerrain]:                                '370100',  // Human Terrain
    [TacticalGraphicName.PenetrationBox]:                              '151900',  // Penetration Box
    [TacticalGraphicName.Area]:                                        '150100',  // Area
    [TacticalGraphicName.SubmarineActionArea]:                          '150502',  // Submarine Action Area (SAA)
    [TacticalGraphicName.SubmarineGeneratedActionArea]:                 '150503',  // Submarine-Generated Action Area (SGAA)
    [TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial]:   '271701',  // Toxic Industrial Material
    [TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial]:     '271801',  // Toxic Industrial Material
    [TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial]: '272001',  // Toxic Industrial Material
    [TacticalGraphicName.JointTacticalActionArea]:                     '150501',  // Joint Tactical Action Area (JTAA)
    [TacticalGraphicName.AreaGeneric]:                                 '120700',  // Area, Generic
    [TacticalGraphicName.ZoneOfFire]:                                  '242600',  // Zone of Fire
    [TacticalGraphicName.RestrictedTerrain]:                           '152400',  // Restricted Terrain
    [TacticalGraphicName.SeverelyRestrictedTerrain]:                   '152500',  // Severely Restricted Terrain
    [TacticalGraphicName.BiologicalContaminatedArea]:                  '271700',  // Biological Contaminated Area
    [TacticalGraphicName.ChemicalContaminatedArea]:                    '271800',  // Chemical Contaminated Area
    [TacticalGraphicName.NuclearContaminatedArea]:                     '271900',  // Nuclear Contaminated Area
    [TacticalGraphicName.RadiologicalContaminatedArea]:                '272000',  // Radiological Contaminated Area
    [TacticalGraphicName.ArtilleryManeuverArea]:                       '242400',  // Artillery Manoeuvre Area (AMA)
    [TacticalGraphicName.ArtilleryReservedArea]:                       '242500',  // Artillery Reserved Area (ARA)
    [TacticalGraphicName.AssemblyArea]:                                '150200',  // Assembly Area (AA)
    [TacticalGraphicName.BaseCamp]:                                    '120500',  // Base Camp
    [TacticalGraphicName.EngagementArea]:                              '151300',  // Engagement Area (EA)
    [TacticalGraphicName.GuerrillaBase]:                               '120600',  // Guerrilla Base
    [TacticalGraphicName.NamedAreaOfInterest]:                         '120200',  // Named Area of Interest
    [TacticalGraphicName.ObjectiveArea]:                               '151700',  // Objective Area
    [TacticalGraphicName.TargetAreaOfInterest]:                        '120300',  // Target Area of Interest
    [TacticalGraphicName.AssaultPosition]:                             '151500',  // Assault Position
    [TacticalGraphicName.AttackPosition]:                              '151600',  // Attack Position
    [TacticalGraphicName.DetaineeHoldingArea]:                         '310100',  // Detainee Holding Area
    [TacticalGraphicName.RefugeeHoldingArea]:                          '310400',  // Refugee Holding Area
    [TacticalGraphicName.ForwardArmingAndRefuelingPoint]:              '310300',  // Forward Arming and Refuelling Point (FARP)
    [TacticalGraphicName.BrigadeSupportArea]:                          '310600',  // Brigade Support Area
    [TacticalGraphicName.DivisionSupportArea]:                         '310700',  // Division Support Area
    [TacticalGraphicName.CorpsSupportArea]:                            '310800',  // Corps Support Area
    [TacticalGraphicName.DropZone]:                                    '150600',  // Drop Zone (DZ)
    [TacticalGraphicName.LandingZone]:                                 '150800',  // Landing Zone (LZ)
    [TacticalGraphicName.KillZone]:                                    null,
    [TacticalGraphicName.PickupZone]:                                  '150900',  // Pick-Up Zone (PZ)
    [TacticalGraphicName.BattlePosition]:                              '151200',  // Battle Position
    [TacticalGraphicName.StrongPoint]:                                 '151203',  // Strong Point
    [TacticalGraphicName.AirCorridor]:                                 '170100',  // Air Corridor
    [TacticalGraphicName.LowLevelTransitRoute]:                        '170200',  // Low Level Transit Route
    [TacticalGraphicName.MinimumRiskRoute]:                            '170300',  // Temporary Minimum- Risk Route
    [TacticalGraphicName.SafeLane]:                                    '170400',  // Safe Lane
    [TacticalGraphicName.SpecialCorridor]:                             '170700',  // Special Corridor (SC)
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]:          '170500',  // Standard Use Army Aircraft Flight Route
    [TacticalGraphicName.TransitCorridor]:                             '170600',  // Transit Corridor
    [TacticalGraphicName.UnmannedAircraftCorridor]:                    null,
    [TacticalGraphicName.Secure]:                                      '342100',  // Secure
    [TacticalGraphicName.Isolate]:                                     '341500',  // Isolate
    [TacticalGraphicName.Retain]:                                      '151205',  // Retain
    [TacticalGraphicName.Control]:                                     '343200',  // Control
    [TacticalGraphicName.CordonAndKnock]:                              '342600',  // Cordon and Knock
    [TacticalGraphicName.MinefieldDynamicDepiction]:                   '270707',  // Minefield, Dynamic Depiction
    [TacticalGraphicName.MinedAreaFenced]:                             '270801',  // Mined Area, Fenced
    [TacticalGraphicName.PsyOpsZoneIrregular]:                         '242701',  // PsyOps Zone, Irregular
    [TacticalGraphicName.PsyOpsZoneRectangular]:                       '242702',  // PsyOps Zone, Rectangular
    [TacticalGraphicName.PsyOpsZoneCircular]:                          '242703',  // PsyOps Zone, Circular
    [TacticalGraphicName.AvenueOfApproach]:                            '152300',  // Avenue of Approach
    [TacticalGraphicName.CounterattackByFire]:                         '340700',  // Counter-Attack by Fire
    [TacticalGraphicName.Deny]:                                        '343400',  // Deny
    [TacticalGraphicName.Locate]:                                      '343900',  // Locate
    [TacticalGraphicName.CordonAndSearch]:                             '342700',  // Cordon and Search
    [TacticalGraphicName.Contain]:                                     '151204',  // Contain
    [TacticalGraphicName.Occupy]:                                      '341700',  // Occupy
    [TacticalGraphicName.AreaDefense]:                                 '152600',  // Area Defence
    [TacticalGraphicName.Cover]:                                       '342201',  // Cover
    [TacticalGraphicName.Guard]:                                       '342202',  // Guard
    [TacticalGraphicName.Screen]:                                      '342203',  // Screen
    [TacticalGraphicName.TacticalBlock]:                               '340100',  // Block
    [TacticalGraphicName.Breach]:                                      '340200',  // Breach
    [TacticalGraphicName.Bypass]:                                      '340300',  // Bypass
    [TacticalGraphicName.Canalize]:                                    '340400',  // Canalize
    [TacticalGraphicName.Clear]:                                       '340500',  // Clear
    [TacticalGraphicName.TacticalDisrupt]:                             '341000',  // Disrupt
    [TacticalGraphicName.Penetration]:                                 '341800',  // Penetrate
    [TacticalGraphicName.Exploitation]:                                '343100',  // Exploit/Exploitation
    [TacticalGraphicName.Disengage]:                                   '344400',  // Disengage
    [TacticalGraphicName.Delay]:                                       '340800',  // Delay
    [TacticalGraphicName.Retirement]:                                  '342000',  // Retire/Retirement
    [TacticalGraphicName.Withdraw]:                                    '342400',  // Withdraw
    [TacticalGraphicName.WithdrawUnderPressure]:                       '342500',  // Withdraw Under Pressure
    [TacticalGraphicName.ForwardPassageOfLines]:                       '344100',  // Forward Passage of Lines
    [TacticalGraphicName.RearwardPassageOfLines]:                      '344200',  // Rearward Passage of Lines
    [TacticalGraphicName.FreeFireAreaIrregular]:                       '240201',  // Irregular
    [TacticalGraphicName.FreeFireAreaRectangular]:                     '240202',  // Rectangular
    [TacticalGraphicName.FreeFireAreaCircular]:                        '240203',  // Circular
    [TacticalGraphicName.NoFireAreaIrregular]:                         '240301',  // Irregular
    [TacticalGraphicName.NoFireAreaRectangular]:                       '240302',  // Rectangular
    [TacticalGraphicName.NoFireAreaCircular]:                          '240303',  // Circular
    [TacticalGraphicName.RestrictiveFireAreaIrregular]:                '240401',  // Irregular
    [TacticalGraphicName.RestrictiveFireAreaRectangular]:              '240402',  // Rectangular
    [TacticalGraphicName.RestrictiveFireAreaCircular]:                 '240403',  // Circular
    [TacticalGraphicName.PositionAreaArtilleryIrregular]:              '240503',  // Irregular
    [TacticalGraphicName.PositionAreaArtilleryRectangular]:            '240501',  // Rectangular
    [TacticalGraphicName.PositionAreaArtilleryCircular]:               '240502',  // Circular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]:    '241101',  // Irregular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]:  '241102',  // Rectangular
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]:     '241103',  // Circular
    [TacticalGraphicName.CallForFireZoneIrregular]:                    '241201',  // Irregular
    [TacticalGraphicName.CallForFireZoneRectangular]:                  '241202',  // Rectangular
    [TacticalGraphicName.CallForFireZoneCircular]:                     '241203',  // Circular
    [TacticalGraphicName.TargetBuildUpAreaIrregular]:                  '241701',  // Irregular
    [TacticalGraphicName.TargetBuildUpAreaRectangular]:                '241702',  // Rectangular
    [TacticalGraphicName.TargetBuildUpAreaCircular]:                   '241703',  // Circular
    [TacticalGraphicName.TargetValueAreaIrregular]:                    '241801',  // Irregular
    [TacticalGraphicName.TargetValueAreaRectangular]:                  '241802',  // Rectangular
    [TacticalGraphicName.TargetValueAreaCircular]:                     '241803',  // Circular
    [TacticalGraphicName.ZoneOfResponsibilityIrregular]:               '241901',  // Irregular
    [TacticalGraphicName.ZoneOfResponsibilityRectangular]:             '241902',  // Rectangular
    [TacticalGraphicName.ZoneOfResponsibilityCircular]:                '241903',  // Circular
    [TacticalGraphicName.CensorZoneIrregular]:                         '241301',  // Irregular
    [TacticalGraphicName.CensorZoneRectangular]:                       '241302',  // Rectangular
    [TacticalGraphicName.CensorZoneCircular]:                          '241303',  // Circular
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]:               '241401',  // Irregular
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]:             '241402',  // Rectangular
    [TacticalGraphicName.CriticalFriendlyZoneCircular]:                '241403',  // Circular
    [TacticalGraphicName.DeadSpaceAreaIrregular]:                      '241501',  // Irregular
    [TacticalGraphicName.DeadSpaceAreaRectangular]:                    '241502',  // Rectangular
    [TacticalGraphicName.DeadSpaceAreaCircular]:                       '241503',  // Circular
    [TacticalGraphicName.BlueKillBoxIrregular]:                        '242301',  // Irregular, Blue
    [TacticalGraphicName.BlueKillBoxRectangular]:                      '242302',  // Rectangular, Blue
    [TacticalGraphicName.BlueKillBoxCircular]:                         '242303',  // Circular, Blue
    [TacticalGraphicName.PurpleKillBoxIrregular]:                      '242304',  // Irregular, Purple
    [TacticalGraphicName.PurpleKillBoxRectangular]:                    '242305',  // Rectangular, Purple
    [TacticalGraphicName.PurpleKillBoxCircular]:                       '242306',  // Circular, Purple
    [TacticalGraphicName.FireSupportAreaIrregular]:                    '241001',  // Irregular
    [TacticalGraphicName.FireSupportAreaRectangular]:                  '241002',  // Rectangular
    [TacticalGraphicName.FireSupportAreaCircular]:                     '241003',  // Circular
    [TacticalGraphicName.TargetAreaIrregular]:                         '240801',  // Area Target
    [TacticalGraphicName.TargetAreaRectangular]:                       '240802',  // Rectangular Target
    [TacticalGraphicName.TargetAreaCircular]:                          '240803',  // Circular Target
    [TacticalGraphicName.HighDensityAirspaceControlZone]:              '170900',  // High-Density Airspace Control Zone
    [TacticalGraphicName.RestrictedOperationsZone]:                    '171000',  // Restricted Operations Zone (ROZ)
    [TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone]:   '171100',  // Air-to-Air Restricted Operating Zone (AARROZ)
    [TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone]:    '171200',  // Unmanned Aircraft Restricted Operating Zone (UA-ROZ)
    [TacticalGraphicName.WeaponEngagementZone]:                        '171300',  // Weapon Engagement Zone (WEZ)
    [TacticalGraphicName.JointEngagementZone]:                         '171500',  // Joint Engagement Zone (JEZ)
    [TacticalGraphicName.MissileEngagementZone]:                       '171600',  // Missile Engagement Zone (MEZ)
    [TacticalGraphicName.LowAltitudeMissileEngagementZone]:            '171700',  // Low (Altitude) Missile Engagement Zone (LOMEZ)
    [TacticalGraphicName.HighAltitudeMissileEngagementZone]:           '171800',  // High (Altitude) Missile Engagement Zone (HIMEZ)
    [TacticalGraphicName.ShortRangeAirDefenseEngagementZone]:          '171900',  // Short Range Air Defence Engagement Zone (SHORADEZ)
    [TacticalGraphicName.WeaponsFreeZone]:                             '172000',  // Weapons Free Zone
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]:           '240101',  // Irregular
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]:         '240102',  // Rectangular
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]:            '240103',  // Circular
    [TacticalGraphicName.Encirclement]:                                '151800',  // Encirclement
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]:             '271000',  // Unexploded Explosive Ordnance (UXO) Area
    [TacticalGraphicName.FortifiedArea]:                               '151000',  // Fortified Area
    [TacticalGraphicName.AirheadLine]:                                 '141300',  // Airhead Line
    [TacticalGraphicName.MunitionFlightPath]:                          '260600',  // Munition Flight Path
    [TacticalGraphicName.FieldsOfFire]:                                '140500',  // Field of Fire
    [TacticalGraphicName.ForwardLineOfOwnTroops]:                      '140100',  // Forward Line of Troops
    [TacticalGraphicName.Bridge]:                                      '271100',  // Bridge
    [TacticalGraphicName.AssaultCrossing]:                             '271300',  // Assault Crossing
    [TacticalGraphicName.Gap]:                                         null,      // FM only; APP-06's 290600 is a different symbol
    [TacticalGraphicName.FordEasy]:                                    '271500',  // Ford Easy
    [TacticalGraphicName.FordDifficult]:                               '271600',  // Ford Difficult
    [TacticalGraphicName.FerryCrossing]:                               '290700',  // Ferry
    [TacticalGraphicName.PassageLane]:                                 null,
    [TacticalGraphicName.SafeLaneOrGap]:                               '290600',  // Safe Lane or Gap
    [TacticalGraphicName.ObstacleBelt]:                                '270100',  // Obstacle Belt
    [TacticalGraphicName.ObstacleGroup]:                               null,
    [TacticalGraphicName.ObstacleZone]:                                '270200',  // Obstacle Zone
    [TacticalGraphicName.ObstacleFreeArea]:                            '270300',  // Obstacle Free Zone
    [TacticalGraphicName.ObstacleRestrictedArea]:                      '270400',  // Obstacle Restricted Zone
    [TacticalGraphicName.Abatis]:                                      '280100',  // Abatis
    [TacticalGraphicName.OverheadWire]:                                '282003',  // Overhead Wire
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]:           '271201',  // Planned
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]:             '271202',  // Explosives, State of Readiness 1 (Safe)
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: '271203',  // Explosives, State of Readiness 2 (Armed but Passable)
    [TacticalGraphicName.RoadblockCompleteExecuted]:                   '271204',  // Roadblock Complete (Executed)
    [TacticalGraphicName.AntiTankDitchUnderConstruction]:              '290201',  // Antitank Ditch Under Construction
    [TacticalGraphicName.AntiTankDitchCompleted]:                      '290202',  // Antitank Ditch Completed
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]:            '290203',  // Antitank Ditch Reinforced, with Antitank Mines
    [TacticalGraphicName.WireUnspecified]:                             '290301',  // Unspecified
    [TacticalGraphicName.WireSingleFence]:                             '290302',  // Single Fence
    [TacticalGraphicName.WireDoubleFence]:                             '290303',  // Double Fence
    [TacticalGraphicName.WireDoubleApronFence]:                        '290304',  // Double Apron Fence
    [TacticalGraphicName.WireLowWireFence]:                            '290305',  // Low Wire Fence
    [TacticalGraphicName.WireHighWireFence]:                           '290306',  // High Wire Fence
    [TacticalGraphicName.WireSingleConcertina]:                        '290307',  // Single Concertina
    [TacticalGraphicName.WireDoubleStrandConcertina]:                  '290308',  // Double Strand Concertina
    [TacticalGraphicName.WireTripleStrandConcertina]:                  '290309',  // Triple Strand Concertina
    [TacticalGraphicName.ObstacleLine]:                                '290100',  // Obstacle Line
    [TacticalGraphicName.BattlePositionPreparedButNotOccupied]:        '151202',  // Battle Position Prepared (P) but Not Occupied
    [TacticalGraphicName.Capture]:                                     '343000',  // Capture
    [TacticalGraphicName.Seize]:                                       '342300',  // Seize
    [TacticalGraphicName.FollowAndAssume]:                             '341200',  // Follow and Assume
    [TacticalGraphicName.FollowAndSupport]:                            '341300',  // Follow and Support
    [TacticalGraphicName.Escort]:                                      '343600',  // Escort
    [TacticalGraphicName.Demonstration]:                               '343300',  // Demonstration/Demonstrate
    [TacticalGraphicName.Evacuate]:                                    '344500',  // Evacuate
    [TacticalGraphicName.Recover]:                                     '344600',  // Recover
    [TacticalGraphicName.DecisionLine]:                                '110500',  // Decision Line
    [TacticalGraphicName.MobilityCorridor]:                            '142100',  // Mobility Corridor
    [TacticalGraphicName.MinimumSafeDistanceZone]:                     '272100',  // Minimum Safe Distance Zone
    [TacticalGraphicName.MinimumSafeDistanceMultipleStrike]:           '272101',  // Multiple Strike (STRIKWARN)
    [TacticalGraphicName.RadiationDoseRateContourLine]:                '272200',  // Radiation Dose Rate Contour Lines
    [TacticalGraphicName.ObstacleBypassEasy]:                          '270601',  // Obstacle Bypass Easy
    [TacticalGraphicName.ObstacleBypassDifficult]:                     '270602',  // Obstacle Bypass Difficult
    [TacticalGraphicName.ObstacleBypassImpossible]:                    '270603',  // Obstacle Bypass Impossible
    [TacticalGraphicName.Mineline]:                                    '290101',  // Mineline
    [TacticalGraphicName.MineCluster]:                                 '290400',  // Mine Cluster
    [TacticalGraphicName.TripWire]:                                    '290500',  // Trip Wire
    [TacticalGraphicName.RaftSite]:                                    '290800',  // Raft Site
    [TacticalGraphicName.FortifiedPosition]:                           '291000',  // Fortified Position
    [TacticalGraphicName.TacticalFix]:                                 '341100',  // Fix
    [TacticalGraphicName.TacticalTurn]:                                '344700',  // Turn
    [TacticalGraphicName.Block]:                                       '270501',  // Block
    [TacticalGraphicName.Disrupt]:                                     '270502',  // Disrupt
    [TacticalGraphicName.Fix]:                                         '270503',  // Fix
    [TacticalGraphicName.Turn]:                                        '270504',  // Turn
    [TacticalGraphicName.DirectionOfMainAttack]:                       '140602',  // Main Attack
    [TacticalGraphicName.DirectionOfSupportingAttack]:                 '140603',  // Supporting Attack
    [TacticalGraphicName.DirectionOfMainAttackFeint]:                  '140605',  // Feint
    [TacticalGraphicName.AviationDirectionOfAttack]:                   '140601',  // Aviation
    [TacticalGraphicName.Infiltration]:                                '343800',  // Infiltrate
    [TacticalGraphicName.InfiltrationLane]:                            '140800',  // Infiltration Lane
    [TacticalGraphicName.MovementToContact]:                           null,
    [TacticalGraphicName.AdvanceToContact]:                            '342900',  // Advance to Contact
    [TacticalGraphicName.FrontalAttack]:                               '152700',  // Frontal Attack
    [TacticalGraphicName.TurningMovement]:                             '152900',  // Turning Movement
    [TacticalGraphicName.Pursuit]:                                     '344000',  // Pursue
    [TacticalGraphicName.Envelopment]:                                 '343500',  // Envelop
    [TacticalGraphicName.MobileDefense]:                               '152800',  // Mobile Defence
    [TacticalGraphicName.Ambush]:                                      '141700',  // Ambush
    [TacticalGraphicName.ReliefInPlace]:                               '341900',  // Relieve in Place / Relief in Place (RIP)
    [TacticalGraphicName.LimitedAccessArea]:                           '151100',  // Limited Access Area
    [TacticalGraphicName.LinearTarget]:                                '240701',  // Linear Target
    [TacticalGraphicName.FinalProtectiveFire]:                         '240703',  // Final Protective Fire (FPF)
    [TacticalGraphicName.LinearSmokeTarget]:                           '240702',  // Linear Smoke Target
    [TacticalGraphicName.SmokeObscurant]:                              '240806',  // Smoke
    [TacticalGraphicName.GroupOrSeriesOfTargets]:                      '240805',  // Series or Groups of Targets
    [TacticalGraphicName.WeaponSensorRangeFanCircular]:                '242100',  // Weapon/Sensor Range Fan, Circular
    [TacticalGraphicName.WeaponSensorRangeFanSector]:                  '242200',  // Weapon/Sensor Range Fan, Sector
    [TacticalGraphicName.LineOfContact]:                               '141100',  // Line of Departure/Line of Contact
    [TacticalGraphicName.AttackByFire]:                                '152000',  // Attack by Fire
    [TacticalGraphicName.Destroy]:                                     '340900',  // Destroy
    [TacticalGraphicName.Exfiltrate]:                                  '343700',  // Exfiltrate
    [TacticalGraphicName.Interdict]:                                   '341400',  // Interdict
    [TacticalGraphicName.Neutralize]:                                  '341600',  // Neutralize
    [TacticalGraphicName.SupportByFire]:                               '152100',  // Support by Fire
    [TacticalGraphicName.Suppress]:                                    '342800',  // Suppress
    [TacticalGraphicName.FightingPosition]:                            null,
    [TacticalGraphicName.LightLine]:                                   '110200',  // Light Line
    [TacticalGraphicName.LineGeneric]:                                 '110400',  // Line, Generic
    [TacticalGraphicName.HandoverLine]:                                '141800',  // Handover Line (HOL)
    [TacticalGraphicName.NamedAreaOfInterestLine]:                     '142000',  // Named Area of Interest Line (NAI)
    [TacticalGraphicName.HoldingLine]:                                 '141500',  // Holding Line (HL)
    [TacticalGraphicName.NoFireLine]:                                  '260300',  // No Fire Line
    [TacticalGraphicName.BattlefieldCoordinationLine]:                 '260400',  // Battlefield Coordination Line
    [TacticalGraphicName.FighterEngagementZone]:                       '171400',  // Fighter Engagement Zone (FEZ)
    [TacticalGraphicName.ExtractionZone]:                              '150700',  // Extraction Zone (EZ)
    [TacticalGraphicName.RegimentalSupportArea]:                       '310500',  // Regimental Support Area
    [TacticalGraphicName.FortifiedLine]:                               '290900',  // Fortified Line
};

const DISTINCT_CODES: string[] = [];

/** Reverse index. Built once; a code may name more than one graphic -- see {@link listNamesByEntityCode}. */
const NAMES_BY_CODE: ReadonlyMap<string, readonly TacticalGraphicName[]> = (() => {
    const index = new Map<string, TacticalGraphicName[]>();
    for (const [name, code] of Object.entries(GRAPHIC_ENTITY_CODES) as [TacticalGraphicName, string | null][]) {
        if (!code) continue;
        const bucket = index.get(code);
        if (bucket) {
            bucket.push(name);
        } else {
            index.set(code, [name]);
            DISTINCT_CODES.push(code);
        }
    }
    return index;
})();

/**
 * The entity code for a graphic, or `undefined` where the published symbology assigns none.
 *
 * `undefined` means FM 1-02.2 defines the graphic and no coded catalog does. It is not
 * an error and not a lookup miss.
 */
export function getEntityCode(name: TacticalGraphicName): string | undefined {
    return GRAPHIC_ENTITY_CODES[name] ?? undefined;
}

/**
 * Every graphic carrying an entity code, for callers that address graphics by code.
 *
 * Returns an array because the mapping is not one-to-one: APP-06 `141100` is
 * "Line of Departure/Line of Contact", which this library draws as two separate
 * graphics. Order follows `GRAPHIC_ENTITY_CODES`. An unknown code returns empty.
 */
export function listNamesByEntityCode(code: string): readonly TacticalGraphicName[] {
    return NAMES_BY_CODE.get(code.trim()) ?? [];
}

/**
 * The single graphic a code names, or `undefined` when the code is unknown *or*
 * names more than one. Use {@link listNamesByEntityCode} when a code may be shared.
 */
export function getNameByEntityCode(code: string): TacticalGraphicName | undefined {
    const names = listNamesByEntityCode(code);
    return names.length === 1 ? names[0] : undefined;
}

/** Every entity code in use, ascending, with no duplicates. */
export function listEntityCodes(): string[] {
    return DISTINCT_CODES.slice().sort();
}
