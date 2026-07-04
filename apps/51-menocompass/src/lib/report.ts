// Doctor-ready report: 90-day one-pager as typeset HTML -> expo-print PDF -> share sheet.
// This artifact is the brand (DESIGN.md) — report typography mirrors the app's specimen.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  aggregate, checkins, cycles, doseLog, labs, meds, symptoms, todayIso,
} from '@/lib/repositories';

function shift(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export interface ReportData { html: string; from: string; to: string }

export function buildReportHtml(rangeDays = 90): ReportData {
  const to = todayIso();
  const from = shift(to, -rangeDays + 1);
  const names = new Map(symptoms.all().map((s) => [s.id, s.name]));
  const aggs = aggregate(from, to).sort((a, b) => b.meanSeverity * b.daysLogged - a.meanSeverity * a.daysLogged).slice(0, 6);
  const entries = checkins.range(from, to);
  const daysLogged = new Set(entries.map((e) => e.date)).size;
  const gaps = cycles.gapSeries().slice(-4);
  const currentGap = cycles.currentGapDays(to);
  const markers = meds.doseChangeMarkers().filter((m) => m.date >= from);
  const labRows = labs.all().filter((l) => l.date >= from);

  const medLines = meds.active().map((med) => {
    const r = meds.currentRegimen(med.id);
    if (!r) return '';
    const history = meds.regimenHistory(med.id);
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const changed = prev ? ` (changed from ${escapeHtml(prev.dose)} on <span class="ember">${fmt(r.startDate)}</span>)` : '';
    const logs = doseLog.forRegimen(r.id, 200);
    const adherence = logs.length ? Math.round((logs.filter((l) => l.status === 'taken').length / logs.length) * 100) : null;
    return `<div>${escapeHtml(med.name)} ${escapeHtml(r.dose)}, ${scheduleText(r.schedule)}${changed}${adherence !== null ? ` · adherence ${adherence}%` : ''}</div>`;
  }).join('');

  const symptomRows = aggs.map((a) => {
    const name = names.get(a.symptomId) ?? a.symptomId;
    return `<tr><td>${escapeHtml(name)}</td><td class="num">${a.daysLogged}</td><td class="num">${a.meanSeverity.toFixed(1)}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 36px; }
    body { font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #26221C; font-size: 11px; line-height: 1.5; }
    h1 { font-family: Georgia, serif; font-size: 20px; margin: 0 0 2px; }
    .sub { color: #6E675C; font-size: 10px; margin-bottom: 14px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6E675C; margin: 16px 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border-top: 1px solid #E3DDD2; padding: 5px 4px; text-align: left; }
    th { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #6E675C; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .ember { color: #B4552D; }
    .muted { color: #6E675C; }
    .foot { margin-top: 18px; font-size: 9px; color: #A39B8D; border-top: 1px solid #E3DDD2; padding-top: 8px; }
  </style></head><body>
    <h1>Symptom &amp; treatment summary</h1>
    <div class="sub">${fmt(from)} – ${fmt(to)} · ${daysLogged} of ${rangeDays} days logged · prepared with MenoCompass</div>
    <h2>Most significant symptoms</h2>
    <table><tr><th>Symptom</th><th class="num">Days logged</th><th class="num">Avg severity (0–3)</th></tr>${symptomRows}</table>
    <h2>Cycle</h2>
    <div class="muted">${gaps.length ? `Recent gaps between period starts: ${gaps.map((g) => `${g.days}`).join(' · ')} days.` : 'No period events logged in range.'}
      ${currentGap !== null ? ` Currently ${currentGap} days since the last period start.` : ''}</div>
    <h2>Current regimen</h2>
    ${medLines || '<div class="muted">No active medications logged.</div>'}
    ${markers.length ? `<h2>Dose changes in range</h2><div class="muted">${markers.map((m) => `${fmt(m.date)}: ${escapeHtml(m.dose)}`).join(' · ')}</div>` : ''}
    ${labRows.length ? `<h2>Labs</h2><table><tr><th>Date</th><th>Panel</th><th class="num">Value</th></tr>${labRows.map((l) => `<tr><td>${fmt(l.date)}</td><td>${escapeHtml(l.panel)}</td><td class="num">${l.value} ${escapeHtml(l.unit)}</td></tr>`).join('')}</table>` : ''}
    <div class="foot">Patient-recorded data from a personal symptom diary. Severity is self-rated 0–3. This document makes no diagnostic claims.</div>
  </body></html>`;
  return { html, from, to };
}

function scheduleText(s: import('@/lib/repositories').Schedule): string {
  switch (s.type) {
    case 'daily': return `daily at ${s.time}`;
    case 'twice_weekly': return `twice weekly (${s.days.join(' & ')})`;
    case 'weekly': return `weekly (${s.day})`;
    case 'cyclical': return `${s.daysOn} days on / ${s.daysOff} off`;
  }
}

function escapeHtml(x: string): string {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function generateAndShare(rangeDays = 90): Promise<void> {
  const { html } = buildReportHtml(rangeDays);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
  }
}
