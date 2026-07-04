/**
 * src/lib/incidents.ts
 *
 * Incident notes tied to waivers -- the wedge feature. When something
 * happens, the operator builds the file where the waivers already live.
 *
 * TODO:
 * - [ ] createIncident(accountId, locationId, occurredAt, title,
 *       description, byUserId).
 * - [ ] linkParticipant(incidentId, participantId): SNAPSHOT the
 *       signature in force at occurred_at (not "latest") into
 *       incident_participants.signature_id -- later re-signs must never
 *       change the incident file (ROADMAP acceptance criterion).
 * - [ ] Waiver-in-force resolution: latest signature whose signed_at <=
 *       occurred_at and expires_at (if any) >= occurred_at; none ->
 *       linked with an explicit "NO WAIVER IN FORCE" marker (the honest
 *       record).
 * - [ ] incidentFile(incidentId): description + participants + their
 *       exact signed waivers, feeding the bulk PDF (lib/pdf).
 * - [ ] Status open|closed; closed incidents immutable except notes.
 */

export interface IncidentLink {
  participantId: string;
  signatureId: string | null;
  note: string;
}

export function linkParticipant(
  _incidentId: string,
  _participantId: string,
  _note: string,
): Promise<IncidentLink> {
  throw new Error("Not implemented");
}
