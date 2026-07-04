// ONBOARDING — life stage -> symptom picker -> HRT status -> done (value first, paywall after).
// Also reachable from Settings as "Manage symptoms tracked" (skips straight to the picker).
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { CORE_SYMPTOM_IDS } from '@/data/symptoms';
import { settings, symptoms } from '@/lib/repositories';
import { isPlusCached } from '@/lib/paywall';
import { space } from '@/theme/tokens';

const STAGES = ['Perimenopausal', 'Menopausal', 'Post-menopausal', 'Not sure'] as const;
const HRT = ['On HRT', 'Considering it', 'Not for me', 'Not sure'] as const;
const FREE_LIMIT = 10;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const already = settings.get('onboarded') === '1';
  const [step, setStep] = useState(already ? 1 : 0);
  const [stage, setStage] = useState<string | null>(null);
  const [hrt, setHrt] = useState<string | null>(null);
  const all = useMemo(() => symptoms.all(), []);
  const [picked, setPicked] = useState<Set<string>>(new Set(symptoms.active().map((s) => s.id)));
  const plus = isPlusCached();

  const toggle = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else if (plus || next.size < FREE_LIMIT || CORE_SYMPTOM_IDS.includes(id)) next.add(id);
      return next;
    });
  };

  const finish = () => {
    for (const s of all) symptoms.setActive(s.id, picked.has(s.id));
    if (stage) settings.set('lifeStage', stage);
    if (hrt) settings.set('hrtStatus', hrt);
    const first = settings.get('onboarded') !== '1';
    settings.set('onboarded', '1');
    if (first && !plus) router.replace('/paywall');
    else router.replace('/(tabs)');
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingBottom: space.xxl, gap: space.l }}>
        {step === 0 && (
          <>
            <Txt role="display">Where are you in the transition?</Txt>
            <Txt role="secondary" color="ink2">There is no wrong answer — "not sure" is the most common one.</Txt>
            <View style={{ gap: space.s }}>
              {STAGES.map((s) => <Chip key={s} label={s} active={stage === s} onPress={() => setStage(s)} />)}
            </View>
            <Txt role="display" style={{ marginTop: space.l }}>And HRT?</Txt>
            <View style={{ gap: space.s }}>
              {HRT.map((h) => <Chip key={h} label={h} active={hrt === h} onPress={() => setHrt(h)} />)}
            </View>
            <Button label="Next" onPress={() => setStep(1)} />
          </>
        )}
        {step === 1 && (
          <>
            <Txt role="display">What should we track?</Txt>
            <Txt role="secondary" color="ink2">
              Pick everything that visits you, even occasionally.{plus ? '' : ` Free tracks up to ${FREE_LIMIT}; Plus is unlimited.`}
            </Txt>
            <Card style={{ padding: space.l }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                {all.map((s) => <Chip key={s.id} label={s.name} active={picked.has(s.id)} onPress={() => toggle(s.id)} />)}
              </View>
            </Card>
            <Txt role="data" color="ink2">{picked.size} selected</Txt>
            <Button label={already ? 'Save' : 'Start tracking'} onPress={finish} disabled={picked.size === 0} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
