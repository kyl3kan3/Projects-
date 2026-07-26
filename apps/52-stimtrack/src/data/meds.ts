/**
 * src/data/meds.ts
 *
 * The bundled fertility-medication library (seeded into the medication
 * table). Names, kinds, and routes only — NO doses, NO schedules suggested:
 * every schedule is user-entered from clinic instructions.
 *
 * Library to curate (typed rows: name, kind, route, ref_slug):
 * stims (Gonal-F, Follistim, Menopur, Rekovelle), antagonists (Cetrotide,
 * Ganirelix), agonists (Lupron), triggers (Ovidrel/hCG, Pregnyl, dual
 * trigger entries), luteal support (progesterone in oil, Endometrin,
 * Crinone), estrogen (estradiol oral/patch), adjuncts (dexamethasone,
 * doxycycline, baby aspirin), plus common FET meds.
 *
 * TODO:
 * - [ ] Type MedLibraryRow { slug, name, kind: injection|oral|patch|
 *       suppository|gel|other, route, isTriggerCandidate, refSlug }.
 * - [ ] Curate the rows above with correct kinds/routes (verify names
 *       against ASRM patient literature; brand + generic where they differ).
 * - [ ] isTriggerCandidate marks meds the trigger flow offers first.
 * - [ ] Export ordered for the picker (stims first, then by phase).
 */

export {};
