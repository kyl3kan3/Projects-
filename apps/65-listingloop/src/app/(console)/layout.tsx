import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "../(auth)/actions";
import { IconFile } from "@/components/icons";
import { Rail, TabBar } from "@/components/Nav";
import { isReadOnly, planSpec, trialDaysLeft } from "@/lib/plans";

/**
 * The console shell. Desktop-first per DESIGN.md (the rail appears at 1024px and
 * the working width is 1280), but it has to survive a phone too — a coordinator
 * checks a deadline from the car — so the phone gets the tab bar and every row
 * stays a 44px target.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, account } = await requireSession();
  const spec = planSpec(account.plan);
  const daysLeft = trialDaysLeft(account);
  const readOnly = isReadOnly(account);

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-sheet px-3 py-6 lg:block">
        <Link href="/deals" className="mb-8 flex items-center gap-2 px-3 text-ink no-underline">
          <IconFile size={22} />
          <span className="t-title">ListingLoop</span>
        </Link>
        <Rail />
        <div className="mt-8 border-t border-line px-3 pt-4">
          <p className="t-label">Desk</p>
          <p className="t-secondary mt-1">{account.name}</p>
          <p className="t-secondary mt-3">
            {spec.name}
            {account.plan === "trial" ? ` · ${daysLeft} days left` : ""}
          </p>
          <p className="t-secondary mt-3">{user.name}</p>
          <form action={logoutAction} className="mt-2">
            <button className="btn-quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {account.plan === "trial" && !readOnly ? (
          <p className="hairline-b bg-sheet px-5 py-2 text-center">
            <span className="t-secondary">
              Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left ·{" "}
              <Link href="/settings/billing" className="btn-quiet">
                choose a plan
              </Link>
            </span>
          </p>
        ) : null}
        {readOnly ? (
          <p className="hairline-b bg-sheet px-5 py-2 text-center">
            <span className="t-secondary" style={{ color: "var(--color-keybox)" }}>
              Your trial has ended — the desk is read-only. Exports still work.{" "}
              <Link href="/settings/billing" className="btn-quiet">
                Choose a plan
              </Link>
            </span>
          </p>
        ) : null}
        {children}
      </div>

      <TabBar />
    </div>
  );
}
