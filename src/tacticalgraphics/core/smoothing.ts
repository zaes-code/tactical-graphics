import type {Feature, Position} from 'geojson';
import {getSmoothLines} from './config';
import {TacticalGraphicName as N} from './type';

/** Corner-cutting passes. Each doubles the vertex count; three reads as a curve at any zoom a line is drawn at. */
export const CHAIKIN_ITERATIONS = 3;

function cut(a: Position, b: Position): [Position, Position] {
    return [
        [0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
        [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]],
    ];
}

/**
 * Chaikin corner cutting on an open line. The two ends stay where they were drawn and keep
 * their direction, so end marks and end labels keep their anchor; every inner vertex is cut away.
 */
export function chaikinLine(coords: Position[], iterations = CHAIKIN_ITERATIONS): Position[] {
    if (coords.length < 3) return coords;
    let line = coords;
    for (let i = 0; i < iterations; i++) {
        const next: Position[] = [line[0]];
        for (let j = 0; j < line.length - 1; j++) {
            const [q, r] = cut(line[j], line[j + 1]);
            if (j > 0) next.push(q);
            if (j < line.length - 2) next.push(r);
        }
        next.push(line[line.length - 1]);
        line = next;
    }
    return line;
}

/** Chaikin corner cutting on a closed ring (first == last). Every corner is cut, the closing one included. */
export function chaikinRing(ring: Position[], iterations = CHAIKIN_ITERATIONS): Position[] {
    if (ring.length < 4) return ring;
    let open = ring.slice(0, -1);
    for (let i = 0; i < iterations; i++) {
        const next: Position[] = [];
        for (let j = 0; j < open.length; j++) next.push(...cut(open[j], open[(j + 1) % open.length]));
        open = next;
    }
    return [...open, open[0]];
}

function along(from: Position, to: Position, distanceOver: Position[], fraction: number): Position {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const reach = Math.hypot(distanceOver[1][0] - distanceOver[0][0], distanceOver[1][1] - distanceOver[0][1]) * fraction;
    if (length === 0) return from;
    return [from[0] + ((to[0] - from[0]) / length) * reach, from[1] + ((to[1] - from[1]) / length) * reach];
}

/**
 * An arrow's route smoothed everywhere but the drawn segments it keeps straight.
 *
 * **The arrow generators build on their end segments.** The head, the aviation twist and its
 * bars, the helicopter rotor's anchor and the frontal attack's bar are all laid on the last
 * segment; the aviation direction of attack's bow tie and the turning movement's bar on the
 * first. So those segments are kept whole, exactly as drawn, and every one of those parts comes
 * out as it does on a hard line. The corner next to a kept segment is still rounded: a control
 * point is added on that segment's own line, half the neighboring segment back, so the curve
 * arrives already heading along it and the joint is smooth.
 */
export function chaikinKeepingEnds(coords: Position[], keepFirst: boolean, keepLast: boolean, iterations = CHAIKIN_ITERATIONS): Position[] {
    const n = coords.length;
    if (n < 3) return coords;
    const from = keepFirst ? 1 : 0;
    const to = keepLast ? n - 2 : n - 1;
    if (to - from < 1) return coords;
    const control = coords.slice(from, to + 1);
    if (keepFirst) {
        // On the first segment's line beyond its end, toward where the route goes next.
        control.splice(1, 0, along(coords[1], [2 * coords[1][0] - coords[0][0], 2 * coords[1][1] - coords[0][1]], [coords[1], coords[2]], 0.5));
    }
    if (keepLast) {
        const joint = coords[n - 2];
        control.splice(control.length - 1, 0, along(joint, [2 * joint[0] - coords[n - 1][0], 2 * joint[1] - coords[n - 1][1]], [coords[n - 3], joint], 0.5));
    }
    return [...(keepFirst ? [coords[0]] : []), ...chaikinLine(control, iterations), ...(keepLast ? [coords[n - 1]] : [])];
}

/**
 * How a graphic's drawn base is smoothed.
 *
 * - `line`: an open path, both ends fixed.
 * - `area`: the closed outline.
 * - `arrow`: an open path whose last drawn segment, where the head is built, stays straight.
 * - `arrowFixedTail`: as `arrow`, and the first drawn segment stays straight too, for the
 *   aviation direction of attack, whose bow tie is marked on it.
 * - `corridor`: an arrow with a body, two walls a half-width either side of the route. The
 *   route stays as drawn and the generator rounds each wall after offsetting it, keeping the
 *   last segment straight. @see MovementGraphicBase.parallel
 * - `corridorFixedTail`: as `corridor`, keeping the first segment too, for the turning
 *   movement's bar.
 * - `ring`: a closed outline stored as a line. The route stays as drawn and the generator
 *   rounds each ring it builds. @see MinimumSafeDistanceMultipleStrike
 */
export type SmoothingKind = 'line' | 'area' | 'arrow' | 'arrowFixedTail' | 'corridor' | 'corridorFixedTail' | 'ring';

/**
 * **Every graphic smooth lines applies to, and how.** One statement read by every engine.
 *
 * The rule is the base, not the look: a graphic is here when the user draws it as a free path
 * of any number of points (a route, an outline). A graphic whose points are anchors with fixed
 * meanings (the mission tasks, the two- and three-point symbols, the rectangles) is absent.
 * So are the free paths that mark every vertex: the air corridor family draws a circle at each
 * turn point and the overhead wire a pylon at each, and `Contain` reads its two points as anchors.
 *
 * @see SmoothingKind, chaikinKeepingEnds
 */
export const SMOOTHED_GRAPHICS: Readonly<Partial<Record<N, SmoothingKind>>> = Object.freeze({
    // ── Lines (Phaseline and its paints) ──
    [N.PhaseLine]: 'line',
    [N.ForwardEdgeOfBattleArea]: 'line',
    [N.ReleaseLine]: 'line',
    [N.BridgeheadLine]: 'line',
    [N.BattlefieldHandoverLine]: 'line',
    [N.DelayLine]: 'line',
    [N.FinalCoordinationLine]: 'line',
    [N.LimitOfAdvance]: 'line',
    [N.LineOfDeparture]: 'line',
    [N.LineOfDepartureOrLineOfContact]: 'line',
    [N.ProbableLineOfDeployment]: 'line',
    [N.FireSupportCoordinationLine]: 'line',
    [N.CoordinatedFireLine]: 'line',
    [N.Boundary]: 'line',
    [N.Route]: 'line',
    [N.MainSupplyRoute]: 'line',
    [N.AlternateSupplyRoute]: 'line',
    [N.CommonSensorBoundary]: 'line',
    [N.LightLine]: 'line',
    [N.LineGeneric]: 'line',
    [N.HandoverLine]: 'line',
    [N.NamedAreaOfInterestLine]: 'line',
    [N.HoldingLine]: 'line',
    [N.NoFireLine]: 'line',
    [N.BattlefieldCoordinationLine]: 'line',
    [N.RestrictiveFireLine]: 'line',
    [N.IntelligenceCoordinationLine]: 'line',
    [N.EngineerWorkLine]: 'line',
    [N.IdentificationFriendOrFoeOff]: 'line',
    [N.IdentificationFriendOrFoeOn]: 'line',
    [N.MunitionFlightPath]: 'line',

    // ── Decorated lines: teeth, merlons, scallops, mines and wire are laid along the path ──
    [N.Abatis]: 'line',
    [N.AntiTankDitchUnderConstruction]: 'line',
    [N.AntiTankDitchCompleted]: 'line',
    [N.AntiTankDitchReinforcedWithMines]: 'line',
    [N.DecisionLine]: 'line',
    [N.FortifiedLine]: 'line',
    [N.ForwardLineOfOwnTroops]: 'line',
    [N.LineOfContact]: 'line',
    [N.Mineline]: 'line',
    [N.MobilityCorridor]: 'line',
    [N.ObstacleLine]: 'line',
    [N.WireUnspecified]: 'line',
    [N.WireSingleFence]: 'line',
    [N.WireDoubleFence]: 'line',
    [N.WireDoubleApronFence]: 'line',
    [N.WireLowWireFence]: 'line',
    [N.WireHighWireFence]: 'line',
    [N.WireSingleConcertina]: 'line',
    [N.WireDoubleStrandConcertina]: 'line',
    [N.WireTripleStrandConcertina]: 'line',

    // ── Line arrows: the route is smoothed, the head's segment stays straight ──
    [N.AviationDirectionOfAttack]: 'arrowFixedTail',
    [N.DirectionOfMainAttack]: 'arrow',
    [N.DirectionOfMainAttackFeint]: 'arrow',
    [N.DirectionOfSupportingAttack]: 'arrow',

    // ── Corridor arrows: the body's walls are rounded, the head's segment stays straight ──
    [N.AdvanceToContact]: 'corridor',
    [N.AttackHelicopterAxisOfAdvance]: 'corridor',
    [N.AvenueOfApproach]: 'corridor',
    [N.AviationAxisOfAdvance]: 'corridor',
    [N.Counterattack]: 'corridor',
    [N.CounterattackByFire]: 'corridor',
    [N.FrontalAttack]: 'corridor',
    [N.MainAxisOfAdvance]: 'corridor',
    [N.MainAxisOfAdvanceFeint]: 'corridor',
    [N.SupportingAxisOfAdvance]: 'corridor',
    [N.TurningMovement]: 'corridorFixedTail',

    // ── Areas (AreaGraphic and its paints) ──
    [N.ObjectiveArea]: 'area',
    [N.AttackPosition]: 'area',
    [N.NamedAreaOfInterest]: 'area',
    [N.TargetAreaOfInterest]: 'area',
    [N.ForwardArmingAndRefuelingPoint]: 'area',
    [N.AssaultPosition]: 'area',
    [N.AreaOfOperations]: 'area',
    [N.BaseCamp]: 'area',
    [N.GuerrillaBase]: 'area',
    [N.DetaineeHoldingArea]: 'area',
    [N.BombArea]: 'area',
    [N.TerminallyGuidedMunitionFootprint]: 'area',
    [N.Bridgehead]: 'area',
    [N.EnemyPrisonerOfWarHoldingArea]: 'area',
    [N.HumanTerrain]: 'area',
    [N.PenetrationBox]: 'area',
    [N.Area]: 'area',
    [N.JointTacticalActionArea]: 'area',
    [N.SubmarineActionArea]: 'area',
    [N.SubmarineGeneratedActionArea]: 'area',
    [N.AreaGeneric]: 'area',
    [N.ZoneOfFire]: 'area',
    [N.RestrictedTerrain]: 'area',
    [N.SeverelyRestrictedTerrain]: 'area',
    [N.BiologicalContaminatedArea]: 'area',
    [N.BiologicalContaminatedAreaToxicIndustrialMaterial]: 'area',
    [N.ChemicalContaminatedArea]: 'area',
    [N.ChemicalContaminatedAreaToxicIndustrialMaterial]: 'area',
    [N.NuclearContaminatedArea]: 'area',
    [N.RadiologicalContaminatedArea]: 'area',
    [N.RadiologicalContaminatedAreaToxicIndustrialMaterial]: 'area',
    [N.ArtilleryManeuverArea]: 'area',
    [N.ArtilleryReservedArea]: 'area',
    [N.AssemblyArea]: 'area',
    [N.EngagementArea]: 'area',
    [N.RefugeeHoldingArea]: 'area',
    [N.BrigadeSupportArea]: 'area',
    [N.DivisionSupportArea]: 'area',
    [N.CorpsSupportArea]: 'area',
    [N.FighterEngagementZone]: 'area',
    [N.ExtractionZone]: 'area',
    [N.RegimentalSupportArea]: 'area',
    [N.DropZone]: 'area',
    [N.LandingZone]: 'area',
    [N.KillZone]: 'area',
    [N.PickupZone]: 'area',
    [N.AirfieldZone]: 'area',
    [N.RadiationDoseRateContourLine]: 'area',
    [N.MinefieldDynamicDepiction]: 'area',
    [N.MinedArea]: 'area',
    [N.MinedAreaFenced]: 'area',
    [N.PsyOpsZoneIrregular]: 'area',
    [N.BattlePosition]: 'area',
    [N.BattlePositionPreparedButNotOccupied]: 'area',
    [N.StrongPoint]: 'area',
    [N.FreeFireAreaIrregular]: 'area',
    [N.NoFireAreaIrregular]: 'area',
    [N.RestrictiveFireAreaIrregular]: 'area',
    [N.PositionAreaArtilleryIrregular]: 'area',
    [N.ArtilleryTargetIntelligenceZoneIrregular]: 'area',
    [N.CallForFireZoneIrregular]: 'area',
    [N.TargetBuildUpAreaIrregular]: 'area',
    [N.TargetValueAreaIrregular]: 'area',
    [N.ZoneOfResponsibilityIrregular]: 'area',
    [N.CensorZoneIrregular]: 'area',
    [N.CriticalFriendlyZoneIrregular]: 'area',
    [N.DeadSpaceAreaIrregular]: 'area',
    [N.BlueKillBoxIrregular]: 'area',
    [N.PurpleKillBoxIrregular]: 'area',
    [N.FireSupportAreaIrregular]: 'area',
    [N.TargetAreaIrregular]: 'area',
    [N.HighDensityAirspaceControlZone]: 'area',
    [N.RestrictedOperationsZone]: 'area',
    [N.AirToAirRefuelingRestrictedOperationsZone]: 'area',
    [N.UnmannedAircraftRestrictedOperationsZone]: 'area',
    [N.WeaponEngagementZone]: 'area',
    [N.JointEngagementZone]: 'area',
    [N.MissileEngagementZone]: 'area',
    [N.LowAltitudeMissileEngagementZone]: 'area',
    [N.HighAltitudeMissileEngagementZone]: 'area',
    [N.ShortRangeAirDefenseEngagementZone]: 'area',
    [N.WeaponsFreeZone]: 'area',
    [N.AirSpaceCoordinationAreaIrregular]: 'area',
    [N.UnexplodedExplosiveOrdnanceArea]: 'area',
    [N.AirheadLine]: 'area',
    [N.LimitedAccessArea]: 'area',
    [N.SmokeObscurant]: 'area',
    [N.GroupOrSeriesOfTargets]: 'area',

    // ── Decorated areas ──
    [N.Encirclement]: 'area',
    [N.FortifiedArea]: 'area',
    [N.ObstacleBelt]: 'area',
    [N.ObstacleZone]: 'area',
    [N.ObstacleGroup]: 'area',
    [N.ObstacleFreeArea]: 'area',
    [N.ObstacleRestrictedArea]: 'area',

    // ── Rings stored as a line ──
    [N.MinimumSafeDistanceMultipleStrike]: 'ring',
});

/** How `name` is smoothed, or `undefined` when smooth lines never touches it. */
export function smoothingKindOf(name: N | string): SmoothingKind | undefined {
    return SMOOTHED_GRAPHICS[name as N];
}

/**
 * The feature a generator builds its **line work** from: the drawn base itself, or, with
 * `smoothLines` on and `name` in {@link SMOOTHED_GRAPHICS}, a smoothed copy of it.
 *
 * Only the line work. Handles and labels keep the drawn points, and so does everything that
 * is saved, so editing still moves what the user placed and a file says nothing about the
 * setting. `drawn` is in generator order, so an arrow's tip is its last vertex.
 */
export function smoothedForGenerator(name: N | string, drawn: Feature): Feature {
    const kind = smoothingKindOf(name);
    // A corridor's route and a ring's points stay as drawn: the generator rounds what it
    // builds from them. @see SmoothingKind
    if (!kind || kind === 'corridor' || kind === 'corridorFixedTail' || kind === 'ring' || !getSmoothLines()) return drawn;
    const geometry = drawn.geometry;
    if (geometry.type === 'LineString' && geometry.coordinates.length >= 3) {
        const coordinates = kind === 'line'
            ? chaikinLine(geometry.coordinates)
            : chaikinKeepingEnds(geometry.coordinates, kind === 'arrowFixedTail', kind !== 'area');
        return {...drawn, geometry: {...geometry, coordinates}};
    }
    if (geometry.type === 'Polygon' && geometry.coordinates[0]?.length >= 4) {
        return {...drawn, geometry: {...geometry, coordinates: geometry.coordinates.map(ring => chaikinRing(ring))}};
    }
    return drawn;
}
