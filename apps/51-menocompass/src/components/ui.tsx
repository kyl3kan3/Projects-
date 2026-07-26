// Shared primitives — every screen builds from these so DESIGN.md stays enforced in one place.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, space, type as typeRoles } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Role = keyof typeof typeRoles;

export function Txt({
  role = 'body',
  color,
  style,
  children,
}: {
  role?: Role;
  color?: 'ink' | 'ink2' | 'ink3' | 'ember' | 'sage' | 'claret';
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}) {
  const p = useTheme();
  const c = color === 'ink2' ? p.ink2 : color === 'ink3' ? p.ink3 : color === 'ember' ? p.ember
    : color === 'sage' ? p.sage : color === 'claret' ? p.claret : p.ink;
  return <Text style={[typeRoles[role] as TextStyle, { color: c }, style]}>{children}</Text>;
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const p = useTheme();
  return (
    <View style={[{ backgroundColor: p.card, borderRadius: radius.card, borderWidth: 1, borderColor: p.hairline }, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
}) {
  const p = useTheme();
  if (kind === 'quiet') {
    return (
      <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
        {({ pressed }) => (
          <Txt role="secondary" color="ember" style={{ fontWeight: '600', opacity: pressed ? 0.75 : 1, textAlign: 'center' }}>
            {label}
          </Txt>
        )}
      </Pressable>
    );
  }
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
    >
      {({ pressed }) => (
        <View
          style={{
            height: 52,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: disabled ? p.hairline : primary ? (pressed ? p.buttonPressed : p.buttonFill) : 'transparent',
            borderWidth: primary ? 0 : 1,
            borderColor: pressed ? p.ink3 : p.hairline,
            transform: [{ scale: pressed && primary ? 0.98 : 1 }],
          }}
        >
          <Text style={[typeRoles.button, { color: disabled ? p.ink3 : primary ? p.buttonLabel : p.ink }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const p = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          height: 32,
          paddingHorizontal: 14,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: active ? p.ember : p.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? p.ember : p.ink2 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  const p = useTheme();
  return <View style={{ flex: 1, backgroundColor: p.paper, paddingHorizontal: space.gutter }}>{children}</View>;
}

export function Hairline() {
  const p = useTheme();
  return <View style={{ height: 1, backgroundColor: p.hairline }} />;
}
