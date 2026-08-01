import { logoutAction } from "./actions";

/** Sign out. A form, not a link: signing out is a state change. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn btn-secondary" type="submit">
        Sign out
      </button>
    </form>
  );
}
