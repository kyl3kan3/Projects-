"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that knows the form is in flight. Used everywhere a plain form
 * posts to a server action — the crew flow does its own thing, because a foreman
 * with gloves gets a bigger target and immediate optimistic feedback.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary btn-full",
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      name={name}
      value={value}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
