// ONBOARDING — life stage -> symptom picker -> HRT status -> done (value first, paywall after).
// Also reachable from Settings as "Manage symptoms tracked" (skips straight to the picker).
import React, { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Screen, Txt } from '@/components/ui';
import { settings, symptoms } from '@/lib/repositories';
import { isPlusCached } from '@/lib/paywall';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

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
  const [all, setAll] = useState(() => symptoms.all());
  const [picked, setPicked] = useState<Set<string>>(new Set(symptoms.active().map((s) => s.id)));
  const [customName, setCustomName] = useState('');
  const plus = isPlusCached();
  const theme = useTheme();

  const toggle = (id: string) => {
    if (!picked.has(id) && !plus && picked.size >= FREE_LIMIT) {
      // The 11th symptom is a specified high-intent paywall moment — never a silent no-op.
      router.push('/paywall');
      return;
    }
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    if (!plus) { router.push('/paywall'); return; }
    const created = symptoms.addCustom(name, 'other');
    setAll(symptoms.all());
    setPicked((cur) => new Set(cur).add(created.id));
    setCustomName('');
  };

  const finish = () => {
    for (const s of all) symptoms.setActive(s.id, picked.has(s.id));
    if (stage) settings.set('lifeStage', stage);
    if (hrt) settings.set('hrtStatus', hrt);
    settings.set('onboarded', '1');
    // Value first (README): the paywall appears after the first real check-in
    // on the Today screen — never as the door out of onboarding.
    router.replace('/(tabs)');
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
            <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder={plus ? 'Add your own symptom' : 'Add your own (Plus)'}
                placeholderTextColor={theme.ink3}
                onSubmitEditing={addCustom}
                style={{
                  flex: 1, height: 44, borderWidth: 1, borderColor: theme.hairline, borderRadius: 10,
                  paddingHorizontal: space.m, color: theme.ink, fontSize: 15, backgroundColor: theme.card,
                }}
              />
              <Button kind="quiet" label="Add" onPress={addCustom} />
            </View>
            <Txt role="data" color="ink2">{picked.size} selected</Txt>
            <Button label={already ? 'Save' : 'Start tracking'} onPress={finish} disabled={picked.size === 0} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
