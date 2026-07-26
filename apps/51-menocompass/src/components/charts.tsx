// Chart marks per DESIGN.md: TrendChart (2px ink line, hairline grid, weekly ticks),
// HeatStrip (severity opacity ramp), CycleGapChart, dose-change markers. No chart junk.
import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { fonts, severityOpacity } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export interface TrendPoint { date: string; value: number }
export interface Marker { date: string; label: string }

function x(dateIso: string, from: string, to: string, width: number): number {
  const span = Date.parse(to) - Date.parse(from) || 1;
  return ((Date.parse(dateIso) - Date.parse(from)) / span) * width;
}

export function TrendChart({
  points, markers, from, to, width, height = 110, maxValue = 3,
}: {
  points: TrendPoint[]; markers: Marker[]; from: string; to: string;
  width: number; height?: number; maxValue?: number;
}) {
  const p = useTheme();
  const plotH = height - 18;
  const y = (v: number) => plotH - (v / maxValue) * (plotH - 12);
  const poly = points.map((pt) => `${x(pt.date, from, to, width).toFixed(1)},${y(pt.value).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      {[1, 2, 3].map((g) => (
        <Line key={g} x1={0} y1={y(g)} x2={width} y2={y(g)} stroke={p.hairline} strokeWidth={1} />
      ))}
      {points.length > 1 && <Polyline points={poly} stroke={p.ink} strokeWidth={2} fill="none" />}
      {markers.map((m) => {
        const mx = x(m.date, from, to, width);
        if (mx < 0 || mx > width) return null;
        return (
          <React.Fragment key={m.date + m.label}>
            <Line x1={mx} y1={6} x2={mx} y2={plotH} stroke={p.ember} strokeWidth={1.5} />
            <Rect x={mx - 4} y={2} width={8} height={8} fill={p.ember} transform={`rotate(45 ${mx} 6)`} />
            <SvgText x={Math.min(mx + 7, width - 70)} y={12} fill={p.ember} fontSize={9} fontFamily={fonts.mono}>
              {m.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/** 90-day at-a-glance: rows of weeks, severity as ember opacity. */
export function HeatStrip({ days, columns = 12, cell = 16 }: { days: { severity: 0 | 1 | 2 | 3 }[]; columns?: number; cell?: number }) {
  const p = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: columns * (cell + 4) }}>
      {days.map((d, i) => (
        <View
          key={i}
          style={{
            width: cell, height: cell, borderRadius: 2,
            backgroundColor: d.severity === 0 ? p.hairline : p.ember,
            opacity: d.severity === 0 ? 1 : severityOpacity[d.severity],
          }}
        />
      ))}
    </View>
  );
}

export function CycleGapChart({ gaps, width, height = 56 }: { gaps: number[]; width: number; height?: number }) {
  const p = useTheme();
  const max = Math.max(...gaps, 1);
  const barW = Math.min(22, width / Math.max(gaps.length, 1) - 6);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height }}>
      {gaps.map((g, i) => {
        const intensity = g / max;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: Math.max(6, (g / max) * height),
              borderRadius: 2,
              backgroundColor: p.ember,
              opacity: intensity > 0.85 ? 1 : intensity > 0.6 ? 0.6 : 0.3,
            }}
          />
        );
      })}
    </View>
  );
}
