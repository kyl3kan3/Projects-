import type { Metadata } from "next";
import Link from "next/link";
import { PolicyForm } from "@/app/(app)/settings/SettingsForms";
import { DetailRow, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { formatDayFull, todayInTimezone } from "@/lib/dates";
import { POLICY_TEMPLATES, defaultPolicyText } from "@/lib/policy";
import { allPolicies } from "@/server/appointments";

export const metadata: Metadata = { title: "Your fee policy" };

export default async function PolicyPage() {
  const { stylist } = await requireStylist();
  const versions = await allPolicies(stylist.id);
  const current = versions[0] ?? null;
  const template = POLICY_TEMPLATES[0];

  return (
    <>
      <ScreenHeader
        label="Settings"
        title={current ? `Policy v${current.version}` : "Your fee policy"}
      />
      <p className="t-secondary" style={{ margin: "0 0 20px" }}>
        This is the product. Your policy is rendered on your booking page, agreed to by every
        client at booking with a timestamp, and quoted on every fee receipt. When a regular
        asks why they were charged, the answer is not your judgement — it is the policy they
        agreed to.
      </p>

      <PolicyForm
        version={current?.version ?? 0}
        cancelWindowHours={current?.cancelWindowHours ?? template.cancelWindowHours}
        lateCancelFeePercent={current?.lateCancelFeePercent ?? template.lateCancelFeePercent}
        noShowFeePercent={current?.noShowFeePercent ?? template.noShowFeePercent}
        policyText={current?.policyText ?? defaultPolicyText(template)}
      />

      {versions.length > 1 && (
        <section style={{ paddingTop: 24 }}>
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            Earlier versions
          </p>
          <p className="t-secondary" style={{ margin: "0 0 8px" }}>
            Kept, never edited. An appointment booked under v1 is still judged by v1.
          </p>
          {versions.slice(1).map((v) => (
            <DetailRow key={v.id} term={`v${v.version}`}>
              {`${v.cancelWindowHours}h · ${v.lateCancelFeePercent}% · ${v.noShowFeePercent}%`}
              <span className="t-secondary" style={{ display: "block" }}>
                from {formatDayFull(todayInTimezone(stylist.timezone, v.effectiveAt))}
              </span>
            </DetailRow>
          ))}
        </section>
      )}

      <p style={{ marginTop: 24 }}>
        <Link className="btn-quiet" href="/settings">
          Back to settings
        </Link>
      </p>
    </>
  );
}
