/**
 * The embed widget. Vanilla TypeScript, no framework, bundled by esbuild into
 * `public/embed.js` (see the `build:widget` script).
 *
 * Constraints that shaped it:
 *  - It runs inside somebody else's page, so everything lives in a **shadow
 *    root**. Their CSS cannot reach in and ours cannot leak out.
 *  - It must stay small. No dependencies, no polyfills, ES2019 output.
 *  - It reuses the same `/api/signup` endpoint as the hosted page, so the rules
 *    (duplicate detection, fraud scoring, plan caps, double opt-in) are
 *    identical wherever someone joins from.
 *  - A `?ref=` on the *host* page is carried through, so a referral link that
 *    points at a founder's own site still credits the referrer.
 *
 * Usage:
 *   <div data-launchlist="your-slug"></div>
 *   <script src="https://launchlist.app/embed.js" async></script>
 */

interface WidgetConfig {
  slug: string;
  name: string;
  ctaLabel: string;
  proofLine: string;
  joined: number;
  theme: { ground: string; accent: string; typePair: string };
  badgeHidden: boolean;
}

/** The origin this script was served from — where the API lives. */
function apiOrigin(): string {
  const current = document.currentScript as HTMLScriptElement | null;
  const src = current?.src ?? findOwnScript();
  if (!src) return "";
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return "";
  }
}

function findOwnScript(): string | null {
  const scripts = document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src;
    if (src && src.indexOf("/embed.js") !== -1) return src;
  }
  return null;
}

function refFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get("ref");
  } catch {
    return null;
  }
}

const WIDGET_CSS = `
:host { all: initial; }
.ll { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ll-text); background: var(--ll-ground); padding: 20px; border-radius: 14px;
  border: 1px solid var(--ll-line); box-sizing: border-box; max-width: 480px; }
.ll * { box-sizing: border-box; }
.ll-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ll-accent); margin: 0 0 12px; }
.ll-row { display: flex; flex-direction: column; gap: 12px; }
.ll-input { width: 100%; height: 52px; padding: 0 14px; font-size: 16px; font-family: inherit;
  color: var(--ll-text); background: var(--ll-ground); border: 1px solid var(--ll-line);
  border-radius: 10px; }
.ll-input::placeholder { color: var(--ll-faint); }
.ll-input:focus { outline: none; border-color: var(--ll-accent);
  box-shadow: 0 0 0 2px var(--ll-accent-soft); }
.ll-btn { width: 100%; height: 52px; border: 0; border-radius: 10px; background: #F2F4FC;
  color: #0A0E1F; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: transform 120ms cubic-bezier(0.25,1,0.5,1), background-color 120ms linear; }
.ll-btn:active:not(:disabled) { transform: scale(0.98); background: #DFE3F1; }
.ll-btn:disabled { background: #262E52; color: var(--ll-faint); cursor: not-allowed; }
.ll-note { font-size: 13px; line-height: 1.45; color: var(--ll-dim); margin: 12px 0 0; }
.ll-err { color: #E5484D; }
.ll-ok { color: #4BD8BE; }
.ll-badge { display: block; margin: 16px 0 0; padding-top: 12px;
  border-top: 1px solid var(--ll-line); font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--ll-faint);
  text-decoration: none; }
@media (prefers-reduced-motion: reduce) { .ll-btn { transition: none; } }
`;

function render(host: HTMLElement, origin: string, config: WidgetConfig): void {
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : null;
  const mount: Node = root ?? host;

  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  mount.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ll";
  wrap.style.setProperty("--ll-ground", config.theme.ground);
  wrap.style.setProperty("--ll-accent", config.theme.accent);
  wrap.style.setProperty("--ll-accent-soft", config.theme.accent + "40");
  wrap.style.setProperty("--ll-text", "#EEF1FB");
  wrap.style.setProperty("--ll-dim", "#8C93B8");
  wrap.style.setProperty("--ll-faint", "#585F88");
  wrap.style.setProperty("--ll-line", "#232B4D");

  const label = document.createElement("p");
  label.className = "ll-label";
  label.textContent = config.name;
  wrap.appendChild(label);

  const form = document.createElement("form");
  form.className = "ll-row";

  const input = document.createElement("input");
  input.className = "ll-input";
  input.type = "email";
  input.required = true;
  input.placeholder = "you@company.com";
  input.setAttribute("aria-label", "Email address");
  form.appendChild(input);

  const button = document.createElement("button");
  button.className = "ll-btn";
  button.type = "submit";
  button.textContent = config.ctaLabel;
  form.appendChild(button);

  wrap.appendChild(form);

  const note = document.createElement("p");
  note.className = "ll-note";
  note.textContent =
    config.joined > 0
      ? config.joined.toLocaleString() +
        (config.joined === 1 ? " person is" : " people are") +
        " already in line" +
        (config.proofLine ? " · " + config.proofLine : "")
      : config.proofLine || "Be the first in line.";
  wrap.appendChild(note);

  if (!config.badgeHidden) {
    const badge = document.createElement("a");
    badge.className = "ll-badge";
    badge.href = origin;
    badge.target = "_blank";
    badge.rel = "noopener";
    badge.textContent = "Powered by LaunchList";
    wrap.appendChild(badge);
  }

  mount.appendChild(wrap);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "One moment…";
    note.className = "ll-note";

    const payload = {
      slug: config.slug,
      email: input.value,
      ref: refFromUrl(),
      source: "widget",
      referrerUrl: window.location.href.slice(0, 500),
    };

    fetch(origin + "/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data as { outcome?: string; message?: string; positionUrl?: string } };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          note.className = "ll-note ll-err";
          note.textContent = result.data.message || "Something went wrong. Try again.";
          button.disabled = false;
          button.textContent = config.ctaLabel;
          return;
        }
        if (result.data.outcome === "joined" && result.data.positionUrl) {
          window.location.href = result.data.positionUrl;
          return;
        }
        form.style.display = "none";
        note.className = "ll-note ll-ok";
        note.textContent =
          result.data.outcome === "duplicate"
            ? "You're already on the list — we've emailed you your place and share link."
            : "Check your email to confirm your spot. Unconfirmed addresses don't hold a position.";
      })
      .catch(function () {
        note.className = "ll-note ll-err";
        note.textContent = "We couldn't reach the server. Check your connection and try again.";
        button.disabled = false;
        button.textContent = config.ctaLabel;
      });
  });
}

function mountAll(origin: string): void {
  const hosts = document.querySelectorAll<HTMLElement>("[data-launchlist]");
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (host.getAttribute("data-launchlist-ready") === "1") continue;
    host.setAttribute("data-launchlist-ready", "1");
    const key = host.getAttribute("data-launchlist");
    if (!key) continue;

    fetch(origin + "/api/lists/" + encodeURIComponent(key) + "/config")
      .then(function (response) {
        if (!response.ok) throw new Error("config");
        return response.json();
      })
      .then(function (config: WidgetConfig) {
        render(host, origin, config);
      })
      .catch(function () {
        // Fail quietly and visibly: a broken widget on someone's landing page
        // must not throw in their console, but it must not look like a working
        // form either.
        host.textContent = "";
      });
  }
}

(function () {
  const origin = apiOrigin();
  if (!origin) return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mountAll(origin);
    });
  } else {
    mountAll(origin);
  }
})();
