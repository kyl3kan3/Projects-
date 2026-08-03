/**
 * The 29 CFR 1904 recordability engine, and the intake questions that feed it.
 *
 * Correctness here is existential (README, Key Risks 1), so three rules govern
 * this module:
 *
 *  1. **Conservative.** Where the answers do not settle it, the result is
 *     `needsJudgment` — never a confident "not recordable". A wrongly excluded
 *     case is the failure mode that gets a company cited.
 *  2. **Cited.** Every decision carries the paragraph it came from, and the UI
 *     prints it. A foreman should be able to check our work against the rule.
 *  3. **Versioned as data.** `FORM_LOGIC_VERSION` is stored on every incident,
 *     so revising this logic next January cannot silently reclassify history.
 *
 * This is recordkeeping tooling, not legal advice — a sentence that is in the
 * product copy too, not just in this comment.
 *
 * Pure module: no db, no env. The intake wizard is a client component and
 * imports it directly.
 */

import type { CaseOutcome, IllnessCategory, Treatment } from "@/db/schema";

export const FORM_LOGIC_VERSION = "1904-2025.1";

/* ------------------------------------------------------------- the answers --- */

export type Trilean = "yes" | "no" | "unsure";

export interface RecordabilityAnswers {
  /** 1904.5: was it work-related? A non-work injury is not recordable at all. */
  workRelated: Trilean;
  /** 1904.7(b)(5): what treatment was given. */
  treatment: Treatment;
  /** Calendar days away from work, not counting the day of the injury. */
  daysAway: number;
  /** Calendar days of job transfer or restricted work. */
  daysRestricted: number;
  /** 1904.7(b)(6). */
  lostConsciousness: Trilean;
  /**
   * 1904.7(b)(7): a significant injury or illness diagnosed by a physician or
   * other licensed health care professional — fractured or cracked bone or
   * tooth, punctured eardrum, cancer, chronic irreversible disease.
   */
  significantDiagnosis: Trilean;
  /** Amputation or loss of an eye, for the 24-hour reporting duty (1904.39). */
  amputationOrEyeLoss: boolean;
}

export interface RecordabilityResult {
  recordable: boolean;
  /** True when the answers cannot settle it and a human has to decide. */
  needsJudgment: boolean;
  /** The 300 log's columns G–J. Null when the case is not recordable. */
  outcome: CaseOutcome | null;
  criterion: string;
  citation: string;
  explanation: string;
  /** Day counts after the 180-day cap in 1904.7(b)(3)(vii) is applied. */
  cappedDaysAway: number;
  cappedDaysRestricted: number;
  formLogicVersion: string;
}

/**
 * 1904.7(b)(3)(vii): you may stop counting at 180 calendar days away from work
 * *and/or* days of job transfer or restriction. It is one combined budget, not
 * 180 of each — getting that wrong inflates columns K and L on every long case.
 */
export function capDayCounts(
  daysAway: number,
  daysRestricted: number,
): { away: number; restricted: number } {
  const away = Math.max(0, Math.min(Math.trunc(daysAway) || 0, 180));
  const remaining = Math.max(0, 180 - away);
  const restricted = Math.max(0, Math.min(Math.trunc(daysRestricted) || 0, remaining));
  return { away, restricted };
}

/** Treatments that are medical treatment beyond first aid under 1904.7(b)(5). */
const BEYOND_FIRST_AID: Treatment[] = ["medical", "er", "hospitalized", "fatality"];

export function isBeyondFirstAid(treatment: Treatment): boolean {
  return BEYOND_FIRST_AID.includes(treatment);
}

export function deriveRecordability(a: RecordabilityAnswers): RecordabilityResult {
  const { away, restricted } = capDayCounts(a.daysAway, a.daysRestricted);
  const base = {
    cappedDaysAway: away,
    cappedDaysRestricted: restricted,
    formLogicVersion: FORM_LOGIC_VERSION,
  };

  // 1904.5 — work-relatedness is the gate. Not work-related, not recordable;
  // "unsure" is a judgment call and is never resolved downward on its own.
  if (a.workRelated === "no") {
    return {
      ...base,
      recordable: false,
      needsJudgment: false,
      outcome: null,
      criterion: "Not work-related",
      citation: "29 CFR 1904.5",
      explanation:
        "A case is recordable only if an event or exposure in the work environment caused or contributed to it, or significantly aggravated a pre-existing condition. This one was recorded as not work-related.",
    };
  }
  if (a.workRelated === "unsure") {
    return {
      ...base,
      recordable: true,
      needsJudgment: true,
      outcome: outcomeFor(a, away, restricted) ?? "other_recordable",
      criterion: "Work-relatedness needs a decision",
      citation: "29 CFR 1904.5",
      explanation:
        "Work-relatedness is presumed for anything resulting from an event or exposure in the work environment, and the exceptions in 1904.5(b)(2) are narrow. The case is logged as recordable pending review — read 1904.5(b)(2), and if it is close, ask counsel or your state's OSHA consultation program before removing it.",
    };
  }

  // Fatality — 1904.7(b)(2).
  if (a.treatment === "fatality") {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "death",
      criterion: "Death",
      citation: "29 CFR 1904.7(b)(2)",
      explanation:
        "A work-related fatality is always recordable, and it is entered in column G of the Form 300.",
    };
  }

  // Days away from work — 1904.7(b)(3).
  if (away > 0) {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "days_away",
      criterion: "Days away from work",
      citation: "29 CFR 1904.7(b)(3)",
      explanation: `The worker was away from work for ${away} calendar day${away === 1 ? "" : "s"} after the day of the injury, which makes the case recordable: column H, with the day count in column K.`,
    };
  }

  // Restricted work or transfer — 1904.7(b)(4).
  if (restricted > 0) {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "restricted",
      criterion: "Job transfer or restriction",
      citation: "29 CFR 1904.7(b)(4)",
      explanation: `Restricted work or a job transfer for ${restricted} calendar day${restricted === 1 ? "" : "s"} makes the case recordable: column I, with the day count in column L. Restricted work means the worker could not perform all of their routine job functions, or could not work a full shift.`,
    };
  }

  // Medical treatment beyond first aid — 1904.7(b)(5).
  if (isBeyondFirstAid(a.treatment)) {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "other_recordable",
      criterion: "Medical treatment beyond first aid",
      citation: "29 CFR 1904.7(b)(5)",
      explanation:
        "Treatment beyond the first-aid list in 1904.7(b)(5)(ii) makes the case recordable. With no days away and no restriction it goes in column J as an other-recordable case.",
    };
  }

  // Loss of consciousness — 1904.7(b)(6).
  if (a.lostConsciousness === "yes") {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "other_recordable",
      criterion: "Loss of consciousness",
      citation: "29 CFR 1904.7(b)(6)",
      explanation:
        "Any work-related loss of consciousness is recordable, however brief and whatever the treatment.",
    };
  }

  // Significant injury or illness diagnosed by a professional — 1904.7(b)(7).
  if (a.significantDiagnosis === "yes") {
    return {
      ...base,
      recordable: true,
      needsJudgment: false,
      outcome: "other_recordable",
      criterion: "Significant injury diagnosed by a health care professional",
      citation: "29 CFR 1904.7(b)(7)",
      explanation:
        "A fractured or cracked bone or tooth, a punctured eardrum, cancer, or a chronic irreversible disease is recordable when diagnosed by a physician or other licensed health care professional — even with no treatment and no lost time.",
    };
  }

  // Anything still unresolved keeps the case on the log pending a decision.
  const unsure: string[] = [];
  if (a.lostConsciousness === "unsure") unsure.push("loss of consciousness");
  if (a.significantDiagnosis === "unsure") unsure.push("a significant diagnosis");
  if (unsure.length > 0) {
    return {
      ...base,
      recordable: true,
      needsJudgment: true,
      outcome: "other_recordable",
      criterion: `Unresolved: ${unsure.join(" and ")}`,
      citation: "29 CFR 1904.7(b)",
      explanation: `The intake left ${unsure.join(" and ")} unresolved, so the case is logged as recordable until someone confirms otherwise — under-recording is the expensive mistake. Get the answer from the treating professional and update the case.`,
    };
  }

  return {
    ...base,
    recordable: false,
    needsJudgment: false,
    outcome: null,
    criterion:
      a.treatment === "observation"
        ? "Observation or diagnostic visit only"
        : a.treatment === "none"
          ? "No treatment needed"
          : "First aid only",
    citation: "29 CFR 1904.7(b)(5)(ii)",
    explanation:
      a.treatment === "observation"
        ? "A visit to a health care professional solely for observation or diagnostic procedures is not medical treatment under 1904.7(b)(5)(ii)(A), and with no days away, no restriction, no loss of consciousness and no significant diagnosis the case is not recordable. Keep this record anyway — it is the evidence if the injury develops."
        : "Only first aid was given, with no days away, no restricted work, no loss of consciousness and no significant diagnosis, so the case is not recordable. Keep this record anyway — it is the evidence if the injury develops.",
  };
}

function outcomeFor(
  a: RecordabilityAnswers,
  away: number,
  restricted: number,
): CaseOutcome | null {
  if (a.treatment === "fatality") return "death";
  if (away > 0) return "days_away";
  if (restricted > 0) return "restricted";
  if (
    isBeyondFirstAid(a.treatment) ||
    a.lostConsciousness === "yes" ||
    a.significantDiagnosis === "yes"
  ) {
    return "other_recordable";
  }
  return null;
}

/* ----------------------------------------------------- the reporting duty --- */

export interface SevereDuty {
  required: true;
  /** 8 for a fatality; 24 for in-patient hospitalization, amputation, eye loss. */
  hours: 8 | 24;
  reason: string;
  citation: string;
  /** The clock starts when the employer learns of the event, not at the event. */
  deadline: Date;
  phone: string;
  phoneLabel: string;
  portal: string;
  note: string;
}

export type SevereDutyResult = SevereDuty | { required: false };

export const OSHA_PHONE = "+18003216742";
export const OSHA_PHONE_LABEL = "1-800-321-6742";
export const OSHA_PORTAL = "https://www.osha.gov/report";

/**
 * 1904.39: fatalities within 8 hours; in-patient hospitalization, amputation,
 * and loss of an eye within 24 hours. The clock runs from when the employer
 * learns of the event.
 *
 * SafetyDeck never files on anyone's behalf. This returns the deadline and the
 * contact details; the incident row records what the company actually did.
 */
export function severeDuty(
  input: { treatment: Treatment; amputationOrEyeLoss: boolean },
  learnedAt: Date,
): SevereDutyResult {
  const base = {
    required: true as const,
    phone: OSHA_PHONE,
    phoneLabel: OSHA_PHONE_LABEL,
    portal: OSHA_PORTAL,
    note: "Report by phone to the 24-hour hotline, by phone to your nearest OSHA area office during business hours, or through the online portal. SafetyDeck does not file for you — this screen exists so the deadline is not missed, and so what you did is on the record.",
  };
  if (input.treatment === "fatality") {
    return {
      ...base,
      hours: 8,
      reason: "Work-related fatality",
      citation: "29 CFR 1904.39(a)(1)",
      deadline: new Date(learnedAt.getTime() + 8 * 3_600_000),
    };
  }
  const reasons: string[] = [];
  if (input.treatment === "hospitalized") reasons.push("in-patient hospitalization");
  if (input.amputationOrEyeLoss) reasons.push("amputation or loss of an eye");
  if (reasons.length === 0) return { required: false };
  return {
    ...base,
    hours: 24,
    reason: capitalize(reasons.join(", ")),
    citation: "29 CFR 1904.39(a)(2)",
    deadline: new Date(learnedAt.getTime() + 24 * 3_600_000),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* -------------------------------------------------------- privacy concern --- */

/**
 * 1904.29(b)(7): the six privacy-concern categories. On these cases the
 * employee's name is replaced with "Privacy Case" on the Form 300, and the names
 * are kept in a separate confidential list.
 */
export const PRIVACY_CASE_REASONS: { id: string; label: string }[] = [
  {
    id: "intimate",
    label: "Injury or illness to an intimate body part or the reproductive system",
  },
  { id: "sexual_assault", label: "Injury or illness resulting from a sexual assault" },
  { id: "mental_illness", label: "A mental illness" },
  { id: "hiv_hep_tb", label: "HIV infection, hepatitis, or tuberculosis" },
  {
    id: "needlestick",
    label: "A needlestick or sharps injury involving contaminated material",
  },
  { id: "requested", label: "The employee voluntarily asked that their name be left off" },
];

export const PRIVACY_MASK = "Privacy Case";

export function privacyReasonLabel(id: string | null): string | null {
  if (!id) return null;
  return PRIVACY_CASE_REASONS.find((r) => r.id === id)?.label ?? null;
}

/* --------------------------------------------------- the intake questions --- */

export type QuestionKind =
  | "employee"
  | "datetime"
  | "text"
  | "longtext"
  | "choice"
  | "trilean"
  | "number"
  | "privacy"
  | "review";

export interface QuestionOption {
  value: string;
  label: string;
  /** Rule text or plain-language detail printed under the option. */
  detail?: string;
}

export interface IntakeQuestion {
  id: string;
  kind: QuestionKind;
  /** Asked in the plainest words that are still accurate. */
  prompt: string;
  help?: string;
  /** Rule citation shown beneath the question. */
  citation?: string;
  options?: QuestionOption[];
  optional?: boolean;
  placeholder?: string;
  suffix?: string;
}

/** The first-aid list from 1904.7(b)(5)(ii), where the foreman can see it. */
export const FIRST_AID_LIST = [
  "Non-prescription medication at non-prescription strength",
  "Tetanus immunization",
  "Cleaning, flushing or soaking a surface wound",
  "Bandages, gauze pads, butterfly bandages or Steri-Strips",
  "Hot or cold therapy",
  "Non-rigid support: elastic bandages, wraps, back belts",
  "Temporary immobilization while transporting an accident victim",
  "Drilling a nail to relieve pressure, or draining a blister",
  "Eye patches, or removing foreign bodies from the eye with irrigation or a swab",
  "Removing splinters or foreign material from skin with tweezers or simple means",
  "Finger guards",
  "Massage",
  "Drinking fluids for heat stress",
];

export const ILLNESS_CATEGORY_OPTIONS: { value: IllnessCategory; label: string }[] = [
  { value: "injury", label: "Injury" },
  { value: "skin_disorder", label: "Skin disorder" },
  { value: "respiratory", label: "Respiratory condition" },
  { value: "poisoning", label: "Poisoning" },
  { value: "hearing_loss", label: "Hearing loss" },
  { value: "other_illness", label: "All other illnesses" },
];

export const TREATMENT_OPTIONS: QuestionOption[] = [
  {
    value: "none",
    label: "Nothing — they kept working",
    detail: "No treatment of any kind was needed.",
  },
  {
    value: "first_aid",
    label: "First aid only",
    detail:
      "The full list is in 1904.7(b)(5)(ii): bandages, cleaning a surface wound, hot or cold therapy, non-prescription medication at non-prescription strength, elastic wraps, a tetanus shot, splinter removal, eye irrigation.",
  },
  {
    value: "observation",
    label: "Saw a doctor, but only for a look or an x-ray",
    detail:
      "A visit solely for observation, counselling, or diagnostic procedures is not medical treatment — 1904.7(b)(5)(ii)(A). If they left with a prescription or stitches, pick the next option instead.",
  },
  {
    value: "medical",
    label: "Medical treatment beyond first aid",
    detail:
      "Prescription medication, stitches or staples, a rigid splint or cast, physical therapy, removing foreign material from an eye with anything other than irrigation.",
  },
  {
    value: "er",
    label: "Treated at an emergency room or urgent care",
    detail:
      "Treatment beyond first aid, given at an ER or urgent care, without being admitted as an in-patient.",
  },
  {
    value: "hospitalized",
    label: "Admitted to the hospital as an in-patient",
    detail:
      "In-patient admission for treatment starts a 24-hour duty to notify OSHA — 1904.39(a)(2). Admission solely for observation does not.",
  },
  {
    value: "fatality",
    label: "The worker died",
    detail: "A work-related fatality must be reported to OSHA within 8 hours — 1904.39(a)(1).",
  },
];

/**
 * The intake flow, one question per screen. Ordered so the facts come first and
 * the classifying questions come once the story is written down — a foreman
 * answering "days away" cold gets it wrong more often than one who has just
 * described what happened.
 */
export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "employeeId",
    kind: "employee",
    prompt: "Who was hurt?",
    help: "Pick from the roster. If they are not on it, add them in Settings first — the log needs their job title.",
  },
  {
    id: "occurredAt",
    kind: "datetime",
    prompt: "When did it happen?",
    help: "As close as you can get. The date decides which year's log the case lands on.",
  },
  {
    id: "learnedAt",
    kind: "datetime",
    prompt: "When did the office find out?",
    help: "The OSHA reporting clocks for a fatality, a hospitalization, an amputation or the loss of an eye run from this moment, not from the injury.",
    citation: "29 CFR 1904.39(b)(7)",
  },
  {
    id: "siteLabel",
    kind: "text",
    prompt: "Which site or job?",
    placeholder: "Harbor Point — Building C",
  },
  {
    id: "whereOccurred",
    kind: "text",
    prompt: "Where on the site?",
    placeholder: "Second-floor deck, north edge",
    optional: true,
  },
  {
    id: "description",
    kind: "longtext",
    prompt: "What happened?",
    help: "Plain sentences, in order: what they were doing, what went wrong, what hurt them. This text prints on the 300 and the 301.",
    placeholder:
      "Carrying a bundle of shingles up the extension ladder, missed the third rung from the top and slid about six feet, catching his left forearm on the rail.",
  },
  {
    id: "objectSubstance",
    kind: "text",
    prompt: "What object or substance harmed them directly?",
    help: "The 301 asks for this specifically — the ladder rail, the saw blade, the chemical, the pallet.",
    placeholder: "Aluminium ladder rail",
    optional: true,
  },
  {
    id: "injuryType",
    kind: "text",
    prompt: "What is the injury or illness?",
    placeholder: "Laceration, seven stitches",
  },
  {
    id: "bodyPart",
    kind: "text",
    prompt: "Which body part?",
    placeholder: "Left forearm",
    optional: true,
  },
  {
    id: "illnessCategory",
    kind: "choice",
    prompt: "Is this an injury, or one of the illness categories?",
    help: "This picks the column in section (M) of the Form 300. Most cases are an injury.",
    citation: "29 CFR 1904.29",
    options: ILLNESS_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  },
  {
    id: "workRelated",
    kind: "trilean",
    prompt: "Did something at work cause or contribute to it?",
    help: "Work-relatedness is presumed for anything resulting from an event or exposure in the work environment. The exceptions in 1904.5(b)(2) are narrow: eating your own food, a common cold, personal grooming, a voluntary wellness event.",
    citation: "29 CFR 1904.5",
  },
  {
    id: "treatment",
    kind: "choice",
    prompt: "What treatment did they get?",
    help: "This question decides most cases. Read the options — the difference between a look at an x-ray and a prescription is the difference between a recordable case and a first-aid record.",
    citation: "29 CFR 1904.7(b)(5)",
    options: TREATMENT_OPTIONS,
  },
  {
    id: "amputationOrEyeLoss",
    kind: "trilean",
    prompt: "Was there an amputation or the loss of an eye?",
    help: "Either one starts a 24-hour duty to notify OSHA, whatever else happened. An amputation includes a fingertip with bone loss.",
    citation: "29 CFR 1904.39(a)(2)",
  },
  {
    id: "daysAway",
    kind: "number",
    prompt: "How many calendar days away from work?",
    help: "Counting starts the day after the injury — the day it happened is never counted. Weekends and days off count if they could not have worked. Enter 0 if they have not missed a day.",
    citation: "29 CFR 1904.7(b)(3)(i)",
    suffix: "days",
  },
  {
    id: "daysRestricted",
    kind: "number",
    prompt: "How many calendar days on restricted duty or transferred?",
    help: "Restricted means they could not do all their routine job functions, or could not work a full shift. Count the days after they came back but still could not do the whole job. Enter 0 if none.",
    citation: "29 CFR 1904.7(b)(4)",
    suffix: "days",
  },
  {
    id: "stillCounting",
    kind: "trilean",
    prompt: "Are they still off work, or still restricted?",
    help: "If yes, the day counts will keep growing and the log needs updating as they do. Counting stops at 180 days combined.",
    citation: "29 CFR 1904.7(b)(3)(vii)",
  },
  {
    id: "lostConsciousness",
    kind: "trilean",
    prompt: "Did they lose consciousness, even briefly?",
    help: "Any work-related loss of consciousness is recordable on its own, regardless of treatment.",
    citation: "29 CFR 1904.7(b)(6)",
  },
  {
    id: "significantDiagnosis",
    kind: "trilean",
    prompt:
      "Did a doctor diagnose a fracture, a cracked bone or tooth, a punctured eardrum, cancer, or a chronic irreversible disease?",
    help: "These are recordable even with no treatment and no lost time. If nobody has seen a doctor yet, answer Not sure.",
    citation: "29 CFR 1904.7(b)(7)",
  },
  {
    id: "privacyCase",
    kind: "privacy",
    prompt: "Is this a privacy-concern case?",
    help: 'On these six categories the Form 300 prints "Privacy Case" instead of the name, and the names live in a separate confidential list.',
    citation: "29 CFR 1904.29(b)(7)",
  },
  {
    id: "review",
    kind: "review",
    prompt: "Here is what we will record.",
  },
];

export const INTAKE_QUESTION_COUNT = INTAKE_QUESTIONS.length;
