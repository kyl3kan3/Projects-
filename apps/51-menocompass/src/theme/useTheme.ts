// Theme hook: resolves the active palette from the OS color scheme.
import { useColorScheme } from 'react-native';
import { palettes, type Palette } from '@/theme/tokens';

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return palettes[scheme === 'dark' ? 'dark' : 'light'];
}
