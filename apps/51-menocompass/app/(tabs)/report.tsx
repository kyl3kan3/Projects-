// REPORT — the hero feature. Doctor-ready one-pager, rendered on device, shared as PDF.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { checkGate } from '@/lib/paywall';
import { buildReportHtml, generateAndShare } from '@/lib/report';
import { aggregate, checkins, cycles, meds, symptoms, todayIso } from '@/lib/repositories';
import { motion, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const RANGES = [30, 90, 180] as const;

export default function Report() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const [busy, setBusy] = useState(false);
  const gated = checkGate('report') !== null;
  const [preview, setPreview] = useState<PreviewData | null>(null);

  useFocusEffect(useCallback(() => setPreview(buildPreview(range)), [range]));

  // The signature render: the page assembles top-to-bottom (reduced motion: plain fade).
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let reduced = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduced = r; }).finally(() => {
      reveal.setValue(0);
      Animated.timing(reveal, { toValue: 1, duration: reduced ? motion.reducedFade : motion.reportRender, useNativeDriver: true }).start();
    });
  }, [preview, reveal]);

  const generate = async () => {
    if (gated) { router.push('/paywall'); return; }
    setBusy(true);
    try { await generateAndShare(range); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl, gap: space.l }}>
        <Txt role="h2">Doctor report</Txt>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {RANGES.map((r) => <Chip key={r} label={`${r}d`} active={range === r} onPress={() => setRange(r)} />)}
        </View>

        {preview && (
          <Animated.View style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
            <Card style={{ padding: space.l, gap: space.m }}>
              <View>
                <Txt role="display" style={{ fontSize: 20, lineHeight: 26 }}>Symptom &amp; treatment summary</Txt>
                <Txt role="secondary" color="ink2">{preview.sub}</Txt>
              </View>
              <View style={{ gap: space.s }}>
                {preview.symptoms.map((row) => (
                  <View key={row.name} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: p.hairline, paddingTop: space.s }}>
                    <Txt role="secondary">{row.name}</Txt>
                    <Txt role="data" color="ink2">{row.days}d · avg {row.avg}</Txt>
                  </View>
                ))}
                {preview.symptoms.length === 0 && <Txt role="secondary" color="ink2">Log a few days of symptoms to fill this in.</Txt>}
              </View>
              <View style={{ gap: 2 }}>
                <Txt role="label" color="ink2">Cycle</Txt>
                <Txt role="secondary" color="ink2">{preview.cycleLine}</Txt>
              </View>
              <View style={{ gap: 2 }}>
                <Txt role="label" color="ink2">Current regimen</Txt>
                {preview.regimenLines.length > 0
                  ? preview.regimenLines.map((l) => <Txt key={l} role="secondary" color="ink2">{l}</Txt>)
                  : <Txt role="secondary" color="ink2">No active medications logged.</Txt>}
              </View>
              {gated && (
                <View style={{ position: 'absolute', inset: 0, backgroundColor: p.paper, opacity: 0.88, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: space.s, padding: space.l }}>
                  <Txt role="title">Your report is ready when you are</Txt>
                  <Txt role="secondary" color="ink2" style={{ textAlign: 'center' }}>Plus renders this as a one-page PDF your clinician can read in a minute.</Txt>
                </View>
              )}
            </Card>
          </Animated.View>
        )}

        <Button label={busy ? 'Preparing…' : 'Generate report'} onPress={() => void generate()} disabled={busy} />
        <Txt role="secondary" color="ink3" style={{ textAlign: 'center' }}>Rendered on this phone. Shared only by you.</Txt>
      </ScrollView>
    </Screen>
  );
}

interface PreviewData {
  sub: string;
  symptoms: { name: string; days: number; avg: string }[];
  cycleLine: string;
  regimenLines: string[];
}

function buildPreview(rangeDays: number): PreviewData {
  const { from, to } = buildReportHtml(rangeDays); // reuse the exact range math
  const names = new Map(symptoms.all().map((s) => [s.id, s.name]));
  const aggs = aggregate(from, to).sort((a, b) => b.meanSeverity * b.daysLogged - a.meanSeverity * a.daysLogged).slice(0, 5);
  const daysLogged = new Set(checkins.range(from, to).map((e) => e.date)).size;
  const gap = cycles.currentGapDays(todayIso());
  const gaps = cycles.gapSeries().slice(-4).map((g) => g.days);
  const regimenLines = meds.active().flatMap((m) => {
    const r = meds.currentRegimen(m.id);
    return r ? [`${m.name} ${r.dose}`] : [];
  });
  return {
    sub: `${from} – ${to} · ${daysLogged} of ${rangeDays} days logged`,
    symptoms: aggs.map((a) => ({ name: names.get(a.symptomId) ?? a.symptomId, days: a.daysLogged, avg: a.meanSeverity.toFixed(1) })),
    cycleLine: gaps.length
      ? `Recent gaps: ${gaps.join(' · ')} days${gap !== null ? ` · currently day ${gap}` : ''}`
      : 'No period events logged in range.',
    regimenLines,
  };
}
