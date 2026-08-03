"use client";

import { logoutAction } from "../../(auth)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="btn btn-secondary">
        Sign out
      </button>
    </form>
  );
}
