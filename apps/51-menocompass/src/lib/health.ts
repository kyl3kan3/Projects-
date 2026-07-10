// Apple Health import (read-only, optional Plus): sleep hours mirrored into health_sample.
// The app must function identically when permission is denied or HealthKit is absent —
// the module is loaded lazily and every failure degrades to "no samples".
import { Platform } from 'react-native';
import { newId, openDb } from '@/lib/db';

export async function importSleep(daysBack = 90): Promise<number> {
  if (Platform.OS !== 'ios') return 0;
  try {
    // Lazy require keeps Android/dev builds working without the native module.
    const hk: any = require('@kingstinct/react-native-healthkit');
    const ok = await hk.requestAuthorization?.(['HKCategoryTypeIdentifierSleepAnalysis'], []);
    if (!ok) return 0;
    const from = new Date(Date.now() - daysBack * 86_400_000);
    const samples: any[] = (await hk.queryCategorySamples?.('HKCategoryTypeIdentifierSleepAnalysis', {
      from, to: new Date(),
    })) ?? [];
    const perDay = new Map<string, number>();
    for (const s of samples) {
      const start = new Date(s.startDate ?? s.startTime);
      const end = new Date(s.endDate ?? s.endTime);
      const day = start.toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + (end.getTime() - start.getTime()) / 3_600_000);
    }
    const d = openDb();
    for (const [day, hours] of perDay) {
      d.runSync(
        `INSERT INTO health_sample (id, date, kind, value, source)
         SELECT ?, ?, 'sleep_hours', ?, 'healthkit'
         WHERE NOT EXISTS (SELECT 1 FROM health_sample WHERE date = ? AND kind = 'sleep_hours')`,
        [newId(), day, Math.round(hours * 10) / 10, day],
      );
    }
    return perDay.size;
  } catch {
    return 0;
  }
}
