/**
 * The contact sheet: a sprocketed film strip of the night's clips, scrolling
 * on a pure-CSS marquee. Frames are art-directed stand-ins for real renders
 * from our episode 42 — labeled with their true timestamps, never invented
 * quotes (MARKETING_PLAYBOOK law 5). Frames render twice for a seamless loop.
 */

const FRAMES = [
  {
    key: "hook",
    art: "radial-gradient(90% 60% at 50% 22%, rgba(122,108,255,0.34), transparent 65%), #12151C",
    figure: true,
    title: (
      <>
        You don&apos;t need
        <br />
        <span className="text-[var(--color-brand)]">more content.</span>
      </>
    ),
    meta: "0:00 · HOOK 94",
  },
  {
    key: "pivot",
    art: "radial-gradient(90% 60% at 30% 80%, rgba(122,108,255,0.26), transparent 60%), #10131A",
    figure: true,
    title: (
      <>
        The pivot
        <br />
        nobody saw
      </>
    ),
    meta: "14:06 · CLIP 03",
  },
  {
    key: "quote",
    art: "linear-gradient(180deg, #0D1016 0%, #161225 100%)",
    quote: "“we left 80% of the value on the table”",
    meta: "4:12 · QUOTE",
  },
  {
    key: "stat",
    art: "radial-gradient(100% 70% at 70% 10%, rgba(122,108,255,0.3), transparent 58%), #12151C",
    stat: true,
    meta: "18:39 · THE STAT",
  },
  {
    key: "signoff",
    art: "radial-gradient(80% 55% at 50% 30%, rgba(62,207,142,0.14), transparent 65%), #0E1116",
    figure: true,
    title: (
      <>
        Same time
        <br />
        next week.
      </>
    ),
    meta: "58:44 · SIGN-OFF",
  },
];

function Frame({ f }: { f: (typeof FRAMES)[number] }) {
  return (
    <div className="frame">
      <div className="absolute inset-0" style={{ background: f.art }} />
      {f.figure && (
        <div
          className="absolute bottom-0 left-1/2 h-[58%] w-[78%] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(50% 55% at 50% 18%, #262B38 0 38%, transparent 40%), radial-gradient(85% 70% at 50% 96%, #20242F 0 60%, transparent 62%)",
          }}
        />
      )}
      {f.stat && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-5xl text-[var(--color-paper)]">
            80<span className="text-2xl text-[var(--color-brand)]">%</span>
          </span>
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 p-2.5 ${f.quote || f.stat ? "text-center" : ""}`}>
        {f.title && (
          <div className="font-display text-[13px] uppercase leading-[1.1]">{f.title}</div>
        )}
        {f.quote && (
          <div className="text-[11px] leading-snug text-[var(--color-muted)]">{f.quote}</div>
        )}
        {f.stat && (
          <div className="text-[11px] text-[var(--color-muted)]">of episode value dies in 48h</div>
        )}
        <div className="mono mt-1.5 text-[9px] text-[var(--color-faint)]">{f.meta}</div>
      </div>
    </div>
  );
}

export function ContactSheet() {
  return (
    <div>
      <div className="mx-auto flex max-w-5xl items-baseline justify-between px-5 pb-3">
        <span className="t-label">The contact sheet</span>
        <span className="mono text-[11px] text-[var(--color-faint)]">EP 42 · 5 MOMENTS</span>
      </div>
      <div className="strip" aria-hidden="true">
        <div className="striptrack">
          {[0, 1].map((dup) =>
            FRAMES.map((f) => <Frame key={`${dup}-${f.key}`} f={f} />)
          )}
        </div>
      </div>
      <p className="mono mx-auto max-w-5xl px-5 pt-3 text-[11px] text-[var(--color-faint)]">
        Every frame cut, cropped 9:16 + 1:1, captions burned in.
      </p>
    </div>
  );
}
