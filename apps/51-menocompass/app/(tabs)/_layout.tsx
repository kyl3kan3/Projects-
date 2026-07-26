// Bottom tab bar per DESIGN.md: Today / Trends / Meds / Report / Settings.
import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon, type IconName } from '@/components/icons';
import { useTheme } from '@/theme/useTheme';
import { fonts } from '@/theme/tokens';

function tab(name: IconName) {
  return ({ color, focused }: { color: string; focused: boolean }) => {
    const p = useTheme();
    return (
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Icon name={name} size={22} color={color} />
        {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: p.ember }} />}
      </View>
    );
  };
}

export default function TabsLayout() {
  const p = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.ink,
        tabBarInactiveTintColor: p.ink3,
        tabBarStyle: { backgroundColor: p.card, borderTopColor: p.hairline, height: 84, paddingTop: 8 },
        tabBarLabelStyle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tab('calendar') }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', tabBarIcon: tab('chart') }} />
      <Tabs.Screen name="meds" options={{ title: 'Meds', tabBarIcon: tab('pill') }} />
      <Tabs.Screen name="report" options={{ title: 'Report', tabBarIcon: tab('file-text') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tab('settings') }} />
    </Tabs>
  );
}
