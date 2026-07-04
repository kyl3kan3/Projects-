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
import { handleNotificationResponse, registerDoseActions } from '@/lib/notifications';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const p = useTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({
    SourceSerif4: require('../assets/fonts/SourceSerif4-Variable.ttf'),
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
