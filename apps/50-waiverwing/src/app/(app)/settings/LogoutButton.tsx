"use client";

import { logoutAction } from "../../(auth)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn btn-secondary" type="submit">
        Sign out
      </button>
    </form>
  );
}
