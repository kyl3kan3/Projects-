// Design tokens from DESIGN.md — the only source of color/type/spacing in the app.
// No other hex values may appear anywhere in src/ or app/.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  paper: string;
  card: string;
  hairline: string;
  ink: string;
  ink2: string;
  ink3: string;
  ember: string;
  sage: string;
  claret: string;
  /** Primary button fill / pressed / label (ink-on-paper flips per mode) */
  buttonFill: string;
  buttonPressed: string;
  buttonLabel: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    paper: '#F7F4EE',
    card: '#FFFDF9',
    hairline: '#E3DDD2',
    ink: '#26221C',
    ink2: '#6E675C',
    ink3: '#A39B8D',
    ember: '#B4552D',
    sage: '#5E7A5A',
    claret: '#8C3A31',
    buttonFill: '#26221C',
    buttonPressed: '#3A3429',
    buttonLabel: '#F7F4EE',
  },
  dark: {
    paper: '#171512',
    card: '#1F1C18',
    hairline: '#332E27',
    ink: '#EDE8DF',
    ink2: '#9C9486',
    ink3: '#635C51',
    ember: '#D06A3E',
    sage: '#7C9877',
    claret: '#B0524A',
    buttonFill: '#EDE8DF',
    buttonPressed: '#D8D2C6',
    buttonLabel: '#171512',
  },
};

/** Severity 0–3 encoded as ember at four weights (DESIGN.md). 0 renders outline-only. */
export const severityOpacity = [0, 0.3, 0.6, 1] as const;
export type Severity = 0 | 1 | 2 | 3;

/** 4px scale from DESIGN.md. Screen gutter = 20. */
export const space = { xs: 4, s: 8, m: 12, l: 16, gutter: 20, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const radius = { control: 10, card: 14, sheet: 22 } as const;

// Variable fonts (assets/fonts/*.ttf) registered under these family names in app/_layout.
export const fonts = {
  serif: 'SourceSerif4',
  ui: 'Inter',
  mono: 'JetBrainsMono',
} as const;

interface TypeRole {
  fontFamily: string;
  fontWeight: '400' | '500' | '600';
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

export const type: Record<
  'display' | 'h2' | 'title' | 'body' | 'secondary' | 'label' | 'data' | 'bigDatum' | 'button',
  TypeRole
> = {
  display: { fontFamily: fonts.serif, fontWeight: '600', fontSize: 28, lineHeight: 35 },
  h2: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  title: { fontFamily: fonts.ui, fontWeight: '500', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.ui, fontWeight: '400', fontSize: 16, lineHeight: 24 },
  secondary: { fontFamily: fonts.ui, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, lineHeight: 13, letterSpacing: 0.88, textTransform: 'uppercase' },
  data: { fontFamily: fonts.mono, fontWeight: '500', fontSize: 14, lineHeight: 17 },
  bigDatum: { fontFamily: fonts.mono, fontWeight: '500', fontSize: 34, lineHeight: 34 },
  button: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, lineHeight: 16 },
};

/** Motion durations (ms). The report render is the only choreographed sequence. */
export const motion = { state: 200, nav: 300, severityTap: 120, reportRender: 900, reducedFade: 250 } as const;
