/**
 * src/lib/programs.ts
 *
 * Program-tree operations: build, duplicate-week-forward, templates,
 * assignment resolution with substitution overlays.
 *
 * TODO:
 * - [ ] duplicateWeek(programId, weekIndex): clone days + rows into
 *       weekIndex+1, shifting later weeks.
 * - [ ] saveAsTemplate(programId) / instantiateTemplate(templateId).
 * - [ ] resolveDay(assignmentId, weekIndex, dayIndex): rows with
 *       substitutions applied (the client PWA's read model).
 * - [ ] todayFor(assignmentId, date): the calendar math from starts_on
 *       + day indices; rest days return null.
 */

export interface ResolvedRow {
  programRowId: string;
  exerciseName: string;
  videoUrl: string | null;
  sets: number;
  reps: string;
  rpe: string | null;
  restSeconds: number | null;
  supersetGroup: number | null;
  substituted: boolean;
  note: string | null;
}

export async function resolveDay(
  assignmentId: string,
  weekIndex: number,
  dayIndex: number,
): Promise<{ label: string; rows: ResolvedRow[] }> {
  throw new Error("Not implemented");
}

export async function duplicateWeek(programId: string, weekIndex: number): Promise<void> {
  throw new Error("Not implemented");
}
