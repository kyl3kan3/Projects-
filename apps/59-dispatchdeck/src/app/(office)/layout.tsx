import Link from "next/link";
import { TabBar } from "@/components/TabBar";
import { SignOutIcon, TruckIcon } from "@/components/icons";
import { requireOffice } from "@/lib/auth";
import { planState } from "@/lib/plans";
import { logoutAction } from "../(auth)/actions";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { user, carrier } = await requireOffice();
  const state = planState(carrier);

  return (
    <>
      <header className="rule-b">
        <div
          className="flex items-center justify-between gap-4 mx-auto"
          style={{ maxWidth: 1120, padding: "12px var(--gutter)" }}
        >
          <Link
            href="/loads"
            className="flex items-center gap-2 min-w-0"
            style={{ textDecoration: "none" }}
          >
            <span style={{ color: "var(--accent)" }}>
              <TruckIcon size={20} />
            </span>
            <span className="t-title truncate">{carrier.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/cab" className="t-placard" style={{ textDecoration: "none" }}>
              Cab
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="btn btn-quiet"
                style={{ minHeight: 44, padding: "0 8px" }}
                aria-label={`Sign out ${user.name}`}
              >
                <SignOutIcon size={20} />
              </button>
            </form>
          </div>
        </div>
      </header>

      {state.readOnly ? (
        <p
          className="t-secondary"
          role="status"
          style={{
            color: "var(--accent)",
            padding: "12px var(--gutter)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          {state.readOnlyReason}{" "}
          <Link href="/settings/billing" style={{ color: "var(--fg)" }}>
            Pick a plan
          </Link>
        </p>
      ) : state.trialing && state.trialDaysLeft !== null ? (
        <p
          className="t-secondary"
          style={{ padding: "12px var(--gutter)", borderBottom: "1px solid var(--line)" }}
        >
          Trial — {state.trialDaysLeft} {state.trialDaysLeft === 1 ? "day" : "days"} left.{" "}
          <Link href="/settings/billing" style={{ color: "var(--fg)" }}>
            See plans
          </Link>
        </p>
      ) : null}

      <TabBar />
      {children}
    </>
  );
}
