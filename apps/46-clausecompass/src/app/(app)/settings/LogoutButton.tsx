"use client";

import { logoutAction } from "@/app/(auth)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn btn-secondary btn-full" type="submit">
        Sign out
      </button>
    </form>
  );
}
