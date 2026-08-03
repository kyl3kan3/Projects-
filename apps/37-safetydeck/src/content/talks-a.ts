/**
 * Seed toolbox talks, part 1 of 2. Plain language, five minutes read aloud,
 * written to be spoken to a circle of people in daylight glare — short
 * sentences, no regulatory throat-clearing, and a rule citation only where the
 * number is the point.
 *
 * Body format is the tiny subset of Markdown that `lib/markdown.ts` renders:
 * `## heading`, `- bullet`, `1. numbered`, and paragraphs.
 */

import type { SeedTalk } from "./talk-types";

export const TALKS_A: SeedTalk[] = [
  {
    slug: "fall-protection-six-feet",
    title: "Fall protection above six feet",
    hazardTags: ["fall protection", "heights"],
    body: `## Why this one matters
Falls kill more construction workers than anything else. Most of them are not from a roof — they are from six to fifteen feet, off a deck edge or through an opening someone left open.

## The rule we work to
In construction, once you are six feet or more above the level below, you are protected: a guardrail, a hole cover, or a harness tied to a real anchor. Not "careful." Protected.

## What that looks like on this job
- Guardrails first. They protect everybody, all day, with nothing to remember.
- Harness and lanyard when guardrails cannot be there. Anchor rated for 5,000 pounds, tied above you when possible.
- Set the lanyard so a fall stops in under six feet and you cannot hit anything on the way.
- Check your harness before you put it on: cut webbing, rusted D-ring, bent snap hook — it comes out of service.

## Before we start today
- Walk the edges with me and point out every fall exposure you see.
- If you are tying off, show me your anchor before you climb.
- If you find an unprotected edge or hole, stop and tell me. That is not a delay, that is the job.

## Talk it over
1. Where on this site are we six feet up without a guardrail?
2. What is your anchor today, and who checked it?`,
  },
  {
    slug: "ladders-setup-and-use",
    title: "Ladders: setup, angle, and the last three feet",
    hazardTags: ["ladders", "falls"],
    body: `## Why this one matters
Ladder falls are short falls that break wrists, ankles, and skulls. Almost every one comes from the same four mistakes: wrong angle, wrong footing, wrong reach, wrong ladder.

## Set it up right
- Four to one. One foot out from the wall for every four feet of height.
- Feet on firm, level ground. Not on a mud pad, not on a plank, not on a bucket.
- Extension ladders go three feet past the landing and get tied off at the top.
- Stepladders open all the way with the spreaders locked. Never leaned closed against a wall.

## Use it right
- Face the ladder. Three points of contact. Hands free — hoist tools, do not carry them up.
- Belt buckle stays between the rails. If you are reaching past that, move the ladder.
- Never stand on the top two rungs of a stepladder.
- One person at a time unless it is built for two.

## Check it first
Bent rails, missing feet, cracked rungs, paint you cannot see through: tag it and get it off the site. A damaged ladder that stays on the truck gets used at 4:30 when everyone is tired.

## Talk it over
1. Is a ladder the right tool for what you are doing today, or do you need a lift?
2. Who tied off the ladder at the landing?`,
  },
  {
    slug: "scaffold-safety",
    title: "Scaffolds: planking, guardrails, and the competent person",
    hazardTags: ["scaffolds", "falls"],
    body: `## Why this one matters
A scaffold is a building we put up in an afternoon and trust with our lives. It only works if the person who inspected it knew what to look for and said so out loud.

## The non-negotiables
- A competent person inspects the scaffold before each shift and after anything that could have changed it — weather, a bump from equipment, a modification.
- Fully planked work platform. No gaps you could put a boot through.
- Guardrails at ten feet and above: toprail, midrail, toeboard.
- Base plates and mud sills on firm ground. Not on blocks, bricks, or a bucket of mix.
- Ties to the structure per the manufacturer's schedule — usually every four times the base width.

## What we do not do
- Climb the frame instead of using the access ladder.
- Ride a rolling scaffold while someone pushes it.
- Stack planks or boxes on the platform to gain height.
- Overload it. Know your duty rating and count your material.

## Before we start today
Look at the tag. Green means inspected and safe today. Yellow means restrictions — read them. Red or missing means do not get on it and come find me.

## Talk it over
1. Who is the competent person on this scaffold, and when did they last look at it?
2. What is stacked on the platform that does not need to be there?`,
  },
  {
    slug: "aerial-lifts",
    title: "Aerial lifts and scissor lifts",
    hazardTags: ["aerial lifts", "falls", "electrical"],
    body: `## Why this one matters
People die in lifts two ways: the lift tips, or they get catapulted out of the basket. Both are preventable and both happen in seconds.

## Before you go up
- Trained and authorized on that specific machine. A scissor lift and a boom lift are not the same skill.
- Walk the route: holes, slopes, soft ground, drop-offs, overhead lines, door headers.
- Function test at ground level — up, down, drive, steer, emergency lower.
- Outriggers down and leveled if the machine has them.

## In the basket
- In a boom lift, harness on with the lanyard tied to the anchor in the basket. Every time, even for one bolt.
- Feet on the floor. Not on the midrail, not on a bucket, not on a plank across the rails.
- Gate closed and latched.
- Keep the load inside. A pipe sticking out is what catches on steel and tips you.

## Power lines
Treat every line as energized. Ten feet minimum for lines up to 50kV, more above that. If the work is closer than that, we stop and call the utility.

## Talk it over
1. Where is the emergency lowering control on the machine you are using today?
2. What is directly above your work area?`,
  },
  {
    slug: "roof-edge-work",
    title: "Working the roof edge",
    hazardTags: ["fall protection", "roofing", "heights"],
    body: `## Why this one matters
The edge is where the work is and where the falls are. On a low-slope roof the ground looks close and the edge does not feel dangerous — until you step backward while carrying a bundle.

## How we protect the edge
- Warning line and a safety monitor is the weakest option and only works on low-slope roofs with the line set back six feet. We use it last, not first.
- Guardrails or a parapet high enough to count. Best option, protects everyone.
- Personal fall arrest tied to a ridge anchor or a properly rigged anchor point.
- Cover every skylight and roof opening with something rated for a person's weight, secured, and marked.

## Habits that keep you on the roof
- Know where the edge is at all times. Look before you step back.
- Never walk backward while carrying material.
- Keep the deck clear — fasteners and cutoffs roll under your boot.
- Watch for soft or rotten decking on a tear-off. Probe before you commit weight.

## Weather
Wet, frosty, or windy changes everything. Wind picks up sheet goods and takes you with them. We stop at 25 mph gusts or when the surface is slick.

## Talk it over
1. What is protecting the edge you are working today?
2. Where are the skylights, and who covered them?`,
  },
  {
    slug: "floor-holes-and-covers",
    title: "Holes, covers, and open shafts",
    hazardTags: ["fall protection", "housekeeping"],
    body: `## Why this one matters
Somebody always cuts a hole and means to come back to it. The next trade walks through in the dark and falls through the floor.

## The rule
Every hole two inches or more across gets a cover, a guardrail, or a barricade — immediately, not at the end of the day. A cover has to hold twice the weight of anyone or anything that could get on it, be secured against sliding, and be marked "HOLE" or "COVER."

## What we do
- If you cut it, you cover it before you walk away. No exceptions.
- Screw or nail the cover down. A loose sheet of plywood is a trap door.
- Mark it in paint big enough to read from across the room.
- Stairwells, elevator shafts, and floor openings get guardrails, not covers.
- If you find an unmarked hole, cover it yourself and tell me who left it.

## The one that gets people
A piece of plywood over a hole with a pallet of block stacked on it. It looks solid. It is not rated for anything and the next person to move that block is standing on nothing.

## Talk it over
1. What holes exist on our floor right now, and are they all covered?
2. Who else is working in this area after we leave today?`,
  },
  {
    slug: "trenching-and-excavation",
    title: "Trenching: five feet, the ladder, and the spoil pile",
    hazardTags: ["excavation", "trenching"],
    body: `## Why this one matters
A cubic yard of soil weighs about as much as a small car. A trench collapse does not knock you over — it crushes your chest and you suffocate. Rescue almost never arrives in time.

## The rules that keep the walls up
- Five feet or deeper needs a protective system: sloped, shored, or a trench box. Deeper than 20 feet needs an engineer.
- A competent person inspects the trench daily, after rain, and any time conditions change. They have the authority to order everyone out.
- Spoil pile stays at least two feet back from the edge. So does the equipment.
- Ladder or ramp within 25 feet of every worker in a trench four feet or deeper.

## Atmosphere
Trenches collect gases and lose oxygen. Deeper than four feet with any chance of a hazardous atmosphere — near a landfill, a leaking line, running equipment — means we test before anyone enters.

## Before we start today
- Who is the competent person, and what did they classify the soil as?
- Where is the ladder going?
- Are the locates marked and verified by hand digging within the tolerance zone?

## Talk it over
1. What is the deepest point of this trench and what is protecting it?
2. If the wall moved right now, could you get out?`,
  },
  {
    slug: "trench-protective-systems",
    title: "Slope it, shore it, or shield it",
    hazardTags: ["excavation", "trenching"],
    body: `## Why this one matters
"It's only chest deep" is on a lot of incident reports. The choice of protective system is not a preference — it comes from the soil, the depth, and the water.

## The three ways
- **Slope it back.** Simplest when you have room. Type C soil slopes one and a half to one — for every foot down, a foot and a half back. Type B is one to one. Type A is three quarters to one.
- **Shore it.** Hydraulic or timber shoring pushes back against the walls. Installed from the top down, removed from the bottom up, never with anyone in an unsupported section.
- **Shield it.** A trench box does not hold the soil back, it protects the space you stand in. It has to extend to within two feet of the bottom of the excavation or higher if the walls above it are stable.

## What changes the answer
- Water in the trench. Any water means the classification drops and a system that was fine yesterday is not fine today.
- Previously disturbed soil. Backfill is never Type A.
- Vibration from traffic or equipment.
- Rain overnight. The trench you left Friday is a different trench Monday.

## Talk it over
1. What is our system today and who decided?
2. What happens to that decision if it rains tonight?`,
  },
  {
    slug: "call-before-you-dig",
    title: "Call before you dig: locates and the tolerance zone",
    hazardTags: ["excavation", "utilities"],
    body: `## Why this one matters
Hitting a gas line can level a block. Hitting a primary electrical feed can kill the person on the shovel and cost a hospital its power. Both are avoidable with a phone call and a shovel.

## What we do every time
- 811 called before the dig, with the legal notice time given. No exceptions for "a quick hole."
- Locates marked, photographed, and dated. Marks fade and get graded away — the photo is your proof.
- Verify by hand digging within the tolerance zone on either side of the mark. Machine buckets do not go in there.
- Private utilities are not covered by 811: site lighting, irrigation, propane, data. Ask the owner and look at the as-builts.

## The color code
Red is electric. Yellow is gas, oil, or steam. Orange is communications. Blue is potable water. Green is sewer. Purple is reclaimed water. White is our own proposed dig.

## If you hit something
Stop. Get everyone back and upwind. Do not try to crimp, patch, or cover it. For gas, no ignition sources — that includes starting the machine. Call 911, then the utility, then me.

## Talk it over
1. Where are the marks on this dig and how old are they?
2. What is not on the locate ticket that could still be down there?`,
  },
  {
    slug: "confined-space-entry",
    title: "Confined space: the permit is not paperwork",
    hazardTags: ["confined space", "atmosphere"],
    body: `## Why this one matters
More than half the people who die in confined spaces are the ones who went in to rescue somebody. The air that dropped the first person is still there.

## What counts as a confined space
Big enough to get into, not designed for people to work in, and hard to get out of. Manholes, vaults, tanks, pits, crawl spaces, and unfinished sewers all qualify. If it can hold a hazardous atmosphere, engulf you, or trap you with sloping walls, it is a permit-required space.

## Nobody goes in without
- A written permit with the entry supervisor's name on it.
- Atmospheric testing in this order: oxygen, then flammables, then toxics — before entry and continuously while anyone is inside.
- Ventilation running.
- An attendant outside who does not leave and does not enter.
- Rescue arranged before entry. Not "we'll call 911."

## The numbers
Oxygen between 19.5 and 23.5 percent. Flammables under 10 percent of the lower explosive limit. Any toxic reading above its exposure limit means nobody enters.

## Talk it over
1. If the person inside stopped answering right now, what exactly would you do?
2. Who is the attendant, and what is their only job?`,
  },
  {
    slug: "lockout-tagout",
    title: "Lockout/tagout: your lock, your key, your life",
    hazardTags: ["lockout tagout", "electrical", "machinery"],
    body: `## Why this one matters
Every year people are killed by equipment somebody else turned on. The switch was off when they started. It was not locked.

## How it works
- Identify every energy source. Electrical is the obvious one; hydraulic pressure, springs, gravity, steam, and stored capacitance all count.
- Shut down, isolate, and lock each source with your own lock.
- Release stored energy: bleed the hydraulics, block the raised bed, discharge the capacitors.
- Verify by trying to start it. If it does not move, you are protected.

## Your lock, your key
Every person working on that equipment puts their own lock on the hasp. One person, one lock, one key, in their pocket. You do not remove someone else's lock — ever, for any reason, no matter how late it is.

## Tags are not locks
A tag says why. A lock is what stops the machine. A tag alone is only acceptable when the device physically cannot be locked, and then it needs extra protection.

## Before we start today
Walk the equipment with me and name every energy source out loud. If we disagree on the count, we do not start.

## Talk it over
1. Whose locks are on this machine right now?
2. What stored energy is left after the power is off?`,
  },
  {
    slug: "electrical-safety-basics",
    title: "Electrical: GFCIs, grounding, and assumed live",
    hazardTags: ["electrical"],
    body: `## Why this one matters
It takes very little current across your chest to stop your heart. On a jobsite, water, metal, and sweat make you a much better conductor than you were in the training video.

## The rules we work to
- Every 120-volt receptacle outlet used for temporary power gets GFCI protection. Test it with the button, not with your hand.
- Cords are inspected before each use: missing ground pin, cracked jacket, taped splice, or a strain-relief pulled out means it gets cut and thrown away.
- No cords through doorways that pinch them or across roadways without protection.
- Panels stay closed and labeled. No missing breaker blanks.

## Assume it is live
Every conductor is energized until you have locked it out and tested it yourself, with a meter you checked on a known live source first. "Somebody said they killed it" has ended careers and lives.

## Water and electricity
If it is raining or the ground is wet, GFCI protection is the only thing between you and the ground. Never plug or unplug with wet hands, and keep cord ends up out of standing water.

## Talk it over
1. What is feeding your tools today, and where is the GFCI?
2. What would you do if a cord in a puddle was still plugged in?`,
  },
  {
    slug: "overhead-power-lines",
    title: "Overhead power lines: ten feet, minimum",
    hazardTags: ["electrical", "power lines", "cranes"],
    body: `## Why this one matters
You do not have to touch a line. High voltage will arc across air to reach you, and the ground around a contact point can be energized for many feet. Crews get hurt trying to help the person on the machine.

## The clearance
Ten feet from any line up to 50kV, and more as voltage goes up. That ten feet applies to you, your ladder, your scaffold, your boom, your load, and the tag line you are holding.

## What we do
- Identify every overhead line before equipment comes on site, and mark the approach.
- Use a dedicated spotter whenever a boom or a mast could get near a line. Their only job is that clearance.
- Never carry a ladder or a length of pipe upright under lines.
- Do not assume a line is insulated. What looks like insulation is weatherproofing.

## If equipment does contact a line
- Stay in the cab. The machine is a safe island until the line is de-energized.
- Warn everyone away. Nobody touches the machine or the ground near it.
- If you must leave because of fire, jump clear — do not step down while holding the machine — and shuffle away with both feet together.

## Talk it over
1. Where is the nearest overhead line to today's work?
2. Who is spotting, and how do they stop the operator?`,
  },
  {
    slug: "temporary-power-and-cords",
    title: "Extension cords and temporary power",
    hazardTags: ["electrical", "housekeeping"],
    body: `## Why this one matters
Temporary power is the most abused system on any site. It gets built in a hurry, added to for months, and nobody owns it.

## Cord rules
- Hard usage or extra hard usage cord only. Household cords are not jobsite cords.
- Three-wire with the ground pin intact. A cut-off ground pin is a cord in the trash.
- Correct gauge for the length and the load. A long thin cord heats up and starves the tool.
- Out of walkways, out of water, up off the floor where we can, and never run through a doorway that pinches it.

## Panels and boxes
- Every temporary box gets a cover, a lock or restricted access, and legible labels.
- GFCI at the source protects everything downstream of it — but test it, because a tripped or failed GFCI feels exactly like a working one.
- No daisy-chained power strips. No strips outdoors.

## Housekeeping is electrical safety
Cords across the floor cause trips, get run over by carts, and get nicked. Route them along walls, hang them at height, and pick them up at the end of the shift.

## Talk it over
1. Which cord on this site should have been thrown away last week?
2. Where would a fire go if it started at the temp panel?`,
  },
  {
    slug: "hand-tools",
    title: "Hand tools: the right one, in good shape",
    hazardTags: ["hand tools", "cuts"],
    body: `## Why this one matters
Hand tool injuries are not dramatic, which is why they keep happening. Stitches, crushed fingers, and lost eyes all come from the same three habits.

## The three habits
- **Wrong tool.** A screwdriver is not a chisel. A wrench is not a hammer. Pliers are not a wrench. Improvising is how the tool slips.
- **Bad condition.** Mushroomed chisel heads throw metal chips. Loose hammer heads fly off. Dull blades need force, and force is what slips.
- **Wrong direction.** Cut away from your body. Push a wrench, do not pull it toward your face. Know where your hand goes when the tool lets go.

## Knives
Utility knives cut more people than any other hand tool. Use a retractable or self-retracting blade, change blades before they get dull, cut away from your body, and never leave a blade exposed on a bench or in a pouch.

## Care
- Inspect before use, every use.
- Keep cutting edges sharp and handles tight.
- Carry sharp tools in a sheath or a pouch, not in a pocket, and never up a ladder in your hand.
- Tag out and remove anything damaged instead of putting it back in the box.

## Talk it over
1. What tool are you using today that is not the right one for the job?
2. Where does your hand end up if the blade slips?`,
  },
  {
    slug: "power-tools-and-guards",
    title: "Power tools: guards stay on",
    hazardTags: ["power tools", "amputation"],
    body: `## Why this one matters
Guards get removed because they are in the way of a cut. Then the tool takes a finger, a hand, or an eye, and the guard is found in the truck.

## Before you pull the trigger
- Guard in place and working. If it will not close on its own, the tool is out of service.
- Right blade or bit for the material, mounted the right way, tight.
- Cord and plug intact, GFCI protected.
- Eye protection on — every time, no matter how small the cut.
- Loose clothing tucked, sleeves down and buttoned, no jewelry, long hair tied.

## While you cut
- Both hands where the tool wants them. Never reach around a spinning blade.
- Support and clamp the work. Holding stock by hand is how kickback finds you.
- Let the tool come to a stop before you set it down. A coasting blade walks.
- Unplug before changing blades, bits, or clearing a jam. The trigger you trust is the one that gets bumped.

## Grinders
Wheel rated above the tool's RPM, guard positioned between you and the wheel, and a full face shield over safety glasses. Never a cut-off wheel on a grinder built for grinding wheels.

## Talk it over
1. Which tool on this job has a guard that has been "temporarily" removed?
2. What is your body position if the blade binds?`,
  },
  {
    slug: "circular-and-cutoff-saws",
    title: "Circular saws, cut-off saws, and kickback",
    hazardTags: ["power tools", "cuts", "silica"],
    body: `## Why this one matters
Kickback happens faster than you can react. The saw comes back at you with the blade running, usually toward your thigh or your forearm.

## What causes kickback
- Blade pinching in the cut because the offcut is not supported or the material closes on it.
- Cutting with the retracting guard tied back.
- Forcing a dull blade or one with the wrong tooth count.
- Twisting the saw in the cut.

## Cut so it cannot bite you
- Support the material on both sides of the cut. Let the offcut fall free.
- Set blade depth so it just clears the material — about a quarter inch past.
- Stand out of the line of the blade, never directly behind it.
- Keep the cord over your shoulder and behind you.
- Let the blade get up to speed before it touches the work, and let it stop before you lift.

## Cut-off saws and masonry
Cutting concrete, block, or brick makes respirable silica. Wet cut or use a shroud with a vacuum every time — Table 1 in the silica rule tells us which control goes with which tool. Dry cutting without a control is not a shortcut, it is a lung disease with a twenty-year delay.

## Talk it over
1. Where does the offcut fall on your next cut?
2. What control are you using for dust today?`,
  },
  {
    slug: "silica-dust-controls",
    title: "Silica dust: Table 1 and why it matters in twenty years",
    hazardTags: ["silica", "respiratory", "dust"],
    body: `## Why this one matters
Cutting, grinding, or drilling concrete, block, brick, or stone releases crystalline silica fine enough to reach the bottom of your lungs. It scars them permanently. Silicosis has no cure and it shows up long after the job is done.

## Table 1 is the easy path
OSHA's silica rule gives a table of common tasks and the control that goes with each. Follow the row for your task and you are compliant without doing air monitoring.

- Handheld saw cutting masonry: integrated water delivery, or a dust shroud with a HEPA vacuum.
- Handheld grinder on concrete: shroud plus HEPA vacuum, and outdoors only for some tasks.
- Rotary hammer or core drill: dust collection with a HEPA vacuum, or water.
- Jackhammer or chipping: water spray or vacuum shroud, plus a respirator over four hours.

## What we do here
- The control comes out of the truck with the tool. Not afterward.
- HEPA vacuum, not a shop vac. A shop vac blows the fine dust back into the air.
- Do not dry sweep silica dust. Wet it or vacuum it.
- Respirators when Table 1 calls for one, and that means fit tested and clean shaven at the seal.

## Talk it over
1. What is your task on Table 1 today, and what control does it call for?
2. Who is downwind of your cut?`,
  },
  {
    slug: "respirators-and-fit-testing",
    title: "Respirators: the seal is the whole thing",
    hazardTags: ["respiratory", "PPE", "silica"],
    body: `## Why this one matters
A respirator that does not seal is a comfort item. Air takes the easy path, and the easy path is the gap along your jaw.

## What has to be true before you wear one
- Medical evaluation on file. Wearing a respirator is work for your heart and lungs.
- Fit test for that make, model, and size, within the last year.
- Clean shaven where the seal touches your face. Stubble breaks the seal. A beard makes a tight-fitting respirator useless.
- The right cartridge for the hazard, changed on schedule. A P100 does nothing for solvent vapor.

## Every single time you put it on
Do a user seal check. Cover the cartridges, inhale, and hold — the facepiece should pull in and stay. Cover the exhalation valve, exhale gently — it should push out and hold. If it leaks, reposition and check again.

## Care
Store it clean, in a bag, out of the sun and off the dashboard. Heat deforms the sealing surface. Wipe it down after each use. Replace cracked straps and hardened seals rather than stretching them one more day.

## Talk it over
1. When was your fit test, and on which model?
2. What are you filtering today — particles, vapor, or both?`,
  },
  {
    slug: "hearing-conservation",
    title: "Noise: you do not get your hearing back",
    hazardTags: ["noise", "PPE"],
    body: `## Why this one matters
Hearing loss from noise is gradual, painless, and permanent. Nobody notices it on the job. They notice it years later at a dinner table when they cannot follow the conversation.

## How loud is too loud
If you have to raise your voice to be heard by someone an arm's length away, you are around 85 decibels and you need protection. A circular saw, a jackhammer, a chop saw, and a concrete grinder are all well past that.

Every three decibels of increase cuts your safe exposure time in half. A 100-decibel tool gives you about fifteen minutes for the day.

## Protection that works
- Foam plugs: roll thin, pull the ear up and out, insert deep, hold. If you can see most of the plug from the front, it is not in.
- Muffs over glasses leak. Use thin temple glasses or plugs instead.
- Double up — plugs and muffs — for the loudest work like breaking concrete.
- Protection stays in for the whole exposure. Popping a plug out to talk resets the benefit.

## Also
Ringing in your ears after a shift is damage, not fatigue. Tell me and get a hearing test.

## Talk it over
1. What is the loudest tool running near you today?
2. Can you hear a backing alarm through your protection?`,
  },
  {
    slug: "hot-work-and-fire-watch",
    title: "Hot work: the fire watch is a job, not a favor",
    hazardTags: ["hot work", "fire", "welding"],
    body: `## Why this one matters
Welding and cutting sparks travel farther than people expect — 35 feet horizontally and much farther down. Fires from hot work often start hours after the torch is off, inside a wall or under a floor.

## Before the torch lights
- Permit signed if the site requires one. Most GCs do.
- Clear combustibles 35 feet, or cover what cannot move with a fire blanket.
- Look through, behind, and under. Sparks fall through gaps into insulation and dust.
- Extinguisher within reach, charged, and the right type.
- Fire watch assigned, with nothing else to do.

## The fire watch
Stays through the work and at least 30 minutes after — an hour where the site requires it. They watch the far side of the wall, the floor below, and the space above. They have a way to call for help and they know the address of the building they are standing in.

## Personal protection
Shade-appropriate lens, leathers, no synthetic clothing that melts, no cuffs or pockets that catch sparks. Ventilation or local exhaust for fumes — galvanized, stainless, and coated steel produce fumes that will put you on the ground.

## Talk it over
1. What is on the other side of the wall you are cutting?
2. Who is the fire watch and when do they stand down?`,
  },
  {
    slug: "fire-extinguishers",
    title: "Fire extinguishers and the way out",
    hazardTags: ["fire", "emergency"],
    body: `## Why this one matters
A fire extinguisher buys you thirty seconds and one decision. If the fire is bigger than a trash can, the right move is to leave, not to fight.

## Know the letters
- **A** — wood, paper, cloth, trash.
- **B** — flammable liquids: fuel, solvent, paint thinner.
- **C** — energized electrical.
- **D** — combustible metals.
- **K** — cooking oils.

The ABC dry chemical unit on the truck covers most of what we have. Water on a fuel fire spreads it; water on live electrical conducts back to you.

## Using it
PASS: Pull the pin. Aim at the base of the flames. Squeeze the handle. Sweep side to side. Stay low, keep your back to your exit, and back out — never let a fire get between you and the door.

## Before you need it
- Know where the nearest two extinguishers are on this site, right now.
- Check the gauge in the green and the pin intact.
- Know your exit route and the muster point, and know that a route blocked by material is not a route.

## When to just leave
Smoke you cannot see through, a fire above your head, more than one extinguisher's worth, or anything involving a cylinder. Get out, account for people, call 911.

## Talk it over
1. Where are the two nearest extinguishers?
2. Where do we meet if we evacuate?`,
  },
  {
    slug: "flammable-liquids",
    title: "Fuel and flammables: vapor is the hazard",
    hazardTags: ["fire", "flammables", "chemical"],
    body: `## Why this one matters
Gasoline does not burn — its vapor does, and the vapor is heavier than air. It pools in low spots and travels along the ground to an ignition source thirty feet away.

## Storage
- Approved safety cans with flame arrestors and self-closing lids. Not a milk jug, not an open bucket.
- Labeled with what is in them.
- Out of direct sun, away from ignition sources, and never in an enclosed vehicle cab or a shipping container in July.
- Quantities on site limited to what the day needs. Bulk goes in a proper cabinet or an approved storage locker.

## Fueling
- Engine off and cool. Small engines get hot enough to ignite vapor.
- Bond the can to the equipment — metal to metal contact — to stop a static spark.
- No smoking, no phone, no grinding within fifty feet.
- Fuel outdoors. Wipe spills, and do not leave a soaked rag in a pile: oily rags in a bucket generate their own heat.

## Spills
Small spill: stop the source, contain with absorbent, bag it as hazardous waste. Larger spill or one reaching a drain: stop work, get people upwind, call me. It becomes a reportable release fast.

## Talk it over
1. Where is fuel stored on this site and is it in the sun?
2. What is the nearest drain to where we fuel?`,
  },
  {
    slug: "heat-illness",
    title: "Heat: water, rest, shade, and the buddy",
    hazardTags: ["heat", "environment"],
    body: `## Why this one matters
Heat kills healthy people. It usually starts with someone who does not want to slow down the crew, and it ends with a body temperature high enough to cause brain damage.

## Know the difference
**Heat exhaustion** — heavy sweat, cold clammy skin, weakness, nausea, headache, dizziness. Get them to shade, loosen clothing, water in sips, cool wet cloths. They do not go back to work today.

**Heat stroke** — hot skin that may be dry, confusion, slurred speech, staggering, no sweat, or a seizure. This is a 911 call. Cool them aggressively while you wait: ice packs to the neck, armpits, and groin, water over them, fan them. Do not give fluids to someone who is confused.

## What we do all day
- Water where the work is, and a cup every fifteen minutes whether you feel thirsty or not. Thirst is a late signal.
- Shade and rest breaks that grow as the heat index does.
- New and returning workers get acclimatized over the first week. Most heat deaths are in the first few days on the job.
- Buddy checks. Watch for someone who has stopped sweating, gone quiet, or started making mistakes.

## Talk it over
1. Where is the water and where is the shade on this site?
2. Who is new this week, and who is watching them?`,
  },
  {
    slug: "cold-stress",
    title: "Cold: hypothermia, frostbite, and wet clothes",
    hazardTags: ["cold", "environment"],
    body: `## Why this one matters
You do not need arctic weather. Hypothermia happens in the forties when you are wet and the wind is up, and the first thing it takes is your judgment.

## Signs and what to do
**Hypothermia** — shivering, then slurred speech, clumsiness, confusion, and finally no shivering at all. Get them inside or into a vehicle, get wet clothes off, wrap them in blankets, warm sweet drinks if alert. Severe cases go to the hospital: handle them gently and call 911.

**Frostbite** — white or grayish skin, hard or waxy feel, numbness. Warm gradually with body heat or warm — not hot — water. Do not rub it, do not use a heater or a torch, and do not thaw it if refreezing is possible.

**Trench foot** — from wet feet, even above freezing. Dry socks matter more than boot brand.

## How we work in it
- Layers you can shed. Sweating in cold weather is dangerous — wet clothing loses most of its insulation.
- Dry socks and gloves in the truck. Change them at lunch.
- Warm break area and hot fluids. No alcohol, and go easy on the caffeine.
- Watch the wind chill, not the thermometer. Twenty degrees with a 25 mph wind is the danger zone.

## Talk it over
1. Who does not have a change of dry gloves today?
2. Where is the warming area?`,
  },
  {
    slug: "severe-weather-stop-work",
    title: "Lightning and severe weather: when we stop",
    hazardTags: ["weather", "emergency"],
    body: `## Why this one matters
Lightning kills people who thought the storm was still far away. Construction workers are frequently the ones caught out — on a roof, on a lift, holding a metal ladder.

## The rule we use
When you hear thunder, the storm is close enough to hit you. Thirty-thirty: if the gap between the flash and the thunder is under thirty seconds, we stop and get to shelter. We wait thirty minutes after the last thunder before going back out.

## Shelter that counts
A building with wiring and plumbing, or a hard-topped vehicle with the windows up. Not a tent, not a job trailer with an open door, not under a tree, not in an open pickup bed, not under the scaffold.

## Wind
- Stop crane and lift work at the manufacturer's limit — usually 20 to 30 mph gusts.
- Sheet goods, form panels, and roofing become sails. Secure or stack them flat before the front hits.
- Watch for stacked material and standing forms in a gust front.

## Rain and after
Trenches get reclassified. Scaffolds and steel get slick. Excavation walls that were fine yesterday are not. Electrical temp power and standing water do not mix.

## Talk it over
1. Where is the shelter from where you are working right now, and how long does it take to get there?
2. Who is watching the radar today?`,
  },
];
