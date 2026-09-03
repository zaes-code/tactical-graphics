import {GRAPHIC_CATEGORIES} from './categories';
import {GRAPHIC_SPECIFICATIONS, TacticalGraphicSpecification, getSpecifications, hasSpecification, listNamesBySpecification} from './specifications';
import {TacticalGraphicName} from './type';

/**
 * The graphics FM 1-02.2 defines and APP-06 Edition E does not. Pinned by name
 * rather than by count so that moving one in or out of APP-06 has to be a
 * deliberate edit to this list, with the Table A-32 lookup that justifies it.
 */
const FM_ONLY_GRAPHICS: TacticalGraphicName[] = [
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.FightingPosition,
    /*
     * **Not APP-06 290600, despite the name.** 290600 is "safe lane or gap" -- a lane
     * *through* an obstacle, drawn as a bar with a splayed cross at each end, lettered
     * T / AM / W / W1 and requiring two anchor points that set its length.
     *
     * FM 1-02.2 Table 5-16's `gap` is "an area free of obstacles that enables forces to
     * maneuver in a tactical formation": two facing brackets with T between them and
     * W / W1 beneath, and no width amplifier at all. The two are different symbols
     * meaning different things, and the shared word in the title is the whole of the
     * resemblance. We draw the FM one; the NATO lane is not implemented.
     * (User's call, 2026-09-01: "we need to differentiate".)
     */
    TacticalGraphicName.Gap,
    TacticalGraphicName.KillZone,
    // FM's movement to contact and APP-06's advance to contact name the same operation
    // and are drawn differently enough to be two graphics: a dropped badge with two
    // contact bolts and flared fins, against a drawn route with one bolt and square
    // shoulders. @see AdvanceToContact, ai/app-6.md
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.ObstacleGroup,
    TacticalGraphicName.PassageLane,
    TacticalGraphicName.UnmannedAircraftCorridor,
];

/**
 * The mirror image: graphics NATO defines and FM 1-02.2 does not.
 *
 * These are what make the specification axis worth having. Until they were added
 * every graphic in the registry was in FM 1-02.2, so filtering by it hid nothing and
 * the axis only ever ran one way. Each was searched for by name in the manual's text
 * before being added; none of them appears there.
 */
const APP6_ONLY_GRAPHICS: TacticalGraphicName[] = [
    TacticalGraphicName.AdvanceToContact,
    // 282003. Neither "overhead wire" nor any of power line / pylon / transmission
    // line appears anywhere in the FM's text.
    TacticalGraphicName.OverheadWire,
    // 290600. The FM's only "safe lane" is the air corridor (170400), which we draw
    // separately; its lane through an obstacle is `passage lane`, lettered differently.
    TacticalGraphicName.SafeLaneOrGap,
    TacticalGraphicName.BattlefieldCoordinationLine,
    TacticalGraphicName.ExtractionZone,
    TacticalGraphicName.FighterEngagementZone,
    TacticalGraphicName.HoldingLine,
    TacticalGraphicName.LightLine,
    TacticalGraphicName.NoFireLine,
    TacticalGraphicName.RegimentalSupportArea,
    // Three target-acquisition zone families APP-06 carries and FM 1-02.2 does not:
    // target build-up area (TBA), target value area (TVAR) and zone of responsibility
    // (ZOR). Labels read off the plates, not inferred from the names.
    TacticalGraphicName.TargetBuildUpAreaIrregular,
    TacticalGraphicName.TargetBuildUpAreaRectangular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaIrregular,
    TacticalGraphicName.TargetValueAreaRectangular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityIrregular,
    TacticalGraphicName.ZoneOfResponsibilityRectangular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    // Plain labelled areas APP-06 carries and FM 1-02.2 does not. Labels off the plates.
    TacticalGraphicName.BombArea,
    TacticalGraphicName.TerminallyGuidedMunitionFootprint,
    TacticalGraphicName.Bridgehead,
    TacticalGraphicName.EnemyPrisonerOfWarHoldingArea,
    TacticalGraphicName.HumanTerrain,
    // Two mission tasks APP-06 draws that FM 1-02.2 does not name. Both reuse an
    // existing construction exactly -- only the letter is theirs.
    TacticalGraphicName.CordonAndKnock,
    // 344300. Four arrows converging on a `D`; FM 1-02.2 never uses the word as a task,
    // and its own `D` belongs to Destroy, which is a solid X. @see Defeat
    TacticalGraphicName.Defeat,
    TacticalGraphicName.Locate,
    // Three APP-06 areas with no FM counterpart. Two carry no label at all -- the
    // plate's template cell is a bare outline -- which the switch default already
    // returns, so they need no case.
    TacticalGraphicName.PenetrationBox,
    TacticalGraphicName.Area,
    TacticalGraphicName.JointTacticalActionArea,
    TacticalGraphicName.SubmarineActionArea,
    TacticalGraphicName.SubmarineGeneratedActionArea,
    TacticalGraphicName.AreaGeneric,
    TacticalGraphicName.ZoneOfFire,
    // Distinguished from each other by hatch texture alone, which is why the tile
    // geometry moved into the library. @see hatchTileSegments
    TacticalGraphicName.RestrictedTerrain,
    TacticalGraphicName.SeverelyRestrictedTerrain,
    // The same runway glyph as Airfield, on a drawn area.
    TacticalGraphicName.AirfieldZone,
    // Three APP-06 lines that are simple lines here: drawn, labelled at both ends,
    // nothing decorating the line itself. Line generic carries no letter at all.
    TacticalGraphicName.LineGeneric,
    TacticalGraphicName.HandoverLine,
    TacticalGraphicName.Capture,
    TacticalGraphicName.PsyOpsZoneIrregular,
    TacticalGraphicName.PsyOpsZoneRectangular,
    TacticalGraphicName.PsyOpsZoneCircular,
    TacticalGraphicName.AvenueOfApproach,
    TacticalGraphicName.CounterattackByFire,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Escort,
    TacticalGraphicName.Evacuate,
    TacticalGraphicName.Recover,
    TacticalGraphicName.DecisionLine,
    TacticalGraphicName.MobilityCorridor,
    TacticalGraphicName.ObstacleBypassEasy,
    TacticalGraphicName.ObstacleBypassDifficult,
    TacticalGraphicName.ObstacleBypassImpossible,
    TacticalGraphicName.Mineline,
    // FM table 5-21 lists a `mine cluster` too, but as a minefield SECTOR 1 MODIFIER
    // -- a glyph that goes inside another symbol. APP-06 290400 is a protection LINE.
    // Same words, different thing; this stays APP-06 only. @see the retagging note below.
    TacticalGraphicName.MineCluster,
    TacticalGraphicName.RaftSite,
    TacticalGraphicName.FortifiedPosition,
    TacticalGraphicName.NamedAreaOfInterestLine,
    // The toxic-industrial-material variants only. Their four parents moved to BOTH on
    // 2026-09-03 -- FM table 5-28 draws all four -- but the manual has no TIM subtype.
    TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial,
    // The two that write their abbreviation into their own broken boundary.
    TacticalGraphicName.ArtilleryManeuverArea,
    TacticalGraphicName.ArtilleryReservedArea,
];

describe('graphic specifications', () => {
    const names = Object.keys(GRAPHIC_SPECIFICATIONS) as TacticalGraphicName[];

    it('classifies exactly the graphics the category table classifies', () => {
        // Both are exhaustive Records over TacticalGraphicName, so they cannot
        // disagree without one of them having been hand-edited wrongly.
        expect(names.slice().sort()).toEqual(Object.keys(GRAPHIC_CATEGORIES).sort());
    });

    it('gives every graphic at least one specification', () => {
        for (const name of names) {
            expect(getSpecifications(name).length).toBeGreaterThan(0);
        }
    });

    it('lists only the pinned exceptions as absent from FM 1-02.2', () => {
        const absent = names.filter(name => !hasSpecification(name, TacticalGraphicSpecification.FM1_02_2));
        expect(absent.sort()).toEqual(APP6_ONLY_GRAPHICS.slice().sort());
    });

    it('lists only the pinned exceptions as absent from APP-06', () => {
        const absent = names.filter((name) => !hasSpecification(name, TacticalGraphicSpecification.APP6));
        expect(absent.sort()).toEqual(FM_ONLY_GRAPHICS.slice().sort());
    });

    it('partitions the registry both ways', () => {
        const inApp6 = listNamesBySpecification(TacticalGraphicSpecification.APP6);
        const inFm = listNamesBySpecification(TacticalGraphicSpecification.FM1_02_2);
        expect(inApp6.length + FM_ONLY_GRAPHICS.length).toBe(names.length);
        expect(inFm.length + APP6_ONLY_GRAPHICS.length).toBe(names.length);
        // Neither specification covers the whole registry on its own, which is the
        // whole point of carrying the axis.
        expect(inApp6.length).toBeLessThan(names.length);
        expect(inFm.length).toBeLessThan(names.length);
    });

    it('returns names in enum declaration order', () => {
        const inApp6 = listNamesBySpecification(TacticalGraphicSpecification.APP6);
        const expected = names.filter((name) => !FM_ONLY_GRAPHICS.includes(name));
        expect(inApp6).toEqual(expected);
    });

    /*
     * The eight retagged on 2026-09-03, pinned by the FM table that carries each.
     *
     * Every one of them had been APP6_ONLY on the strength of a name search over
     * `docs/FM_1-02.2.txt` that came back empty -- and the search was the defect, not the
     * manual. **FM tables name a symbol by its position under a heading.** Table 5-28's
     * four contaminated areas are rows reading `biological`, `chemical`, `nuclear` and
     * `radiological` under a heading `Contaminated area`, so the phrase this library uses
     * appears nowhere; table 5-20 does the same to the minefield family, and table 5-15
     * puts `demonstration` under `Variations of Tactical Deception`.
     *
     * Pinned individually rather than trusted to the list above, because the list above
     * is the thing that was wrong. Each plate was opened and read.
     */
    const RETAGGED_TO_BOTH: [TacticalGraphicName, string][] = [
        [TacticalGraphicName.BiologicalContaminatedArea, 'FM table 5-28, row "biological"'],
        [TacticalGraphicName.ChemicalContaminatedArea, 'FM table 5-28, row "chemical"'],
        [TacticalGraphicName.NuclearContaminatedArea, 'FM table 5-28, row "nuclear"'],
        [TacticalGraphicName.RadiologicalContaminatedArea, 'FM table 5-28, row "radiological"'],
        [TacticalGraphicName.MinefieldDynamicDepiction, 'FM table 5-20, row "dynamic depiction minefield"'],
        [TacticalGraphicName.MinedAreaFenced, 'FM table 5-20, row "mined area, fenced"'],
        [TacticalGraphicName.TripWire, 'FM table 5-20, row "tripwire"'],
        [TacticalGraphicName.Demonstration, 'FM table 5-15, "Variations of Tactical Deception", labelled DEM'],
    ];

    it.each(RETAGGED_TO_BOTH)('%s is in both catalogs (%s)', (name) => {
        expect(getSpecifications(name)).toEqual([TacticalGraphicSpecification.FM1_02_2, TacticalGraphicSpecification.APP6]);
    });

    it('does not hand out a mutable specification array', () => {
        // getSpecifications returns one of two shared consts, so a caller that
        // pushed into it would corrupt every other graphic sharing that value.
        const first = getSpecifications(TacticalGraphicName.PhaseLine);
        const second = getSpecifications(TacticalGraphicName.Boundary);
        expect(first).toBe(second);
        expect(Object.isFrozen(first) || first === second).toBe(true);
    });
});
