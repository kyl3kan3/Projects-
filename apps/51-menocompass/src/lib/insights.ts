// Deterministic on-device insight engine — pure arithmetic, no network, no advice.
// Copy rules are a hard boundary (BUILD.md wellness line): observational, past-tense,
// correlation-not-causation footer rendered by the InsightCard component.
import { aggregate, meds, symptoms, todayIso } from '@/lib/repositories';

export interface Insight {
  id: string;
  symptomId: string;
  symptomName: string;
  medicationId: string;
  changeDate: string;
  /** Negative = symptom improved (lower severity) after the change. */
  deltaPct: number;
  windowWeeks: number;
  text: string;
}

/** Minimum logged days on each side of a change before we'll say anything. */
const MIN_DAYS_PER_WINDOW = 21;
/** Minimum |delta| worth surfacing. */
const MIN_DELTA_PCT = 15;
const WINDOW_DAYS = 42; // 6 weeks

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeInsights(today = todayIso()): Insight[] {
  const markers = meds.doseChangeMarkers();
  const names = new Map(symptoms.all().map((s) => [s.id, s.name]));
  const medNames = new Map(meds.active().map((m) => [m.id, m.name]));
  const out: Insight[] = [];

  for (const marker of markers) {
    // The window after the change must have fully elapsed.
    if (shiftDate(marker.date, WINDOW_DAYS) > today) continue;
    const before = new Map(
      aggregate(shiftDate(marker.date, -WINDOW_DAYS), shiftDate(marker.date, -1)).map((a) => [a.symptomId, a])
    );
    const after = new Map(
      aggregate(shiftDate(marker.date, 1), shiftDate(marker.date, WINDOW_DAYS)).map((a) => [a.symptomId, a])
    );

    for (const [symptomId, b] of before) {
      const a = after.get(symptomId);
      if (!a || b.daysLogged < MIN_DAYS_PER_WINDOW || a.daysLogged < MIN_DAYS_PER_WINDOW) continue;
      if (b.meanSeverity === 0) continue;
      const deltaPct = Math.round(((a.meanSeverity - b.meanSeverity) / b.meanSeverity) * 100);
      if (Math.abs(deltaPct) < MIN_DELTA_PCT) continue;
      const symptomName = names.get(symptomId) ?? symptomId;
      const medName = medNames.get(marker.medicationId) ?? 'medication';
      const direction = deltaPct < 0 ? 'lower' : 'higher';
      out.push({
        id: `${marker.medicationId}-${marker.date}-${symptomId}`,
        symptomId,
        symptomName,
        medicationId: marker.medicationId,
        changeDate: marker.date,
        deltaPct,
        windowWeeks: WINDOW_DAYS / 7,
        // Observational template — never causal, never advisory.
        text: `${symptomName} averaged ${Math.abs(deltaPct)}% ${direction} in the ${WINDOW_DAYS / 7} weeks after your ${formatDate(marker.date)} ${medName} change.`,
      });
    }
  }
  // Strongest observations first.
  return out.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct));
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
