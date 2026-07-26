// Design tokens — the only source of color/type/spacing in the app.
// Identity: "Twilight" — a dark-first clinical instrument. Deep teal-ink grounds,
// one warm amber-gold signal, mono data. Both modes are first-class; dark is the
// hero expression (the 3 a.m. night-sweat log is a core use case).
// No other hex values may appear anywhere in src/ or app/.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  paper: string; // the ground of every screen
  card: string; // raised surfaces
  hairline: string;
  ink: string;
  ink2: string;
  ink3: string;
  ember: string; // THE signal — amber-gold. Active states, dose-change markers, brand. ≤10%.
  sage: string; // semantic: logged / taken
  claret: string; // semantic: skipped / missed
  buttonFill: string;
  buttonPressed: string;
  buttonLabel: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  // Dark — the hero expression. Deep teal-ink, not black; amber-gold reads like a lit dial.
  dark: {
    paper: '#0E1618',
    card: '#16232A',
    hairline: '#26383E',
    ink: '#E9F1EE',
    ink2: '#93A8A8',
    ink3: '#5C7176',
    ember: '#E8A552',
    sage: '#6FB79A',
    claret: '#E0755F',
    buttonFill: '#E9F1EE',
    buttonPressed: '#CFDAD7',
    buttonLabel: '#0E1618',
  },
  // Light — the daytime companion. Cool off-white with a faint teal bias (chosen, not default grey).
  light: {
    paper: '#F1F4F3',
    card: '#FFFFFF',
    hairline: '#DBE4E2',
    ink: '#12201F',
    ink2: '#4E605D',
    ink3: '#8A9E9A',
    ember: '#B26A12',
    sage: '#3C7B61',
    claret: '#BB4E37',
    buttonFill: '#12201F',
    buttonPressed: '#223634',
    buttonLabel: '#F1F4F3',
  },
};

/** Severity 0–3 as four weights of the amber signal. 0 renders outline-only. */
export const severityOpacity = [0, 0.3, 0.6, 1] as const;
export type Severity = 0 | 1 | 2 | 3;

/** 4px scale. Screen gutter = 20. */
export const space = { xs: 4, s: 8, m: 12, l: 16, gutter: 20, xl: 24, xxl: 32, xxxl: 48, huge: 64 } as const;

export const radius = { control: 10, card: 14, sheet: 22 } as const;

// Variable fonts (assets/fonts/*.ttf) registered under these family names in app/_layout.
// Bricolage Grotesque carries the display voice — technical, warm, un-literary.
export const fonts = {
  display: 'BricolageGrotesque',
  ui: 'Inter',
  mono: 'JetBrainsMono',
} as const;

interface TypeRole {
  fontFamily: string;
  fontWeight: '400' | '500' | '600' | '700';
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

export const type: Record<
  'display' | 'h2' | 'title' | 'body' | 'secondary' | 'label' | 'data' | 'bigDatum' | 'button',
  TypeRole
> = {
  display: { fontFamily: fonts.display, fontWeight: '700', fontSize: 30, lineHeight: 35, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.display, fontWeight: '600', fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  title: { fontFamily: fonts.ui, fontWeight: '500', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.ui, fontWeight: '400', fontSize: 16, lineHeight: 24 },
  secondary: { fontFamily: fonts.ui, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, lineHeight: 13, letterSpacing: 0.9, textTransform: 'uppercase' },
  data: { fontFamily: fonts.mono, fontWeight: '500', fontSize: 14, lineHeight: 17 },
  bigDatum: { fontFamily: fonts.mono, fontWeight: '600', fontSize: 36, lineHeight: 36 },
  button: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, lineHeight: 16 },
};

/** Motion durations (ms). The report render is the only choreographed sequence. */
export const motion = { state: 200, nav: 300, severityTap: 120, reportRender: 900, reducedFade: 250 } as const;
