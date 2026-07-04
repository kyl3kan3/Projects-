// The core control (DESIGN.md): card tile, domain glyph, symptom title, 4-dot severity row.
// Tap the tile = cycle severity; tap a dot = set directly. Selection haptic on every change.
import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, severityOpacity, space, type Severity } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Icon, DOMAIN_ICON } from '@/components/icons';
import { Txt } from '@/components/ui';
import type { Symptom } from '@/lib/repositories';

export function CheckInTile({
  symptom,
  severity,
  onChange,
  large = false,
}: {
  symptom: Symptom;
  severity: Severity;
  onChange: (s: Severity) => void;
  large?: boolean;
}) {
  const p = useTheme();
  const set = (s: Severity) => {
    void Haptics.selectionAsync();
    onChange(s);
  };
  const dotSize = large ? 18 : 12;
  return (
    <Pressable onPress={() => set(((severity + 1) % 4) as Severity)} accessibilityLabel={`${symptom.name}, severity ${severity} of 3`}>
      <View
        style={{
          backgroundColor: p.card,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: severity > 0 ? p.ember : p.hairline,
          padding: large ? 18 : space.m,
          minHeight: large ? 88 : 64,
          gap: space.s,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Icon name={DOMAIN_ICON[symptom.domain] ?? 'bolt'} size={large ? 22 : 18} color={severity > 0 ? p.sage : p.ink2} />
          <Txt role="title" style={large ? { fontSize: 19 } : undefined}>{symptom.name}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: large ? 14 : space.s }}>
          {([0, 1, 2, 3] as Severity[]).map((s) => (
            <Pressable key={s} onPress={() => set(s)} hitSlop={6} accessibilityLabel={`set severity ${s}`}>
              <View
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  borderWidth: s === 0 ? 1.5 : 0,
                  borderColor: p.ember,
                  backgroundColor: s === 0 ? 'transparent' : p.ember,
                  opacity: s === 0 ? 1 : severityOpacity[s],
                  transform: [{ scale: severity === s ? 1.25 : 1 }],
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </Pressable>
  );
}
