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
    TacticalGraphicName.NamedAreaOfInterestLine,
    // The toxic-industrial-material variants only. Their four parents moved to BOTH on
    // 2026-09-03 -- FM table 5-28 draws all four -- but the manual has no TIM subtype.
    TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial,
    // The two that write their abbreviation into their own broken boundary.
    TacticalGraphicName.ArtilleryManeuverArea,
    TacticalGraphicName.ArtilleryReservedArea,
    /*
     * APP-06 §8.11, the maritime control lines (220100-220109), added 2026-09-03.
     *
     * The FM has no bearing line and no rhumb line of any kind, and this was checked the
     * way the 2026-09-03 retagging batch established it has to be: by **searching the
     * manual's text**, not by trusting that a maritime chapter has no Army counterpart.
     * Eight graphics moved APP6_ONLY -> BOTH that same day because the search had been
     * skipped, so what it returned is recorded here rather than the conclusion alone:
     *
     *   bearing line · rhumb · jammer · direction finder · acoustic   0 hits each
     *   bearing                                                       2 hits, both the
     *                                                                 *same glossary entry*
     *
     * That last one is the trap in miniature and cuts the way that matters. `direction
     * finding` really is in the manual -- defined at the term list and again in the
     * glossary, quoting JP 3-85 -- and it is still not a symbol. A definition is not a
     * control measure, so 220108 stays APP-06 only; a search that stopped at "found it"
     * would have tagged it BOTH, which is the mirror image of the mistake the batch fixed.
     */
    TacticalGraphicName.BearingLine,
    TacticalGraphicName.BearingLineElectronic,
    TacticalGraphicName.BearingLineElectromagneticWarfare,
    TacticalGraphicName.BearingLineAcoustic,
    TacticalGraphicName.BearingLineAcousticAmbiguous,
    TacticalGraphicName.BearingLineTorpedo,
    TacticalGraphicName.BearingLineElectroOpticalIntercept,
    TacticalGraphicName.BearingLineJammer,
    TacticalGraphicName.BearingLineRadioDirectionFinder,
    TacticalGraphicName.NavigationalRhumbLine,
    // APP-06 240804. `aegis`, `NSFS` and `naval surface fire` are all absent from the FM;
    // `naval gunfire` is present, but as a *section heading* over the fire support areas
    // and the fire support station -- which this library covers under their own codes.
    TacticalGraphicName.TargetAreaSingleTargetAegis,
    /*
     * APP-06 §8.10 Table 8-12, the maritime control areas (group 20), added 2026-09-04.
     *
     * Searched the same way, and recorded rather than concluded:
     *
     *   launch area · defended area · no attack · NOTACK · ship area · cued acquisition
     *                                                                   0 hits each
     *   radar search                                                    4 hits, and every
     *                                                                   one of them prose
     *
     * The four are the glossary and term-list definitions of an artillery target
     * intelligence zone and a call for fire zone -- *"a weapons locating radar search area
     * in enemy territory"* -- two graphics this library already draws under 241401 and
     * 241001. Same words, different thing, exactly as `mine cluster` was. A definition is
     * not a plate.
     */
    TacticalGraphicName.LaunchAreaEllipse,
    TacticalGraphicName.DefendedAreaEllipse,
    TacticalGraphicName.DefendedAreaRectangle,
    TacticalGraphicName.NoAttackZone,
    TacticalGraphicName.ShipAreaOfInterestEllipse,
    TacticalGraphicName.ShipAreaOfInterestRectangle,
    TacticalGraphicName.ActiveManeuverArea,
    TacticalGraphicName.CuedAcquisitionDoctrine,
    TacticalGraphicName.RadarSearchDoctrine,
    /*
     * APP-06 152200. `search area` is in the manual six times and never as a symbol -- the
     * hits are "target acquisition search areas" in the common sensor boundary's definition
     * and "weapons locating radar search area" in the two zones above. `reconnaissance
     * area` is absent entirely, and its Table 8-10 neighbours 151900, 152300, 152400 and
     * 152500 are all APP-06 only.
     *
     * **The convoys are deliberately not here.** FM table 5-18 draws both, which is why
     * they are `BOTH` -- and they are the counter-example that keeps this list honest, added
     * in the same commit as the nine above.
     */
    TacticalGraphicName.SearchArea,
    /*
     * APP-06 218400, added 2026-09-04. `navigational` appears in FM 1-02.2 fourteen times
     * and never as a symbol -- every hit is prose ("navigational aids", "navigation
     * warfare") or a glossary entry. The manual has no maritime chapter, and this is a
     * maritime control measure whose neighbours in group 21 are all point symbols.
     */
    TacticalGraphicName.NavigationalLine,
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
