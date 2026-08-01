import Link from "next/link";
import { headers } from "next/headers";
import { workspaceForHost, themeVars } from "@/lib/whitelabel";
import { PLANS } from "@/lib/plans";
import { PortalDemo } from "@/components/marketing/PortalDemo";
import { AgencyDoor } from "./AgencyDoor";
import { AgencyMark } from "./p/[slug]/PortalTheme";
import { IconBell, IconCheck, IconMail, IconStamp } from "@/components/icons";

/**
 * Two pages at one address.
 *
 * On an agency's own verified domain (portal.theiragency.com) the root is *their*
 * front door — their brand, no mention of us. On our own host it is the marketing
 * page. The host is resolved against verified custom domains only, so an
 * unverified hostname can never dress itself as an agency.
 */
export const dynamic = "force-dynamic";

const CTA = "Open your first portal";

export default async function RootPage() {
  const host = (await headers()).get("host") ?? "";
  const agency = await workspaceForHost(host);

  if (agency) {
    return (
      <div style={themeVars(agency.branding) as React.CSSProperties}>
        <main className="screen screen-portal">
          <div className="hairline-b py-4">
            <AgencyMark branding={agency.branding} name={agency.name} />
          </div>
          <div className="pt-12">
            <h1 className="t-display">Your project portal.</h1>
            <p className="t-body mt-4">
              Status, files, approvals and invoices for your work with {agency.name} — in one place,
              on your phone.
            </p>
          </div>
          <div className="mt-8">
            <AgencyDoor workspaceId={agency.id} agencyName={agency.name} />
          </div>
        </main>
      </div>
    );
  }

  return <MarketingPage />;
}

function MarketingPage() {
  return (
    <main>
      {/* ---- Hero: the machine running, above everything ------------------- */}
      <section className="screen pt-8 pb-12">
        <nav className="hairline-b flex items-center py-4">
          <span className="t-title flex-1" style={{ fontFamily: "var(--font-display)" }}>
            ClientDock
          </span>
          <Link href="/login" className="btn-quiet">
            Sign in
          </Link>
        </nav>

        <div className="pt-10">
          <p className="t-label">For agencies of 2 to 25</p>
          <h1 className="t-display mt-3">The client who stopped emailing “any update?”</h1>
          <p className="t-body mt-4" style={{ maxWidth: "34ch" }}>
            One branded link where your clients see exactly where things stand — status, files,
            approvals, invoices. Your logo on it. Nothing of ours.
          </p>
          <Link href="/signup" className="btn btn-primary btn-full mt-6">
            {CTA}
          </Link>
          <p className="t-secondary mt-3">14 days, two portals, no card.</p>
        </div>

        <div className="mt-10">
          <PortalDemo accent="#A8843F" band="#1E4D3B" />
          <p className="t-label mt-3 text-center">
            A staged demo portal, built in ClientDock — not a customer&apos;s data
          </p>
        </div>
      </section>

      {/* ---- The enemy ----------------------------------------------------- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The enemy</p>
        <h2 className="t-h2 mt-3">
          Status communication is the most expensive thing your studio does, and nobody bills for it.
        </h2>
        <p className="t-body mt-4">
          The Thursday “where are we on X?” email. The weekly call that exists only for reassurance.
          The file sent for the fifth time. The approval lost three replies deep in somebody&apos;s
          inbox.
        </p>
        <p className="t-body mt-4">
          None of it is the work. All of it is the job — until the client can just look.
        </p>
      </section>

      {/* ---- The math (animated moment: the offer writing itself out) ------ */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The math</p>
        <h2 className="t-h2 mt-3">Priced per business. Not per person on your side.</h2>
        <div className="mt-6">
          {[
            { label: "You, at $79/mo", value: "$79" },
            { label: "You plus a designer", value: "$79" },
            { label: "You, a designer, a PM and a dev", value: "$79" },
            { label: "The same four on $29-per-seat software", value: "$116" },
          ].map((row) => (
            <div key={row.label} className="row">
              <span className="t-body min-w-0 flex-1">{row.label}</span>
              <span className="t-data">{row.value}</span>
            </div>
          ))}
        </div>
        <p className="t-secondary mt-4">
          Per-seat pricing taxes the thing you want to do — grow the team. This doesn&apos;t.
        </p>
      </section>

      {/* ---- Objection killer --------------------------------------------- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">The real objection</p>
        <h2 className="t-h2 mt-3">“My clients will never log in.”</h2>
        <p className="t-body mt-4">
          Correct — they won&apos;t. So there is nothing to log into.
        </p>
        <div className="mt-6">
          {[
            {
              Icon: IconMail,
              title: "A link, not an account",
              body: "One tap from an email opens the portal. No password is ever created, so none is ever forgotten.",
            },
            {
              Icon: IconBell,
              title: "They can stay in email",
              body: "Every thread has its own reply address. A client answers the notification and it lands in the portal record.",
            },
            {
              Icon: IconStamp,
              title: "Approvals in one tap",
              body: "Approve, or send it back with a note. Either way the audit trail records who, when and what they said.",
            },
            {
              Icon: IconCheck,
              title: "You can prove they looked",
              body: "Every visit is counted, so you know which client actually opened it and which one needs a nudge.",
            },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="hairline-b flex gap-3 py-4">
              <Icon size={20} style={{ color: "var(--wl-accent)", flex: "none", marginTop: 2 }} />
              <div>
                <p className="t-title">{title}</p>
                <p className="t-secondary mt-1">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- White label -------------------------------------------------- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">White-label first, not last</p>
        <h2 className="t-h2 mt-3">The portal is your brand&apos;s front door. It should say so.</h2>
        <p className="t-body mt-4">
          Your logo, your two colours, your domain, and notification email from your own address once
          DKIM verifies. At $79 there is no “powered by” line anywhere a client can see — not in the
          footer, not in the email, not in the URL.
        </p>
        <p className="t-secondary mt-4">
          Two things we don&apos;t let you theme: the spacing and the approved/awaiting colours. They
          carry meaning your client relies on, and a portal nobody can read is worse than no portal.
        </p>
      </section>

      {/* ---- Pricing ------------------------------------------------------ */}
      <section className="screen hairline-t py-12">
        <p className="t-label">Pricing</p>
        <h2 className="t-h2 mt-3">Three tiers. Add whoever you like to any of them.</h2>
        <div className="mt-6">
          {(["solo", "agency", "studio"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="hairline-b py-5">
                <div className="flex items-baseline gap-3">
                  <span className="t-h2 flex-1">{p.name}</span>
                  <span className="t-data">${p.priceMonthly}/MO</span>
                </div>
                <p className="t-secondary mt-2">
                  {id === "solo"
                    ? "10 client portals · your logo and colours · your own portal domain"
                    : id === "agency"
                      ? "50 portals · full white-label · client e-approvals with audit trail · Stripe invoices paid in the portal · email from your domain"
                      : "Unlimited portals · team roles · per-client adoption analytics"}
                </p>
                <p className="t-data mt-2" style={{ color: "var(--color-ink-3)" }}>
                  {id === "solo"
                    ? "$2.90 PER PORTAL AT 10"
                    : id === "agency"
                      ? "$1.58 PER PORTAL AT 50"
                      : "PER BUSINESS, WHATEVER THE COUNT"}
                </p>
              </div>
            );
          })}
        </div>
        <Link href="/signup" className="btn btn-primary btn-full mt-6">
          {CTA}
        </Link>
      </section>

      {/* ---- Honest receipts --------------------------------------------- */}
      <section className="screen hairline-t py-12">
        <p className="t-label">Where the receipts will go</p>
        <h2 className="t-h2 mt-3">We haven&apos;t launched, so we have nothing to quote you.</h2>
        <p className="t-body mt-4">
          No logos we don&apos;t have permission for, no invented numbers, no testimonials from
          people who don&apos;t exist. The demo above is our own staged portal, and it is labelled as
          one.
        </p>
        <p className="t-body mt-4">
          What we can promise is the shape of the first three case studies: how long it took to
          furnish a portal, how many invited clients opened it in week one, and what happened to the
          “any update?” emails. When those exist, they go here with names on them.
        </p>
      </section>

      {/* ---- Final CTA --------------------------------------------------- */}
      <section className="screen hairline-t py-12" style={{ paddingBottom: 120 }}>
        <h2 className="t-display">Give your clients a lobby.</h2>
        <p className="t-body mt-4">
          Four minutes to furnish the first one. One link to send. Then the emails stop.
        </p>
        <Link href="/signup" className="btn btn-primary btn-full mt-6">
          {CTA}
        </Link>
        <p className="t-secondary mt-3">
          Not ready? <Link href="/signup" style={{ color: "var(--wl-accent)" }}>Build one portal</Link>{" "}
          and look at it on your phone before you invite anybody.
        </p>
      </section>

      {/* ---- Sticky mobile CTA ------------------------------------------- */}
      <div
        className="approval-bar"
        style={{ maxWidth: 560, bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <Link href="/signup" className="btn btn-primary btn-full">
          {CTA}
        </Link>
      </div>
    </main>
  );
}
