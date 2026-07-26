// Local notification engine: schedules dose reminders from regimen schedules and
// handles Taken/Skipped actions (writing dose_log) without opening the app.
import * as Notifications from 'expo-notifications';
import { doseLog, meds, type Regimen, type Schedule } from '@/lib/repositories';

const DOSE_CATEGORY = 'dose-reminder';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerDoseActions(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    { identifier: 'taken', buttonTitle: 'Taken', options: { opensAppToForeground: false } },
    { identifier: 'skipped', buttonTitle: 'Skip', options: { isDestructive: true, opensAppToForeground: false } },
  ]);
}

export async function requestPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return { hour: h || 8, minute: m || 0 };
}

/** Recompute all dose reminders from active regimens. Called on app open and every regimen change. */
export async function rescheduleAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const med of meds.active()) {
    const regimen = meds.currentRegimen(med.id);
    if (!regimen) continue;
    await scheduleRegimen(med.name, regimen);
  }
}

async function scheduleRegimen(medName: string, regimen: Regimen): Promise<void> {
  const s: Schedule = regimen.schedule;
  const { hour, minute } = parseTime('time' in s ? s.time : '08:00');
  const content = {
    title: medName,
    body: doseBody(s, medName),
    categoryIdentifier: DOSE_CATEGORY,
    data: { regimenId: regimen.id },
  };
  if (s.type === 'daily' || s.type === 'cyclical') {
    // Cyclical windows are refined at log time; the daily trigger is the reminder backbone.
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  } else {
    const days = s.type === 'weekly' ? [s.day] : s.days;
    for (const day of days) {
      const weekday = WEEKDAYS.indexOf(day) + 1; // expo: 1 = Sunday
      if (weekday === 0) continue;
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
      });
    }
  }
}

function doseBody(s: Schedule, name: string): string {
  if (s.type === 'twice_weekly') return `Time to change your ${name} patch.`;
  return `Time for your ${name}.`;
}

/**
 * Handle a notification response. Taken/Skipped actions log the dose and stay in the background;
 * tapping the notification body returns a route to open. (The 3 a.m. pre-scrolled
 * quick-log variant is roadmapped — ROADMAP Phase 1 week 8.)
 */
export function handleNotificationResponse(response: Notifications.NotificationResponse): string | null {
  const regimenId = response.notification.request.content.data?.regimenId as string | undefined;
  const action = response.actionIdentifier;
  if (regimenId && (action === 'taken' || action === 'skipped')) {
    doseLog.log(regimenId, new Date().toISOString(), action);
    return null;
  }
  return '/(tabs)';
}
