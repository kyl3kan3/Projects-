// The single SVG icon set: 20x20 viewBox, 1.75 stroke, round caps, currentColor.
import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export type IconName =
  | 'flame' | 'moon' | 'cloud' | 'bolt' | 'drop' | 'heart' | 'patch' | 'pill' | 'vial'
  | 'chart' | 'file-text' | 'bell' | 'check' | 'x' | 'plus' | 'chevron-left' | 'chevron-right'
  | 'chevron-down' | 'settings' | 'lock' | 'share' | 'calendar';

const strokeProps = { strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const s = { ...strokeProps, stroke: color };
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {name === 'flame' && <Path {...s} d="M10 2c2 3 5 5 5 9a5 5 0 0 1-10 0c0-4 3-6 5-9z" />}
      {name === 'moon' && <Path {...s} d="M15 12A7 7 0 1 1 8 3a6 6 0 0 0 7 9z" />}
      {name === 'cloud' && <Path {...s} d="M5 13a4 4 0 1 1 1-7.9A5 5 0 0 1 15.9 7 3.5 3.5 0 0 1 15 13z" />}
      {name === 'bolt' && <Path {...s} d="M11 2 4 11h5l-1 7 8-10h-5z" />}
      {name === 'drop' && <Path {...s} d="M10 2s5 5.5 5 10a5 5 0 0 1-10 0C5 7.5 10 2 10 2z" />}
      {name === 'heart' && <Path {...s} d="M10 17s-6-3.8-6-8a3.5 3.5 0 0 1 6-2.4A3.5 3.5 0 0 1 16 9c0 4.2-6 8-6 8z" />}
      {name === 'patch' && (<><Rect {...s} x="3" y="3" width="14" height="14" rx="3" /><Path {...s} d="M13 17v-4h4" /></>)}
      {name === 'pill' && (<><Rect {...s} x="4" y="2.5" width="12" height="15" rx="6" /><Path {...s} d="M4 10h12" /></>)}
      {name === 'vial' && <Path {...s} d="M8 2h4M10 2v6l4 8a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l4-8" />}
      {name === 'chart' && <Path {...s} d="M3 16l4-6 3 3 4-7 3 4" />}
      {name === 'file-text' && <Path {...s} d="M6 2h6l3 3v13H6z M12 2v4h4 M8 10h5 M8 13h5" />}
      {name === 'bell' && <Path {...s} d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13zM8.5 16.5a1.5 1.5 0 0 0 3 0" />}
      {name === 'check' && <Path {...s} d="M4 10.5 8.5 15 16 5" />}
      {name === 'x' && <Path {...s} d="M5 5l10 10M15 5 5 15" />}
      {name === 'plus' && <Path {...s} d="M10 4v12M4 10h12" />}
      {name === 'chevron-left' && <Path {...s} d="M12 4l-6 6 6 6" />}
      {name === 'chevron-right' && <Path {...s} d="M8 4l6 6-6 6" />}
      {name === 'chevron-down' && <Path {...s} d="M4 8l6 6 6-6" />}
      {name === 'settings' && (<><Circle {...s} cx="10" cy="10" r="3" /><Path {...s} d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M15.7 4.3l-2.1 2.1M6.4 13.6l-2.1 2.1" /></>)}
      {name === 'lock' && (<><Rect {...s} x="4" y="9" width="12" height="8" rx="2" /><Path {...s} d="M7 9V6a3 3 0 0 1 6 0v3" /></>)}
      {name === 'share' && <Path {...s} d="M10 12V3M6.5 6 10 2.5 13.5 6M4 10v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6" />}
      {name === 'calendar' && (<><Rect {...s} x="3" y="4" width="14" height="13" rx="2" /><Path {...s} d="M3 8h14M7 2v4M13 2v4" /></>)}
    </Svg>
  );
}

export const DOMAIN_ICON: Record<string, IconName> = {
  vasomotor: 'flame', sleep: 'moon', mood: 'cloud', cognitive: 'cloud',
  physical: 'heart', cycle: 'drop', other: 'bolt',
};
