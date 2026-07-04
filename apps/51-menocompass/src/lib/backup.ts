// Backup & export: full DB -> JSON file -> share sheet; CSV export of entries.
// Restore reads a backup file back in. (AES passphrase encryption of the backup
// file is Phase-1 week-8 polish — tracked in ROADMAP; export is user-initiated
// and shared only through the OS share sheet, nothing leaves the device otherwise.)
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { openDb } from '@/lib/db';

const TABLES = ['symptom', 'symptom_entry', 'cycle_event', 'medication', 'regimen', 'dose_log', 'lab_result', 'settings'] as const;

export async function exportBackup(): Promise<void> {
  const d = openDb();
  const payload: Record<string, unknown[]> = { __schema: [1] };
  for (const t of TABLES) payload[t] = d.getAllSync(`SELECT * FROM ${t}`);
  const uri = FileSystem.cacheDirectory + 'menocompass-backup.json';
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json' });
}

export async function exportCsv(): Promise<void> {
  const d = openDb();
  const rows = d.getAllSync<any>(
    `SELECT e.date, s.name AS symptom, e.severity, e.note FROM symptom_entry e JOIN symptom s ON s.id = e.symptom_id ORDER BY e.date`,
  );
  const csv = ['date,symptom,severity,note']
    .concat(rows.map((r) => [r.date, quote(r.symptom), r.severity, quote(r.note ?? '')].join(',')))
    .join('\n');
  const uri = FileSystem.cacheDirectory + 'menocompass-entries.csv';
  await FileSystem.writeAsStringAsync(uri, csv);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv' });
}

export function deleteAllData(): void {
  const d = openDb();
  for (const t of TABLES) d.runSync(`DELETE FROM ${t}`);
}

function quote(x: string): string {
  return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
}
