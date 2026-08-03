/**
 * Seed toolbox talks, part 2 of 2. Same rules as part 1: spoken language, five
 * minutes, and a number cited only when the number is the point.
 */

import type { SeedTalk } from "./talk-types";

export const TALKS_B: SeedTalk[] = [
  {
    slug: "sun-exposure",
    title: "Sun exposure: the occupational disease nobody tracks",
    hazardTags: ["sun", "environment"],
    body: `## Why this one matters
Outdoor workers get several times the UV dose of people who work indoors. Skin cancer is the most common cancer in the country, and for us it is an occupational one — it just takes twenty years to show up, so it never makes an incident report.

## What actually works
- Long sleeves in a light, breathable fabric. Covering up beats reapplying sunscreen you will not reapply.
- Broad-brim or a hard-hat brim attachment. The tops of ears, the back of the neck, and the nose take the worst of it.
- Sunscreen SPF 30 or higher on what is still exposed, reapplied every two hours and after heavy sweat.
- Wraparound safety glasses with UV protection. Sun damages the eye's surface and lens too.
- Shade for breaks. Not the side of the truck at noon.

## Watch your own skin
A mole that changes shape, size, or color, a sore that will not heal, or a new rough patch is worth a doctor visit. Caught early this is a fifteen-minute procedure. Caught late it is not.

## Reflection counts
Concrete, metal roofing, water, and light-colored sand throw UV back up at you. On a bright deck you get it from both directions, including under a hat brim.

## Talk it over
1. Who on this crew has sleeves and a brim today?
2. Where is the shade at lunch?`,
  },
  {
    slug: "hazard-communication",
    title: "HazCom: labels, pictograms, and the SDS",
    hazardTags: ["chemical", "hazcom"],
    body: `## Why this one matters
You have the legal right to know what you are working with. The system only works if somebody reads the label before opening the container, and if the safety data sheets are actually on site.

## The label
Every container arrives with a product name, a signal word (Danger is worse than Warning), hazard statements, precautionary statements, and pictograms. If you pour product into a spray bottle or a bucket, that container gets labeled too — with the product name and the hazards. An unlabeled bottle is a guess, and a guess gets somebody hurt.

## The pictograms worth memorizing
Flame is flammable. Skull is acutely toxic. Corrosion is burns to skin and eyes. Exploding chest is a health hazard — carcinogen, respiratory sensitizer, organ damage. Exclamation point is irritant.

## The safety data sheet
Sixteen sections, always in the same order. In an emergency you want section 4 (first aid), section 8 (protection required), and section 7 (handling and storage). Our sheets are in the site binder and the office copy — ask me and you get one, that day.

## What we do
- Read the label before you open it.
- Wear what section 8 says, not what is in the truck.
- Never mix products. Bleach and ammonia products make chlorine gas.

## Talk it over
1. What chemicals are in use on this site today?
2. Where is the SDS binder?`,
  },
  {
    slug: "ppe-basics",
    title: "PPE: the last line, not the first",
    hazardTags: ["PPE"],
    body: `## Why this one matters
PPE is the last thing between you and a hazard we could not eliminate. It fails quietly — the wrong glove, the loose strap, the scratched lens — and you only find out at the worst moment.

## The order of controls
We try to eliminate the hazard first, then substitute something safer, then engineer it out with a guard or ventilation, then change the work practice. PPE is fifth because it depends entirely on a person wearing it right, all day.

## The baseline on this site
- Hard hat, in good condition, worn forward.
- Safety glasses with side protection, all the time, outside the trailer.
- High-visibility vest or shirt any time equipment is moving.
- Sturdy work boots. Composite or steel toe where we are handling material.
- Gloves matched to the task — cut resistant for sheet metal and blades, chemical resistant for solvents, insulated for hot work.

## Fit and care
PPE that does not fit does not protect. Report anything that does not fit rather than working around it. Inspect before every use, clean it, and store it out of the sun. Damaged PPE gets replaced, not taped.

## Talk it over
1. What PPE is required for your specific task today, beyond the site baseline?
2. What piece of your gear is due for replacement?`,
  },
  {
    slug: "head-protection",
    title: "Hard hats: type, class, and expiry",
    hazardTags: ["PPE", "struck-by"],
    body: `## Why this one matters
A dropped wrench from twenty feet arrives at about thirty miles an hour. A hard hat converts a fatal impact into a bad day — if the suspension is intact and it is actually on your head.

## Type and class
- **Type I** protects against blows to the top. **Type II** also protects the sides — worth it where we work around swinging loads and lift work.
- **Class E** is rated to 20,000 volts, **Class G** to 2,200, **Class C** has no electrical rating and often has vents. Electrical work means Class E, no exceptions.

## It has a service life
The shell and the suspension both age. Replace the suspension about every year, the shell about every five years from date of manufacture — the date is stamped inside the brim. Replace immediately after any impact, even if it looks fine; the shell absorbs energy by deforming, once.

## Care
- Nothing between the suspension and the shell. No hat, no rag, no gloves.
- No paint, no solvent, no stickers over cracks — solvents weaken the shell.
- Keep it out of the back window of the truck. UV and heat make it brittle.
- Worn forward. Backward is only allowed if the suspension is reversible and rated for it.

## Talk it over
1. What is the date stamped inside your hard hat?
2. Has yours taken a hit since you got it?`,
  },
  {
    slug: "eye-and-face-protection",
    title: "Eyes: you only get the two",
    hazardTags: ["PPE", "eye injury"],
    body: `## Why this one matters
Most jobsite eye injuries happen to people who had safety glasses within arm's reach. It was a quick cut, a moment overhead, one bolt to loosen.

## Match the protection to the hazard
- Impact and flying debris: safety glasses with side shields, rated Z87+.
- Heavy grinding, chipping, or overhead work: goggles or a face shield over glasses. A shield alone is not impact protection for your eyes.
- Chemicals and splash: sealed goggles. Glasses let liquid run in from below.
- Welding and cutting: the correct shade lens for the process and amperage, and don't watch someone else's arc.
- Dust and wind: sealed goggles beat glasses every time.

## Habits
- Anti-fog lens or a fogging routine, because glasses pushed up on a hard hat protect nothing.
- Replace scratched lenses. You compensate for a scratch by looking around it.
- Prescription glasses are not safety glasses. Use over-glasses or prescription-rated safety frames.

## If something gets in an eye
Do not rub. Flush with the eyewash or clean water for fifteen minutes. Never try to remove something embedded — cover it lightly, and go to the clinic. Chemical splash goes straight to fifteen minutes of flushing, then medical care, with the SDS in hand.

## Talk it over
1. Is anyone working above you today?
2. Where is the nearest eyewash?`,
  },
  {
    slug: "hand-protection",
    title: "Hands: cuts, pinches, and the right glove",
    hazardTags: ["PPE", "cuts", "hand injury"],
    body: `## Why this one matters
Hand injuries are the most common serious injury on a jobsite. You use your hands to make a living, and there is no substitute for a finger.

## The right glove for the task
- **Cut resistant (A4–A6)** for sheet metal, glass, blades, and banding.
- **Leather** for general material handling, rough lumber, and rigging.
- **Chemical resistant** for solvents and adhesives — check the SDS, because nitrile that handles one solvent dissolves in another.
- **Insulated or rated electrical** gloves for hot work and electrical, inspected and in date.
- **No gloves at all** near rotating equipment that could grab and pull your hand in.

## Pinch points
Half of hand injuries are not cuts. They are pinches: setting a panel, closing a tailgate, landing a beam, dropping a plate. Before you move anything heavy, look at where your hands will be if it shifts, and use a push stick, a bar, or a handle instead of your fingers.

## Line of fire
Keep your hands out of the path. Reposition your body instead of reaching. Never use your hand as a stop, a wedge, or a hammer.

## Talk it over
1. What pinch point exists in your next task?
2. Do you have the right cut level for what you are handling today?`,
  },
  {
    slug: "housekeeping",
    title: "Housekeeping: the pile that trips you",
    hazardTags: ["housekeeping", "slips trips falls", "fire"],
    body: `## Why this one matters
Housekeeping sounds like the least serious topic on the list, and it causes trips, punctures, fires, and struck-by injuries. A clean site is also a faster site — you spend less time hunting for tools and material.

## What we do all day, not at the end
- Cut-offs and scrap into the bin as you go, not into a pile "for later."
- Nails bent over or pulled. A nail through a boot sole is a tetanus shot and two weeks of limping.
- Cords and hoses routed along walls and up off the walking surface.
- Material stacked stable, banded, and not blocking exits, panels, or extinguishers.
- Spills wiped now. Water, mud, and dust on a smooth deck are a slip.

## Exit routes and access
Walkways, stairs, and doorways stay clear at full width. Egress blocked by a pallet is a fire code violation and a real problem at 3pm when somebody needs to get out fast.

## Storage
- Nothing stacked within six feet of a floor opening or edge.
- Nothing stored on stair treads or landings, ever.
- Flammables and rags in proper containers, not in a corner.

## Talk it over
1. What is in your walking path right now that should not be?
2. Who cleans the area we are working in today?`,
  },
  {
    slug: "slips-trips-falls",
    title: "Slips, trips, and the fall that is only three feet",
    hazardTags: ["slips trips falls", "housekeeping"],
    body: `## Why this one matters
Same-level falls do not sound serious until you land on a rebar cap or a concrete step. Broken wrists, torn shoulders, and head injuries all come from a fall that started with a boot catching an inch of something.

## Slips
- Mud, frost, ice, dust on smooth concrete, plastic sheeting, and spilled fuel all cut traction to nothing.
- Boots with real tread, cleaned of mud. Worn-smooth soles are a hazard you carry with you.
- Shorten your stride and keep your weight over your feet on a slick surface.

## Trips
- Cords, hoses, banding, rebar dowels, form stakes, and the lip of a plywood sheet.
- Change in level of a quarter inch is enough to catch a toe at walking speed.
- Carry loads you can see over. If you cannot see your feet, the load is too big or too high.

## Light and hands
Working in the dark or at dusk doubles the risk. Use task lighting rather than a phone flashlight. Keep one hand free on stairs and ramps, always use the handrail, and never carry a load up a ladder.

## Talk it over
1. What is the worst walking surface on this site today?
2. Where do we need light before the shift ends?`,
  },
  {
    slug: "manual-lifting",
    title: "Lifting: your back has a budget",
    hazardTags: ["ergonomics", "back injury"],
    body: `## Why this one matters
Back injuries do not usually come from one heroic lift. They come from a thousand small ones and then a bag of mix on a bad day. Once your back is hurt, it is a career-length problem.

## Before you lift
- Size it up. Test the weight by tipping a corner. If it fights back, get help or get equipment.
- Plan the path. Know where you are setting it down before you pick it up, and clear the route.
- Get help for anything awkward, above your shoulders, or over about fifty pounds.

## The lift
- Feet apart, one slightly forward. Get close — the load is heaviest when it is far from your body.
- Bend your knees and hips, not your back. Keep the load between your knees.
- Lift with your legs, smoothly. No jerking.
- Turn with your feet. Twisting under load is the classic injury.
- Keep the load at waist height and against your body while you carry it.

## Better than lifting
Carts, dollies, hand trucks, pallet jacks, a second person, and material delivered where it will be used. The best lift is the one that does not happen — ask for delivery closer to the work.

## Talk it over
1. What is the heaviest thing you will lift today?
2. What could we get on a cart instead?`,
  },
  {
    slug: "forklifts-and-telehandlers",
    title: "Forklifts and telehandlers",
    hazardTags: ["mobile equipment", "struck-by"],
    body: `## Why this one matters
A rough terrain forklift with a load up high is a tipping machine. Most fatalities are a tipover with the operator jumping or being thrown, or a pedestrian who was in a blind spot.

## Operators
- Trained, evaluated, and authorized on that class of truck. Every three years, and again after any incident.
- Daily inspection before use: forks, chains, hydraulics, tires, horn, backup alarm, seatbelt, leaks.
- Seatbelt on. In a tipover, staying in the seat is what saves you.
- Load charts are not suggestions. Reach and height reduce capacity fast on a telehandler.

## Driving
- Load low while traveling — carried high it blocks your view and raises the center of gravity.
- Travel in reverse when the load blocks your view forward, and use a spotter.
- On a grade, load points uphill.
- Sound the horn at corners and doorways. Make eye contact with people on foot.

## On foot
Never walk under raised forks or a raised boom. Assume the operator cannot see you until they wave. Give equipment a wide berth and never pass behind a machine that is backing.

## Talk it over
1. Where are the blind spots on the machine working here today?
2. How does a person on foot get the operator's attention?`,
  },
  {
    slug: "cranes-and-load-paths",
    title: "Cranes: signals, the load path, and never under it",
    hazardTags: ["cranes", "rigging", "struck-by"],
    body: `## Why this one matters
When a load drops or swings, the people hurt are the ones who happened to be in its path. Load paths are predictable, which means they are avoidable.

## Before the pick
- Ground conditions checked and mats set. Cranes tip because the ground moves.
- Load weight known, not guessed. Rigging rated for it with the right sling angle.
- Swing radius barricaded — a rotating counterweight has killed people standing next to it.
- One signal person, identified out loud, wearing something that makes them obvious.
- Tag lines to control the load, held by someone standing clear.

## During
- Nobody under a suspended load, ever. Not for a second, not to guide it.
- The operator obeys only the designated signal person — except for a stop signal, which anyone can give and everyone must obey.
- Watch out for the load bumping structure and shock-loading the rigging.
- Wind stops the pick at the manufacturer's limit.

## The path
Before the load lifts, walk the path from pick to set and clear people out of it — including the trade working two floors down under an open shaft.

## Talk it over
1. Who is the signal person for this pick?
2. Where is the load path, and who is under it right now?`,
  },
  {
    slug: "rigging-and-slings",
    title: "Rigging: slings, angles, and the inspection",
    hazardTags: ["rigging", "cranes"],
    body: `## Why this one matters
Rigging fails at the weakest link, and the weakest link is usually a sling nobody inspected or an angle nobody calculated.

## Inspect before every use
- **Synthetic slings**: cuts, holes, abrasion, melted or hardened areas, snags, illegible or missing tag. No tag means no use.
- **Wire rope**: broken wires, kinks, birdcaging, crushing, corrosion, heat damage.
- **Chain**: stretched, gouged, twisted, or nicked links; missing or bent hooks.
- **Hooks**: throat opening stretched, latch missing or bent, cracks, twist.

Anything that fails inspection gets cut and thrown away where nobody can pull it back out of the dumpster.

## Angles cost you capacity
A sling at 60 degrees carries about 87 percent of its vertical rating. At 45 degrees, about 71 percent. At 30 degrees, half. That last one surprises people — a choker pulled shallow doubles the tension in the leg.

## Protect the sling
Soft edge protection at every corner. A sharp steel edge cuts a synthetic sling under load with no warning.

## Center of gravity
Rig above it or the load rolls. Do a test lift a few inches off the ground and check it hangs level before anyone gets close.

## Talk it over
1. Do the slings we are using today have legible tags?
2. What is the sling angle on this pick?`,
  },
  {
    slug: "struck-by-vehicles",
    title: "Struck-by: backing, spotters, and blind spots",
    hazardTags: ["struck-by", "mobile equipment"],
    body: `## Why this one matters
Struck-by is one of the leading causes of construction deaths, and backing equipment is the most common version. The operator is not careless — they physically cannot see you.

## On foot
- High-visibility vest, every day equipment is moving.
- Make eye contact before you cross behind or in front of a machine. A wave back is the only permission that counts.
- Never assume a backup alarm means someone sees you. It means the machine is moving.
- Stay out of the swing radius and the pinch between a machine and a fixed object.

## Operators
- Walk around the machine before you start it. Anything could be behind you: a person, a cord, a tool, a stake.
- Use a spotter when backing where you cannot see, and stop the moment you lose sight of them.
- Back up as little as the work allows. Set up so you drive forward.
- Windows and mirrors clean. Cameras working.

## Site design
Separate people from machines with barricades and marked walking routes when we can. Deliveries get a designated area, not the middle of the work.

## Talk it over
1. Where do people and equipment cross paths on this site?
2. Who is spotting the delivery truck when it backs in?`,
  },
  {
    slug: "work-zone-traffic",
    title: "Work zones: flagging and live traffic",
    hazardTags: ["traffic", "struck-by"],
    body: `## Why this one matters
The driver coming at you is texting, tired, or annoyed at the delay. Your protection is the taper, the cones, and the flagger — not their attention.

## Setting up
- Follow the traffic control plan. If there is not one for a lane closure, we do not open it.
- Advance warning signs far enough back for the speed limit. At 55 mph that is a long way, not fifty feet.
- Taper length matters more than cone count. A short taper puts cars in your lap.
- Buffer space between traffic and the work area, kept empty of people and material.
- Truck-mounted attenuator or a shadow vehicle where the plan calls for it.

## Flaggers
Trained and certified, high-vis with a hard hat, paddle not a flag, standing where they can be seen from a distance and have an escape route. Never stand in the lane you are protecting. Never turn your back on traffic.

## Working in it
- Face traffic when you can.
- One person watching traffic when the crew's attention is in the hole.
- No equipment backing into a live lane.
- Night work needs lighting and retro-reflective gear, not just a vest.

## Talk it over
1. Where is your escape route if a car comes into the work zone?
2. What is the traffic speed here, and what should it be?`,
  },
  {
    slug: "equipment-walkaround",
    title: "The daily walkaround",
    hazardTags: ["mobile equipment", "inspection"],
    body: `## Why this one matters
Most equipment failures announce themselves the day before — a puddle, a soft brake, a cracked weld, a frayed cable. The walkaround is five minutes that finds them.

## What you are looking for
- **Under it**: fresh fluid on the ground. Know the color — hydraulic, coolant, fuel, oil.
- **Tires and tracks**: pressure, cuts, missing lugs, track tension.
- **Fluids**: engine oil, hydraulic, coolant, fuel — at the right level and not milky or gritty.
- **Guards and covers**: in place and latched. Steps and grab handles solid and clean.
- **Attachments**: pins, keepers, cutting edges, cracked welds where the load goes.
- **Cab**: seatbelt working, mirrors clean, glass intact, horn, lights, backup alarm, fire extinguisher charged.
- **Controls**: test function slowly before you go to work — hoist, boom, steering, service brake, parking brake.

## What to do with a defect
Write it up. Tag it out if it affects safety — brakes, steering, alarms, guards, or a structural crack. "It has been like that all week" is exactly the thing that stops being tolerable at the worst moment.

## Talk it over
1. What was on your walkaround sheet this morning?
2. What defect on this site is somebody working around?`,
  },
  {
    slug: "concrete-and-formwork",
    title: "Concrete: rebar caps, formwork, and burns",
    hazardTags: ["concrete", "impalement", "chemical"],
    body: `## Why this one matters
Concrete work stacks up hazards: exposed rebar to fall on, forms under enormous pressure, and a material that burns skin slowly enough that you do not notice until it is deep.

## Rebar and impalement
Cap every vertical bar you could fall on, or bend it over and cover it. Troughs of impalement protection over dowel rows. This is the single cheapest thing on the site and it prevents the worst outcome.

## Formwork and shoring
- Formwork is engineered. It does not get modified in the field because a panel does not fit.
- Shoring stays in place until the concrete has the strength the engineer specified — not until it "looks set."
- During placement, watch for forms bulging, ties slipping, or shores that have shifted. Everyone gets out at the first sign of movement.
- Nobody works under an elevated pour except where the plan allows it.

## Wet concrete burns
Cement is caustic. It draws moisture out of your skin and keeps working for hours. Wet concrete in your boot causes third-degree burns on your ankle.

- Waterproof gloves and boots, sleeves and pant legs over the tops.
- Rinse skin with water immediately if it contacts you, and change out of soaked clothing.
- Eye contact means fifteen minutes of flushing and a doctor.

## Talk it over
1. Are all the vertical bars capped in our work area?
2. Who is watching the forms during the pour?`,
  },
  {
    slug: "demolition",
    title: "Demolition: what is holding what up",
    hazardTags: ["demolition", "structural", "asbestos"],
    body: `## Why this one matters
In demolition the building fights back. Structures that stood for decades fail suddenly when a member comes out in the wrong order, and old buildings hide asbestos, lead, and live services.

## Before anything comes down
- Engineering survey by a competent person, in writing, covering the condition of the structure and the risk of unplanned collapse.
- All utilities located, shut off, capped, and verified. Gas, electric, water, steam, sewer, fiber.
- Hazardous material survey — asbestos and lead paint especially. Abatement happens before demolition, not during.
- A written plan for the order of removal, top down.

## During
- Nobody works below anyone else in a demo zone.
- Openings and floor holes get covered or barricaded immediately.
- Watch for spring-loaded members, loaded walls, and debris piles pushing on a wall that is now unsupported.
- Wet the debris for dust, and know that dust in an old building is not just dust.

## Debris
Never overload a floor with debris. Use chutes for material dropped more than twenty feet, and barricade the discharge.

## Talk it over
1. What is structurally holding up the piece we are removing next?
2. What was this building built in, and has it been surveyed?`,
  },
  {
    slug: "asbestos-awareness",
    title: "Asbestos awareness in renovation",
    hazardTags: ["asbestos", "respiratory", "renovation"],
    body: `## Why this one matters
Asbestos is still in millions of buildings, and disturbing it is what makes it dangerous. Mesothelioma takes twenty to forty years to appear, and there is no safe exposure level.

## Where it hides in buildings before the 1990s
- Pipe and boiler insulation, especially wrapped elbows.
- 9x9 floor tile, the black mastic under tile, and sheet vinyl backing.
- Textured ceiling coatings and joint compound.
- Roofing felt, shingles, and flashing cement.
- Transite panels, siding, and cement pipe.
- Fireproofing spray on steel.

## What we do
- We do not assume. If the building is old and we are going to disturb material, it gets sampled by a licensed inspector first.
- Only trained and licensed abatement workers disturb known or presumed asbestos-containing material.
- If you find something unexpected — old pipe wrap behind a wall, tile you did not expect — **stop, do not touch it, do not sweep it**, get people out, and call me.
- Never dry sweep, never use compressed air, never take a power tool to suspect material.

## Your own gear
If you were in an area where material was disturbed, do not take the dust home. Fibers on your clothes have made family members sick.

## Talk it over
1. How old is this building, and do we have a survey?
2. What suspect material is in our work area?`,
  },
  {
    slug: "compressed-gas-cylinders",
    title: "Compressed gas cylinders",
    hazardTags: ["compressed gas", "fire", "welding"],
    body: `## Why this one matters
A cylinder is a few thousand pounds of stored pressure. Snap the valve off one and it becomes a rocket that goes through block walls. That is not a metaphor; it has happened.

## Handling
- Valve cap on any time the cylinder is not in use and connected. Always.
- Move them upright on a cart, chained. Never drag, roll, or carry one by the valve.
- Never lift a cylinder with a magnet or a sling around the body — use a proper cradle.
- Secure upright with a chain or strap at all times, top third of the cylinder.

## Storage
- Oxygen and fuel gas separated by twenty feet or a half-hour fire wall.
- Out of the sun and away from heat, electrical, and ignition sources.
- Full and empty stored separately, and empties marked MT and closed.
- Never in a stairwell, an exit route, or an unventilated space.

## Use
- Regulator rated for that gas and pressure, threads clean, no tape and no oil — oil and oxygen ignite.
- Crack the valve away from people to clear debris before attaching the regulator.
- Open the valve slowly and fully for fuel gas, and stand to the side of the regulator face.
- Leak check with soapy water, never a flame.

## Talk it over
1. Are the cylinders on this site capped and secured right now?
2. How far apart are the oxygen and the acetylene?`,
  },
  {
    slug: "nail-guns",
    title: "Nail guns: triggers and the second nail",
    hazardTags: ["power tools", "puncture"],
    body: `## Why this one matters
Nail gun injuries send tens of thousands of people to the emergency room a year, and the majority are hands and fingers. Contact-trip triggers cause about twice as many injuries as sequential ones.

## Trigger types
- **Sequential (single actuation)**: you press the nose, then pull the trigger, one nail at a time. Slower, and dramatically safer.
- **Contact trip (bump fire)**: hold the trigger and bump the nose. Fast, and it fires a second unintended nail on recoil — often into a hand holding the work.

We use sequential triggers for anything where a hand could be near the nose: toe-nailing, blocking, small pieces, ladder or lift work, and any awkward position.

## Rules
- Never disable the safety tip or wire it back.
- Never carry the gun with a finger on the trigger, and never a loaded gun up a ladder.
- Disconnect the air before clearing a jam, adjusting, or leaving it.
- Keep your free hand at least a foot from the nose, and never behind the material.
- Watch for blow-through at edges and on thin stock — the nail comes out somewhere.

## If you get nailed
Go to the clinic even if it looks like nothing. Punctures drive contamination deep, and barbed nails cause damage on the way out.

## Talk it over
1. What trigger is on the gun you are using today?
2. Where is your other hand on your next nail?`,
  },
  {
    slug: "chainsaws-and-tree-work",
    title: "Chainsaws and tree work",
    hazardTags: ["chainsaw", "tree care", "struck-by"],
    body: `## Why this one matters
Chainsaw injuries are deep, fast, and often to the leg. In tree work the bigger killer is the thing you are cutting — falling limbs and barber-chair trunks.

## Gear, all of it, every time
Chaps or cut-resistant pants, steel-toe boots, gloves, hard hat with face screen, and hearing protection. Chaps are not optional; a saw at full chain speed opens a thigh in a fraction of a second.

## The saw
- Chain brake working, chain sharp and tensioned, throttle interlock functional.
- Start it on the ground or braced, never drop-started.
- Two hands, thumbs wrapped, all the time.
- Cut between waist and mid-chest. Never above your shoulders, never on a ladder.
- Know your kickback zone — the upper tip of the bar. Watch it near unseen limbs and nails.

## The tree
- Look up first. Hangers, dead limbs, and power lines.
- Plan the fall, clear two escape routes at 45 degrees behind you, and use a proper notch and hinge.
- Watch for barber chair on leaning or split trunks and for spring poles under tension.
- Nobody in the drop zone — a radius of at least twice the tree height.

## Talk it over
1. Where are your two escape routes on the next fall?
2. What is overhead in this tree?`,
  },
  {
    slug: "mowers-and-trimmers",
    title: "Mowers, trimmers, and thrown objects",
    hazardTags: ["landscaping", "eye injury", "amputation"],
    body: `## Why this one matters
A mower blade tips travels around two hundred miles an hour. A rock leaving that blade will go through a window, a shin, or an eye at a distance you would not expect.

## Before the walk-behind or the rider
- Walk the area and pick up rocks, wire, cans, and toys. Two minutes here prevents most incidents.
- Guards, discharge chutes, and deflectors in place. Never removed for a faster cut.
- Fuel cold and outdoors.
- Blade tight, not cracked, and sharpened, not welded.

## While mowing
- Eye protection and hearing protection, plus long pants and real boots. No sandals, ever.
- Mow across slopes with a walk-behind, up and down with a rider — and know the machine's limit.
- Never put a hand or foot near the deck with the engine running, even for a clog. Stop it, disconnect the plug, then clear it.
- Watch your discharge direction relative to people, cars, and glass.

## String trimmers and blowers
Trimmers throw more debris than anything else — full face protection near hard surfaces. Blowers throw dust and silica off concrete; keep it away from people and think about who is downwind.

## Talk it over
1. Who else is within throwing range of your machine today?
2. What did you pick up out of the grass before you started?`,
  },
  {
    slug: "driving-the-company-truck",
    title: "Driving the company truck",
    hazardTags: ["driving", "fleet"],
    body: `## Why this one matters
Highway crashes are the single leading cause of work-related death in this country. On a normal week, the most dangerous thing most of us do is drive to the job.

## Before you roll
- Walk around: tires, lights, mirrors, glass, leaks, and anything left on the bumper or the roof.
- Everything in the bed secured. A loose ladder in the bed is a projectile at 60 mph.
- Seatbelt on before the truck moves, every passenger, every trip, including the 200 yards across the site.

## While driving
- Phone down. Not hands-free-and-typing, not "just checking the address." Pull over.
- Following distance of four seconds, more with a trailer or in rain.
- Speed for the conditions, not the sign.
- Backing: get out and look, use a spotter, or park where you can pull forward out.
- Fatigue is impairment. If you have been up since four and the drive is an hour, say so and swap.

## Loads and tools
Tools inside the cab become missiles in a crash. Secure them in a box or the bed.

## If you are in a crash
Stop, protect the scene, call 911 for any injury, exchange information, photograph everything, and call me before you agree to anything.

## Talk it over
1. What is loose in your truck right now?
2. How many hours will you be driving today?`,
  },
  {
    slug: "towing-and-load-securement",
    title: "Towing and securing the load",
    hazardTags: ["driving", "towing", "struck-by"],
    body: `## Why this one matters
An unsecured skid steer or a trailer that comes loose does not just wreck your truck; it kills the family behind you. Securement is a legal duty and every commercial vehicle inspection checks it.

## Hooking up
- Coupler fully seated and latched, with a pin or a lock through the latch.
- Safety chains crossed under the tongue with enough slack to turn, and no more.
- Breakaway cable attached to the truck, not to the safety chain.
- Lights connected and tested — brakes, turn signals, markers.
- Tongue weight around ten to fifteen percent of trailer weight, load toward the front.

## Securing equipment
- Four independent tie-downs on any machine, at four corners, rated for the load.
- Attachments lowered and secured separately — the bucket gets its own chain.
- Working load limits added up to at least half the cargo weight. Chains and binders in good condition, no knots in straps, no frayed webbing.
- Re-check within the first fifty miles, then every fuel stop.

## Driving with it
Wider turns, longer stopping distance, slower on grades, and no sudden lane changes. Know your combined height before you go under anything.

## Talk it over
1. How many tie-downs are on the machine on that trailer?
2. When did you last check the binders?`,
  },
  {
    slug: "fatigue-and-long-shifts",
    title: "Fatigue: the impairment nobody tests for",
    hazardTags: ["fatigue", "human factors"],
    body: `## Why this one matters
Being awake for seventeen hours affects you about like a couple of drinks. Late in a long stretch of overtime, people make the mistakes they would never make on a Tuesday morning — including the ones with a machine involved.

## What fatigue does
- Slows reaction time and narrows your attention to one thing.
- Wrecks judgment about risk, which is exactly the wrong thing to lose on a jobsite.
- Causes microsleeps — a few seconds of nothing that you do not notice.

## What helps
- Sleep is the only fix. Caffeine buys twenty minutes and then takes it back.
- Rotate the highest-risk tasks to earlier in the shift: lift work, hot work, crane picks, trenching.
- Real breaks. Working through lunch to leave early costs more than it saves.
- Watch each other, especially near the end of a long stretch — the person making small mistakes is the signal.
- Hydration and food. Skipping both makes fatigue worse.

## Say something
If you are too tired to do the work safely, say it. That is not weakness, it is the same call as tagging out a broken tool, and you will not be punished for it here. The drive home counts too — if you should not be driving, tell me.

## Talk it over
1. Who has worked the most hours on this crew this week?
2. What is the highest-risk task left today, and when is it scheduled?`,
  },
  {
    slug: "first-aid-and-bleeding-control",
    title: "First aid: bleeding, CPR, and who to call",
    hazardTags: ["first aid", "emergency"],
    body: `## Why this one matters
An ambulance takes eight to fifteen minutes on a good day and much longer on a rural site. Severe bleeding can kill in three. What happens in those minutes is up to whoever is standing there.

## Severe bleeding
- Pressure, hard, directly on the wound with whatever is cleanest. Do not stop to find gloves if you have them nearby, but use them.
- Keep pressing. Do not peek.
- If pressure will not hold it and it is an arm or a leg, use the tourniquet from the kit: high and tight above the wound, tighten until the bleeding stops, and write the time on it.
- Call 911 first if you are alone with one hand free. Speaker phone.

## Not breathing
Call 911, start chest compressions in the center of the chest, two inches deep, about a hundred a minute, and do not stop until help takes over. Get the AED if the site has one.

## Everything else
Eye injury: flush fifteen minutes, cover, go. Burns: cool water, no ice, no ointment. Suspected spine injury: do not move them unless they are in danger. Amputation: pressure on the stump, put the part in a clean bag on ice, bring it.

## The kit and the address
Know where the kit and the AED are, and know the street address of this site — that is the first question the dispatcher asks.

## Talk it over
1. What is the street address here?
2. Who on this crew is current in first aid and CPR?`,
  },
  {
    slug: "reporting-an-injury",
    title: "Reporting an injury: same day, every time",
    hazardTags: ["reporting", "recordkeeping"],
    body: `## Why this one matters
Late reporting hurts the injured person most. Delays make claims harder, treatment worse, and turn a two-day problem into a two-month one. It also means the hazard that got them is still out there for the next person.

## What gets reported
Everything. A cut you cleaned yourself, a tweaked back, a smashed finger, a chemical splash, a near miss with a swinging load. Not just the ones that need stitches.

## How, on this crew
- Tell me before you go home. Not next week when it stiffens up.
- We write down what happened: time, place, what you were doing, what hurt, who saw it.
- Medical care first if it is needed. Nobody gets talked out of seeing a doctor.
- Nothing bad happens to you for reporting. Retaliating against someone for reporting an injury is illegal, and it does not happen here.

## What we do with it
Some injuries have to go on the OSHA log — that is a legal requirement about the record, not a judgment about you. If something is serious — a fatality, an in-patient hospitalization, an amputation, or the loss of an eye — the company has to notify OSHA within 8 or 24 hours depending on which, so I need to know immediately, not tomorrow.

## Talk it over
1. Has anything happened this week that did not get written down?
2. Who do you tell if I am not on site?`,
  },
  {
    slug: "near-misses",
    title: "Near misses: the free lesson",
    hazardTags: ["reporting", "safety culture"],
    body: `## Why this one matters
A near miss is the same event as an injury with better luck. The wrench that missed your head told you everything the wrench that hit you would have, and cost nothing.

## What counts
- Something fell and nobody was under it.
- A load swung and someone stepped back in time.
- A trench wall sloughed while everyone was on break.
- You caught a mistake in the rigging before the pick.
- You nearly stepped into an uncovered hole.

## Why people do not report them
Because nothing happened, because it feels like admitting a mistake, and because last time somebody got chewed out. None of those apply here. I want the report, and there is no discipline attached to bringing one.

## What we do with them
Fix the condition today if we can — cover the hole, re-rig it, move the pile. Then tell the other crews, because the same condition exists on their site. A near miss that turns into a five-minute talk next Monday is the cheapest safety improvement there is.

## Say it out loud
The fastest way is to tell me while you are still standing there. If it is easier later, tell me at the end of the shift. What I do not want is to hear it in three weeks after somebody got hurt the same way.

## Talk it over
1. What was your closest call in the last month?
2. What condition on this site nearly got somebody already?`,
  },
  {
    slug: "stop-work-authority",
    title: "Stop-work authority: you have it",
    hazardTags: ["safety culture", "emergency"],
    body: `## Why this one matters
Almost every serious incident had a moment where somebody thought "this doesn't look right" and did not say it — because of schedule, because of who was watching, because they were new.

## The rule on this crew
Anyone can stop the work. Not just the foreman, not just the person with the most years. If you think something is unsafe, you say stop, and everything stops. Nobody has to earn the right first.

## How to use it
- Say it loud and clear: "Stop." Not a hint, not a question.
- Make the area safe — set the load down, kill the power, get people back.
- Say what you saw and what you think the hazard is.
- We figure it out together. If we disagree, the work stays stopped until somebody with the authority to resolve it looks at it.

## What will not happen
You will not be sent home, written up, mocked, or given the worst job tomorrow for stopping work. If you stop it and you turn out to be wrong, that is a good outcome — it means we all learned where the line is.

## What that costs
Sometimes twenty minutes. The alternative is an ambulance, a shutdown, an inspection, and a person who does not come back to work.

## Talk it over
1. Has anyone here ever stopped a job? What happened?
2. What would keep you from calling stop today?`,
  },
];
