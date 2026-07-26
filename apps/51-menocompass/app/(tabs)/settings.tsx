// SETTINGS — reminders, health import, export/backup/delete, privacy explainer, purchases, education.
import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icons';
import { Button, Card, Hairline, Screen, Txt } from '@/components/ui';
import { deleteAllData, exportBackup, exportCsv } from '@/lib/backup';
import { importSleep } from '@/lib/health';
import { requestPermission } from '@/lib/notifications';
import { checkGate, restore } from '@/lib/paywall';
import { EDUCATION_CARDS } from '@/data/education';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Settings() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [eduOpen, setEduOpen] = useState(false);

  const onHealth = async () => {
    if (checkGate('health-import') !== null) { router.push('/paywall'); return; }
    const n = await importSleep();
    setHealthMsg(n > 0 ? `Imported sleep for ${n} nights.` : 'Nothing imported — permission denied or no data.');
  };

  const onDelete = () => {
    Alert.alert('Delete all data?', 'Every entry, medication, and lab on this phone. There is no cloud copy to recover from.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: () => deleteAllData() },
    ]);
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.l, paddingBottom: space.xxl, gap: space.l }}>
        <Txt role="h2">Settings</Txt>

        <Card style={{ padding: space.l, gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Icon name="lock" size={20} color={p.ember} />
            <Txt role="title">Your data never leaves this phone</Txt>
          </View>
          <Txt role="secondary" color="ink2">
            No account. No analytics. No servers of ours. Try it: turn on airplane mode — everything except purchases keeps working, forever.
          </Txt>
        </Card>

        <Section title="Reminders">
          <Row label="Allow notifications" hint="Dose reminders with Taken/Skip buttons" onPress={() => void requestPermission()} />
        </Section>

        <Section title="Apple Health">
          <Row label="Import sleep data" hint={healthMsg ?? 'Read-only. Enriches your trends. Plus feature.'} onPress={() => void onHealth()} />
        </Section>

        <Section title="Your data">
          <Row label="Export backup file" hint="Full JSON backup, shared wherever you choose" onPress={() => void exportBackup()} />
          <Hairline />
          <Row label="Export CSV" hint="Every check-in as a spreadsheet" onPress={() => void exportCsv()} />
          <Hairline />
          <Row label="Delete all data" hint="Immediate and unrecoverable" destructive onPress={onDelete} />
        </Section>

        <Section title="Purchases">
          <Row label="Restore purchases" onPress={() => void restore()} />
        </Section>

        <Section title="Learn">
          <Row label={eduOpen ? 'Hide the guide' : 'The 20-card guide'} hint="Plain-language, cited to NICE / NAMS guidance" onPress={() => setEduOpen((v) => !v)} />
          {eduOpen && EDUCATION_CARDS.map((c) => (
            <View key={c.id} style={{ paddingVertical: space.m, gap: space.xs }}>
              <Hairline />
              <Txt role="title" style={{ marginTop: space.s }}>{c.title}</Txt>
              <Txt role="secondary" color="ink2">{c.body}</Txt>
              <Pressable onPress={() => void Linking.openURL(c.sourceUrl)}>
                <Txt role="secondary" color="ember">{c.source}</Txt>
              </Pressable>
            </View>
          ))}
        </Section>

        <Txt role="secondary" color="ink3" style={{ textAlign: 'center' }}>
          MenoCompass logs, reminds, and reports. It never diagnoses or doses.
        </Txt>
        <Button kind="secondary" label="Manage symptoms tracked" onPress={() => router.push('/onboarding')} />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.s }}>
      <Txt role="label" color="ink2">{title}</Txt>
      <Card style={{ paddingHorizontal: space.l }}>{children}</Card>
    </View>
  );
}

function Row({ label, hint, destructive, onPress }: { label: string; hint?: string; destructive?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View style={{ paddingVertical: space.m, opacity: pressed ? 0.7 : 1, gap: 2 }}>
          <Txt role="title" color={destructive ? 'claret' : 'ink'}>{label}</Txt>
          {hint && <Txt role="secondary" color="ink2">{hint}</Txt>}
        </View>
      )}
    </Pressable>
  );
}
