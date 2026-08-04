import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  clearPrincipalScopedClientState,
  isSensitiveStorageKey,
  principalFingerprint,
  purgePrivateBrowserCaches,
  purgeSensitiveStorage,
} from "../../src/security/sessionIsolation.ts";
import {
  setAuthPersistencePreference,
  supabaseAuthStorage,
} from "../../src/security/authStorage.ts";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

class MemoryStorage {
  #items = new Map();

  get length() { return this.#items.size; }
  key(index) { return [...this.#items.keys()][index] ?? null; }
  getItem(key) { return this.#items.has(key) ? this.#items.get(key) : null; }
  setItem(key, value) { this.#items.set(String(key), String(value)); }
  removeItem(key) { this.#items.delete(String(key)); }
}

test("prywatne klucze są czyszczone, a ustawienia niesensytywne pozostają", () => {
  const storage = new MemoryStorage();
  storage.setItem("testUser", "forged");
  storage.setItem("getrido_gps_consent", "true");
  storage.setItem("workshop-order-draft:tenant-a", "private");
  storage.setItem("rido:payment-intent:abc", "payment");
  storage.setItem("rido_language", "pl");
  storage.setItem("theme", "dark");
  storage.setItem("rido_remember_me", "true");

  assert.equal(isSensitiveStorageKey("testUser", "local"), true);
  assert.equal(isSensitiveStorageKey("getrido_gps_consent", "local"), true);
  assert.equal(isSensitiveStorageKey("workshop-order-draft:tenant-a", "local"), true);
  assert.equal(isSensitiveStorageKey("rido:payment-intent:abc", "session"), true);
  assert.equal(isSensitiveStorageKey("theme", "local"), false);

  purgeSensitiveStorage(storage, "local");
  assert.equal(storage.getItem("testUser"), null);
  assert.equal(storage.getItem("getrido_gps_consent"), null);
  assert.equal(storage.getItem("workshop-order-draft:tenant-a"), null);
  assert.equal(storage.getItem("rido_language"), "pl");
  assert.equal(storage.getItem("theme"), "dark");
  assert.equal(storage.getItem("rido_remember_me"), "true");
});

test("czyszczenie cache usuwa stare cache Supabase, ale zachowuje publiczny precache", async () => {
  const deleted = [];
  const cacheStorage = {
    async keys() {
      return ["supabase-cache", "rido-private-tenant-a", "workbox-precache-v2-app"];
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };

  const removed = await purgePrivateBrowserCaches(cacheStorage);
  assert.deepEqual(new Set(removed), new Set(["supabase-cache", "rido-private-tenant-a"]));
  assert.deepEqual(new Set(deleted), new Set(["supabase-cache", "rido-private-tenant-a"]));
  assert.equal(deleted.includes("workbox-precache-v2-app"), false);
});

test("QueryClient jest czyszczony nawet po błędzie anulowania zapytań", async () => {
  let cleared = 0;
  await clearPrincipalScopedClientState({
    async cancelQueries() { throw new Error("cancel failed"); },
    clear() { cleared += 1; },
  }, "user-b");
  assert.equal(cleared, 1);
});

test("fingerprint rozdziela użytkowników i kontekst autoryzacyjny tenanta", () => {
  const a = principalFingerprint({ user: { id: "user-a", role: "authenticated", app_metadata: { tenant_id: "tenant-a" } } });
  const b = principalFingerprint({ user: { id: "user-b", role: "authenticated", app_metadata: { tenant_id: "tenant-b" } } });
  const switched = principalFingerprint({ user: { id: "user-a", role: "authenticated", app_metadata: { tenant_id: "tenant-b" } } });
  assert.notEqual(a, b);
  assert.notEqual(a, switched);
  assert.equal(principalFingerprint(null), "anonymous");
});

test("adapter auth respektuje sesję karty i jawne zapamiętanie", () => {
  const previousWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  globalThis.window = { localStorage, sessionStorage };

  try {
    localStorage.setItem("sb-auth-token", "legacy-token");
    setAuthPersistencePreference(false);
    supabaseAuthStorage.setItem("sb-auth-token", "session-token");
    assert.equal(localStorage.getItem("sb-auth-token"), null);
    assert.equal(sessionStorage.getItem("sb-auth-token"), "session-token");

    setAuthPersistencePreference(true);
    supabaseAuthStorage.setItem("sb-auth-token", "persistent-token");
    assert.equal(localStorage.getItem("sb-auth-token"), "persistent-token");
    assert.equal(sessionStorage.getItem("sb-auth-token"), null);

    supabaseAuthStorage.removeItem("sb-auth-token");
    assert.equal(localStorage.getItem("sb-auth-token"), null);
    assert.equal(sessionStorage.getItem("sb-auth-token"), null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("aplikacja uruchamia i egzekwuje granicę izolacji sesji", () => {
  const main = read("src/main.tsx");
  const app = read("src/App.tsx");
  const boundary = read("src/security/SessionIsolationBoundary.tsx");
  const vite = read("vite.config.ts");

  assert.match(main, /bootstrapPrincipalIsolation\(principal\)/);
  assert.match(app, /<SessionIsolationBoundary>/);
  assert.ok(app.indexOf("<PwaUpdater />") < app.indexOf("<SessionIsolationBoundary>"));
  assert.match(boundary, /SIGNED_OUT/);
  assert.match(boundary, /queryClient/);
  assert.match(boundary, /previous === nextPrincipal/);
  assert.match(boundary, /queryClient\.resetQueries\(\)/);
  assert.doesNotMatch(boundary, /FORCE_CLEAR_AUTH_EVENTS/);
  assert.doesNotMatch(vite, /supabase-cache/);
  assert.doesNotMatch(vite, /wclrrytmrscqvsyxyvnn\.supabase\.co/);
});

test("raport sprzedaży warsztatu używa tenantowego RPC i osobnego cache key", () => {
  const report = read("src/components/workshop/WorkshopExtraReports.tsx");
  const migration = read("supabase/migrations/20260801145000_phase_d_session_xss_tenant_followup.sql");

  assert.match(report, /queryKey:\s*\['workshop-sales-report', providerId\]/);
  assert.match(report, /phase_d_workshop_sales_report/);
  assert.doesNotMatch(report, /from\('user_invoices'\)/);
  assert.match(migration, /phase_c_can_manage_provider\(p_provider_id\)/);
  assert.match(migration, /JOIN public\.workshop_orders/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase_d_workshop_sales_report/);
});

test("logowanie ustawia preferencję storage przed utworzeniem sesji", () => {
  for (const path of [
    "src/pages/Auth.tsx",
    "src/pages/MarketplaceAuth.tsx",
    "src/components/auth/AuthModal.tsx",
    "src/components/LoginModal.tsx",
  ]) {
    const source = read(path);
    const preference = source.indexOf("setAuthPersistencePreference(");
    const signIn = source.indexOf("signInWithPassword(");
    assert.ok(preference >= 0, `${path}: brak preferencji storage`);
    assert.ok(signIn > preference, `${path}: preferencja musi poprzedzać signIn`);
  }
});

test("testowa tożsamość i wysyłka wynajmu pozostają fail-closed w produkcji", () => {
  const dashboard = read("src/pages/DriverDashboard.tsx");
  const messaging = read("src/components/rental/rentalMessaging.ts");
  const parser = read("supabase/functions/parse-listing-ai/index.ts");

  assert.match(dashboard, /import\.meta\.env\.DEV \? localStorage\.getItem\('testUser'\) : null/);
  assert.match(messaging, /export function getDryRun\(\): boolean \{\s*return true;/);
  assert.doesNotMatch(messaging, /localStorage\.getItem\('rental_dry_run'\)/);
  assert.match(parser, /ai_description_html:\s*aiTextAsSafeHtml\(parsed\.description_formatted\)/);
});

test("DOMPurify jest jawną, przypiętą zależnością aplikacji", () => {
  const packageJson = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(packageJson.dependencies.dompurify, "3.4.12");
  assert.equal(lock.packages[""].dependencies.dompurify, "3.4.12");
  assert.equal(lock.packages["node_modules/dompurify"].version, "3.4.12");
  assert.notEqual(lock.packages["node_modules/dompurify"].optional, true);
});
