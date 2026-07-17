/**
 * StepperInput — 56px weight/rep steppers for gym thumbs.
 *
 * Long-press accelerates; weight steps 2.5kg/5lb by unit preference;
 * values render in JetBrains Mono. Writes go through the outbox, never
 * directly to fetch.
 *
 * TODO: props { value, step, unit, onCommit }; press-and-hold repeat;
 * haptic-feel active states (scale 0.98).
 */

"use client";

export interface StepperInputProps {
  value: number;
  step: number;
  unit: "kg" | "lb" | "reps" | "rpe";
  onCommit: (value: number) => void;
}

export function StepperInput(props: StepperInputProps) {
  void props;
  return <div className="stepper">Not implemented</div>;
}
