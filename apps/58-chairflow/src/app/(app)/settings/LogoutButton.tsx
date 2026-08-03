"use client";

import { logoutAction } from "@/app/(auth)/actions";

/**
 * Signing out is a POST, never a link. `next/link` prefetches on hover, so a GET route with
 * a side effect runs before anybody taps it — which for this one would mean being logged out
 * by looking at the settings screen.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn btn-secondary" type="submit">
        Sign out
      </button>
    </form>
  );
}
