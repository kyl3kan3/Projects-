// The curated symptom library. Names use plain adult language (DESIGN.md voice).
// The 10 marked `core` are the free tier; the full set (+custom) is Plus.

export type SymptomDomain = 'vasomotor' | 'sleep' | 'mood' | 'cognitive' | 'physical' | 'cycle' | 'other';

export interface SymptomDef {
  id: string;
  name: string;
  domain: SymptomDomain;
  core?: boolean;
  sort: number;
}

export const SYMPTOM_LIBRARY: SymptomDef[] = [
  // Vasomotor
  { id: 'hot-flashes', name: 'Hot flashes', domain: 'vasomotor', core: true, sort: 10 },
  { id: 'night-sweats', name: 'Night sweats', domain: 'vasomotor', core: true, sort: 20 },
  { id: 'chills', name: 'Chills', domain: 'vasomotor', sort: 30 },
  { id: 'flushing', name: 'Facial flushing', domain: 'vasomotor', sort: 40 },
  // Sleep
  { id: 'insomnia', name: 'Trouble sleeping', domain: 'sleep', core: true, sort: 50 },
  { id: 'early-waking', name: 'Waking too early', domain: 'sleep', sort: 60 },
  { id: 'restless-sleep', name: 'Restless sleep', domain: 'sleep', sort: 70 },
  // Mood
  { id: 'irritability', name: 'Irritability or rage', domain: 'mood', core: true, sort: 80 },
  { id: 'anxiety', name: 'Anxiety', domain: 'mood', core: true, sort: 90 },
  { id: 'low-mood', name: 'Low mood', domain: 'mood', core: true, sort: 100 },
  { id: 'mood-swings', name: 'Mood swings', domain: 'mood', sort: 110 },
  { id: 'loss-of-drive', name: 'Loss of motivation', domain: 'mood', sort: 120 },
  { id: 'low-libido', name: 'Low libido', domain: 'mood', sort: 130 },
  // Cognitive
  { id: 'brain-fog', name: 'Brain fog', domain: 'cognitive', core: true, sort: 140 },
  { id: 'memory', name: 'Memory lapses', domain: 'cognitive', sort: 150 },
  { id: 'word-finding', name: 'Word-finding trouble', domain: 'cognitive', sort: 160 },
  { id: 'concentration', name: 'Poor concentration', domain: 'cognitive', sort: 170 },
  // Physical
  { id: 'fatigue', name: 'Fatigue', domain: 'physical', core: true, sort: 180 },
  { id: 'joint-pain', name: 'Joint pain', domain: 'physical', core: true, sort: 190 },
  { id: 'muscle-aches', name: 'Muscle aches', domain: 'physical', sort: 200 },
  { id: 'headache', name: 'Headaches or migraine', domain: 'physical', sort: 210 },
  { id: 'palpitations', name: 'Heart palpitations', domain: 'physical', sort: 220 },
  { id: 'dizziness', name: 'Dizziness', domain: 'physical', sort: 230 },
  { id: 'breast-tenderness', name: 'Breast tenderness', domain: 'physical', sort: 240 },
  { id: 'bloating', name: 'Bloating', domain: 'physical', sort: 250 },
  { id: 'weight-change', name: 'Weight change', domain: 'physical', sort: 260 },
  { id: 'dry-skin', name: 'Dry or itchy skin', domain: 'physical', sort: 270 },
  { id: 'dry-eyes', name: 'Dry eyes', domain: 'physical', sort: 280 },
  { id: 'hair-thinning', name: 'Hair thinning', domain: 'physical', sort: 290 },
  { id: 'vaginal-dryness', name: 'Vaginal dryness', domain: 'physical', sort: 300 },
  { id: 'urinary', name: 'Urinary changes', domain: 'physical', sort: 310 },
  { id: 'tinnitus', name: 'Ringing ears', domain: 'physical', sort: 320 },
  // Cycle
  { id: 'heavy-bleeding', name: 'Heavier periods', domain: 'cycle', core: true, sort: 330 },
  { id: 'irregular-cycles', name: 'Irregular cycles', domain: 'cycle', sort: 340 },
  { id: 'cramps', name: 'Cramps', domain: 'cycle', sort: 350 },
];

export const CORE_SYMPTOM_IDS = SYMPTOM_LIBRARY.filter((s) => s.core).map((s) => s.id);

export const DOMAIN_LABELS: Record<SymptomDomain, string> = {
  vasomotor: 'Heat',
  sleep: 'Sleep',
  mood: 'Mood',
  cognitive: 'Mind',
  physical: 'Body',
  cycle: 'Cycle',
  other: 'Other',
};
