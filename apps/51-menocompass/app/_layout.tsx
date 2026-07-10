// Root layout: fonts, database, RevenueCat, notification actions, navigation shell.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import { openDb } from '@/lib/db';
import { settings } from '@/lib/repositories';
import { handleNotificationResponse, registerDoseActions, rescheduleAll } from '@/lib/notifications';
import { refreshEntitlement } from '@/lib/paywall';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const p = useTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({
    BricolageGrotesque: require('../assets/fonts/BricolageGrotesque-Variable.ttf'),
    Inter: require('../assets/fonts/Inter-Variable.ttf'),
    JetBrainsMono: require('../assets/fonts/JetBrainsMono-Variable.ttf'),
  });

  useEffect(() => {
    openDb();
    void registerDoseActions();
    const apiKey =
      Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
    if (apiKey) Purchases.configure({ apiKey });
    // Refresh the Plus entitlement cache on every launch so a lapsed subscription
    // expires on-device and a reinstalled payer is restored without hunting for a button.
    if (apiKey) void refreshEntitlement();
    void rescheduleAll();
    // A Taken/Skip tap that launched the app from a killed state is not delivered to
    // the listener below — fetch it explicitly so the dose log is never lost.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = handleNotificationResponse(response);
      if (route) router.push(route);
    });
    setReady(true);
    return () => sub.remove();
  }, [router]);

  if (!fontsLoaded || !ready) {
    // Fonts must actually load (BUILD.md) — we hold the ground color, never render fallback type.
    return <View style={{ flex: 1, backgroundColor: p.paper }} />;
  }

  const onboarded = settings.get('onboarded') === '1';
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.paper } }}
      initialRouteName={onboarded ? '(tabs)' : 'onboarding'}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
