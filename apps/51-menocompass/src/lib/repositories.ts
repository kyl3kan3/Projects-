// Repository layer — all SQL lives here; stores/screens never touch the db directly.
import { openDb, newId } from '@/lib/db';
import type { SymptomDomain } from '@/data/symptoms';

export type Severity = 0 | 1 | 2 | 3;

export interface Symptom {
  id: string;
  name: string;
  domain: SymptomDomain;
  isCustom: boolean;
  isActive: boolean;
  sort: number;
}

export interface SymptomEntry {
  id: string;
  symptomId: string;
  date: string; // YYYY-MM-DD
  severity: Severity;
  note: string | null;
}

export type CycleKind = 'period_start' | 'period_end' | 'spotting';
export interface CycleEvent { id: string; date: string; kind: CycleKind; note: string | null }

export type MedKind = 'patch' | 'gel' | 'spray' | 'tablet' | 'vaginal' | 'injection' | 'supplement' | 'other';

export type Schedule =
  | { type: 'daily'; time: string }
  | { type: 'twice_weekly'; days: [string, string]; time: string }
  | { type: 'weekly'; day: string; time: string }
  | { type: 'cyclical'; daysOn: number; daysOff: number; time: string };

export interface Medication { id: string; name: string; kind: MedKind; isHrt: boolean; active: boolean }
export interface Regimen {
  id: string;
  medicationId: string;
  dose: string;
  schedule: Schedule;
  startDate: string;
  endDate: string | null;
}
export interface DoseLog { id: string; regimenId: string; dueAt: string; status: 'taken' | 'skipped'; loggedAt: string }
export interface LabResult { id: string; date: string; panel: string; value: number; unit: string; note: string | null }

export function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ---------- symptoms & check-ins ----------

export const symptoms = {
  all(): Symptom[] {
    return openDb()
      .getAllSync<any>('SELECT * FROM symptom ORDER BY sort')
      .map(rowToSymptom);
  },
  active(): Symptom[] {
    return openDb()
      .getAllSync<any>('SELECT * FROM symptom WHERE is_active = 1 ORDER BY sort')
      .map(rowToSymptom);
  },
  setActive(id: string, active: boolean): void {
    openDb().runSync('UPDATE symptom SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
  },
  addCustom(name: string, domain: SymptomDomain): Symptom {
    const id = `custom-${newId()}`;
    const maxSort = openDb().getFirstSync<{ m: number }>('SELECT MAX(sort) AS m FROM symptom')?.m ?? 0;
    openDb().runSync(
      'INSERT INTO symptom (id, name, domain, is_custom, is_active, sort) VALUES (?, ?, ?, 1, 1, ?)',
      [id, name, domain, maxSort + 10]
    );
    return { id, name, domain, isCustom: true, isActive: true, sort: maxSort + 10 };
  },
};

export const checkins = {
  /** Upsert one symptom's severity for a date. Severity 0 with no note deletes the entry. */
  set(symptomId: string, date: string, severity: Severity, note?: string): void {
    const d = openDb();
    if (severity === 0 && !note) {
      d.runSync('DELETE FROM symptom_entry WHERE symptom_id = ? AND date = ?', [symptomId, date]);
      return;
    }
    d.runSync(
      `INSERT INTO symptom_entry (id, symptom_id, date, severity, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symptom_id, date) DO UPDATE SET severity = excluded.severity, note = COALESCE(excluded.note, note)`,
      [newId(), symptomId, date, severity, note ?? null, new Date().toISOString()]
    );
  },
  forDate(date: string): SymptomEntry[] {
    return openDb()
      .getAllSync<any>('SELECT * FROM symptom_entry WHERE date = ?', [date])
      .map(rowToEntry);
  },
  /** Entries in [from, to] inclusive, oldest first — feeds trends, heat strip, report. */
  range(from: string, to: string): SymptomEntry[] {
    return openDb()
      .getAllSync<any>('SELECT * FROM symptom_entry WHERE date >= ? AND date <= ? ORDER BY date', [from, to])
      .map(rowToEntry);
  },
  /** The yesterday-prefill: most recent logged date strictly before `date`, with its entries. */
  previousDay(date: string): { date: string; entries: SymptomEntry[] } | null {
    const row = openDb().getFirstSync<{ date: string }>(
      'SELECT date FROM symptom_entry WHERE date < ? ORDER BY date DESC LIMIT 1',
      [date]
    );
    if (!row) return null;
    return { date: row.date, entries: checkins.forDate(row.date) };
  },
  loggedDayCount(): number {
    return openDb().getFirstSync<{ n: number }>('SELECT COUNT(DISTINCT date) AS n FROM symptom_entry')?.n ?? 0;
  },
};

// ---------- cycles (irregularity-native: events, never predictions) ----------

export const cycles = {
  add(date: string, kind: CycleKind, note?: string): void {
    openDb().runSync('INSERT INTO cycle_event (id, date, kind, note) VALUES (?, ?, ?, ?)', [
      newId(), date, kind, note ?? null,
    ]);
  },
  remove(id: string): void {
    openDb().runSync('DELETE FROM cycle_event WHERE id = ?', [id]);
  },
  all(): CycleEvent[] {
    return openDb().getAllSync<any>('SELECT * FROM cycle_event ORDER BY date').map((r) => ({
      id: r.id, date: r.date, kind: r.kind, note: r.note,
    }));
  },
  /** Days between consecutive period_start events, oldest first. */
  gapSeries(): { from: string; to: string; days: number }[] {
    const starts = openDb().getAllSync<{ date: string }>(
      "SELECT date FROM cycle_event WHERE kind = 'period_start' ORDER BY date"
    );
    const gaps: { from: string; to: string; days: number }[] = [];
    for (let i = 1; i < starts.length; i++) {
      gaps.push({
        from: starts[i - 1].date,
        to: starts[i].date,
        days: Math.round((Date.parse(starts[i].date) - Date.parse(starts[i - 1].date)) / 86_400_000),
      });
    }
    return gaps;
  },
  /** Days since the last period_start, or null when none logged ("no idea" is a valid state). */
  currentGapDays(today = todayIso()): number | null {
    const last = openDb().getFirstSync<{ date: string }>(
      "SELECT date FROM cycle_event WHERE kind = 'period_start' ORDER BY date DESC LIMIT 1"
    );
    if (!last) return null;
    return Math.round((Date.parse(today) - Date.parse(last.date)) / 86_400_000);
  },
};

// ---------- medications & regimens ----------

export const meds = {
  add(name: string, kind: MedKind, isHrt: boolean, dose: string, schedule: Schedule, startDate = todayIso()): Medication {
    const d = openDb();
    const medId = newId();
    d.runSync('INSERT INTO medication (id, name, kind, is_hrt, active, created_at) VALUES (?, ?, ?, ?, 1, ?)', [
      medId, name, kind, isHrt ? 1 : 0, new Date().toISOString(),
    ]);
    d.runSync('INSERT INTO regimen (id, medication_id, dose, schedule_json, start_date) VALUES (?, ?, ?, ?, ?)', [
      newId(), medId, dose, JSON.stringify(schedule), startDate,
    ]);
    return { id: medId, name, kind, isHrt, active: true };
  },
  active(): Medication[] {
    return openDb().getAllSync<any>('SELECT * FROM medication WHERE active = 1 ORDER BY created_at').map((r) => ({
      id: r.id, name: r.name, kind: r.kind, isHrt: r.is_hrt === 1, active: r.active === 1,
    }));
  },
  deactivate(medicationId: string, endDate = todayIso()): void {
    const d = openDb();
    d.runSync('UPDATE medication SET active = 0 WHERE id = ?', [medicationId]);
    d.runSync('UPDATE regimen SET end_date = ? WHERE medication_id = ? AND end_date IS NULL', [endDate, medicationId]);
  },
  /** A dose change closes the current regimen row and opens a new one — the timeline event. */
  changeDose(medicationId: string, dose: string, schedule: Schedule, effectiveDate = todayIso()): Regimen {
    const d = openDb();
    d.runSync('UPDATE regimen SET end_date = ? WHERE medication_id = ? AND end_date IS NULL', [
      effectiveDate, medicationId,
    ]);
    const id = newId();
    d.runSync('INSERT INTO regimen (id, medication_id, dose, schedule_json, start_date) VALUES (?, ?, ?, ?, ?)', [
      id, medicationId, dose, JSON.stringify(schedule), effectiveDate,
    ]);
    return { id, medicationId, dose, schedule, startDate: effectiveDate, endDate: null };
  },
  currentRegimen(medicationId: string): Regimen | null {
    const r = openDb().getFirstSync<any>(
      'SELECT * FROM regimen WHERE medication_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1',
      [medicationId]
    );
    return r ? rowToRegimen(r) : null;
  },
  regimenHistory(medicationId?: string): Regimen[] {
    const d = openDb();
    const rows = medicationId
      ? d.getAllSync<any>('SELECT * FROM regimen WHERE medication_id = ? ORDER BY start_date', [medicationId])
      : d.getAllSync<any>('SELECT * FROM regimen ORDER BY start_date');
    return rows.map(rowToRegimen);
  },
  /** Every regimen start after the first per med = a dose-change marker for charts. */
  doseChangeMarkers(): { date: string; medicationId: string; dose: string }[] {
    const all = meds.regimenHistory();
    const seen = new Set<string>();
    const markers: { date: string; medicationId: string; dose: string }[] = [];
    for (const r of all) {
      if (seen.has(r.medicationId)) markers.push({ date: r.startDate, medicationId: r.medicationId, dose: r.dose });
      seen.add(r.medicationId);
    }
    return markers.sort((a, b) => a.date.localeCompare(b.date));
  },
};

export const doseLog = {
  log(regimenId: string, dueAt: string, status: 'taken' | 'skipped'): void {
    openDb().runSync('INSERT INTO dose_log (id, regimen_id, due_at, status, logged_at) VALUES (?, ?, ?, ?, ?)', [
      newId(), regimenId, dueAt, status, new Date().toISOString(),
    ]);
  },
  forRegimen(regimenId: string, limit = 50): DoseLog[] {
    return openDb()
      .getAllSync<any>('SELECT * FROM dose_log WHERE regimen_id = ? ORDER BY due_at DESC LIMIT ?', [regimenId, limit])
      .map((r) => ({ id: r.id, regimenId: r.regimen_id, dueAt: r.due_at, status: r.status, loggedAt: r.logged_at }));
  },
};

// ---------- labs ----------

export const labs = {
  add(date: string, panel: string, value: number, unit: string, note?: string): void {
    openDb().runSync('INSERT INTO lab_result (id, date, panel, value, unit, note) VALUES (?, ?, ?, ?, ?, ?)', [
      newId(), date, panel, value, unit, note ?? null,
    ]);
  },
  all(): LabResult[] {
    return openDb().getAllSync<any>('SELECT * FROM lab_result ORDER BY date DESC').map((r) => ({
      id: r.id, date: r.date, panel: r.panel, value: r.value, unit: r.unit, note: r.note,
    }));
  },
};

// ---------- settings ----------

export const settings = {
  get(key: string): string | null {
    return openDb().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
  },
  set(key: string, value: string): void {
    openDb().runSync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value]
    );
  },
};

// ---------- aggregates (trends / insights / report) ----------

export interface SymptomAggregate {
  symptomId: string;
  daysLogged: number;
  meanSeverity: number;
}

/** Per-symptom mean severity & frequency over [from, to] — the shared input for trends and insight windows. */
export function aggregate(from: string, to: string): SymptomAggregate[] {
  return openDb()
    .getAllSync<any>(
      `SELECT symptom_id, COUNT(*) AS days, AVG(severity) AS mean
       FROM symptom_entry WHERE date >= ? AND date <= ? GROUP BY symptom_id`,
      [from, to]
    )
    .map((r) => ({ symptomId: r.symptom_id, daysLogged: r.days, meanSeverity: r.mean }));
}

// ---------- row mappers ----------

function rowToSymptom(r: any): Symptom {
  return { id: r.id, name: r.name, domain: r.domain, isCustom: r.is_custom === 1, isActive: r.is_active === 1, sort: r.sort };
}
function rowToEntry(r: any): SymptomEntry {
  return { id: r.id, symptomId: r.symptom_id, date: r.date, severity: r.severity as Severity, note: r.note };
}
function rowToRegimen(r: any): Regimen {
  return {
    id: r.id, medicationId: r.medication_id, dose: r.dose,
    schedule: JSON.parse(r.schedule_json) as Schedule, startDate: r.start_date, endDate: r.end_date,
  };
}
