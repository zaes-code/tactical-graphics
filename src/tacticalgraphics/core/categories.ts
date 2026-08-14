import {TacticalGraphicName} from './type';

export enum TacticalGraphicCategory {
    AirspaceCoordinatingMeasures = 'Airspace Coordinating Measures',
    Areas = 'Areas',
    Boundaries = 'Boundaries',
    DefenseOperationsPlanning = 'Defense Operations Planning',
    EnablingOperationsPlanning = 'Enabling Operations Planning',
    FieldFortification = 'Field Fortification Symbols',
    FireSupportCoordination = 'Fire Support Coordination Control Measures',
    Lines = 'Lines',
    MobilityAndCountermobility = 'Mobility and Countermobility Control Measures',
    MovementAndManeuver = 'Movement and Maneuver',
    OffenseOperationsPlanning = 'Offense Operations Planning',
    TacticalMissionTasks = 'Tactical Mission Tasks',
    TargetAcquisitionControlMeasures = 'Target Acquisition Control Measures',
    TargetControlMeasures = 'Target Control Measures',
}

export const GRAPHIC_CATEGORIES: Record<TacticalGraphicName, TacticalGraphicCategory> = {

    // ── Airspace Control Measures ───────────────────────────────────────────── OK
    [TacticalGraphicName.AirCorridor]:                              TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.AirSpaceCoordinationAreaCircular]:         TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.AirSpaceCoordinationAreaIrregular]:        TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.AirSpaceCoordinationAreaRectangular]:      TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone]: TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.BaseDefenseZone]:                          TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.HighAltitudeMissileEngagementZone]:        TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.HighDensityAirspaceControlZone]:           TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.IdentificationFriendOrFoeOff]:             TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.IdentificationFriendOrFoeOn]:              TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.FighterEngagementZone]: TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.JointEngagementZone]:                      TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.LowAltitudeMissileEngagementZone]:         TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.LowLevelTransitRoute]:                     TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.MinimumRiskRoute]:                         TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.MissileEngagementZone]:                    TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.RestrictedOperationsZone]:                 TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.SafeLane]:                                 TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.ShortRangeAirDefenseEngagementZone]:       TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.SpecialCorridor]:                          TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.StandardUseArmyAircraftFlightRoute]:       TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.TransitCorridor]:                          TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.UnmannedAircraftCorridor]:                 TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone]: TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.WeaponEngagementZone]:                     TacticalGraphicCategory.AirspaceCoordinatingMeasures,
    [TacticalGraphicName.WeaponsFreeZone]:                          TacticalGraphicCategory.AirspaceCoordinatingMeasures,

    // ── Areas ──────────────────────────────────────────────────────────────── OK
    [TacticalGraphicName.Airfield]:                         TacticalGraphicCategory.Areas,
    [TacticalGraphicName.AirheadLine]:                      TacticalGraphicCategory.Areas,
    [TacticalGraphicName.AreaOfOperations]:                 TacticalGraphicCategory.Areas,
    [TacticalGraphicName.AssaultPosition]:                  TacticalGraphicCategory.Areas,
    [TacticalGraphicName.BombArea]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TerminallyGuidedMunitionFootprint]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.Bridgehead]: TacticalGraphicCategory.Areas,
    [TacticalGraphicName.EnemyPrisonerOfWarHoldingArea]: TacticalGraphicCategory.Areas,
    [TacticalGraphicName.HumanTerrain]: TacticalGraphicCategory.Areas,
    [TacticalGraphicName.AssemblyArea]:                     TacticalGraphicCategory.Areas,
    [TacticalGraphicName.AttackPosition]:                   TacticalGraphicCategory.Areas,
    [TacticalGraphicName.BaseCamp]:                         TacticalGraphicCategory.Areas,
    [TacticalGraphicName.BattlePosition]:                   TacticalGraphicCategory.Areas,
    [TacticalGraphicName.BrigadeSupportArea]:               TacticalGraphicCategory.Areas,
    [TacticalGraphicName.CorpsSupportArea]:                 TacticalGraphicCategory.Areas,
    [TacticalGraphicName.DetaineeHoldingArea]:              TacticalGraphicCategory.Areas,
    [TacticalGraphicName.DivisionSupportArea]:              TacticalGraphicCategory.Areas,
    [TacticalGraphicName.ExtractionZone]: TacticalGraphicCategory.Areas,
    [TacticalGraphicName.RegimentalSupportArea]: TacticalGraphicCategory.Areas,
    [TacticalGraphicName.DropZone]:                         TacticalGraphicCategory.Areas,
    [TacticalGraphicName.Encirclement]:                     TacticalGraphicCategory.Areas,
    [TacticalGraphicName.EngagementArea]:                   TacticalGraphicCategory.Areas,
    [TacticalGraphicName.FortifiedArea]:                    TacticalGraphicCategory.Areas,
    [TacticalGraphicName.ForwardArmingAndRefuelingPoint]:   TacticalGraphicCategory.Areas,
    [TacticalGraphicName.GuerrillaBase]:                    TacticalGraphicCategory.Areas,
    [TacticalGraphicName.KillZone]:                         TacticalGraphicCategory.Areas,
    [TacticalGraphicName.LandingZone]:                      TacticalGraphicCategory.Areas,
    [TacticalGraphicName.LimitedAccessArea]:                TacticalGraphicCategory.Areas,
    [TacticalGraphicName.NamedAreaOfInterest]:              TacticalGraphicCategory.Areas,
    [TacticalGraphicName.ObjectiveArea]:                    TacticalGraphicCategory.Areas,
    [TacticalGraphicName.PickupZone]:                       TacticalGraphicCategory.Areas,
    [TacticalGraphicName.RefugeeHoldingArea]:               TacticalGraphicCategory.Areas,
    [TacticalGraphicName.StrongPoint]:                      TacticalGraphicCategory.Areas,
    [TacticalGraphicName.TargetAreaOfInterest]:             TacticalGraphicCategory.Areas,
    [TacticalGraphicName.UnexplodedExplosiveOrdnanceArea]:  TacticalGraphicCategory.Areas,

    // ── Boundaries ──────────────────────────────────────────────────────────── OK
    [TacticalGraphicName.Boundary]: TacticalGraphicCategory.Boundaries,

    // ── Defense Operations Planning ─────────────────────────────────────────── OK
    [TacticalGraphicName.AreaDefense]:                      TacticalGraphicCategory.DefenseOperationsPlanning,
    [TacticalGraphicName.Delay]:                            TacticalGraphicCategory.DefenseOperationsPlanning,
    [TacticalGraphicName.MobileDefense]:                    TacticalGraphicCategory.DefenseOperationsPlanning,
    [TacticalGraphicName.Retirement]:                       TacticalGraphicCategory.DefenseOperationsPlanning,
    [TacticalGraphicName.Withdraw]:                         TacticalGraphicCategory.DefenseOperationsPlanning,
    [TacticalGraphicName.WithdrawUnderPressure]:            TacticalGraphicCategory.DefenseOperationsPlanning,

    // ── Enabling Operations Planning ────────────────────────────────────────── OK
    [TacticalGraphicName.Cover]:                            TacticalGraphicCategory.EnablingOperationsPlanning,
    [TacticalGraphicName.ForwardPassageOfLines]:            TacticalGraphicCategory.EnablingOperationsPlanning,
    [TacticalGraphicName.Guard]:                            TacticalGraphicCategory.EnablingOperationsPlanning,
    [TacticalGraphicName.RearwardPassageOfLines]:           TacticalGraphicCategory.EnablingOperationsPlanning,
    [TacticalGraphicName.ReliefInPlace]:                    TacticalGraphicCategory.EnablingOperationsPlanning,
    [TacticalGraphicName.Screen]:                           TacticalGraphicCategory.EnablingOperationsPlanning,

    // ── Field Fortification Symbols ─────────────────────────────────────────── OK
    [TacticalGraphicName.FightingPosition]:                 TacticalGraphicCategory.FieldFortification, // TODO: not in ui yet
    [TacticalGraphicName.FortifiedLine]:                    TacticalGraphicCategory.FieldFortification, // TODO: not in ui yet

    // ── Fire Support Coordination Control Measures ──────────────────────────── OK
    [TacticalGraphicName.FieldsOfFire]:                     TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.FreeFireAreaCircular]:             TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.FreeFireAreaIrregular]:            TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.FreeFireAreaRectangular]:          TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.MunitionFlightPath]:               TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.NoFireAreaCircular]:               TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.NoFireAreaIrregular]:              TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.NoFireAreaRectangular]:            TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.PositionAreaArtilleryCircular]:    TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.PositionAreaArtilleryIrregular]:   TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.PositionAreaArtilleryRectangular]: TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.RestrictiveFireAreaCircular]:      TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.RestrictiveFireAreaIrregular]:     TacticalGraphicCategory.FireSupportCoordination,
    [TacticalGraphicName.RestrictiveFireAreaRectangular]:   TacticalGraphicCategory.FireSupportCoordination,

    // ── Lines ───────────────────────────────────────────────────────────────── OK
    [TacticalGraphicName.BattlefieldHandoverLine]:          TacticalGraphicCategory.Lines,
    [TacticalGraphicName.BridgeheadLine]:                   TacticalGraphicCategory.Lines,
    [TacticalGraphicName.CommonSensorBoundary]:             TacticalGraphicCategory.Lines,
    [TacticalGraphicName.CoordinatedFireLine]:              TacticalGraphicCategory.Lines,
    [TacticalGraphicName.DelayLine]:                        TacticalGraphicCategory.Lines,
    [TacticalGraphicName.EngineerWorkLine]:                 TacticalGraphicCategory.Lines,
    [TacticalGraphicName.FinalCoordinationLine]:            TacticalGraphicCategory.Lines,
    [TacticalGraphicName.FireSupportCoordinationLine]:      TacticalGraphicCategory.Lines,
    [TacticalGraphicName.ForwardEdgeOfBattleArea]:          TacticalGraphicCategory.Lines,
    [TacticalGraphicName.ForwardLineOfOwnTroops]:           TacticalGraphicCategory.Lines,
    [TacticalGraphicName.IntelligenceCoordinationLine]:     TacticalGraphicCategory.Lines,
    [TacticalGraphicName.LimitOfAdvance]:                   TacticalGraphicCategory.Lines,
    [TacticalGraphicName.LineOfContact]:                    TacticalGraphicCategory.Lines,
    [TacticalGraphicName.LineOfDepartureOrLineOfContact]:   TacticalGraphicCategory.Lines,
    [TacticalGraphicName.LineOfDeparture]:                  TacticalGraphicCategory.Lines,
    [TacticalGraphicName.PhaseLine]:                        TacticalGraphicCategory.Lines,
    [TacticalGraphicName.ProbableLineOfDeployment]:         TacticalGraphicCategory.Lines,
    [TacticalGraphicName.ReleaseLine]:                      TacticalGraphicCategory.Lines,
    [TacticalGraphicName.LightLine]: TacticalGraphicCategory.Lines,
    [TacticalGraphicName.HoldingLine]: TacticalGraphicCategory.Lines,
    [TacticalGraphicName.NoFireLine]: TacticalGraphicCategory.Lines,
    [TacticalGraphicName.BattlefieldCoordinationLine]: TacticalGraphicCategory.Lines,
    [TacticalGraphicName.RestrictiveFireLine]:              TacticalGraphicCategory.Lines,

    // ── Mobility and Countermobility Control Measures ─────────────────────────
    [TacticalGraphicName.Abatis]:                           TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ExplosivesPlannedStateOfReadiness]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ExplosivesStateOfReadiness1Safe]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.RoadblockCompleteExecuted]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.AntiTankDitchUnderConstruction]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.AntiTankDitchCompleted]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.AntiTankDitchReinforcedWithMines]: TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireUnspecified]:                       TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireSingleFence]:                       TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireDoubleFence]:                       TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireDoubleApronFence]:                  TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireLowWireFence]:                      TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireHighWireFence]:                     TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireSingleConcertina]:                  TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireDoubleStrandConcertina]:            TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.WireTripleStrandConcertina]:            TacticalGraphicCategory.MobilityAndCountermobility,
    // Convoy Symbols OK
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.HaltedConvoy]:                  TacticalGraphicCategory.MobilityAndCountermobility,
    // [TacticalGraphicName.MovingConvoy]:                  TacticalGraphicCategory.MobilityAndCountermobility,

    // Countermobility OK
    // [TacticalGraphicName.Abatis]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AntiTankDitchCompleted]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AntiTankDitchUnderConstruction]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AntiTankDitchReinforced]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    [TacticalGraphicName.Block]:                            TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.Disrupt]:                          TacticalGraphicCategory.MobilityAndCountermobility,
    // [TacticalGraphicName.ExplosivesPlanned]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.ExplosivesSafe]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.ExplosivesArmedButPassable]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    [TacticalGraphicName.Fix]:                              TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleBelt]:                     TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleFreeArea]:                 TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleGroup]:                    TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleLine]:                     TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleRestrictedArea]:           TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.ObstacleZone]:                     TacticalGraphicCategory.MobilityAndCountermobility,
    // [TacticalGraphicName.RoadblockComplete]:                     TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    [TacticalGraphicName.Turn]:                             TacticalGraphicCategory.MobilityAndCountermobility,
    // Wire obstacles — the tracker names every one `wire, …`, so the members
    // carry a `Wire` prefix and sort together here rather than scattering
    // through the list under D, H, S and T. `WireUnspecified` in particular was
    // a bare `Unspecified`, which said nothing about what it was unspecified
    // about. The names must keep matching the tracker's: `gen-proven-graphics.py`
    // resolves a row by stripping non-alphanumerics and lowercasing, so
    // `wire, double apron fence` → `wiredoubleapronfence` → `WireDoubleApronFence`.
    // [TacticalGraphicName.WireDoubleApronFence]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireDoubleFence]:                  TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireDoubleStrandConcertina]:       TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireHighWireFence]:                TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireLowWireFence]:                 TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireSingleConcertina]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireSingleFence]:                  TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireTripleStrandConcertina]:       TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.WireUnspecified]:                  TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet

    // Mobility OK
    [TacticalGraphicName.AssaultCrossing]:                  TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.Bridge]:                           TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.FerryCrossing]:                    TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.FordDifficult]:                         TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.FordEasy]:                             TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.Gap]:                              TacticalGraphicCategory.MobilityAndCountermobility,
    [TacticalGraphicName.PassageLane]:                      TacticalGraphicCategory.MobilityAndCountermobility,

    // Route Control Measures OK
    [TacticalGraphicName.AlternateSupplyRoute]:             TacticalGraphicCategory.MobilityAndCountermobility,
    // [TacticalGraphicName.AlternateSupplyRouteAlternatingTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AlternateSupplyRouteOneWayTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AlternateSupplyRouteTwoWayTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.AlternatingTrafficRoute]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    [TacticalGraphicName.MainSupplyRoute]:                  TacticalGraphicCategory.MobilityAndCountermobility,
    // [TacticalGraphicName.MainSupplyRouteAlternatingTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.MainSupplyRouteOneWayTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.MainSupplyRouteTwoWayTraffic]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    // [TacticalGraphicName.OneWayTrafficRoute]:             TacticalGraphicCategory.MobilityAndCountermobility, // TODO: not in ui yet
    [TacticalGraphicName.Route]:                            TacticalGraphicCategory.MobilityAndCountermobility,

    // ── Movement and Maneuver ───────────────────────────────────────────────── OK
    [TacticalGraphicName.AviationAxisOfAdvance]:            TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]:    TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.AviationDirectionOfAttack]:           TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.DirectionOfMainAttack]:            TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.DirectionOfMainAttackFeint]:       TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.DirectionOfSupportingAttack]:      TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.Envelopment]:                      TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.FrontalAttack]:                    TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.Infiltration]:                     TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.InfiltrationLane]:                     TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.MainAxisOfAdvance]:                TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.MainAxisOfAdvanceFeint]:           TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.Penetration]:                      TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.SupportingAxisOfAdvance]:                 TacticalGraphicCategory.MovementAndManeuver,
    [TacticalGraphicName.TurningMovement]:                  TacticalGraphicCategory.MovementAndManeuver,

    // ── Offense Operations Planning ─────────────────────────────────────────── OK
    [TacticalGraphicName.Ambush]:                           TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.CordonAndKnock]: TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.Locate]: TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.CordonAndSearch]:                  TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.Counterattack]:                    TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.Exploitation]:                     TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.MovementToContact]:                TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.AdvanceToContact]:                 TacticalGraphicCategory.OffenseOperationsPlanning,
    [TacticalGraphicName.Pursuit]:                          TacticalGraphicCategory.OffenseOperationsPlanning,

    // ── Tactical Mission Tasks ──────────────────────────────────────────────── OK
    [TacticalGraphicName.AttackByFire]:                     TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.TacticalBlock]:                            TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Breach]:                           TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Bypass]:                           TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Canalize]:                         TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Clear]:                            TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Contain]:                          TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Control]:                          TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Destroy]:                          TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Disengage]:                        TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.TacticalDisrupt]:                          TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Exfiltrate]:                       TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.TacticalFix]:                              TacticalGraphicCategory.TacticalMissionTasks,
    // Excluded — see ai/excluded-graphics.md
    // [TacticalGraphicName.FollowAndAssume]:               TacticalGraphicCategory.TacticalMissionTasks,
    // [TacticalGraphicName.FollowAndSupport]:              TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Interdict]:                        TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Isolate]:                          TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Neutralize]:                       TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Occupy]:                           TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Retain]:                           TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Secure]:                           TacticalGraphicCategory.TacticalMissionTasks,
    // [TacticalGraphicName.Seize]:                            TacticalGraphicCategory.TacticalMissionTasks, // TODO: not in ui yet
    [TacticalGraphicName.SupportByFire]:                    TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.Suppress]:                         TacticalGraphicCategory.TacticalMissionTasks,
    [TacticalGraphicName.TacticalTurn]:                             TacticalGraphicCategory.TacticalMissionTasks,

    // ── Target Acquisition Control Measures ─────────────────────────────────── OK
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular]:    TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular]:   TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.BlueKillBoxCircular]:              TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.BlueKillBoxIrregular]:             TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.BlueKillBoxRectangular]:           TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CallForFireZoneCircular]:          TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CallForFireZoneIrregular]:         TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CallForFireZoneRectangular]:       TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetBuildUpAreaCircular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetBuildUpAreaIrregular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetBuildUpAreaRectangular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetValueAreaCircular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetValueAreaIrregular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.TargetValueAreaRectangular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.ZoneOfResponsibilityCircular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.ZoneOfResponsibilityIrregular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.ZoneOfResponsibilityRectangular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CensorZoneCircular]:               TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CensorZoneIrregular]:              TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CensorZoneRectangular]:            TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CriticalFriendlyZoneCircular]:    TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CriticalFriendlyZoneIrregular]:   TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.CriticalFriendlyZoneRectangular]: TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.DeadSpaceAreaCircular]:            TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.DeadSpaceAreaIrregular]:           TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.DeadSpaceAreaRectangular]:         TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.PurpleKillBoxCircular]:            TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.PurpleKillBoxIrregular]:           TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.PurpleKillBoxRectangular]:         TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.WeaponSensorRangeFanCircular]:     TacticalGraphicCategory.TargetAcquisitionControlMeasures,
    [TacticalGraphicName.WeaponSensorRangeFanSector]:       TacticalGraphicCategory.TargetAcquisitionControlMeasures,

    // ── Target Control Measures ─────────────────────────────────────────────── OK
    [TacticalGraphicName.FinalProtectiveFire]:              TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.FireSupportAreaCircular]:          TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.FireSupportAreaIrregular]:         TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.FireSupportAreaRectangular]:       TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.GroupOrSeriesOfTargets]:           TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.LinearSmokeTarget]:                TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.LinearTarget]:                     TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.SmokeObscurant]:            TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.TargetAreaCircular]:               TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.TargetAreaIrregular]:              TacticalGraphicCategory.TargetControlMeasures,
    [TacticalGraphicName.TargetAreaRectangular]:            TacticalGraphicCategory.TargetControlMeasures,
};
