/**
 * Activity-specific waiver skeletons.
 *
 * These are starting points, not legal advice, and every screen that offers one
 * says so in those words. WaiverWing supplies the signing and retrieval
 * machinery; an operator's attorney supplies the enforceable language. The
 * README lists this framing as the mitigation for risk 1 and it is a product
 * requirement, not a disclaimer bolted on.
 */

import type { ExpiryRule, WaiverBlock } from "@/db/schema";

export interface WaiverTemplate {
  key: string;
  name: string;
  blurb: string;
  activityTags: string[];
  expiryRule: ExpiryRule;
  ageOfMajority: number;
  blocks: WaiverBlock[];
}

const DISCLOSURE =
  "By signing below I confirm that I have read this agreement in full, that I am signing it voluntarily, and that my electronic signature has the same legal effect as a handwritten one.";

function signatureBlock(allowDrawn = true): WaiverBlock {
  return {
    key: "signature",
    kind: "signature",
    config: { disclosure: DISCLOSURE, allowDrawn },
  };
}

const EMERGENCY_CONTACT: WaiverBlock[] = [
  {
    key: "emergency_name",
    kind: "question",
    config: { label: "Emergency contact name", kind: "text", required: true },
  },
  {
    key: "emergency_phone",
    kind: "question",
    config: { label: "Emergency contact phone", kind: "phone", required: true },
  },
  {
    key: "emergency_relationship",
    kind: "question",
    config: { label: "Relationship to participant", kind: "text", required: true },
  },
];

export const TEMPLATES: WaiverTemplate[] = [
  {
    key: "climbing",
    name: "Climbing & bouldering gym",
    blurb:
      "Roped climbing, bouldering and auto-belay use, with the ground-fall and belay-competence clauses gyms are usually asked for.",
    activityTags: ["climbing", "bouldering", "top rope", "auto belay"],
    expiryRule: "days_365",
    ageOfMajority: 18,
    blocks: [
      {
        key: "risks",
        kind: "liability_text",
        config: {
          heading: "Acknowledgement of risk",
          body: "Climbing, bouldering and the use of climbing walls, auto-belays, ropes, harnesses and padded flooring involve inherent and significant risks of physical injury, including sprains, fractures, dislocations, head and spinal injury, permanent disability and death. These risks exist even when equipment is well maintained, staff are attentive and the facility is used exactly as intended. Falls to the floor, swinging falls into walls or other climbers, dropped equipment, equipment failure, and the acts or omissions of other participants are all foreseeable. I understand that padded flooring reduces but does not eliminate the risk of injury from a fall.",
        },
      },
      {
        key: "release",
        kind: "liability_text",
        config: {
          heading: "Release and waiver of claims",
          body: "In consideration of being permitted to use this facility, I release and agree not to sue the facility, its owners, officers, employees, instructors, volunteers and landlords for any claim arising out of my participation, including claims based on ordinary negligence in the design, maintenance, supervision or operation of the facility. I agree to be responsible for damage I cause to the facility or its equipment. This release binds my heirs, executors and assigns.",
        },
      },
      {
        key: "fitness",
        kind: "liability_text",
        config: {
          heading: "Physical condition and medical treatment",
          body: "I confirm I am physically able to participate and that I have disclosed any condition that could affect my safety or the safety of others. If I am injured, I authorise the facility to arrange emergency medical care at my expense, and I accept that staff are not medical professionals.",
        },
      },
      {
        key: "clause_belay",
        kind: "initialed_clause",
        config: {
          text: "I will only belay, lead climb or use an auto-belay after being checked by staff, and I will not coach or supervise anyone else's climbing unless staff have approved it.",
          prompt: "Initial to confirm you will be checked before belaying",
        },
      },
      {
        key: "clause_ground_fall",
        kind: "initialed_clause",
        config: {
          text: "I understand that bouldering means unroped climbing above padded flooring, that a ground fall from any height is possible on every attempt, and that no spotter or pad prevents injury.",
          prompt: "Initial to confirm you understand bouldering ground-fall risk",
        },
      },
      {
        key: "clause_supervision",
        kind: "initialed_clause",
        config: {
          text: "If I am signing for a participant under 18, I will remain in the facility and supervise them while they climb.",
          prompt: "Initial if signing for a minor",
        },
      },
      ...EMERGENCY_CONTACT,
      {
        key: "medical_flags",
        kind: "question",
        config: {
          label: "Injuries, conditions or medications staff should know about",
          kind: "long_text",
          required: false,
          medical: true,
          help: "Shoulder or ankle injuries, pregnancy, epilepsy, heart conditions, blood thinners.",
        },
      },
      {
        key: "first_visit",
        kind: "question",
        config: { label: "Is this your first visit to this gym?", kind: "yes_no", required: true },
      },
      signatureBlock(),
    ],
  },
  {
    key: "trampoline",
    name: "Trampoline & adventure park",
    blurb:
      "Jump courts, foam pits, ninja courses and slides — written for a family-heavy walk-up crowd with a lot of minors.",
    activityTags: ["trampoline", "foam pit", "ninja course", "dodgeball"],
    expiryRule: "days_365",
    ageOfMajority: 18,
    blocks: [
      {
        key: "risks",
        kind: "liability_text",
        config: {
          heading: "Acknowledgement of risk",
          body: "Trampolines, foam pits, airbags, slides, ninja courses and dodgeball courts involve a significant risk of injury including sprains, broken bones, concussion, neck and spinal injury, paralysis and death. Injuries commonly occur on landing, on double-bounce, in collisions between jumpers, and on flips or somersaults. Foam pits and airbags reduce impact but do not make any manoeuvre safe. I have read the park rules and I will follow the directions of court monitors at all times.",
        },
      },
      {
        key: "release",
        kind: "liability_text",
        config: {
          heading: "Release and waiver of claims",
          body: "In exchange for being allowed to enter and use the park, I release the park, its owners, employees and court monitors from liability for injury or loss arising from participation, including injuries caused by ordinary negligence in supervision, maintenance or operation of the attractions. I agree that I am responsible for the conduct of any minor I bring or sign for.",
        },
      },
      {
        key: "clause_flips",
        kind: "initialed_clause",
        config: {
          text: "I understand flips, somersaults and inverted landings carry the highest risk of catastrophic neck and spinal injury, and that attempting them is my choice and my responsibility.",
          prompt: "Initial to confirm you understand the risk of flips",
        },
      },
      {
        key: "clause_socks",
        kind: "initialed_clause",
        config: {
          text: "I will wear park-issued grip socks, remove jewellery and hard objects from my pockets, and leave the court if a monitor asks me to.",
          prompt: "Initial to confirm the equipment and rules",
        },
      },
      {
        key: "clause_minor_supervision",
        kind: "initialed_clause",
        config: {
          text: "If I am signing for participants under 18, I confirm I am their parent or legal guardian and that an adult from my party will remain on site for the whole session.",
          prompt: "Initial if signing for minors",
        },
      },
      ...EMERGENCY_CONTACT,
      {
        key: "medical_flags",
        kind: "question",
        config: {
          label: "Conditions staff should know about before you jump",
          kind: "long_text",
          required: false,
          medical: true,
          help: "Pregnancy, recent surgery, concussion history, seizure disorders, heart conditions.",
        },
      },
      signatureBlock(),
    ],
  },
  {
    key: "tours",
    name: "Guided tour & outfitter",
    blurb:
      "Kayak, raft, ATV, zipline and similar guided trips: remote-location, weather and equipment clauses, expiring per trip.",
    activityTags: ["kayak", "raft", "atv", "zipline", "guided tour"],
    expiryRule: "visit",
    ageOfMajority: 18,
    blocks: [
      {
        key: "risks",
        kind: "liability_text",
        config: {
          heading: "Nature of the activity and its risks",
          body: "Guided outdoor trips take place in a natural environment that cannot be made safe. Risks include drowning, capsize, cold-water immersion and hypothermia, heat illness, sunburn, dehydration, falls from height, rollover, collision, falling rock and timber, wildlife and insects, sudden and severe weather, equipment failure, and delays or errors in rescue and evacuation from a remote location where medical help may be hours away. Guides make judgement calls with incomplete information, and those judgements may turn out to be wrong.",
        },
      },
      {
        key: "release",
        kind: "liability_text",
        config: {
          heading: "Assumption of risk and release",
          body: "I choose to participate with full knowledge of these risks and I accept them. I release the outfitter, its guides, employees, agents, landowners and permitting agencies from claims for injury, illness, death, property damage or loss arising from the trip, including claims founded on ordinary negligence in guiding, instruction, equipment selection or route choice. This release does not apply to gross negligence or wilful misconduct where the law does not permit it.",
        },
      },
      {
        key: "fitness",
        kind: "liability_text",
        config: {
          heading: "Fitness, honesty and evacuation costs",
          body: "I confirm I have accurately described my swimming ability, fitness and medical history. I understand a search, rescue or evacuation may be billed to me or my insurer, and that the outfitter may end my participation at any time for safety reasons without refund.",
        },
      },
      {
        key: "clause_pfd",
        kind: "initialed_clause",
        config: {
          text: "I will wear the personal flotation device, helmet, harness or restraint issued to me for the entire activity, fitted as the guide directs.",
          prompt: "Initial to confirm you will wear the safety equipment",
        },
      },
      {
        key: "clause_alcohol",
        kind: "initialed_clause",
        config: {
          text: "I am not under the influence of alcohol, cannabis or any drug that impairs judgement, balance or reaction time, and I will not consume any during the trip.",
          prompt: "Initial to confirm you are unimpaired",
        },
      },
      {
        key: "clause_instructions",
        kind: "initialed_clause",
        config: {
          text: "I will follow my guide's instructions, including instructions to turn back, portage, or abandon equipment.",
          prompt: "Initial to confirm you will follow guide instructions",
        },
      },
      {
        key: "swim_ability",
        kind: "question",
        config: {
          label: "Can you swim 50 metres in moving water while wearing a PFD?",
          kind: "yes_no",
          required: true,
        },
      },
      {
        key: "weight",
        kind: "question",
        config: {
          label: "Weight (kg) — needed for PFD, harness and boat trim",
          kind: "text",
          required: true,
        },
      },
      ...EMERGENCY_CONTACT,
      {
        key: "medical_flags",
        kind: "question",
        config: {
          label: "Medical conditions, allergies and medications",
          kind: "long_text",
          required: false,
          medical: true,
          help: "Asthma, anaphylaxis (and whether you carry an auto-injector), diabetes, heart conditions, pregnancy.",
        },
      },
      signatureBlock(),
    ],
  },
  {
    key: "rentals",
    name: "Equipment rental",
    blurb:
      "Bikes, e-bikes, boards, skis, kayaks and paddleboards: damage responsibility and return-condition clauses alongside the injury release.",
    activityTags: ["bike rental", "ski rental", "paddleboard", "e-bike"],
    expiryRule: "days_365",
    ageOfMajority: 18,
    blocks: [
      {
        key: "risks",
        kind: "liability_text",
        config: {
          heading: "Risks of the rented equipment",
          body: "Riding, sliding, paddling and operating rented equipment carries a risk of serious injury or death from falls, collisions with vehicles, terrain or other users, mechanical failure, loss of control at speed, immersion, and the acts of third parties. Equipment is inspected before it goes out but can fail without warning. I am responsible for riding, skiing or paddling within my own ability and for the conditions I encounter.",
        },
      },
      {
        key: "release",
        kind: "liability_text",
        config: {
          heading: "Release and responsibility for the equipment",
          body: "I release the rental shop, its owners and employees from claims for injury or loss arising from my use of the equipment, including claims based on ordinary negligence in inspection, adjustment, fitting or instruction. I remain responsible for the equipment until it is returned and checked in: I will pay the cost of repair or replacement for damage, theft or loss while it is in my care, and I will not lend it to anyone who has not signed this agreement.",
        },
      },
      {
        key: "clause_fit",
        kind: "initialed_clause",
        config: {
          text: "The equipment was fitted and adjusted in front of me, I have had the chance to test it, and I accept it in its current condition. Ski and snowboard bindings are set to a release value based on the information I gave; a binding may release when I do not want it to, or fail to release when I do.",
          prompt: "Initial to accept the equipment as fitted",
        },
      },
      {
        key: "clause_helmet",
        kind: "initialed_clause",
        config: {
          text: "A helmet was offered to me. I understand a helmet reduces but does not eliminate the risk of head injury, and choosing not to wear one is my decision.",
          prompt: "Initial to confirm the helmet offer",
        },
      },
      {
        key: "clause_return",
        kind: "initialed_clause",
        config: {
          text: "I will return the equipment by the agreed time and accept late fees, and I will report any damage or crash at check-in rather than leaving it for the next customer.",
          prompt: "Initial to confirm the return terms",
        },
      },
      {
        key: "experience",
        kind: "question",
        config: {
          label: "Experience level with this equipment",
          kind: "text",
          required: true,
          help: "First time, occasional, confident, expert.",
        },
      },
      ...EMERGENCY_CONTACT,
      {
        key: "medical_flags",
        kind: "question",
        config: {
          label: "Anything that affects how we should fit or set up your equipment",
          kind: "long_text",
          required: false,
          medical: true,
          help: "Previous knee or shoulder injuries, joint replacements, balance or vision limitations.",
        },
      },
      signatureBlock(),
    ],
  },
];

export const TEMPLATE_DISCLAIMER =
  "A starting point, not legal advice. Have your attorney review the language before you take a real signature on it.";

export function template(key: string): WaiverTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}
