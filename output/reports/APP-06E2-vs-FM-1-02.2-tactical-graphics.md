# APP-06 Edition E Version 2 vs FM 1-02.2 tactical-graphics comparison

**Report date:** 21 August 2026  
**Primary sources:** NATO APP-06(E)(2), *NATO Joint Military Symbology* (868 pages; Chapter 8 and Annex A Table A-32), and US Army FM 1-02.2, *Military Symbols* (296 pages; Chapters 5-6).

## Executive conclusion

For the 284 tactical graphics currently provided by this project, 211 map to both specifications, 9 occur only in FM 1-02.2, and 64 occur only in APP-06(E)(2). The original version of this report called 210 of the shared mappings “1:1.” That claim was too strong: their normative geometry/templates match and their checked fixed labels match, but the review did not exhaustively compare every optional amplifier, value transformation, and label placement. Under the stricter definition that identical API properties must produce visually identical output, those 210 are **candidate 1:1 matches pending full label/amplifier parity verification**. One shared graphic already has a confirmed amplifier-semantic conflict.

The dominant finding is interoperability, not divergence: the two land/control-measure catalogs are strongly harmonized. Most apparent differences are spelling, hierarchy, or noun-versus-verb naming. The dangerous cases are the few where the operational concept sounds equivalent but the construction is not, especially Movement to Contact versus Advance to Contact.

| Classification | Count | Meaning |
| --- | --- | --- |
| Candidate 1:1 shared | 210 | Geometry/template matches and checked fixed labels match; exhaustive optional-amplifier and placement parity is not yet proven. |
| Confirmed not 1:1 | 1 | Same visible rectangular-target family, but the AN amplifier has conflicting semantics. |
| FM 1-02.2 only | 9 | Provided graphic has no matching APP-06(E)(2) Chapter 8 entity. |
| APP-06 only | 64 | Provided graphic has no matching FM 1-02.2 Chapters 5-6 entry. |
| Total provided | 284 | Union of the current project catalog. |

## Scope and method

This is a comparison of the tactical graphics provided by this repository, not a claim that the repository implements every symbol in either 800-series publication. APP-06 Chapter 8 also contains maritime, sustainment, intelligence, parent taxonomy rows, and many point symbols rendered by SIDC-oriented point-symbol software rather than this multi-point geometry library. Those out-of-library families are discussed under “Document-level coverage limits.”

A graphic may be certified as 1:1 only when all of the following agree:

- the normative template/line work;
- the construction geometry and meaningful anchor/control-point count;
- fixed identifying text, optional amplifier eligibility, field semantics, formatting, ordering, and placement;
- status variants that change the visible line work.

Differences in capitalization, British/US spelling, catalog hierarchy, or noun-versus-verb naming were recorded but did not by themselves make the graphic non-1:1. APP-06’s Template column was treated as normative; its Example column was used as explanatory context, not as the definition. Annex A Table A-32 six-digit entity codes were used as stable NATO identifiers.

The comparison combined: complete text extraction and code-anchored inventory matching; visual review of 275 APP-06 template/example pairs against the current shared paint output; and a rule-level pass over 141 APP-06 construction statements. Earlier automated counts that recognized only phrases such as “requires two anchor points” missed 59 differently worded rules; the final classification accounts for those formulations. The visual sweep used canned bases and did **not** populate every optional amplifier. It therefore proves template/geometry agreement, not full label parity. Where FM supplies a template but no explicit anchor count, matching visible geometry plus the absence of a conflicting construction statement is a candidate match; it is not proof that FM mandates the same editor interaction.

## Shared graphics that are not strict 1:1

| Graphic | APP-06 code | Difference and impact |
| --- | --- | --- |
| target area rectangular | 240802 | Not strict 1:1 amplifier semantics: APP-06 240802 uses centre + length (AM1) + width (AM) and Target Attitude (AN, mils); FM permits four grids or centre + length/width and uses AN as altitude. |

### The most important false equivalence

| Property | FM 1-02.2: Movement to Contact | APP-06 342900: Advance to Contact |
| --- | --- | --- |
| Catalog status | FM-only | APP-06-only |
| Construction | One dropped point; fixed badge | Drawn route; N points, 3-50 |
| Arrow head | Flared, swept-back fins | Square shoulders |
| Contact marks | Two bolts, upper and lower flanks | One bolt, lower flank |
| Amplifiers | None on the template | T designation; W/W1 start and projected-end date-time groups |

These must not be merged merely because the operational concepts are close. Doing so produces a hybrid that conforms to neither document.

### Construction ambiguities that are not counted as cross-standard differences

- APP-06 Cover uses four points (two endpoints for each arrow); Guard and Screen inherit that family rule. FM 1-02.2 describes independently oriented and elongatable arrows but does not prescribe an editor anchor count. The normative visible symbol agrees, so these are classified 1:1 with an interaction-model caveat.
- APP-06 obstacle-effect Turn states a 90-degree arc while its prose is internally inconsistent about whether the construction has two or three anchor points. FM’s normative visible Turn agrees. This is an APP-06 drafting ambiguity, not enough evidence for a cross-standard graphic difference.

## Naming differences that do not change the graphic

| FM 1-02.2 wording | APP-06 wording | Assessment |
| --- | --- | --- |
| Penetration | Penetrate | Same symbol; noun versus mission verb. |
| Infiltration | Infiltrate | Same symbol; noun versus mission verb. |
| Pursuit | Pursue | Same symbol; noun versus mission verb. |
| Envelopment | Envelop | Same symbol; noun versus mission verb. |
| Movement to contact | Advance to contact | Not the same symbol; kept as two one-sided entries. |
| Forward line of own troops | Forward line of troops | Same line work; shorter NATO name. |
| Restrictive fire area | Restricted fire area | Same symbol family; terminology differs. |
| Obstacle free area | Obstacle free zone | Same symbol; area/zone wording differs. |
| Minimum-risk route | Temporary minimum-risk route | Same symbol; NATO name is more specific. |
| Ferry crossing | Ferry | Same symbol; shortened NATO name. |

APP-06 also nests axis-of-advance and direction-of-attack variants as subtypes, while the FM/library catalog exposes them as individual graphic names. That is a taxonomy difference, not a shape difference.

## Graphics present only in FM 1-02.2

| Graphic | Assessment |
| --- | --- |
| axis of attack | Registered FM family graphic; no APP-06 entity mapping. |
| unmanned aircraft (UA) corridor | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| delay line | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| common sensor boundary | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| passage lane | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| kill zone | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| obstacle group | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| movement to contact | No plausible APP-06(E)(2) Table A-32 counterpart found. |
| fighting position | No plausible APP-06(E)(2) Table A-32 counterpart found. |

Delay Line must not be matched to APP-06 “Delay”: the NATO entry is a tactical mission task, not the FM line graphic.

## Graphics present only in APP-06(E)(2)

| Graphic | APP-06 code | APP-06 entity name |
| --- | --- | --- |
| counterattack by fire | 340700 | Counter-Attack by Fire |
| avenue of approach | 152300 | Avenue of Approach |
| light line | 110200 | Light Line |
| line, generic | 110400 | Line, Generic |
| handover line | 141800 | Handover Line (HOL) |
| named area of interest line | 142000 | Named Area of Interest Line (NAI) |
| holding line | 141500 | Holding Line (HL) |
| no fire line | 260300 | No Fire Line |
| battlefield coordination line | 260400 | Battlefield Coordination Line |
| bomb area | 240808 | Bomb Area |
| terminally guided munition footprint | 242000 | Terminally Guided Munition Footprint (TGMF) |
| bridgehead | 120800 | Bridgehead |
| enemy prisoner of war holding area | 310200 | Enemy Prisoner of War Holding Area |
| human terrain | 370100 | Human Terrain |
| penetration box | 151900 | Penetration Box |
| area | 150100 | Area |
| joint tactical action area | 150501 | Joint Tactical Action Area (JTAA) |
| area, generic | 120700 | Area, Generic |
| zone of fire | 242600 | Zone of Fire |
| restricted terrain | 152400 | Restricted Terrain |
| severely restricted terrain | 152500 | Severely Restricted Terrain |
| biological contaminated area | 271700 | Biological Contaminated Area |
| chemical contaminated area | 271800 | Chemical Contaminated Area |
| nuclear contaminated area | 271900 | Nuclear Contaminated Area |
| radiological contaminated area | 272000 | Radiological Contaminated Area |
| artillery maneuver area | 242400 | Artillery Manoeuvre Area (AMA) |
| artillery reserved area | 242500 | Artillery Reserved Area (ARA) |
| fighter engagement zone | 171400 | Fighter Engagement Zone (FEZ) |
| extraction zone | 150700 | Extraction Zone (EZ) |
| regimental support area | 310500 | Regimental Support Area |
| airfield zone | 120400 | Airfield Zone |
| minefield, dynamic depiction | 270707 | Minefield, Dynamic Depiction |
| mined area, fenced | 270801 | Mined Area, Fenced |
| PsyOps zone, irregular | 242701 | PsyOps Zone, Irregular |
| PsyOps zone, rectangular | 242702 | PsyOps Zone, Rectangular |
| target build up area irregular | 241701 | Irregular |
| target build up area rectangular | 241702 | Rectangular |
| target value area irregular | 241801 | Irregular |
| target value area rectangular | 241802 | Rectangular |
| zone of responsibility irregular | 241901 | Irregular |
| zone of responsibility rectangular | 241902 | Rectangular |
| cordon and knock | 342600 | Cordon and Knock |
| locate | 343900 | Locate |
| deny | 343400 | Deny |
| target build up area circular | 241703 | Circular |
| target value area circular | 241803 | Circular |
| zone of responsibility circular | 241903 | Circular |
| PsyOps zone, circular | 242703 | PsyOps Zone, Circular |
| mineline | 290101 | Mineline |
| obstacle bypass easy | 270601 | Obstacle Bypass Easy |
| obstacle bypass difficult | 270602 | Obstacle Bypass Difficult |
| obstacle bypass impossible | 270603 | Obstacle Bypass Impossible |
| decision line | 110500 | Decision Line |
| escort | 343600 | Escort |
| demonstration | 343300 | Demonstration/Demonstrate |
| capture | 343000 | Capture |
| evacuate | 344500 | Evacuate |
| recover | 344600 | Recover |
| mobility corridor | 142100 | Mobility Corridor |
| mine cluster | 290400 | Mine Cluster |
| trip wire | 290500 | Trip Wire |
| raft site | 290800 | Raft Site |
| fortified position | 291000 | Fortified Position |
| advance to contact | 342900 | Advance to Contact |

## Complete shared matrix

“Candidate” below means the normative geometry/template and checked fixed labels agree. It is deliberately not called 1:1 until every supported API field has been populated with the same test value and its eligibility, semantics, formatting, placement, and resulting pixels have been compared against both standards.

| Provided graphic | APP-06 code | APP-06 entity name | Result |
| --- | --- | --- | --- |
| abatis | 280100 | Abatis | Candidate: geometry/template match; full label parity pending |
| Wire, Unspecified | 290301 | Unspecified | Candidate: geometry/template match; full label parity pending |
| Wire, Single Fence | 290302 | Single Fence | Candidate: geometry/template match; full label parity pending |
| Wire, Double Fence | 290303 | Double Fence | Candidate: geometry/template match; full label parity pending |
| Wire, Double Apron Fence | 290304 | Double Apron Fence | Candidate: geometry/template match; full label parity pending |
| Wire, Low Wire Fence | 290305 | Low Wire Fence | Candidate: geometry/template match; full label parity pending |
| Wire, High Wire Fence | 290306 | High Wire Fence | Candidate: geometry/template match; full label parity pending |
| Wire, Single Concertina | 290307 | Single Concertina | Candidate: geometry/template match; full label parity pending |
| Wire, Double Strand Concertina | 290308 | Double Strand Concertina | Candidate: geometry/template match; full label parity pending |
| Wire, Triple Strand Concertina | 290309 | Triple Strand Concertina | Candidate: geometry/template match; full label parity pending |
| Explosives, Planned State of Readiness | 271201 | Planned | Candidate: geometry/template match; full label parity pending |
| Explosives, State of Readiness 1 (Safe) | 271202 | Explosives, State of Readiness 1 (Safe) | Candidate: geometry/template match; full label parity pending |
| Explosives, State of Readiness 2 (Armed but Passable) | 271203 | Explosives, State of Readiness 2 (Armed but Passable) | Candidate: geometry/template match; full label parity pending |
| Roadblock Complete (Executed) | 271204 | Roadblock Complete (Executed) | Candidate: geometry/template match; full label parity pending |
| Anti-Tank Ditch, Under Construction | 290201 | Antitank Ditch Under Construction | Candidate: geometry/template match; full label parity pending |
| Anti-Tank Ditch, Completed | 290202 | Antitank Ditch Completed | Candidate: geometry/template match; full label parity pending |
| Anti-Tank Ditch Reinforced, with Anti-Tank Mines | 290203 | Antitank Ditch Reinforced, with Antitank Mines | Candidate: geometry/template match; full label parity pending |
| attack helicopter axis of advance | 151402 | Attack Helicopter | Candidate: geometry/template match; full label parity pending |
| airborne or aviation axis of advance | 151401 | Airborne/Aviation | Candidate: geometry/template match; full label parity pending |
| main axis of advance | 151403 | Main Attack | Candidate: geometry/template match; full label parity pending |
| main axis of advance feint | 151406 | Feint | Candidate: geometry/template match; full label parity pending |
| supporting axis of advance | 151404 | Supporting Attack | Candidate: geometry/template match; full label parity pending |
| counterattack | 340600 | Counter-Attack | Candidate: geometry/template match; full label parity pending |
| air corridor | 170100 | Air Corridor | Candidate: geometry/template match; full label parity pending |
| low level transit route | 170200 | Low Level Transit Route | Candidate: geometry/template match; full label parity pending |
| minimum risk route | 170300 | Temporary Minimum- Risk Route | Candidate: geometry/template match; full label parity pending |
| safe lane | 170400 | Safe Lane | Candidate: geometry/template match; full label parity pending |
| special corridor | 170700 | Special Corridor (SC) | Candidate: geometry/template match; full label parity pending |
| standard use Army aircraft flight route | 170500 | Standard Use Army Aircraft Flight Route | Candidate: geometry/template match; full label parity pending |
| transit corridor | 170600 | Transit Corridor | Candidate: geometry/template match; full label parity pending |
| direction of main attack | 140602 | Main Attack | Candidate: geometry/template match; full label parity pending |
| direction of supporting attack | 140603 | Supporting Attack | Candidate: geometry/template match; full label parity pending |
| direction of main attack feint | 140605 | Feint | Candidate: geometry/template match; full label parity pending |
| aviation direction of attack | 140601 | Aviation | Candidate: geometry/template match; full label parity pending |
| phase line | 140300 | Phase Line | Candidate: geometry/template match; full label parity pending |
| forward edge of battle area | 140400 | Forward Edge of the Battle Area | Candidate: geometry/template match; full label parity pending |
| release line | 141600 | Release Line | Candidate: geometry/template match; full label parity pending |
| bridgehead line | 141400 | Bridgehead Line (BL) | Candidate: geometry/template match; full label parity pending |
| battlefield handover line | 141900 | Battle Handover Line (BHL) | Candidate: geometry/template match; full label parity pending |
| final coordination line | 140700 | Final Coordination Line | Candidate: geometry/template match; full label parity pending |
| limit of advance | 140900 | Limit of Advance | Candidate: geometry/template match; full label parity pending |
| line of departure | 141000 | Line of Departure | Candidate: geometry/template match; full label parity pending |
| line of departure or line of contact | 141100 | Line of Departure/Line of Contact | Candidate: geometry/template match; full label parity pending |
| probable line of deployment | 141200 | Probable Line of Deployment | Candidate: geometry/template match; full label parity pending |
| fire support coordination line | 260100 | Fire Support Coordination Line (FSCL) | Candidate: geometry/template match; full label parity pending |
| coordinated fire line | 260200 | Coordinated Fire Line (CFL) | Candidate: geometry/template match; full label parity pending |
| boundary | 110100 | Boundary | Candidate: geometry/template match; full label parity pending |
| route | 330500 | Route | Candidate: geometry/template match; full label parity pending |
| main supply route | 330300 | Main Supply Route (MSR) | Candidate: geometry/template match; full label parity pending |
| alternate supply route | 330400 | Alternate Supply Route (ASR) | Candidate: geometry/template match; full label parity pending |
| restrictive fire line | 260500 | Restrictive Fire Line | Candidate: geometry/template match; full label parity pending |
| intelligence coordination line | 300100 | Intelligence Coordination Line (ICL) | Candidate: geometry/template match; full label parity pending |
| engineer work line | 110300 | Engineer Work Line | Candidate: geometry/template match; full label parity pending |
| identification friend or foe off | 190100 | Identification Friend or Foe (IFF) Off Line | Candidate: geometry/template match; full label parity pending |
| identification friend or foe on | 190200 | Identification Friend or Foe (IFF) On Line | Candidate: geometry/template match; full label parity pending |
| munition flight path | 260600 | Munition Flight Path | Candidate: geometry/template match; full label parity pending |
| fields of fire / sector of fire | 140500 | Field of Fire | Candidate: geometry/template match; full label parity pending |
| forward line of own troops | 140100 | Forward Line of Troops | Candidate: geometry/template match; full label parity pending |
| line of contact | 141100 | Line of Departure/Line of Contact | Candidate: geometry/template match; full label parity pending |
| bridge | 271100 | Bridge | Candidate: geometry/template match; full label parity pending |
| gap | 290600 | Safe Lane or Gap | Candidate: geometry/template match; full label parity pending |
| assault crossing | 271300 | Assault Crossing | Candidate: geometry/template match; full label parity pending |
| ford, easy | 271500 | Ford Easy | Candidate: geometry/template match; full label parity pending |
| ford, difficult | 271600 | Ford Difficult | Candidate: geometry/template match; full label parity pending |
| ferry crossing | 290700 | Ferry | Candidate: geometry/template match; full label parity pending |
| objective area | 151700 | Objective Area | Candidate: geometry/template match; full label parity pending |
| attack position | 151600 | Attack Position | Candidate: geometry/template match; full label parity pending |
| named area of interest | 120200 | Named Area of Interest | Candidate: geometry/template match; full label parity pending |
| target area of interest | 120300 | Target Area of Interest | Candidate: geometry/template match; full label parity pending |
| forward arming and refueling point | 310300 | Forward Arming and Refuelling Point (FARP) | Candidate: geometry/template match; full label parity pending |
| assault position | 151500 | Assault Position | Candidate: geometry/template match; full label parity pending |
| area of operations | 120100 | Area of Operations | Candidate: geometry/template match; full label parity pending |
| base camp | 120500 | Base Camp | Candidate: geometry/template match; full label parity pending |
| guerrilla base | 120600 | Guerrilla Base | Candidate: geometry/template match; full label parity pending |
| detainee holding area | 310100 | Detainee Holding Area | Candidate: geometry/template match; full label parity pending |
| assembly area | 150200 | Assembly Area (AA) | Candidate: geometry/template match; full label parity pending |
| engagement area | 151300 | Engagement Area (EA) | Candidate: geometry/template match; full label parity pending |
| refugee holding area | 310400 | Refugee Holding Area | Candidate: geometry/template match; full label parity pending |
| brigade support area | 310600 | Brigade Support Area | Candidate: geometry/template match; full label parity pending |
| division support area | 310700 | Division Support Area | Candidate: geometry/template match; full label parity pending |
| corps support area | 310800 | Corps Support Area | Candidate: geometry/template match; full label parity pending |
| drop zone | 150600 | Drop Zone (DZ) | Candidate: geometry/template match; full label parity pending |
| landing zone | 150800 | Landing Zone (LZ) | Candidate: geometry/template match; full label parity pending |
| pickup zone | 150900 | Pick-Up Zone (PZ) | Candidate: geometry/template match; full label parity pending |
| radiation dose rate contour line | 272200 | Radiation Dose Rate Contour Lines | Candidate: geometry/template match; full label parity pending |
| battle position | 151200 | Battle Position | Candidate: geometry/template match; full label parity pending |
| battle position prepared but not occupied | 151202 | Battle Position Prepared (P) but Not Occupied | Candidate: geometry/template match; full label parity pending |
| strong point | 151203 | Strong Point | Candidate: geometry/template match; full label parity pending |
| free fire area irregular | 240201 | Irregular | Candidate: geometry/template match; full label parity pending |
| free fire area rectangular | 240202 | Rectangular | Candidate: geometry/template match; full label parity pending |
| no fire area irregular | 240301 | Irregular | Candidate: geometry/template match; full label parity pending |
| no fire area rectangular | 240302 | Rectangular | Candidate: geometry/template match; full label parity pending |
| restrictive fire area irregular | 240401 | Irregular | Candidate: geometry/template match; full label parity pending |
| restrictive fire area rectangular | 240402 | Rectangular | Candidate: geometry/template match; full label parity pending |
| position area artillery irregular | 240503 | Irregular | Candidate: geometry/template match; full label parity pending |
| position area artillery rectangular | 240501 | Rectangular | Candidate: geometry/template match; full label parity pending |
| artillery target intelligence zone irregular | 241101 | Irregular | Candidate: geometry/template match; full label parity pending |
| artillery target intelligence zone rectangular | 241102 | Rectangular | Candidate: geometry/template match; full label parity pending |
| call for fire zone irregular | 241201 | Irregular | Candidate: geometry/template match; full label parity pending |
| call for fire zone rectangular | 241202 | Rectangular | Candidate: geometry/template match; full label parity pending |
| censor zone irregular | 241301 | Irregular | Candidate: geometry/template match; full label parity pending |
| censor zone rectangular | 241302 | Rectangular | Candidate: geometry/template match; full label parity pending |
| critical friendly zone irregular | 241401 | Irregular | Candidate: geometry/template match; full label parity pending |
| critical friendly zone rectangular | 241402 | Rectangular | Candidate: geometry/template match; full label parity pending |
| dead space area irregular | 241501 | Irregular | Candidate: geometry/template match; full label parity pending |
| dead space area rectangular | 241502 | Rectangular | Candidate: geometry/template match; full label parity pending |
| blue kill box irregular | 242301 | Irregular, Blue | Candidate: geometry/template match; full label parity pending |
| blue kill box rectangular | 242302 | Rectangular, Blue | Candidate: geometry/template match; full label parity pending |
| purple kill box irregular | 242304 | Irregular, Purple | Candidate: geometry/template match; full label parity pending |
| purple kill box rectangular | 242305 | Rectangular, Purple | Candidate: geometry/template match; full label parity pending |
| fire support area irregular | 241001 | Irregular | Candidate: geometry/template match; full label parity pending |
| fire support area rectangular | 241002 | Rectangular | Candidate: geometry/template match; full label parity pending |
| target area irregular | 240801 | Area Target | Candidate: geometry/template match; full label parity pending |
| target area rectangular | 240802 | Rectangular Target | Qualified difference - see exception table |
| high density airspace control zone | 170900 | High-Density Airspace Control Zone | Candidate: geometry/template match; full label parity pending |
| restricted operations zone | 171000 | Restricted Operations Zone (ROZ) | Candidate: geometry/template match; full label parity pending |
| air to air refueling restricted operations zone | 171100 | Air-to-Air Restricted Operating Zone (AARROZ) | Candidate: geometry/template match; full label parity pending |
| unmanned aircraft restricted operations zone | 171200 | Unmanned Aircraft Restricted Operating Zone (UA-ROZ) | Candidate: geometry/template match; full label parity pending |
| weapon engagement zone | 171300 | Weapon Engagement Zone (WEZ) | Candidate: geometry/template match; full label parity pending |
| joint engagement zone | 171500 | Joint Engagement Zone (JEZ) | Candidate: geometry/template match; full label parity pending |
| missile engagement zone | 171600 | Missile Engagement Zone (MEZ) | Candidate: geometry/template match; full label parity pending |
| low altitude missile engagement zone | 171700 | Low (Altitude) Missile Engagement Zone (LOMEZ) | Candidate: geometry/template match; full label parity pending |
| high altitude missile engagement zone | 171800 | High (Altitude) Missile Engagement Zone (HIMEZ) | Candidate: geometry/template match; full label parity pending |
| short range air defense engagement zone | 171900 | Short Range Air Defence Engagement Zone (SHORADEZ) | Candidate: geometry/template match; full label parity pending |
| weapons free zone | 172000 | Weapons Free Zone | Candidate: geometry/template match; full label parity pending |
| air space coordination area rectangular | 240102 | Rectangular | Candidate: geometry/template match; full label parity pending |
| air space coordination area irregular | 240101 | Irregular | Candidate: geometry/template match; full label parity pending |
| unexploded explosive ordnance (UXO) area | 271000 | Unexploded Explosive Ordnance (UXO) Area | Candidate: geometry/template match; full label parity pending |
| airhead line | 141300 | Airhead Line | Candidate: geometry/template match; full label parity pending |
| control | 343200 | Control | Candidate: geometry/template match; full label parity pending |
| cordon and search | 342700 | Cordon and Search | Candidate: geometry/template match; full label parity pending |
| isolate | 341500 | Isolate | Candidate: geometry/template match; full label parity pending |
| retain | 151205 | Retain | Candidate: geometry/template match; full label parity pending |
| secure | 342100 | Secure | Candidate: geometry/template match; full label parity pending |
| contain | 151204 | Contain | Candidate: geometry/template match; full label parity pending |
| occupy | 341700 | Occupy | Candidate: geometry/template match; full label parity pending |
| area defense | 152600 | Area Defence | Candidate: geometry/template match; full label parity pending |
| free fire area circular | 240203 | Circular | Candidate: geometry/template match; full label parity pending |
| no fire area circular | 240303 | Circular | Candidate: geometry/template match; full label parity pending |
| restrictive fire area circular | 240403 | Circular | Candidate: geometry/template match; full label parity pending |
| position area artillery circular | 240502 | Circular | Candidate: geometry/template match; full label parity pending |
| artillery target intelligence zone circular | 241103 | Circular | Candidate: geometry/template match; full label parity pending |
| call for fire zone circular | 241203 | Circular | Candidate: geometry/template match; full label parity pending |
| censor zone circular | 241303 | Circular | Candidate: geometry/template match; full label parity pending |
| critical friendly zone circular | 241403 | Circular | Candidate: geometry/template match; full label parity pending |
| dead space area circular | 241503 | Circular | Candidate: geometry/template match; full label parity pending |
| blue kill box circular | 242303 | Circular, Blue | Candidate: geometry/template match; full label parity pending |
| purple kill box circular | 242306 | Circular, Purple | Candidate: geometry/template match; full label parity pending |
| fire support area circular | 241003 | Circular | Candidate: geometry/template match; full label parity pending |
| target area circular | 240803 | Circular Target | Candidate: geometry/template match; full label parity pending |
| air space coordination area circular | 240103 | Circular | Candidate: geometry/template match; full label parity pending |
| airfield | 131900 | Airfield | Candidate: geometry/template match; full label parity pending |
| encirclement | 151800 | Encirclement | Candidate: geometry/template match; full label parity pending |
| fortified area | 151000 | Fortified Area | Candidate: geometry/template match; full label parity pending |
| obstacle belt | 270100 | Obstacle Belt | Candidate: geometry/template match; full label parity pending |
| obstacle zone | 270200 | Obstacle Zone | Candidate: geometry/template match; full label parity pending |
| obstacle free area | 270300 | Obstacle Free Zone | Candidate: geometry/template match; full label parity pending |
| obstacle restricted area | 270400 | Obstacle Restricted Zone | Candidate: geometry/template match; full label parity pending |
| obstacle line | 290100 | Obstacle Line | Candidate: geometry/template match; full label parity pending |
| minimum safe distance zone | 272100 | Minimum Safe Distance Zone | Candidate: geometry/template match; full label parity pending |
| minimum safe distance zone, multiple strike (STRIKWARN) | 272101 | Multiple Strike (STRIKWARN) | Candidate: geometry/template match; full label parity pending |
| cover | 342201 | Cover | Candidate: geometry/template match; full label parity pending |
| screen | 342203 | Screen | Candidate: geometry/template match; full label parity pending |
| guard | 342202 | Guard | Candidate: geometry/template match; full label parity pending |
| block | 340100 | Block | Candidate: geometry/template match; full label parity pending |
| block | 270501 | Block | Candidate: geometry/template match; full label parity pending |
| breach | 340200 | Breach | Candidate: geometry/template match; full label parity pending |
| bypass | 340300 | Bypass | Candidate: geometry/template match; full label parity pending |
| canalize | 340400 | Canalize | Candidate: geometry/template match; full label parity pending |
| clear | 340500 | Clear | Candidate: geometry/template match; full label parity pending |
| disrupt | 341000 | Disrupt | Candidate: geometry/template match; full label parity pending |
| disrupt | 270502 | Disrupt | Candidate: geometry/template match; full label parity pending |
| fix | 341100 | Fix | Candidate: geometry/template match; full label parity pending |
| fix | 270503 | Fix | Candidate: geometry/template match; full label parity pending |
| turn | 344700 | Turn | Candidate: geometry/template match; full label parity pending |
| turn | 270504 | Turn | Candidate: geometry/template match; full label parity pending |
| penetration | 341800 | Penetrate | Candidate: geometry/template match; full label parity pending |
| exploitation | 343100 | Exploit/Exploitation | Candidate: geometry/template match; full label parity pending |
| delay | 340800 | Delay | Candidate: geometry/template match; full label parity pending |
| withdraw | 342400 | Withdraw | Candidate: geometry/template match; full label parity pending |
| withdraw under pressure | 342500 | Withdraw Under Pressure | Candidate: geometry/template match; full label parity pending |
| disengage | 344400 | Disengage | Candidate: geometry/template match; full label parity pending |
| retirement | 342000 | Retire/Retirement | Candidate: geometry/template match; full label parity pending |
| forward passage of lines | 344100 | Forward Passage of Lines | Candidate: geometry/template match; full label parity pending |
| rearward passage of lines | 344200 | Rearward Passage of Lines | Candidate: geometry/template match; full label parity pending |
| frontal attack | 152700 | Frontal Attack | Candidate: geometry/template match; full label parity pending |
| turning movement | 152900 | Turning Movement | Candidate: geometry/template match; full label parity pending |
| pursuit | 344000 | Pursue | Candidate: geometry/template match; full label parity pending |
| envelopment | 343500 | Envelop | Candidate: geometry/template match; full label parity pending |
| mobile defense | 152800 | Mobile Defence | Candidate: geometry/template match; full label parity pending |
| infiltration | 343800 | Infiltrate | Candidate: geometry/template match; full label parity pending |
| infiltration lane | 140800 | Infiltration Lane | Candidate: geometry/template match; full label parity pending |
| ambush | 141700 | Ambush | Candidate: geometry/template match; full label parity pending |
| relief in place | 341900 | Relieve in Place / Relief in Place (RIP) | Candidate: geometry/template match; full label parity pending |
| weapon sensor range fan circular | 242100 | Weapon/Sensor Range Fan, Circular | Candidate: geometry/template match; full label parity pending |
| weapon sensor range fan sector | 242200 | Weapon/Sensor Range Fan, Sector | Candidate: geometry/template match; full label parity pending |
| fortified/trench line | 290900 | Fortified Line | Candidate: geometry/template match; full label parity pending |
| attack by fire | 152000 | Attack by Fire | Candidate: geometry/template match; full label parity pending |
| support by fire | 152100 | Support by Fire | Candidate: geometry/template match; full label parity pending |
| destroy | 340900 | Destroy | Candidate: geometry/template match; full label parity pending |
| interdict | 341400 | Interdict | Candidate: geometry/template match; full label parity pending |
| neutralize | 341600 | Neutralize | Candidate: geometry/template match; full label parity pending |
| suppress | 342800 | Suppress | Candidate: geometry/template match; full label parity pending |
| exfiltrate | 343700 | Exfiltrate | Candidate: geometry/template match; full label parity pending |
| limited access area | 151100 | Limited Access Area | Candidate: geometry/template match; full label parity pending |
| smoke obscurant | 240806 | Smoke | Candidate: geometry/template match; full label parity pending |
| group/series of targets | 240805 | Series or Groups of Targets | Candidate: geometry/template match; full label parity pending |
| linear target | 240701 | Linear Target | Candidate: geometry/template match; full label parity pending |
| final protective fire | 240703 | Final Protective Fire (FPF) | Candidate: geometry/template match; full label parity pending |
| linear smoke target | 240702 | Linear Smoke Target | Candidate: geometry/template match; full label parity pending |
| base defense zone | 170800 | Base Defence Zone | Candidate: geometry/template match; full label parity pending |

## Labels, status, and construction findings

- The fixed abbreviation for High-Density Airspace Control Zone is **HIDACZ**, not HDACZ. The latter is absent from FM 1-02.2 and was corrected during the review.
- The three explosives readiness states are visibly distinct in both standards: planned uses both dashed bars; state 1 uses one dashed/one solid bar; state 2 uses both solid bars.
- Wire-obstacle templates agree, including rail placement for low/high fence and concertina variants.
- Hatched-area semantics agree. Raster tools that drop dash arrays or pattern fills can make correct symbols look wrong; browser/vector inspection was used for these cases.
- Contain and Retain specify tic length and spacing equal to the identifying letter’s text height in APP-06; the resulting rendered construction agrees after applying that rule.
- Rectangular fire-support/airspace zones use width in metres as a construction amplifier in both documents. A polygon may look right while still failing interoperability if the width value is not preserved.
- APP-06 labels that cannot safely be guessed include TVAR (Target Value Area), BA (Bridgehead), the full phrase EPW HOLDING AREA, and no fixed label for Penetration Box, Area, or Area Generic.

## Document-level coverage limits

APP-06(E)(2) Chapter 8 is broader than this repository’s multi-point land/control-measure catalog. The project deliberately does not claim coverage of the maritime (§8.10), sustainment (§8.16), or intelligence (§8.17) sections. Point entities whose graphic is fundamentally a framed SIDC symbol are also outside this geometry library and belong to a point-symbol renderer. Parent rows ending in `00` with children are taxonomy headers, not separate drawable graphics.

Accordingly, the 9-versus-64 one-sided counts above answer “which of the graphics provided by this project are on only one side.” They must not be read as the complete set difference between every row in the two publications. APP-06 Annex A Table A-32 contains 645 control-measure codes (641 named), far beyond the subset relevant to this library.

## Confidence and residual uncertainty

High confidence applies to inventory membership, APP-06 entity codes, the confirmed exception, and the Movement-to-Contact/Advance-to-Contact split. The strongest evidence is the two supplied source PDFs themselves, checked at the template and construction-rule level.

There is currently **no certified numeric 1:1 count under the identical-rendering definition**, because the prior sweep did not exercise all optional labels. This is an evidence limitation, not evidence that the 210 candidates differ. APP-06 occasionally leaves a rule cell blank and inherits a parent/sibling rule; those inherited cases were reconstructed from table hierarchy rather than treated as “no rule.”

## Doctrinal relationship between the publications

FM 1-02.2 is the US Army’s approved military-symbol doctrine for depicting land operations. It is not the parent standard from which APP-06 is derived. Its own preface says that it **implements STANAG 2019 Edition 7 / APP-6(E)**, alongside other NATO agreements. In that formal sense, the direction is NATO agreement/publication to national implementation: STANAG 2019 records the nations’ agreement, APP-06 contains the NATO joint symbology, and FM 1-02.2 adopts that multinational baseline for Army use while adding Army-specific doctrine, terminology, definitions, examples, and some graphics.

APP-06(E)(2) is itself a NATO standardization publication approved by the Military Committee Joint Standardization Board; its Letter of Promulgation says national agreement to use it is recorded in STANAG 2019. Edition E Version 2 superseded Edition E Version 1 in October 2025. FM 1-02.2 is dated January 2025 and cites STANAG 2019 Edition 7 / APP-6(E) dated October 2023, so this FM cannot literally have been derived from the later October 2025 APP-06(E)(2) revision. The accurate relationship is:

`NATO nations agree through STANAG 2019 -> APP-06 publishes the NATO baseline -> FM 1-02.2 implements that baseline for the US Army -> both continue to evolve through their own change processes.`

The relationship is therefore neither simple copying nor equality. US proposals also feed back into NATO’s change process: APP-06(E)(2)’s change record contains numerous USA-sponsored symbology proposals. That explains why the catalogs are highly harmonized while still containing national-only graphics, NATO-only additions, terminology differences, and edition drift.

## Secondary corroboration

Esri’s archived Joint Military Symbology Markup Language (JMSML) models MIL-STD-2525D and APP-6(D) together and supports standard-specific tagging. It corroborates the broad historical harmonization of control measures, but it is secondary evidence only: this report compares APP-06 Edition E Version 2 directly with the newer FM 1-02.2, and Edition E contains substantial code drift from the D generation.

## Source references

1. NATO Standardization Office, APP-06(E)(2), *NATO Joint Military Symbology*, promulgated 16 October 2025: Chapter 8 and Annex A, Table A-32.
2. Headquarters, Department of the Army, FM 1-02.2, *Military Symbols*, May 2025: Chapters 5 and 6, Tables 5-1 through 5-28 and Table 6-1.
3. Esri, *Joint Military Symbology XML* (archived), machine-readable MIL-STD-2525D/APP-6(D) cross-standard corpus: https://github.com/Esri/joint-military-symbology-xml

