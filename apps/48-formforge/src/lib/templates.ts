/**
 * src/lib/templates.ts
 *
 * The template gallery: complete, editable intake packets per vertical.
 *
 * These are real drafting, not filler — a practice should be able to copy one,
 * change the practice name in the consent text, and send it. The consent copy is
 * written to be plain-language and specific; it is a starting point a practice's
 * own counsel should review, which is stated in the gallery UI rather than
 * implied here.
 */

import type { FormBlock } from "@/db/schema";

export interface PacketTemplate {
  key: string;
  title: string;
  vertical: string;
  description: string;
  blocks: FormBlock[];
}

const demographics = (heading = "About you"): FormBlock => ({
  key: "demographics",
  kind: "demographics",
  config: {
    heading,
    fields: [
      { key: "first_name", required: true },
      { key: "last_name", required: true },
      { key: "preferred_name", required: false },
      { key: "dob", required: true },
      { key: "pronouns", required: false },
      { key: "phone", required: true },
      { key: "email", required: true },
      { key: "address", required: false },
      { key: "emergency_name", required: true },
      { key: "emergency_phone", required: true },
      { key: "emergency_relationship", required: false },
    ],
  },
});

const insurance = (): FormBlock => ({
  key: "insurance",
  kind: "insurance",
  config: {
    heading: "Insurance",
    fields: [
      { key: "self_pay", required: true },
      { key: "carrier", required: false },
      { key: "member_id", required: false },
      { key: "group_number", required: false },
      { key: "subscriber_name", required: false },
      { key: "subscriber_relationship", required: false },
    ],
  },
});

const cardUpload = (): FormBlock => ({
  key: "insurance_card",
  kind: "upload",
  config: {
    heading: "Insurance card",
    label: "Photo of the front of your insurance card",
    help: "Skip this if you are paying privately. Photos are encrypted as soon as they arrive.",
    accept: ["image/jpeg", "image/png", "application/pdf"],
    maxBytes: 8 * 1024 * 1024,
    required: false,
  },
});

const phq9 = (): FormBlock => ({
  key: "phq9",
  kind: "screener",
  config: { instrument: "phq9" },
});

const gad7 = (): FormBlock => ({
  key: "gad7",
  kind: "screener",
  config: { instrument: "gad7" },
});

const DISCLOSURE =
  "By typing or drawing my name below I am signing this document electronically. " +
  "I agree that my electronic signature is the legal equivalent of my handwritten signature, " +
  "and I confirm I have read the text above.";

/* ------------------------------------------------------- behavioral health */

const behavioralHealth: PacketTemplate = {
  key: "behavioral_health_v1",
  title: "Behavioral health intake packet",
  vertical: "Therapy, psychology, counseling",
  description:
    "Demographics, insurance, presenting concern, PHQ-9 and GAD-7, plus consent to treatment and a privacy-practices acknowledgment.",
  blocks: [
    demographics(),
    insurance(),
    cardUpload(),
    {
      key: "history",
      kind: "history",
      config: {
        heading: "What brings you in",
        intro:
          "Answer in as much or as little detail as you like. Your clinician reads this before your first session, so anything you write here is time you do not have to spend explaining.",
        questions: [
          {
            key: "presenting_concern",
            label: "What would you like help with right now?",
            kind: "long_text",
            required: true,
          },
          {
            key: "duration",
            label: "How long has this been going on?",
            kind: "text",
            required: false,
            help: "For example: about six months",
          },
          {
            key: "prior_therapy",
            label: "Have you worked with a therapist or counselor before?",
            kind: "yes_no",
            required: true,
          },
          {
            key: "prior_therapy_detail",
            label: "If yes, what was helpful and what was not?",
            kind: "long_text",
            required: false,
          },
          {
            key: "medications",
            label: "Medications you are currently taking, including dosage if you know it",
            kind: "long_text",
            required: false,
          },
          {
            key: "medical_conditions",
            label: "Medical conditions we should know about",
            kind: "long_text",
            required: false,
          },
          {
            key: "primary_care",
            label: "Primary care provider (name and city)",
            kind: "text",
            required: false,
          },
        ],
      },
    },
    phq9(),
    gad7(),
    {
      key: "consent_treatment",
      kind: "consent",
      config: {
        heading: "Consent to treatment",
        requireScroll: true,
        body: [
          "I am asking for psychotherapy services for myself. I understand that therapy is a collaborative process, that its outcome cannot be guaranteed, and that I may stop at any time without penalty.",
          "Sessions are 50 minutes unless we agree otherwise. If I cannot attend, I will give at least 24 hours' notice; late cancellations and missed sessions may be billed at the full session fee, and insurance does not reimburse a missed session.",
          "My clinician keeps a clinical record of our work. I may ask to see it or ask for a copy, and my clinician will explain anything in it that is unclear.",
          "Confidentiality has limits set by law. My clinician must break confidentiality if there is a serious risk that I will harm myself or another person, if there is reasonable suspicion of abuse or neglect of a child, an older adult, or a dependent adult, or if a court orders disclosure. Where possible, my clinician will tell me before disclosing anything.",
          "If I am in crisis between sessions I will call or text 988, go to my nearest emergency department, or call 911. I understand this practice does not provide 24-hour emergency coverage.",
        ].join("\n\n"),
      },
    },
    {
      key: "sign_treatment",
      kind: "signature",
      config: {
        heading: "Sign the consent to treatment",
        disclosure: DISCLOSURE,
        allowDrawn: true,
        consentBlockKey: "consent_treatment",
      },
    },
    {
      key: "consent_privacy",
      kind: "consent",
      config: {
        heading: "Notice of privacy practices",
        requireScroll: true,
        body: [
          "This practice keeps your health information private and uses it to provide your care, to arrange payment for that care, and to run the practice. Those three purposes do not need your separate permission.",
          "Anything else does. Your information will not be sold, and it will not be used for marketing. If you want it shared with anyone else — a partner, a physician, a school, an employer — you will be asked to sign a separate release naming that person and saying what may be shared.",
          "You have the right to see and get a copy of your record, to ask for a correction, to ask for a list of disclosures the practice has made, to ask that the practice contact you a particular way, and to receive a paper copy of this notice.",
          "This acknowledgment records that you received this notice. It is not consent to treatment, and it does not waive any of the rights described above.",
        ].join("\n\n"),
      },
    },
    {
      key: "sign_privacy",
      kind: "signature",
      config: {
        heading: "Acknowledge the privacy notice",
        disclosure:
          "By signing I acknowledge that I received and read this practice's notice of privacy practices. " +
          "I agree my electronic signature is the legal equivalent of my handwritten signature.",
        allowDrawn: true,
        consentBlockKey: "consent_privacy",
      },
    },
  ],
};

/* ------------------------------------------------------- physical therapy */

const physicalTherapy: PacketTemplate = {
  key: "physical_therapy_v1",
  title: "Physical therapy intake packet",
  vertical: "PT / OT / rehab",
  description:
    "Demographics, insurance, injury history with pain rating and red-flag screening, plus consent to treat and financial responsibility.",
  blocks: [
    demographics("Patient details"),
    insurance(),
    cardUpload(),
    {
      key: "injury",
      kind: "history",
      config: {
        heading: "Your injury",
        intro:
          "Your therapist reads this before you arrive so your first visit can be spent moving rather than talking.",
        questions: [
          {
            key: "area",
            label: "Where does it hurt? Be as specific as you can.",
            kind: "text",
            required: true,
          },
          {
            key: "onset",
            label: "When did it start, and what were you doing?",
            kind: "long_text",
            required: true,
          },
          {
            key: "pain_now",
            label: "Rate the pain right now from 0 to 10",
            kind: "text",
            required: true,
            help: "0 is no pain, 10 is the worst pain you can imagine",
          },
          {
            key: "pain_worst",
            label: "Rate the pain at its worst in the last week",
            kind: "text",
            required: true,
          },
          {
            key: "imaging",
            label: "Have you had an X-ray, MRI, or CT scan for this?",
            kind: "yes_no",
            required: true,
          },
          {
            key: "surgery",
            label: "Any surgery on this area? When?",
            kind: "text",
            required: false,
          },
          {
            key: "red_flags",
            label:
              "Have you had unexplained weight loss, night pain that wakes you, fever, or loss of bowel or bladder control?",
            kind: "yes_no",
            required: true,
            help: "Your therapist will follow up before your visit if you answer yes.",
          },
          {
            key: "goals",
            label: "What do you want to be able to do again?",
            kind: "long_text",
            required: true,
          },
        ],
      },
    },
    {
      key: "consent_pt",
      kind: "consent",
      config: {
        heading: "Consent to treatment and financial responsibility",
        requireScroll: true,
        body: [
          "I consent to physical therapy evaluation and treatment. I understand treatment may include hands-on techniques, exercise, and modalities such as heat, ice, or electrical stimulation, and that some soreness after treatment is normal.",
          "I understand no specific result has been promised, that I should tell my therapist immediately if anything hurts more than expected, and that I may refuse any part of treatment at any time.",
          "I am financially responsible for charges not covered by my insurance, including visits beyond my plan's authorized number and any co-payment or deductible. I will give 24 hours' notice to cancel; missed visits may be billed.",
          "I confirm that the health information I have given on this form is accurate and complete as far as I know.",
        ].join("\n\n"),
      },
    },
    {
      key: "sign_pt",
      kind: "signature",
      config: {
        heading: "Sign the consent",
        disclosure: DISCLOSURE,
        allowDrawn: true,
        consentBlockKey: "consent_pt",
      },
    },
  ],
};

/* ----------------------------------------------------------- dietitian */

const dietitian: PacketTemplate = {
  key: "dietitian_v1",
  title: "Nutrition counseling intake packet",
  vertical: "Dietitian / nutrition",
  description:
    "Demographics, insurance, eating and medical history with a weight-talk preference, plus consent to nutrition counseling.",
  blocks: [
    demographics("About you"),
    insurance(),
    {
      key: "nutrition",
      kind: "history",
      config: {
        heading: "Eating and health history",
        intro:
          "There are no wrong answers here, and nothing you write is used to judge you. It is used to plan your first appointment.",
        questions: [
          {
            key: "reason",
            label: "What made you book this appointment?",
            kind: "long_text",
            required: true,
          },
          {
            key: "conditions",
            label: "Diagnosed conditions relevant to eating (diabetes, IBS, coeliac, PCOS, reflux…)",
            kind: "long_text",
            required: false,
          },
          {
            key: "allergies",
            label: "Food allergies or intolerances",
            kind: "text",
            required: false,
          },
          {
            key: "typical_day",
            label: "Walk us through a typical day of eating",
            kind: "long_text",
            required: true,
          },
          {
            key: "supplements",
            label: "Supplements and medications you take",
            kind: "long_text",
            required: false,
          },
          {
            key: "weight_talk",
            label: "Would you like weight discussed in your sessions?",
            kind: "yes_no",
            required: true,
            help: "Either answer is fine. Your dietitian will follow your preference.",
          },
          {
            key: "prior_care",
            label: "Have you worked with a dietitian or followed a structured plan before?",
            kind: "long_text",
            required: false,
          },
        ],
      },
    },
    {
      key: "consent_nutrition",
      kind: "consent",
      config: {
        heading: "Consent to nutrition counseling",
        requireScroll: true,
        body: [
          "I consent to medical nutrition therapy with a registered dietitian. I understand this is education and counseling, not medical treatment, and that it does not replace care from my physician.",
          "I understand my dietitian may recommend changes to how I eat, and that I decide what to do with those recommendations. No outcome — including any change in weight, laboratory value, or symptom — has been promised to me.",
          "I will tell my dietitian about medications, supplements and conditions that could interact with a change in diet, and I will speak to my physician before stopping or changing any prescribed medication.",
          "I am responsible for charges my insurance does not cover, and I will give 24 hours' notice to cancel an appointment.",
        ].join("\n\n"),
      },
    },
    {
      key: "sign_nutrition",
      kind: "signature",
      config: {
        heading: "Sign the consent",
        disclosure: DISCLOSURE,
        allowDrawn: true,
        consentBlockKey: "consent_nutrition",
      },
    },
  ],
};

export const TEMPLATES: PacketTemplate[] = [behavioralHealth, physicalTherapy, dietitian];

export function templateByKey(key: string): PacketTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}
