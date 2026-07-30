/**
 * src/app/(crew)/clock/page.tsx
 *
 * The crew home screen: mini-map with the site dot, the hero shift
 * readout, and the one oversized CLOCK IN/OUT control in the thumb zone.
 * Fully bilingual EN/ES per the user's locale; designed for gloves and
 * sunlight (DESIGN.md "Mobile layout: Crew home").
 *
 * TODO:
 * - [ ] Load the crew user's assignments; single-job crews skip the job
 *       picker entirely.
 * - [ ] Geolocation permission flow with honest fallback: denied ->
 *       punch still records as "unavailable", flagged for office review.
 * - [ ] Punch flow: getCurrentPosition (high accuracy, 10s timeout) ->
 *       build PunchEvent with client_event_id -> POST /api/punches/sync,
 *       falling back to the IndexedDB outbox when offline (conflict
 *       rules in src/lib/time-entries reconcileOfflineBatch).
 * - [ ] The geofence ring signature: 1.5px foreman ring draws over 400ms
 *       ease-out-quart on clock-in; un-draws on clock-out; reduced-motion
 *       -> instant filled ring + text state.
 * - [ ] Control states: inside fence / outside fence ("142 m from site --
 *       will be flagged / a 142 m del sitio -- se marcará") / GPS
 *       unavailable -- punches are never blocked, only labeled.
 * - [ ] Live shift readout ("6h 12m") ticking in JetBrains Mono; the
 *       job's labor-cost meter ticks beneath for owners viewing this screen.
 * - [ ] Offline banner: "Saved on phone -- will sync / Guardado en el
 *       teléfono -- se sincronizará".
 * - [ ] Every string through t() -- no hardcoded copy in either language.
 */

export default function CrewClockPage() {
  return null; // TODO: implement
}
