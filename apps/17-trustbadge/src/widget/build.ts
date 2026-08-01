/**
 * Builds the embed to public/widget/w.js and enforces the size budget.
 *
 * The 15KB gzipped claim is marketed (README differentiation 1), so it is a
 * build gate rather than an aspiration: exceeding it fails the build, exactly
 * like a failing test.
 *
 * The measured size is written twice. `public/widget/manifest.json` is for
 * anyone inspecting the CDN. `src/widget/build-info.json` is what the app
 * imports, because `public/` is not part of a serverless function's filesystem
 * on Vercel — reading it at request time works locally and silently returns
 * nothing in production, which is exactly how a marketed number quietly
 * disappears. An imported module is bundled and always there.
 */

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BUDGET_BYTES = 15 * 1024;
const OUT_DIR = path.resolve(process.cwd(), "public/widget");
const OUT_FILE = path.join(OUT_DIR, "w.js");

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  await build({
    entryPoints: [path.resolve(process.cwd(), "src/widget/embed.ts")],
    outfile: OUT_FILE,
    bundle: true,
    minify: true,
    format: "iife",
    // Storefront reality: Safari 14 and Chrome 80 still show up in real traffic.
    target: ["es2019", "safari14"],
    legalComments: "none",
    logLevel: "warning",
  });

  const raw = await readFile(OUT_FILE);
  const gzipped = gzipSync(raw, { level: 9 });

  const manifest = {
    file: "w.js",
    bytes: raw.byteLength,
    gzipBytes: gzipped.byteLength,
    budgetBytes: BUDGET_BYTES,
    builtAt: new Date().toISOString(),
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(OUT_DIR, "manifest.json"), json);
  await writeFile(path.resolve(process.cwd(), "src/widget/build-info.json"), json);

  const kb = (n: number) => `${(n / 1024).toFixed(2)} KB`;
  console.log(`widget: ${kb(raw.byteLength)} raw, ${kb(gzipped.byteLength)} gzipped`);

  if (gzipped.byteLength > BUDGET_BYTES) {
    console.error(
      `widget bundle is ${kb(gzipped.byteLength)} gzipped, over the ${kb(BUDGET_BYTES)} budget`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
