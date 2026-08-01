import { IconGift, IconLock, IconUnlock } from "@/components/icons";
import { rewardProgress, type RewardTier } from "@/lib/referrals";

/**
 * The reward-gate stack — the app's only framed objects.
 *
 * A gate is locked until the tier before it is reachable: showing "Lifetime deal
 * · 25 referrals" as a bright card to someone with zero referrals is a taunt, so
 * anything more than one tier ahead renders in `text-3` with the lock glyph.
 */
export function RewardGates({
  referrals,
  tiers,
  grantedIds = [],
}: {
  referrals: number;
  tiers: readonly RewardTier[];
  grantedIds?: readonly string[];
}) {
  if (!tiers.length) return null;
  const progress = rewardProgress(referrals, tiers);
  const nextIndex = progress.findIndex((p) => !p.unlocked);

  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {progress.map((p, index) => {
        // Locked = more than one tier away. The next tier is always legible.
        const locked = !p.unlocked && nextIndex >= 0 && index > nextIndex;
        const granted = grantedIds.includes(p.reward.id);
        const pct = p.reward.threshold > 0 ? (p.progress / p.reward.threshold) * 100 : 100;

        return (
          <li
            key={p.reward.id}
            className="gate gate-enter"
            data-locked={locked}
            data-unlocked={p.unlocked}
            style={{ animationDelay: `${Math.min(index, 3) * 30}ms` }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  color: p.unlocked
                    ? "var(--color-mint)"
                    : locked
                      ? "var(--color-text-3)"
                      : "var(--page-accent)",
                }}
              >
                {p.unlocked ? <IconUnlock size={20} /> : locked ? <IconLock size={20} /> : <IconGift size={20} />}
              </span>
              <span className="t-title" style={{ flex: 1, minWidth: 0 }}>
                {p.reward.label}
              </span>
              <span className="t-data" style={{ color: p.unlocked ? "var(--color-mint)" : undefined }}>
                {p.progress}/{p.reward.threshold}
              </span>
            </div>

            <p className="t-label" style={{ marginTop: 8 }}>
              {p.reward.threshold} {p.reward.threshold === 1 ? "referral" : "referrals"}
              {p.unlocked ? (granted ? " · unlocked" : " · unlocking") : ""}
            </p>

            {p.reward.description && !locked ? (
              <p className="t-secondary" style={{ marginTop: 8 }}>
                {p.reward.description}
              </p>
            ) : null}

            <div className="gate-track" style={{ marginTop: 12 }}>
              <span className="gate-fill" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
