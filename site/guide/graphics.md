# Graphics

## Supported graphics

The graphics below are **fully implemented and verified** — each can be drawn, labeled, repositioned and modified, and rotated and resized wherever the symbol admits it, with its shape and labels checked against the plate that defines it. This is the library's real, proven capability.

**Which plate that is depends on the graphic, and each one records its own answer.** 225 are defined by both FM 1-02.2 and NATO APP-06, 85 by APP-06 alone, and 8 by FM 1-02.2 alone — `getSpecifications(name)` returns the answer for any of them, and `getEntityCode(name)` returns APP-06's six-digit identifier where there is one. Where the two standards draw the same symbol differently, the divergence is recorded beside the graphic rather than silently resolved.

*Some symbols are fixed by doctrine rather than sized to the ground, and refuse the gestures that would misrepresent them: the crossed mission tasks (Destroy, Interdict, Neutralize, Suppress) resize, but refuse to **rotate** — their X turned 45° is a different symbol — and so do Defeat and Airfield. The weapon and sensor range fans refuse a whole-graphic **resize**, because each band's range is a stated number rather than one found by eye; a band is sized by typing its range or dragging its own rim. Cover, Guard and Screen were fixed-size badges until 3.0.0; APP-06 gives them four anchor points, so they are drawn from two now — one arrow, with the other derived — and they take every gesture. Ask `allowedGestures(name)` rather than guessing.*

(The [gallery at the top](/guide/introduction) draws every graphic whose shape and labels are verified, which today is all 318 names `listTacticalGraphicNames()` returns, and the table below covers the same set. It has more rows than that because some rows name the variants of one graphic separately: the four boundary statuses, the three route traffic flows, a battle position that is planned but not prepared. The table is the verified set: drawable, correctly shaped and labeled, and fully editable.)

| Graphic | Entity |
|---|---|
| Air Corridor | Airspace Control Areas |
| Air-To-Air Refueling Restricted Operations Zone | Airspace Control Areas |
| Base Defense Zone | Airspace Control Areas |
| Fighter Engagement Zone | Airspace Control Areas |
| High-Altitude Missile Engagement Zone | Airspace Control Areas |
| High-Density Airspace Control Zone | Airspace Control Areas |
| Joint Engagement Zone | Airspace Control Areas |
| Low-Altitude Missile Engagement Zone | Airspace Control Areas |
| Low-Level Transit Route | Airspace Control Areas |
| Minimum-Risk Route | Airspace Control Areas |
| Missile Engagement Zone | Airspace Control Areas |
| Restricted Operations Zone | Airspace Control Areas |
| Safe Lane | Airspace Control Areas |
| Short-Range Air Defense Engagement Zone | Airspace Control Areas |
| Special Corridor | Airspace Control Areas |
| Standard Use Army Aircraft Flight Route | Airspace Control Areas |
| Transit Corridor | Airspace Control Areas |
| Unmanned Aircraft Restricted Operations Zone | Airspace Control Areas |
| Weapon Engagement Zone | Airspace Control Areas |
| Weapons Free Zone | Airspace Control Areas |
| Identification, Friend-Or-Foe Switch Off-Line | Airspace Control Lines |
| Identification, Friend-Or-Foe Switch On-Line | Airspace Control Lines |
| Airfield Zone | Command and Control Areas |
| Area Of Operations | Command and Control Areas |
| Area, Generic | Command and Control Areas |
| Base Camp | Command and Control Areas |
| Bridgehead | Command and Control Areas |
| Guerrilla Base | Command and Control Areas |
| Named Area Of Interest | Command and Control Areas |
| Target Area Of Interest | Command and Control Areas |
| Decision Line | Command and Control Lines |
| Enemy Known Boundary | Command and Control Lines |
| Enemy Suspected Boundary | Command and Control Lines |
| Engineer Work Line | Command and Control Lines |
| Friendly Planned Boundary | Command and Control Lines |
| Friendly Present Boundary | Command and Control Lines |
| Light Line | Command and Control Lines |
| Line, Generic | Command and Control Lines |
| Airfield | Command and Control Points |
| Battlefield Coordination Line | Fire Lines |
| Coordinated Fire Line | Fire Lines |
| Fire Support Coordination Line | Fire Lines |
| Munition Flight Path (MFP) | Fire Lines |
| No Fire Line | Fire Lines |
| Restrictive Fire Line | Fire Lines |
| Airspace Coordination Area, Circular | Fires Areas |
| Airspace Coordination Area, Irregular | Fires Areas |
| Airspace Coordination Area, Rectangular | Fires Areas |
| Artillery Maneuver Area | Fires Areas |
| Artillery Reserved Area | Fires Areas |
| Artillery Target Intelligence Zone, Circular | Fires Areas |
| Artillery Target Intelligence Zone, Irregular | Fires Areas |
| Artillery Target Intelligence Zone, Rectangular | Fires Areas |
| Blue Kill Box, Circular | Fires Areas |
| Blue Kill Box, Irregular | Fires Areas |
| Blue Kill Box, Rectangular | Fires Areas |
| Bomb Area | Fires Areas |
| Call For Fire Zone, Circular | Fires Areas |
| Call For Fire Zone, Irregular | Fires Areas |
| Call For Fire Zone, Rectangular | Fires Areas |
| Censor Zone, Circular | Fires Areas |
| Censor Zone, Irregular | Fires Areas |
| Censor Zone, Rectangular | Fires Areas |
| Critical Friendly Zone, Circular | Fires Areas |
| Critical Friendly Zone, Irregular | Fires Areas |
| Critical Friendly Zone, Rectangular | Fires Areas |
| Dead Space Area, Circular | Fires Areas |
| Dead Space Area, Irregular | Fires Areas |
| Dead Space Area, Rectangular | Fires Areas |
| Final Protective Fire | Fires Areas |
| Fire Support Area, Circular | Fires Areas |
| Fire Support Area, Irregular | Fires Areas |
| Fire Support Area, Rectangular | Fires Areas |
| Free-Fire Area, Circular | Fires Areas |
| Free-Fire Area, Irregular | Fires Areas |
| Free-Fire Area, Rectangular | Fires Areas |
| Group/Series Of Targets | Fires Areas |
| Linear Smoke Target | Fires Areas |
| Linear Target | Fires Areas |
| No-Fire Area, Circular | Fires Areas |
| No-Fire Area, Irregular | Fires Areas |
| No-Fire Area, Rectangular | Fires Areas |
| Position Area For Artillery, Circular | Fires Areas |
| Position Area For Artillery, Irregular | Fires Areas |
| Position Area For Artillery, Rectangular | Fires Areas |
| PsyOps Zone, Circular | Fires Areas |
| PsyOps Zone, Irregular | Fires Areas |
| PsyOps Zone, Rectangular | Fires Areas |
| Purple Kill Box, Circular | Fires Areas |
| Purple Kill Box, Irregular | Fires Areas |
| Purple Kill Box, Rectangular | Fires Areas |
| Restrictive Fire Area, Circular | Fires Areas |
| Restrictive Fire Area, Irregular | Fires Areas |
| Restrictive Fire Area, Rectangular | Fires Areas |
| Smoke Obscurant | Fires Areas |
| Target Area, Circular | Fires Areas |
| Target Area, Irregular | Fires Areas |
| Target Area, Rectangular | Fires Areas |
| Target Area, Single Target (AEGIS) | Fires Areas |
| Target Build-Up Area, Circular | Fires Areas |
| Target Build-Up Area, Irregular | Fires Areas |
| Target Build-Up Area, Rectangular | Fires Areas |
| Target Value Area, Circular | Fires Areas |
| Target Value Area, Irregular | Fires Areas |
| Target Value Area, Rectangular | Fires Areas |
| Terminally Guided Munition Footprint | Fires Areas |
| Weapon Or Sensor Range Fan | Fires Areas |
| Weapon Or Sensor Range Fan, Circular | Fires Areas |
| Zone Of Fire | Fires Areas |
| Zone Of Responsibility, Circular | Fires Areas |
| Zone Of Responsibility, Irregular | Fires Areas |
| Zone Of Responsibility, Rectangular | Fires Areas |
| Common Sensor Boundary | FM 1-02.2 only |
| Delay Line | FM 1-02.2 only |
| Gap | FM 1-02.2 only |
| Kill Zone | FM 1-02.2 only |
| Movement To Contact | FM 1-02.2 only |
| Obstacle Group | FM 1-02.2 only |
| Passage Lane | FM 1-02.2 only |
| Unmanned Aircraft (UA) Corridor | FM 1-02.2 only |
| Human Terrain | Intelligence Areas |
| Intelligence Coordination Line | Intelligence Lines |
| Airborne Or Aviation Axis Of Advance | Manoeuvre Areas |
| Area | Manoeuvre Areas |
| Area Defense | Manoeuvre Areas |
| Assault Position | Manoeuvre Areas |
| Assembly Area | Manoeuvre Areas |
| Attack By Fire | Manoeuvre Areas |
| Attack Helicopter Axis Of Advance | Manoeuvre Areas |
| Attack Position | Manoeuvre Areas |
| Avenue Of Approach | Manoeuvre Areas |
| Battle Position | Manoeuvre Areas |
| Battle Position Planned But Not Prepared | Manoeuvre Areas |
| Battle Position Prepared But Not Occupied | Manoeuvre Areas |
| Contain | Manoeuvre Areas |
| Drop Zone | Manoeuvre Areas |
| Encirclement | Manoeuvre Areas |
| Engagement Area | Manoeuvre Areas |
| Extraction Zone | Manoeuvre Areas |
| Fortified Area | Manoeuvre Areas |
| Frontal Attack | Manoeuvre Areas |
| Joint Tactical Action Area | Manoeuvre Areas |
| Landing Zone | Manoeuvre Areas |
| Limited Access Area | Manoeuvre Areas |
| Main Axis Of Advance | Manoeuvre Areas |
| Main Axis Of Advance Feint | Manoeuvre Areas |
| Mobile Defense | Manoeuvre Areas |
| Objective Area | Manoeuvre Areas |
| Penetration Box | Manoeuvre Areas |
| Pickup Zone | Manoeuvre Areas |
| Restricted Terrain | Manoeuvre Areas |
| Retain | Manoeuvre Areas |
| Search Area / Reconnaissance Area | Manoeuvre Areas |
| Severely Restricted Terrain | Manoeuvre Areas |
| Strong Point | Manoeuvre Areas |
| Submarine Action Area | Manoeuvre Areas |
| Submarine-Generated Action Area | Manoeuvre Areas |
| Support By Fire | Manoeuvre Areas |
| Supporting Axis Of Advance | Manoeuvre Areas |
| Turning Movement | Manoeuvre Areas |
| Airhead Line | Manoeuvre Lines |
| Ambush | Manoeuvre Lines |
| Aviation Direction Of Attack | Manoeuvre Lines |
| Battlefield Handover Line | Manoeuvre Lines |
| Bridgehead Line | Manoeuvre Lines |
| Direction Of Main Attack | Manoeuvre Lines |
| Direction Of Main Attack Feint | Manoeuvre Lines |
| Direction Of Supporting Attack | Manoeuvre Lines |
| Fields Of Fire/Sector Of Fire | Manoeuvre Lines |
| Final Coordination Line | Manoeuvre Lines |
| Forward Edge Of The Battle Area | Manoeuvre Lines |
| Forward Line Of Own Troops | Manoeuvre Lines |
| Handover Line | Manoeuvre Lines |
| Holding Line | Manoeuvre Lines |
| Infiltration Lane | Manoeuvre Lines |
| Limit Of Advance | Manoeuvre Lines |
| Line Of Contact | Manoeuvre Lines |
| Line Of Departure | Manoeuvre Lines |
| Line Of Departure Or Line Of Contact | Manoeuvre Lines |
| Mobility Corridor | Manoeuvre Lines |
| Named Area Of Interest Line | Manoeuvre Lines |
| Phase Line | Manoeuvre Lines |
| Probable Line Of Deployment | Manoeuvre Lines |
| Release Line | Manoeuvre Lines |
| Active Maneuver Area | Maritime Control Areas |
| Cued Acquisition Doctrine | Maritime Control Areas |
| Defended Area, Ellipse/Circle | Maritime Control Areas |
| Defended Area, Rectangle | Maritime Control Areas |
| Launch Area, Ellipse/Circle | Maritime Control Areas |
| No Attack (NOTACK) Zone | Maritime Control Areas |
| Radar Search Doctrine | Maritime Control Areas |
| Ship Area Of Interest, Ellipse/Circle | Maritime Control Areas |
| Ship Area Of Interest, Rectangle | Maritime Control Areas |
| Bearing Line | Maritime Control Lines |
| Bearing Line, Acoustic | Maritime Control Lines |
| Bearing Line, Acoustic (ambiguous) | Maritime Control Lines |
| Bearing Line, Electro-Optical Intercept | Maritime Control Lines |
| Bearing Line, Electromagnetic Warfare (EW) | Maritime Control Lines |
| Bearing Line, Electronic | Maritime Control Lines |
| Bearing Line, Jammer | Maritime Control Lines |
| Bearing Line, Radio Direction Finder (RDF) | Maritime Control Lines |
| Bearing Line, Torpedo | Maritime Control Lines |
| Navigational Rhumb Line | Maritime Control Lines |
| Navigational Line | Maritime Control Points |
| Advance To Contact | Mission Tasks |
| Block | Mission Tasks |
| Breach | Mission Tasks |
| Bypass | Mission Tasks |
| Canalize | Mission Tasks |
| Capture | Mission Tasks |
| Clear | Mission Tasks |
| Control | Mission Tasks |
| Cordon And Knock | Mission Tasks |
| Cordon And Search | Mission Tasks |
| Counterattack | Mission Tasks |
| Counterattack By Fire | Mission Tasks |
| Cover | Mission Tasks |
| Defeat | Mission Tasks |
| Delay | Mission Tasks |
| Demonstration | Mission Tasks |
| Deny | Mission Tasks |
| Destroy | Mission Tasks |
| Disengage | Mission Tasks |
| Disrupt | Mission Tasks |
| Envelopment | Mission Tasks |
| Escort | Mission Tasks |
| Evacuate | Mission Tasks |
| Exfiltrate | Mission Tasks |
| Exploitation | Mission Tasks |
| Fix | Mission Tasks |
| Follow And Assume | Mission Tasks |
| Follow And Support | Mission Tasks |
| Forward Passage Of Lines | Mission Tasks |
| Guard | Mission Tasks |
| Infiltration | Mission Tasks |
| Interdict | Mission Tasks |
| Isolate | Mission Tasks |
| Locate | Mission Tasks |
| Neutralize | Mission Tasks |
| Occupy | Mission Tasks |
| Penetration | Mission Tasks |
| Pursuit | Mission Tasks |
| Rearward Passage Of Lines | Mission Tasks |
| Recover | Mission Tasks |
| Relief In Place | Mission Tasks |
| Retirement | Mission Tasks |
| Screen | Mission Tasks |
| Secure | Mission Tasks |
| Seize | Mission Tasks |
| Suppress | Mission Tasks |
| Turn | Mission Tasks |
| Withdraw | Mission Tasks |
| Withdraw Under Pressure | Mission Tasks |
| Assault Crossing | Protection Areas |
| Biological Contaminated Area | Protection Areas |
| Biological Contaminated Area, Toxic Industrial Material | Protection Areas |
| Block | Protection Areas |
| Bridge | Protection Areas |
| Chemical Contaminated Area | Protection Areas |
| Chemical Contaminated Area, Toxic Industrial Material | Protection Areas |
| Disrupt | Protection Areas |
| Explosives, Planned State Of Readiness | Protection Areas |
| Explosives, State Of Readiness 1 (safe) | Protection Areas |
| Explosives, State Of Readiness 2 (armed But Passable) | Protection Areas |
| Fix | Protection Areas |
| Ford, Difficult | Protection Areas |
| Ford, Easy | Protection Areas |
| Mined Area | Protection Areas |
| Mined Area, Fenced | Protection Areas |
| Minefield, Dynamic Depiction | Protection Areas |
| Minimum Safe Distance Zone | Protection Areas |
| Minimum Safe Distance Zone, Multiple Strike (STRIKWARN) | Protection Areas |
| Nuclear Contaminated Area | Protection Areas |
| Obstacle Belt | Protection Areas |
| Obstacle Bypass Difficult | Protection Areas |
| Obstacle Bypass Easy | Protection Areas |
| Obstacle Bypass Impossible | Protection Areas |
| Obstacle Free Area | Protection Areas |
| Obstacle Restricted Area | Protection Areas |
| Obstacle Zone | Protection Areas |
| Radiation Dose Rate Contour Line | Protection Areas |
| Radiological Contaminated Area | Protection Areas |
| Radiological Contaminated Area, Toxic Industrial Material | Protection Areas |
| Roadblock Complete (executed) | Protection Areas |
| Turn | Protection Areas |
| Unexploded Explosive Ordnance (UXO) Area | Protection Areas |
| Anti-Tank Ditch - Completed | Protection Lines |
| Anti-Tank Ditch - Under Construction | Protection Lines |
| Anti-Tank Ditch Reinforced, With Anti-Tank Mines | Protection Lines |
| Ferry Crossing | Protection Lines |
| Fortified/Fighting Position | Protection Lines |
| Fortified/Trench Line | Protection Lines |
| Mine Cluster | Protection Lines |
| Mineline | Protection Lines |
| Obstacle Line | Protection Lines |
| Raft Site | Protection Lines |
| Safe Lane Or Gap | Protection Lines |
| Trip Wire | Protection Lines |
| Wire, Double Apron Fence | Protection Lines |
| Wire, Double Fence | Protection Lines |
| Wire, Double Strand Concertina | Protection Lines |
| Wire, High Wire Fence | Protection Lines |
| Wire, Low Wire Fence | Protection Lines |
| Wire, Single Concertina | Protection Lines |
| Wire, Single Fence | Protection Lines |
| Wire, Triple Strand Concertina | Protection Lines |
| Wire, Unspecified | Protection Lines |
| Abatis | Protection Points |
| Overhead Wire | Protection Points |
| Brigade Support Area | Sustainment Areas |
| Corps Support Area | Sustainment Areas |
| Detainee Holding Area | Sustainment Areas |
| Division Support Area | Sustainment Areas |
| Enemy Prisoner Of War Holding Area | Sustainment Areas |
| Forward Arming And Refueling Point | Sustainment Areas |
| Refugee Holding Area | Sustainment Areas |
| Regimental Support Area | Sustainment Areas |
| Alternate Supply Route | Sustainment Lines |
| Alternate Supply Route, Alternating Traffic | Sustainment Lines |
| Alternate Supply Route, One-Way Traffic | Sustainment Lines |
| Alternate Supply Route, Two-Way Traffic | Sustainment Lines |
| Halted Convoy | Sustainment Lines |
| Main Supply Route | Sustainment Lines |
| Main Supply Route, Alternating Traffic | Sustainment Lines |
| Main Supply Route, One-Way Traffic | Sustainment Lines |
| Main Supply Route, Two-Way Traffic | Sustainment Lines |
| Moving Convoy | Sustainment Lines |
| Route | Sustainment Lines |
| Route - Alternating Traffic | Sustainment Lines |
| Route - One-Way Traffic | Sustainment Lines |
| Route - Two-Way Traffic | Sustainment Lines |

---

## Upcoming graphics

Everything still being worked towards. A graphic is listed here until it is drawable, its shape and labels are signed off against the plate that defines it — FM 1-02.2, APP-06, or both — **and** its edit handles are finished — so this covers both graphics that have not been started and ones that are partly done.

**The list is empty**: every graphic this library tracks has met all three. It is kept because the next addition starts here.

| Graphic | Entity |
|---|---|
