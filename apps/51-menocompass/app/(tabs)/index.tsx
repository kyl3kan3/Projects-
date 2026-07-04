// TODAY — the daily check-in. <30s to complete, brain-fog-friendly.
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { CheckInTile } from '@/components/CheckInTile';
import { Icon } from '@/components/icons';
import { Card, Hairline, Screen, Txt } from '@/components/ui';
import {
  checkins, cycles, doseLog, meds, symptoms, todayIso,
  type Medication, type Regimen, type SymptomEntry,
} from '@/lib/repositories';
import { space, type Severity } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface MedToday { med: Medication; regimen: Regimen; takenAt: string | null; skipped: boolean }

export default function Today() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const date = todayIso();
  const [entries, setEntries] = useState<Map<string, SymptomEntry>>(new Map());
  const [medsToday, setMedsToday] = useState<MedToday[]>([]);
  const [note, setNote] = useState('');
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);

  const active = useMemo(() => symptoms.active(), []);

  const reload = useCallback(() => {
    let todays = checkins.forDate(date);
    // Yesterday-prefill: on the first open of a new day, carry forward the last logged day
    // so the user only taps what changed.
    if (todays.length === 0) {
      const prev = checkins.previousDay(date);
      if (prev && daysBetween(prev.date, date) <= 2) {
        for (const e of prev.entries) checkins.set(e.symptomId, date, e.severity);
        todays = checkins.forDate(date);
        setPrefilledFrom(prev.date);
      }
    }
    setEntries(new Map(todays.map((e) => [e.symptomId, e])));
    setMedsToday(
      meds.active().flatMap((med) => {
        const regimen = meds.currentRegimen(med.id);
        if (!regimen) return [];
        const logs = doseLog.forRegimen(regimen.id, 5).filter((l) => l.loggedAt.slice(0, 10) === date);
        return [{
          med, regimen,
          takenAt: logs.find((l) => l.status === 'taken')?.loggedAt ?? null,
          skipped: logs.some((l) => l.status === 'skipped'),
        }];
      }),
    );
  }, [date]);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const setSeverity = (symptomId: string, s: Severity) => {
    checkins.set(symptomId, date, s);
    const next = new Map(entries);
    if (s === 0) next.delete(symptomId);
    else next.set(symptomId, { id: '', symptomId, date, severity: s, note: null });
    setEntries(next);
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl, gap: space.l }}>
        <View>
          <Txt role="display">{formatToday()}</Txt>
          {prefilledFrom && (
            <Txt role="secondary" color="ink2" style={{ marginTop: space.xs }}>
              Prefilled from your last check-in — tap anything that changed.
            </Txt>
          )}
        </View>

        <FlatList
          data={active}
          scrollEnabled={false}
          numColumns={2}
          columnWrapperStyle={{ gap: space.s + 2 }}
          contentContainerStyle={{ gap: space.s + 2 }}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <CheckInTile
                symptom={item}
                severity={(entries.get(item.id)?.severity ?? 0) as Severity}
                onChange={(s) => setSeverity(item.id, s)}
              />
            </View>
          )}
        />

        {medsToday.length > 0 && (
          <View style={{ gap: space.s }}>
            <Txt role="label" color="ink2">Today's meds</Txt>
            <Card style={{ paddingHorizontal: space.m }}>
              {medsToday.map((m, i) => (
                <View key={m.med.id}>
                  {i > 0 && <Hairline />}
                  <MedRow item={m} onLog={(status) => { doseLog.log(m.regimen.id, new Date().toISOString(), status); reload(); }} />
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={{ gap: space.s }}>
          <Txt role="label" color="ink2">Cycle</Txt>
          <Card style={{ padding: space.m, flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Icon name="drop" size={18} color={p.ink2} />
            <CycleQuickLog onLogged={reload} />
          </Card>
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          onEndEditing={() => { if (note.trim()) { const first = active[0]; if (first) checkins.set(first.id, date, (entries.get(first.id)?.severity ?? 1) as Severity, note.trim()); } }}
          placeholder="Add a note about today"
          placeholderTextColor={p.ink3}
          style={{ color: p.ink, fontSize: 16, paddingVertical: space.s, textAlign: 'center' }}
        />
      </ScrollView>
    </Screen>
  );
}

function MedRow({ item, onLog }: { item: MedToday; onLog: (s: 'taken' | 'skipped') => void }) {
  const p = useTheme();
  const s = item.regimen.schedule;
  const scheduleLine =
    s.type === 'twice_weekly' ? `patch · ${s.days.join(' & ')}` :
    s.type === 'weekly' ? `${item.med.kind} · ${s.day}s` :
    s.type === 'cyclical' ? `${item.med.kind} · ${s.daysOn} on / ${s.daysOff} off` :
    `${item.med.kind} · daily`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
      <Icon name={item.med.kind === 'patch' ? 'patch' : 'pill'} size={20} color={p.ink2} />
      <View style={{ flex: 1 }}>
        <Txt role="title">{item.med.name} {item.regimen.dose}</Txt>
        <Txt role="secondary" color="ink2">{scheduleLine}</Txt>
      </View>
      {item.takenAt ? (
        <Txt role="data" color="sage">✓ {item.takenAt.slice(11, 16)}</Txt>
      ) : item.skipped ? (
        <Txt role="data" color="claret">skipped</Txt>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.l }}>
          <Pressable onPress={() => onLog('taken')} hitSlop={8}><Txt role="secondary" color="sage" style={{ fontWeight: '600' }}>Taken</Txt></Pressable>
          <Pressable onPress={() => onLog('skipped')} hitSlop={8}><Txt role="secondary" color="ink3" style={{ fontWeight: '600' }}>Skip</Txt></Pressable>
        </View>
      )}
    </View>
  );
}

function CycleQuickLog({ onLogged }: { onLogged: () => void }) {
  const gap = cycles.currentGapDays();
  const [logged, setLogged] = useState(false);
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt role="secondary" color="ink2">
        {gap === null ? 'No period logged yet — that’s a valid state here.' : `Day ${gap} since last period start`}
      </Txt>
      {!logged && (
        <Pressable onPress={() => { cycles.add(todayIso(), 'period_start'); setLogged(true); onLogged(); }} hitSlop={8}>
          <Txt role="secondary" color="ember" style={{ fontWeight: '600' }}>Period started</Txt>
        </Pressable>
      )}
    </View>
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
