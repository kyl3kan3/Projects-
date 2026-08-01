// Replay a server-action form exactly as a browser with JavaScript disabled
// would: scrape the hidden $ACTION_* inputs out of the SSR HTML and POST them.

const [page, formIndex, ...pairs] = process.argv.slice(2);
const session = process.env.SESSION;
const base = "http://localhost:3015";

const html = await (await fetch(base + page, { headers: { cookie: `launchlist_session=${session}` } })).text();
const forms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((m) => m[0]);
const form = forms[Number(formIndex)];
if (!form) { console.error(`no form ${formIndex} (found ${forms.length})`); process.exit(1); }

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const fd = new FormData();
for (const tag of form.match(/<input\b[^>]*>/g) ?? []) {
  const name = /name="([^"]*)"/.exec(tag)?.[1];
  if (!name || !name.startsWith("$ACTION")) continue;
  fd.append(name, decode(/value="([^"]*)"/.exec(tag)?.[1] ?? ""));
}
for (let i = 0; i < pairs.length; i += 2) fd.append(pairs[i], pairs[i + 1]);

const res = await fetch(base + page, {
  method: "POST",
  headers: { cookie: `launchlist_session=${session}`, origin: base },
  body: fd,
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
console.log("status", res.status, res.headers.get("location") ?? "");
const text = await res.text();
const msgs = [...text.matchAll(/role="(alert|status)"[^>]*>([^<]{3,160})/g)].map((m) => m[2]);
if (msgs.length) console.log("message:", msgs.join(" | "));
