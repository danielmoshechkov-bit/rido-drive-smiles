#!/usr/bin/env node
/**
 * Guard: blokuje domeny deweloperskie w linkach.
 *
 * Klient końcowy NIGDY, w żadnym kanale (SMS/e-mail/PDF/QR), nie może zobaczyć domeny
 * deweloperskiej. Publiczne linki budujemy WYŁĄCZNIE przez buildPublicUrl() (getrido.pl).
 * Ten skrypt fail-uje CI, jeśli w src/ lub supabase/functions/ pojawi się "lovable.app"
 * albo "preview--". Uruchamiany lokalnie: `npm run lint:urls`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "supabase/functions"];
const FORBIDDEN = ["lovable.app", "preview--"];
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Pliki, które CELOWO zawierają zakazane wzorce (definicja guardu / lista zakazanych stringów):
const IGNORE = new Set([
  "src/lib/publicUrl.ts",
  "supabase/functions/_shared/publicUrl.ts",
  "scripts/check-public-urls.mjs",
]);

const hits = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name)) scan(p);
  }
}

function scan(p) {
  const rel = relative(process.cwd(), p).replace(/\\/g, "/");
  if (IGNORE.has(rel)) return;
  const lines = readFileSync(p, "utf8").split("\n");
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const bad of FORBIDDEN) {
      if (lower.includes(bad)) hits.push(`  ${rel}:${i + 1}  →  ${line.trim()}`);
    }
  });
}

for (const r of ROOTS) walk(r);

if (hits.length > 0) {
  console.error("\n❌ Znaleziono domeny deweloperskie w linkach (lovable.app / preview--):\n");
  console.error(hits.join("\n"));
  console.error(
    `\n${hits.length} trafień. Użyj buildPublicUrl() z src/lib/publicUrl.ts ` +
      `(lub supabase/functions/_shared/publicUrl.ts). Jeśli wystąpienie jest uzasadnione, dodaj plik do IGNORE.\n`,
  );
  process.exit(1);
}

console.log("✅ Brak domen deweloperskich (lovable.app / preview--) w src/ i supabase/functions/.");
