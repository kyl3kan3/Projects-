#!/usr/bin/env node
/**
 * Assemble a node_modules for one app out of the shared .buildkit toolchain.
 *
 * Why this exists: the apps under apps/ are deliberately self-contained and
 * each pins its own dependency ranges (SCAFFOLD_GUIDE.md rule 4). Installing
 * all ~75 separately costs tens of GB and hours, but naively sharing one
 * install compiles an app against versions its manifest does not allow — e.g.
 * an app pinning stripe ^18 type-checked against stripe 17 fails on an
 * apiVersion literal that is perfectly correct for the version it asked for.
 *
 * So: for every package the app's source actually imports, link the shared
 * copy when it satisfies the app's declared range, and otherwise install that
 * one package at the app's range into .buildkit/extra/<pkg>@<range> and link
 * that. The result is a node_modules whose versions all satisfy the app's own
 * manifest, assembled in seconds instead of minutes.
 *
 * Usage: node tools/link-deps.mjs <app-dir> [--kit web|expo|node] [--quiet]
 * Prints one line per package that had to be resolved outside the shared kit.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const KITS = path.join(ROOT, ".buildkit");
const EXTRA = path.join(KITS, "extra");

const args = process.argv.slice(2);
const appDir = path.resolve(args[0] || ".");
const kitName = (args.includes("--kit") ? args[args.indexOf("--kit") + 1] : null) || "web";
const quiet = args.includes("--quiet");
const kitModules = path.join(KITS, kitName, "node_modules");

const require = createRequire(path.join(kitModules, "index.js"));
const semver = require("semver");

const log = (...m) => { if (!quiet) console.log(...m); };

/* Build tooling every app of a given stack needs, whether or not it is imported. */
const ALWAYS = {
  web: ["next", "react", "react-dom", "typescript", "@types/node", "@types/react",
        "@types/react-dom", "tailwindcss", "@tailwindcss/postcss"],
  expo: ["expo", "react", "react-native", "typescript", "@types/react", "expo-router"],
  node: ["typescript", "@types/node"],
};

/**
 * Packages we refuse to install: huge, or they download a browser at postinstall.
 *
 * `playwright` is deliberately NOT here. Chromium is pre-installed at
 * PLAYWRIGHT_BROWSERS_PATH and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set, so the
 * package installs without fetching anything — and it is the only way to drive a
 * Next server action, whose payload is encrypted and cannot be posted by curl.
 */
const HEAVY = new Set(["puppeteer", "@shopify/cli", "electron", "tesseract.js",
  "@react-pdf/renderer", "canvas"]);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const pkg = readJson(path.join(appDir, "package.json"));
if (!pkg) { console.error(`no package.json in ${appDir}`); process.exit(2); }
const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

/* ---- which external packages does this app's source actually import? ---- */
function importedPackages(dir) {
  const found = new Set();
  const skip = new Set(["node_modules", ".next", ".git", "dist", "build", "src-tauri"]);
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(full); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|astro)$/.test(e.name)) continue;
      // Lint/test config isn't part of the build; ignore what it imports.
      if (/^(eslint|vitest|jest|playwright)\.config\./.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      const specs = [
        ...src.matchAll(/\bfrom\s+["']([^"']+)["']/g),
        ...src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
        ...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
        ...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ].map((m) => m[1]);
      for (const s of specs) {
        if (s.startsWith(".") || s.startsWith("@/") || s.startsWith("~/") || s.startsWith("node:")) continue;
        const name = s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0];
        if (name) found.add(name);
      }
    }
  };
  walk(dir);
  return found;
}

const needed = new Set([...(ALWAYS[kitName] || []), ...importedPackages(appDir)]);

/* Types packages matter for a typecheck even when nothing imports them. */
for (const d of Object.keys(declared)) if (d.startsWith("@types/")) needed.add(d);

/* ---- reset the node_modules we manage (never touch a real install) ---- */
const nm = path.join(appDir, "node_modules");
const marker = path.join(nm, ".buildkit-managed");
if (fs.existsSync(nm)) {
  const isOurs = fs.lstatSync(nm).isSymbolicLink() || fs.existsSync(marker);
  if (!isOurs) { log(`${path.basename(appDir)}: real node_modules present, leaving it alone`); process.exit(0); }
  fs.rmSync(nm, { recursive: true, force: true });
}
fs.mkdirSync(nm, { recursive: true });
fs.writeFileSync(marker, "Assembled by tools/link-deps.mjs. Safe to delete.\n");

const link = (name, target) => {
  const dest = path.join(nm, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.symlinkSync(target, dest, "dir");
};

/* .bin comes from the kit so `next`/`tsc`/`drizzle-kit` are on PATH. */
if (fs.existsSync(path.join(kitModules, ".bin"))) link(".bin", path.join(kitModules, ".bin"));

const installedVersion = (modules, name) => {
  const j = readJson(path.join(modules, name, "package.json"));
  return j && j.version;
};

/* ---- install a single package at a specific range, cached across apps ---- */
const extraCache = new Map();
function resolveExtra(name, range) {
  const key = `${name}@${range}`;
  if (extraCache.has(key)) return extraCache.get(key);
  const slug = key.replace(/[^a-zA-Z0-9._@-]/g, "_").replace(/^@/, "at-");
  const dir = path.join(EXTRA, slug);
  const target = path.join(dir, "node_modules", name);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, "package.json"))) {
      fs.writeFileSync(path.join(dir, "package.json"),
        JSON.stringify({ name: `extra-${slug}`, private: true, version: "0.0.0" }, null, 2) + "\n");
    }
    try {
      execFileSync("npm", ["install", `${name}@${range}`, "--no-audit", "--no-fund",
        "--legacy-peer-deps", "--ignore-scripts", "--loglevel", "error"], {
        cwd: dir, stdio: "pipe", timeout: 300000,
        env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1", PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
      });
    } catch (e) {
      extraCache.set(key, null);
      return null;
    }
  }
  if (fs.existsSync(target)) backfillPeers(dir);
  const result = fs.existsSync(target) ? target : null;
  extraCache.set(key, result);
  return result;
}

/**
 * Make the kit's packages visible to a separately-installed one.
 *
 * An extra lives at .buildkit/extra/<pkg>@<range>/node_modules/<pkg>, so Node
 * resolves *its* imports from that directory upward — never from the app's own
 * node_modules. A package with an unbundled peer therefore cannot find it:
 * `drizzle-orm/postgres-js` threw `Cannot find module 'postgres'` under tsx, so
 * every db-backed script and test failed at runtime while `tsc` and `next build`
 * stayed green (Next bundles, so it resolves its own way and hides this).
 *
 * Two apps lost work to that before it was diagnosed. Linking every kit package
 * the extra does not already carry into its own node_modules fixes the class of
 * bug rather than the one instance: names already present win, so an extra's own
 * pinned nested copy is never shadowed.
 */
function backfillPeers(dir) {
  const dest = path.join(dir, "node_modules");
  let kitEntries;
  try { kitEntries = fs.readdirSync(kitModules, { withFileTypes: true }); } catch { return; }
  for (const e of kitEntries) {
    if (e.name === ".bin" || e.name.startsWith(".")) continue;
    if (e.name.startsWith("@")) {
      let scoped;
      try { scoped = fs.readdirSync(path.join(kitModules, e.name)); } catch { continue; }
      for (const inner of scoped) {
        const rel = `${e.name}/${inner}`;
        if (fs.existsSync(path.join(dest, rel))) continue;
        fs.mkdirSync(path.join(dest, e.name), { recursive: true });
        try { fs.symlinkSync(path.join(kitModules, rel), path.join(dest, rel), "dir"); } catch {}
      }
      continue;
    }
    if (fs.existsSync(path.join(dest, e.name))) continue;
    try { fs.symlinkSync(path.join(kitModules, e.name), path.join(dest, e.name), "dir"); } catch {}
  }
}

const notes = [];
for (const name of [...needed].sort()) {
  const range = declared[name];
  const kitHas = fs.existsSync(path.join(kitModules, name));
  const kitVer = kitHas ? installedVersion(kitModules, name) : null;

  // Undeclared but present in the kit (usually a transitive we can satisfy anyway).
  if (!range) {
    if (kitHas) link(name, path.join(kitModules, name));
    else notes.push(`${name}: imported but not declared in package.json and not in kit`);
    continue;
  }

  const satisfied = kitVer && (semver.validRange(range)
    ? semver.satisfies(kitVer, range, { includePrerelease: true })
    : true);

  if (satisfied) { link(name, path.join(kitModules, name)); continue; }

  if (HEAVY.has(name)) {
    if (kitHas) link(name, path.join(kitModules, name));
    notes.push(`${name}@${range}: skipped (heavy/browser-downloading dependency)`);
    continue;
  }

  const extra = resolveExtra(name, range);
  if (extra) {
    link(name, extra);
    notes.push(`${name}@${range}: installed separately (kit has ${kitVer || "none"})`);
  } else if (kitHas) {
    link(name, path.join(kitModules, name));
    notes.push(`${name}@${range}: install failed, fell back to kit ${kitVer}`);
  } else {
    notes.push(`${name}@${range}: UNRESOLVED`);
  }
}

for (const n of notes) log(`  ${n}`);
