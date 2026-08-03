"use client";

import { logoutAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton className="btn btn-secondary" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
}
