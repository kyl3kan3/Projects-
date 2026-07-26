// SQLite open + migrations per ARCHITECTURE.md. All access goes through repositories.ts.
import * as SQLite from 'expo-sqlite';
import { SYMPTOM_LIBRARY, CORE_SYMPTOM_IDS } from '@/data/symptoms';

export type DB = SQLite.SQLiteDatabase;

let db: DB | null = null;

const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS symptom (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL CHECK(domain IN ('vasomotor','sleep','mood','cognitive','physical','cycle','other')),
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS symptom_entry (
    id TEXT PRIMARY KEY,
    symptom_id TEXT NOT NULL REFERENCES symptom(id),
    date TEXT NOT NULL,
    severity INTEGER NOT NULL CHECK(severity BETWEEN 0 AND 3),
    note TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(symptom_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_entry_date ON symptom_entry(date);
  CREATE TABLE IF NOT EXISTS cycle_event (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('period_start','period_end','spotting')),
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS medication (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('patch','gel','spray','tablet','vaginal','injection','supplement','other')),
    is_hrt INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS regimen (
    id TEXT PRIMARY KEY,
    medication_id TEXT NOT NULL REFERENCES medication(id),
    dose TEXT NOT NULL,
    schedule_json TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT
  );
  CREATE TABLE IF NOT EXISTS dose_log (
    id TEXT PRIMARY KEY,
    regimen_id TEXT NOT NULL REFERENCES regimen(id),
    due_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('taken','skipped')),
    logged_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lab_result (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    panel TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS health_sample (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('sleep_hours','sleep_interruptions')),
    value REAL NOT NULL,
    source TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function openDb(): DB {
  if (db) return db;
  db = SQLite.openDatabaseSync('menocompass.db');
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  seedSymptoms(db);
  return db;
}

function migrate(d: DB): void {
  const row = d.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < SCHEMA_VERSION; v++) {
    d.execSync('BEGIN');
    try {
      d.execSync(MIGRATIONS[v]);
      d.execSync(`PRAGMA user_version = ${v + 1}`);
      d.execSync('COMMIT');
    } catch (e) {
      d.execSync('ROLLBACK');
      throw e;
    }
  }
}

function seedSymptoms(d: DB): void {
  const count = d.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM symptom');
  if ((count?.n ?? 0) > 0) return;
  const insert = d.prepareSync(
    'INSERT INTO symptom (id, name, domain, is_custom, is_active, sort) VALUES (?, ?, ?, 0, ?, ?)'
  );
  try {
    for (const s of SYMPTOM_LIBRARY) {
      insert.executeSync([s.id, s.name, s.domain, CORE_SYMPTOM_IDS.includes(s.id) ? 1 : 0, s.sort]);
    }
  } finally {
    insert.finalizeSync();
  }
}

/** Test/reset hook: closes and forgets the handle (delete-all-data recreates via openDb). */
export function closeDb(): void {
  db?.closeSync();
  db = null;
}

export function newId(): string {
  // Compact random id; no external dep needed.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
