/**
 * src/lib/templates.ts
 *
 * The note templates: SOAP and DAP, each in a general form and in the three
 * modality forms the MVP ships (CBT, EMDR, couples).
 *
 * A template is two things at once — the section structure the clinician reads,
 * and the per-section *guidance* that steers drafting. The guidance is the whole
 * reason a modality template is not a cosmetic label: the EMDR "Data" section
 * asks for the target memory, SUDs at open and close, VOC and what was
 * installed, so the draft attends to those and says plainly when the tape does
 * not contain them. The section keys stay canonical to the format, because a
 * SOAP note that invents a fifth heading is not a SOAP note.
 */

import { sql } from "drizzle-orm";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, type Modality, type NoteFormat, type Template, type TemplateSection } from "@/db/schema";

export interface BuiltinTemplate {
  name: string;
  format: NoteFormat;
  modality: Modality;
  sections: TemplateSection[];
}

const SOAP_KEYS = ["subjective", "objective", "assessment", "plan"] as const;
const DAP_KEYS = ["data", "assessment", "plan"] as const;

export const SECTION_LABEL: Record<string, string> = {
  subjective: "Subjective",
  objective: "Objective",
  data: "Data",
  assessment: "Assessment",
  plan: "Plan",
};

/** Guidance by (modality, section key). General is the fallback for each key. */
const GUIDANCE: Record<Modality, Partial<Record<string, string>>> = {
  general: {
    subjective:
      "What the client reported in their own frame: presenting concerns this week, mood, sleep, stressors, and their words for how the week went. Quote sparingly and only what was said.",
    objective:
      "Observable clinical data: presentation, affect, orientation, engagement, risk indicators reviewed, and the interventions the clinician delivered this session.",
    data: "Both what the client reported and what was observed: presenting concerns, mood and sleep, presentation and affect, engagement, risk indicators reviewed, and the interventions delivered.",
    assessment:
      "Clinical formulation: progress toward goals, response to intervention, and current functioning. No diagnosis is asserted that the session did not support.",
    plan: "Next steps: focus for the next session, homework or between-session practice assigned, referrals or coordination, and the agreed cadence.",
  },
  cbt: {
    subjective:
      "The client's report through a CBT lens: situations that triggered distress, automatic thoughts as stated, mood ratings if given, and adherence to last session's homework.",
    objective:
      "The CBT work done in session: thought records reviewed, cognitive restructuring, behavioural experiments or exposure steps, SUDs/anxiety ratings before and after, and observable engagement with the model.",
    data: "The CBT work and the client's report together: triggering situations, automatic thoughts as stated, ratings given, homework adherence, and the in-session intervention (thought record, restructuring, exposure step) with ratings before and after.",
    assessment:
      "Response to the CBT protocol: which cognitions shifted, avoidance reduced or maintained, skill acquisition, and any barrier to homework completion.",
    plan: "The next rung of the hierarchy or the next thought-record assignment, stated concretely, plus the practice frequency agreed.",
  },
  emdr: {
    subjective:
      "The client's report at open: current disturbance, what has come up since the last set, sleep and containment between sessions, and readiness for further processing.",
    objective:
      "The EMDR protocol as run: phase worked, target memory addressed, negative and positive cognitions, SUDs at open and close, VOC, sets of bilateral stimulation, what was installed, and whether the body scan was clear. State plainly when a value was not recorded in session.",
    data: "The EMDR protocol as run alongside the client's report: phase worked, target memory, negative and positive cognitions, SUDs at open and close, VOC, sets of bilateral stimulation, installation, body scan, and containment used at close. State plainly when a value was not recorded in session.",
    assessment:
      "Processing response: movement in SUDs and VOC, blocking beliefs or looping, affect tolerance across sets, and whether the target is complete or incomplete.",
    plan: "Whether the target continues next session or a new target is selected, containment and self-care between sessions, and any stabilisation work needed first.",
  },
  couples: {
    subjective:
      "Each partner's report, attributed to the partner who said it and never merged into one voice: the week's events, each one's account of the conflict, and stated wants.",
    objective:
      "The dyad's observable pattern: the cycle enacted in session, who pursues and who withdraws, repair attempts and whether they landed, and the interventions used with the couple.",
    data: "Each partner's report attributed separately, plus the dyad's observable pattern: the cycle enacted in session, pursue/withdraw positions, repair attempts and whether they landed, and the interventions used.",
    assessment:
      "Relational formulation: the cycle as it is currently understood, each partner's part in it, safety considerations, and movement since the last session.",
    plan: "The between-session experiment or structured conversation assigned to the couple, individual work if any, and the focus agreed for next session.",
  },
  play: {},
  sfbt: {},
};

function sectionsFor(format: NoteFormat, modality: Modality): TemplateSection[] {
  const keys = format === "soap" ? SOAP_KEYS : DAP_KEYS;
  return keys.map((key) => ({
    key,
    label: SECTION_LABEL[key],
    guidance: GUIDANCE[modality]?.[key] ?? GUIDANCE.general[key] ?? "",
  }));
}

const MODALITY_NAME: Partial<Record<Modality, string>> = {
  general: "General",
  cbt: "CBT",
  emdr: "EMDR",
  couples: "Couples",
};

/** The templates shipped with the product. MVP: general + CBT + EMDR + couples. */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = (
  ["general", "cbt", "emdr", "couples"] as Modality[]
).flatMap((modality) =>
  (["soap", "dap"] as NoteFormat[]).map((format) => ({
    name: `${MODALITY_NAME[modality]} — ${format.toUpperCase()}`,
    format,
    modality,
    sections: sectionsFor(format, modality),
  })),
);

/**
 * Insert the built-in templates if they are not already there.
 *
 * Built-ins are practice-agnostic (`practice_id IS NULL`), so this runs once for
 * the installation rather than once per signup — but signup is when it is first
 * needed, and two signups can land at the same instant. An advisory lock inside
 * the transaction makes the check-then-insert safe without adding a unique index
 * to a table whose rows are also user-authored.
 */
export async function ensureBuiltinTemplates(): Promise<Template[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('sessionscribe:builtin-templates'))`,
    );
    const existing = await tx
      .select()
      .from(templates)
      .where(and(isNull(templates.practiceId), eq(templates.isBuiltin, true)));
    const missing = BUILTIN_TEMPLATES.filter(
      (b) => !existing.some((e) => e.format === b.format && e.modality === b.modality),
    );
    if (missing.length === 0) return existing;
    const inserted = await tx
      .insert(templates)
      .values(
        missing.map((b) => ({
          practiceId: null,
          name: b.name,
          format: b.format,
          modality: b.modality,
          sections: b.sections,
          isBuiltin: true,
        })),
      )
      .returning();
    return [...existing, ...inserted];
  });
}

/** Every template a practice may pick from: built-ins plus its own. */
export async function listTemplates(practiceId: string): Promise<Template[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(templates)
    .where(
      sql`(${templates.practiceId} is null and ${templates.isBuiltin} = true) or ${templates.practiceId} = ${practiceId}`,
    );
  return rows.sort(
    (a, b) => a.modality.localeCompare(b.modality) || a.format.localeCompare(b.format),
  );
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = getDb();
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  return row ?? null;
}

/**
 * Resolve the template for a capture: the per-session override if one was
 * chosen, else the client's default, else the built-in matching the client's
 * modality and the clinician's default format.
 */
export function resolveTemplate(
  available: Template[],
  opts: {
    overrideId?: string | null;
    clientDefaultId?: string | null;
    modality: Modality;
    format: NoteFormat;
  },
): Template | null {
  const byId = (id?: string | null) =>
    id ? available.find((t) => t.id === id) ?? null : null;
  return (
    byId(opts.overrideId) ??
    byId(opts.clientDefaultId) ??
    available.find((t) => t.modality === opts.modality && t.format === opts.format) ??
    available.find((t) => t.modality === "general" && t.format === opts.format) ??
    null
  );
}
