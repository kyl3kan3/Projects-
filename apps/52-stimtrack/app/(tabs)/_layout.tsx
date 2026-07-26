/**
 * app/(tabs)/_layout.tsx
 *
 * Bottom tab bar per DESIGN.md: Today / Calendar / Meds / Labs / Settings.
 *
 * TODO:
 * - [ ] Tab bar: height 56 + safe area, card at 96% + blur, hairline top;
 *       active = ink icon + 2px viridian dot; icons from src/components/icons
 *       at 22px.
 * - [ ] Ended-cycle register: when the active cycle is ended, tabs render
 *       neutral (no accent) until a new cycle starts (loss-aware rule).
 * - [ ] Redirect to /onboarding when no cycle exists and onboarding is
 *       incomplete (settings flag).
 */

export {};
