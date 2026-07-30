import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { availableChannelKinds, listChannels, listRules } from "@/lib/alerts";
import { plan } from "@/lib/plans";
import { ChannelIcon, IconTrash } from "@/components/icons";
import { AddChannelForm } from "../AddChannelForm";
import {
  addChannelAction,
  deleteChannelAction,
  testChannelAction,
  updateRuleAction,
} from "../actions";

export const metadata: Metadata = { title: "Alert channels" };
export const dynamic = "force-dynamic";

const NOTIFY_LABELS = {
  down: "When something goes down",
  recovery: "When it recovers",
  expiry: "Certificate and domain expiry",
} as const;

export default async function AlertsSettingsPage() {
  const { team } = await requireUser();
  const [channels, rules] = await Promise.all([listChannels(team.id), listRules(team.id)]);
  const limits = plan(team.plan);
  const kinds = availableChannelKinds(team.plan);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-4">Alert channels</h1>
        <p className="t-secondary mt-1">
          {channels.length === 0
            ? "Nothing is configured, so nothing would reach you."
            : `${channels.length} configured · ${channels.filter((c) => c.verified).length} tested`}
        </p>
      </header>

      {channels.length ? (
        <section className="mb-8 flex flex-col gap-4">
          {channels.map((channel) => {
            const rule = rules.find((r) => r.channel.id === channel.id)?.rule;
            return (
              <article key={channel.id} className="panel p-4">
                <div className="flex items-start gap-3">
                  <ChannelIcon kind={channel.kind} size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="t-title truncate">{channel.name}</p>
                    <p
                      className="t-data mt-1"
                      style={{
                        color: channel.verified
                          ? "var(--color-phosphor)"
                          : "var(--color-amber)",
                      }}
                    >
                      {channel.verified ? "tested" : "never tested"}
                    </p>
                  </div>
                  <form action={deleteChannelAction}>
                    <input type="hidden" name="id" value={channel.id} />
                    <button
                      className="btn-quiet"
                      type="submit"
                      style={{ color: "var(--color-red)" }}
                      aria-label={`Remove ${channel.name}`}
                    >
                      <IconTrash size={18} />
                    </button>
                  </form>
                </div>

                {rule ? (
                  <form action={updateRuleAction} className="mt-4">
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <div className="flex flex-col gap-3">
                      {(["down", "recovery", "expiry"] as const).map((kind) => (
                        <label key={kind} className="flex items-center justify-between gap-4">
                          <span className="t-secondary">{NOTIFY_LABELS[kind]}</span>
                          <input
                            type="checkbox"
                            name={kind}
                            defaultChecked={rule.notifyOn.includes(kind)}
                            className="size-5"
                          />
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-secondary mt-3" type="submit">
                      Save
                    </button>
                  </form>
                ) : null}

                <div className="hairline-t mt-4 pt-3">
                  <form action={testChannelAction}>
                    <input type="hidden" name="id" value={channel.id} />
                    <button className="btn-quiet" type="submit">
                      Send a test alert
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="pb-8">
        <p className="t-label mb-3">Add a channel</p>
        <AddChannelForm action={addChannelAction} kinds={kinds} />
        {kinds.length < 4 ? (
          <p className="t-secondary mt-4">
            Slack and Discord are on Solo and Team. {limits.name} covers{" "}
            {limits.channels.join(" and ")}.
          </p>
        ) : null}
      </section>
    </main>
  );
}
