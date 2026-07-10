// PAYWALL — annual+trial hero, monthly fallback. No timers, no fake strikethroughs (DESIGN.md).
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { Icon, type IconName } from '@/components/icons';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { purchase, restore } from '@/lib/paywall';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'file-text', text: 'The doctor-ready report — 90 days on one page' },
  { icon: 'patch', text: 'Full HRT engine: every delivery method, dose-change markers' },
  { icon: 'chart', text: 'Insights that compare before and after every change' },
];

export default function Paywall() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [annual, setAnnual] = useState<PurchasesPackage | null>(null);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [chosen, setChosen] = useState<'annual' | 'monthly'>('annual');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Purchases.getOfferings()
      .then((o) => {
        setAnnual(o.current?.annual ?? null);
        setMonthly(o.current?.monthly ?? null);
      })
      .catch(() => {});
  }, []);

  const buy = async () => {
    const pkg = chosen === 'annual' ? annual : monthly;
    if (!pkg) { router.back(); return; }
    setBusy(true);
    try {
      if (await purchase(pkg)) router.back();
    } catch {
      // User cancelled or store error — stay put, no nagging.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.l, gap: space.l }}>
        <Txt role="display">The instrument, complete.</Txt>
        <View style={{ gap: space.m }}>
          {BENEFITS.map((b) => (
            <View key={b.text} style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
              <Icon name={b.icon} size={20} color={p.ink2} />
              <Txt role="body" style={{ flex: 1 }}>{b.text}</Txt>
            </View>
          ))}
        </View>

        <Pressable onPress={() => setChosen('annual')}>
          <Card
            style={{
              padding: space.l,
              borderColor: p.ember,
              gap: 2,
              shadowColor: p.ember,
              shadowOpacity: chosen === 'annual' ? 0.35 : 0,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
              elevation: chosen === 'annual' ? 4 : 0,
            }}
          >
            <Txt role="label" color="ember">7 days free</Txt>
            <Txt role="title">Annual · {annual?.product.priceString ?? '$59.99'}/year</Txt>
            <Txt role="secondary" color="ink2">Equivalent to {annual ? monthlyEquivalent(annual) : '$5.00'}/month</Txt>
          </Card>
        </Pressable>
        <Pressable onPress={() => setChosen('monthly')}>
          <Card style={{ padding: space.l, borderColor: chosen === 'monthly' ? p.ember : p.hairline, borderRadius: radius.card }}>
            <Txt role="title">Monthly · {monthly?.product.priceString ?? '$9.99'}/month</Txt>
          </Card>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Button label={busy ? 'One moment…' : chosen === 'annual' ? 'Start free week' : 'Subscribe monthly'} onPress={() => void buy()} disabled={busy} />
        <Button kind="quiet" label="Restore purchases" onPress={() => void restore().then((ok) => ok && router.back())} />
        <Button kind="quiet" label="Not now" onPress={() => router.back()} />
        <Txt role="secondary" color="ink3" style={{ textAlign: 'center' }}>
          Because your data lives only on this phone, subscriptions are what keep this independent — you are the customer, not the product.
        </Txt>
      </View>
    </Screen>
  );
}

function monthlyEquivalent(pkg: PurchasesPackage): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: pkg.product.currencyCode }).format(
      pkg.product.price / 12,
    );
  } catch {
    return (pkg.product.price / 12).toFixed(2);
  }
}
