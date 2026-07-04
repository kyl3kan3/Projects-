/**
 * src/lib/blocks.ts
 *
 * The structured block system: definitions, zod config schemas, and
 * validation for every block kind. Blocks -- not a drag-anything canvas --
 * are what make submissions exportable records (README differentiation 3).
 *
 * TODO:
 * - [ ] Block registry: demographics, insurance, history (free text +
 *       structured questions), consent (rich text + required scroll),
 *       signature, upload (types/size caps), screener (see screeners.ts).
 * - [ ] zod schema per block config AND per block answer payload.
 * - [ ] validateForm(blocks): ordering rules (signature requires a
 *       preceding consent; at most one demographics block).
 * - [ ] Export mapping: each block kind declares its stable CSV columns
 *       (the EHR-lite contract -- changing them is a versioned event).
 * - [ ] Template gallery definitions: behavioral-health intake packet v1
 *       (demographics, insurance, history, PHQ-9, GAD-7, consent,
 *       signature) with real, reviewed copy -- no lorem.
 */

import type { FormBlock } from "../db/schema";

export interface BlockDefinition {
  kind: FormBlock["kind"];
  label: string;
  description: string;
  csvColumns: string[];
}

export function blockRegistry(): BlockDefinition[] {
  throw new Error("Not implemented");
}

export function validateForm(_blocks: FormBlock[]): string[] {
  throw new Error("Not implemented");
}
