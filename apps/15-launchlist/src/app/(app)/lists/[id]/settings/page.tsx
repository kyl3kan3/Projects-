import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { billableSignupCount, ownedList } from "@/lib/lists";
import { deliveryStats, endpointsFor, ZAPIER_HOOK_HELP } from "@/lib/webhooks";
import { featureAllowed, limitLabel, plan } from "@/lib/plans";
import { env } from "@/lib/env";
import { ListHeader } from "@/components/ListHeader";
import { IconDownload } from "@/components/icons";
import {
  ArchiveButton,
  BadgeToggle,
  DomainForm,
  LaunchButton,
  MechanicsForm,
  RemoveWebhookButton,
  SlugForm,
  WebhookForm,
} from "./SettingsForms";

export const metadata: Metadata = { title: "List settings" };
export const dynamic = "force-dynamic";

export default async function ListSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();

  const limits = plan(user.plan);
  const [used, endpoints, deliveries] = await Promise.all([
    billableSignupCount(list.id),
    endpointsFor(list.id),
    deliveryStats(list.id),
  ]);
  const appHost = env.appUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  return (
    <main className="screen">
      <ListHeader
        list={list}
        section="Settings"
        detail={
          <p className="t-secondary">
            {used} of {limitLabel(limits.signupsPerList)} signups on {limits.name} ·{" "}
            <Link href="/settings/billing">Change plan</Link>
          </p>
        }
      />

      <Section title="Address">
        <SlugForm listId={list.id} slug={list.slug} base={`${appHost}/l`} />
      </Section>

      <Section title="Referral mechanics">
        <MechanicsForm
          listId={list.id}
          boostPerReferral={list.boostPerReferral}
          maxBoost={list.maxBoost}
          requireDoubleOptIn={list.requireDoubleOptIn}
        />
      </Section>

      <Section title="Badge">
        <BadgeToggle
          listId={list.id}
          hidden={list.badgeHidden}
          allowed={featureAllowed(user.plan, "canHideBadge")}
        />
      </Section>

      <Section
        title="Custom domain"
        note={
          featureAllowed(user.plan, "customDomain")
            ? undefined
            : `Custom domains are on Growth. You're on ${limits.name}.`
        }
      >
        <DomainForm
          listId={list.id}
          customDomain={list.customDomain}
          verified={list.customDomainVerified}
          allowed={featureAllowed(user.plan, "customDomain")}
          appHost={appHost}
        />
      </Section>

      <Section title="Export">
        <p className="t-secondary">
          Your list is yours on every plan, including free — email, position, referral code, who
          referred whom, and the fraud score we assigned.
        </p>
        <a
          href={`/api/lists/${list.id}/export`}
          className="btn btn-secondary btn-full"
          style={{ marginTop: 12 }}
        >
          <IconDownload size={18} />
          Download CSV
        </a>
      </Section>

      <Section
        title="Webhooks and Zapier"
        note={
          featureAllowed(user.plan, "webhooks")
            ? undefined
            : `Webhooks are on Pro. You're on ${limits.name}.`
        }
      >
        <p className="t-secondary">
          Every confirmed signup is POSTed as JSON, signed with{" "}
          <span className="t-data">x-launchlist-signature</span>. Retried five times with backoff, so
          a deploy on your side doesn&apos;t lose events.
        </p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {ZAPIER_HOOK_HELP}
        </p>

        {endpoints.length > 0 ? (
          <ul style={{ marginTop: 16 }}>
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-data" style={{ display: "block", wordBreak: "break-all" }}>
                    {endpoint.url}
                  </span>
                  <span className="t-secondary">
                    secret <span className="t-data">{endpoint.secret.slice(0, 12)}…</span>
                  </span>
                </span>
                <RemoveWebhookButton listId={list.id} endpointId={endpoint.id} />
              </li>
            ))}
          </ul>
        ) : null}

        {deliveries.delivered + deliveries.pending + deliveries.failed > 0 ? (
          <p className="t-data" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
            {deliveries.delivered} delivered · {deliveries.pending} pending ·{" "}
            <span style={{ color: deliveries.failed ? "var(--color-red)" : undefined }}>
              {deliveries.failed} failed
            </span>
          </p>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <WebhookForm listId={list.id} allowed={featureAllowed(user.plan, "webhooks")} />
        </div>
      </Section>

      <Section title="Status">
        <p className="t-secondary">
          {list.status === "launched"
            ? "Marked as launched. The page still accepts signups — post-launch mode, which converts the list into an updates audience, is not built yet."
            : "Pre-launch. This is only a label for you; it changes nothing about the page."}
        </p>
        <div style={{ marginTop: 12 }}>
          <LaunchButton listId={list.id} launched={list.status === "launched"} />
        </div>
      </Section>

      <Section title="Archive">
        <p className="t-secondary">
          Archiving takes the list out of your plan&apos;s count and stops the page. Nothing is
          deleted: signups, positions and the referral graph stay exactly as they are.
        </p>
        <div style={{ marginTop: 12 }}>
          <ArchiveButton listId={list.id} />
        </div>
      </Section>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hairline-t" style={{ paddingTop: 24, marginBottom: 32 }}>
      <p className="t-label">{title}</p>
      {note ? (
        <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-text-3)" }}>
          {note}
        </p>
      ) : null}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}
