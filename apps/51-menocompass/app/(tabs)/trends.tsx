// TRENDS — heat strip, per-symptom charts with dose-change markers, cycle-gap chart, insights.
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { CycleGapChart, HeatStrip, TrendChart, type TrendPoint } from '@/components/charts';
import { Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { computeInsights, type Insight } from '@/lib/insights';
import { checkins, cycles, healthSamples, meds, symptoms, todayIso, type SymptomEntry } from '@/lib/repositories';
import { checkGate } from '@/lib/paywall';
import { space, type Severity } from '@/theme/tokens';

const RANGES = [7, 30, 90] as const;

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Trends() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const chartW = width - space.gutter * 2 - space.l * 2;
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [entries, setEntries] = useState<SymptomEntry[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const to = todayIso();
  const from = shift(to, -range + 1);

  useFocusEffect(useCallback(() => {
    setEntries(checkins.range(from, to));
    setInsights(checkGate('insights') === null ? computeInsights() : []);
  }, [from, to]));

  const names = useMemo(() => new Map(symptoms.all().map((s) => [s.id, s.name])), []);
  const markers = useMemo(
    () => meds.doseChangeMarkers().map((m) => ({ date: m.date, label: `${m.date.slice(5).replace('-', '/')} · ${m.dose}` })),
    [],
  );

  // Heat strip: worst severity across all symptoms per day.
  const heatDays = useMemo(() => {
    const byDate = new Map<string, Severity>();
    for (const e of entries) {
      const cur = byDate.get(e.date) ?? 0;
      if (e.severity > cur) byDate.set(e.date, e.severity as Severity);
    }
    const days: { severity: Severity }[] = [];
    for (let i = 0; i < range; i++) {
      days.push({ severity: byDate.get(shift(from, i)) ?? 0 });
    }
    return days;
  }, [entries, from, range]);

  // Per-symptom weekly mean series, sorted by recent burden.
  const series = useMemo(() => {
    const bySymptom = new Map<string, SymptomEntry[]>();
    for (const e of entries) {
      const arr = bySymptom.get(e.symptomId) ?? [];
      arr.push(e);
      bySymptom.set(e.symptomId, arr);
    }
    return [...bySymptom.entries()]
      .map(([id, es]) => {
        const points: TrendPoint[] = es.map((e) => ({ date: e.date, value: e.severity }));
        const mean = es.reduce((s, e) => s + e.severity, 0) / es.length;
        return { id, name: names.get(id) ?? id, points, mean, days: es.length };
      })
      .filter((s) => s.days >= 3)
      .sort((a, b) => b.mean * b.days - a.mean * a.days)
      .slice(0, 6);
  }, [entries, names]);

  const gaps = cycles.gapSeries().slice(-8).map((g) => g.days);
  const currentGap = cycles.currentGapDays();
  const sleep = healthSamples.sleepRange(from, to);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl, gap: space.l }}>
        <Txt role="h2">Trends</Txt>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {RANGES.map((r) => (
            <Chip
              key={r}
              label={`${r}d`}
              active={range === r}
              onPress={() => {
                // Free tier keeps 30 days of history; the long view is Plus.
                if (r > 30 && checkGate('history-31') !== null) { router.push('/paywall'); return; }
                setRange(r);
              }}
            />
          ))}
        </View>

        <View style={{ gap: space.s }}>
          <Txt role="label" color="ink2">Last {range} days · all symptoms</Txt>
          <HeatStrip days={heatDays} columns={range === 7 ? 7 : 12} cell={range === 90 ? 12 : 16} />
        </View>

        {series.map((s) => (
          <Card key={s.id} style={{ padding: space.l, gap: space.s }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Txt role="title">{s.name}</Txt>
              <Txt role="data" color="ink2">avg {s.mean.toFixed(1)}</Txt>
            </View>
            <TrendChart points={s.points} markers={markers} from={from} to={to} width={chartW} />
          </Card>
        ))}
        {series.length === 0 && (
          <Card style={{ padding: space.l }}>
            <Txt role="body" color="ink2">Not enough logged days in this range yet. Three days of check-ins draws the first chart.</Txt>
          </Card>
        )}

        <Card style={{ padding: space.l, gap: space.m }}>
          <Txt role="label" color="ink2">Cycle</Txt>
          {currentGap !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
              <Txt role="bigDatum">{currentGap}</Txt>
              <Txt role="secondary" color="ink2">days since last period start</Txt>
            </View>
          ) : (
            <Txt role="secondary" color="ink2">No period events logged — a valid state here.</Txt>
          )}
          {gaps.length > 1 && <CycleGapChart gaps={gaps} width={chartW} />}
          <Txt role="label" color="ink3">Irregular is normal here</Txt>
        </Card>

        {sleep.length >= 3 && (
          <Card style={{ padding: space.l, gap: space.s }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Txt role="title">Sleep</Txt>
              <Txt role="data" color="ink2">Apple Health · hrs/night</Txt>
            </View>
            <TrendChart
              points={sleep.map((x) => ({ date: x.date, value: x.value }))}
              markers={markers}
              from={from}
              to={to}
              width={chartW}
              maxValue={10}
            />
          </Card>
        )}

        {insights.map((i) => (
          <Card key={i.id} style={{ padding: space.l, gap: space.xs }}>
            <Txt role="label" color="ember">Observed</Txt>
            <Txt role="body">{i.text}</Txt>
            <Txt role="secondary" color="ink2">Correlation, not causation — bring it to your clinician.</Txt>
          </Card>
        ))}
        {checkGate('insights') !== null && (
          <Card style={{ padding: space.l, gap: space.s }}>
            <Txt role="label" color="ink2">Insights</Txt>
            <Txt role="body" color="ink2">Plus compares your symptoms before and after every dose change.</Txt>
            <Button kind="quiet" label="See how it works" onPress={() => router.push('/paywall')} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
