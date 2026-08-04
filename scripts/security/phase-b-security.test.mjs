import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  parsePaymentInitInput,
  readSmallJsonBody,
  requirePaymentIdempotencyKey,
} from "../../supabase/functions/_shared/paymentSecurity.ts";
import { SecurityError } from "../../supabase/functions/_shared/securityPrimitives.ts";

const ROOT = process.cwd();
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const PRODUCT_UUID = "7b35f37b-a476-4f05-9730-d0a26280b0bd";
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

function paymentRequest(idempotencyKey = UUID) {
  return new Request("https://app.getrido.pl/functions/v1/payment-core", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
  });
}

function expectSecurityError(run, code, status = 400) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof SecurityError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

function phaseBMigration() {
  const matches = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((name) => /phase_b.*(?:billing|payment)|(?:billing|payment).*phase_b/i.test(name))
    .sort();
  assert.equal(matches.length, 1, `Oczekiwano jednej migracji Fazy B, znaleziono: ${matches.join(", ")}`);
  return read(`supabase/migrations/${matches[0]}`);
}

test("bezpieczny kontrakt akceptuje tylko kanoniczny price_id i UUID idempotencji", () => {
  assert.deepEqual(
    parsePaymentInitInput({ action: "init", price_id: "credit-package:abc-123" }, paymentRequest()),
    { priceId: "credit-package:abc-123", productRefId: null, idempotencyKey: UUID },
  );
  expectSecurityError(
    () => parsePaymentInitInput(
      { action: "init", price_id: "credit-package:abc-123", product_ref_id: PRODUCT_UUID },
      paymentRequest(),
    ),
    "product_reference_checkout_disabled",
    410,
  );
});

test("klient nie może podstawić kwoty, waluty, odbiorcy, tenanta ani przyznawanej wartości", () => {
  const forbidden = {
    amount: 0,
    amount_minor: -100,
    currency: "EUR",
    user_id: PRODUCT_UUID,
    tenant_id: PRODUCT_UUID,
    company_id: PRODUCT_UUID,
    provider_id: PRODUCT_UUID,
    credits: 999999,
    credits_amount: 999999,
    sms: 999999,
    sms_amount: 999999,
    status: "paid",
    paid: true,
    product_type: "admin_grant",
    metadata: { benefit: 999999 },
    wallet_used: 999999,
    return_url: "https://evil.example/steal",
  };

  for (const [field, value] of Object.entries(forbidden)) {
    expectSecurityError(
      () => parsePaymentInitInput(
        { action: "init", price_id: "credit-package:abc-123", [field]: value },
        paymentRequest(),
      ),
      "legacy_payment_payload_rejected",
    );
  }
});

test("kwota zero, ujemna, zmieniona i inna waluta są odrzucane przed RPC", () => {
  for (const body of [
    { amount: 0 },
    { amount: -1 },
    { amount: 0.01 },
    { amount_minor: 1 },
    { currency: "USD" },
  ]) {
    expectSecurityError(
      () => parsePaymentInitInput(
        { action: "init", price_id: "credit-package:abc-123", ...body },
        paymentRequest(),
      ),
      "legacy_payment_payload_rejected",
    );
  }
});

test("akcje admin_grant, confirm_webhook i credits_check są wyłączone", () => {
  for (const action of ["admin_grant", "confirm_webhook", "credits_check"]) {
    expectSecurityError(
      () => parsePaymentInitInput({ action, price_id: "credit-package:abc-123" }, paymentRequest()),
      "legacy_payment_action_disabled",
      410,
    );
  }
});

test("allowlista body odrzuca nieznane pola i nieprawidłowe referencje", () => {
  expectSecurityError(
    () => parsePaymentInitInput(
      { action: "init", price_id: "credit-package:abc-123", unexpected: true },
      paymentRequest(),
    ),
    "unsupported_payment_fields",
  );
  expectSecurityError(
    () => parsePaymentInitInput(
      { action: "init", price_id: "credit-package:abc-123", product_ref_id: "../tenant-b" },
      paymentRequest(),
    ),
    "invalid_product_reference",
  );
});

test("price_id nie może być puste, względne ani zawierać znaków sterujących", () => {
  for (const priceId of ["", " ../x", "../x", "x/y", "x?amount=0", "x\npaid=true"]) {
    expectSecurityError(
      () => parsePaymentInitInput({ action: "init", price_id: priceId }, paymentRequest()),
      "invalid_price_id",
    );
  }
});

test("idempotency key jest obowiązkowym, kanonicznym UUID", () => {
  assert.equal(requirePaymentIdempotencyKey(UUID), UUID);
  for (const value of [null, "", "same-key", ` ${UUID}`, `${UUID} `, PRODUCT_UUID.toUpperCase()]) {
    if (value === PRODUCT_UUID.toUpperCase()) {
      // UUID jest case-insensitive, ale musi być przesłany bez dodatkowych znaków.
      assert.equal(requirePaymentIdempotencyKey(value), value);
    } else {
      expectSecurityError(() => requirePaymentIdempotencyKey(value), "invalid_idempotency_key");
    }
  }
});

test("parser ogranicza rozmiar body i odrzuca nieprawidłowy JSON", async () => {
  await assert.rejects(
    readSmallJsonBody(new Request("https://app.getrido.pl", {
      method: "POST",
      headers: { "content-length": "9000" },
      body: "{}",
    })),
    (error) => error instanceof SecurityError && error.code === "payload_too_large" && error.status === 413,
  );
  await assert.rejects(
    readSmallJsonBody(new Request("https://app.getrido.pl", { method: "POST", body: "{" })),
    (error) => error instanceof SecurityError && error.code === "invalid_json",
  );
});

test("payment-core ustala użytkownika z JWT i nigdy nie rejestruje zewnętrznej płatności", () => {
  const source = read("supabase/functions/payment-core/index.ts");
  assert.match(source, /identity\s*=\s*await requireUser\(req, client\)/);
  assert.match(source, /PAYMENT_INTENT_CREATION_ENABLED/);
  assert.match(source, /Deno\.env\.get\("PAYMENT_INTENT_CREATION_ENABLED"\) !== "true"/);
  assert.match(source, /billing_create_payment_order/);
  assert.match(source, /p_correlation_id:\s*identity\.correlationId/);
  assert.match(source, /status:\s*"gateway_registration_blocked"/);
  assert.match(source, /payment_url:\s*null/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /action\s*===?\s*["'](?:admin_grant|confirm_webhook|credits_check)["']/);
  assert.doesNotMatch(source, /simulated\s*:/);
  assert.doesNotMatch(source, /status:\s*["']paid["']/);
});

test("frontend wysyła tylko identyfikatory, a nie kwotę, walutę lub odbiorcę", () => {
  const hook = read("src/hooks/usePayment.ts");
  const body = hook.match(/body:\s*\{([\s\S]*?)\n\s*\},\n\s*headers:/)?.[1] ?? "";
  assert.match(body, /action:\s*"init"/);
  assert.match(body, /price_id/);
  assert.doesNotMatch(body, /product_ref_id/);
  assert.doesNotMatch(body, /amount|currency|user_id|tenant_id|company_id|provider_id|credits|sms|status|paid/);
  assert.match(hook, /"x-idempotency-key": attempt\.key/);
  assert.match(hook, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(hook, /getOrCreateIdempotencyKey\(user\.id, priceId/);
  assert.match(hook, /paymentAttemptStorageKey\(userId, priceId\)/);
  assert.match(hook, /VITE_PAYMENT_REDIRECT_ORIGINS/);
  assert.match(hook, /allowedOrigins\.has\(paymentUrl\.origin\)/);
  assert.match(hook, /hasLegacyClientOwnedValues/);

  const buy = read("src/pages/BuyCredits.tsx");
  assert.match(buy, /\.from\("billing_public_products"/);
  assert.match(buy, /priceId:\s*pkg\.price_id/);
  assert.doesNotMatch(buy, /\.from\("credit_packages"/);
  assert.doesNotMatch(buy, /promo_code_redemptions["']?\)\.insert|used_count.*update/);
});

test("pozostałe atrapy wartościowe są fail-closed w frontendzie", () => {
  const wallet = read("src/hooks/useUserWallet.ts");
  assert.doesNotMatch(wallet, /\.from\(["'](?:user_wallets|coin_transactions)["']\)[\s\S]{0,180}\.(?:insert|upsert|update|delete)\s*\(/);
  assert.match(wallet, /wymaga autoryzowanej funkcji serwerowej i wpisu w ledgerze/);

  const adminWallet = read("src/components/admin/MapWalletPanel.tsx");
  assert.doesNotMatch(adminWallet, /\.from\(["'](?:user_wallets|wallet_transactions)["']\)[\s\S]{0,180}\.(?:insert|upsert|update|delete)\s*\(/);
  assert.match(adminWallet, /reautoryzacji administratora, serwerowego ledgeru i audytu/);

  const rentalListing = read("src/components/rental/rentalListing.ts");
  const featureFunction = rentalListing.match(/export async function featureRentalListing[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(featureFunction, /\.from\(|payment_status|is_featured/);
  assert.match(featureFunction, /zweryfikowanej płatności i serwerowej aktywacji/);

  const parking = read("src/components/maps/parkingService.ts");
  const parkingPurchase = parking.match(/export async function purchaseParkingSession[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(parkingPurchase, /\.from\(|simulated|payment_status|status:\s*['"]active/);
  assert.match(parkingPurchase, /wymaga zweryfikowanej płatności serwerowej/);

  for (const file of [
    "src/components/rental/RentalPaymentsPanel.tsx",
    "src/components/rental/RentalBookingsList.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /\.from\(["']rental_payments["']\)[\s\S]{0,180}\.(?:insert|upsert|update|delete)\s*\(/, file);
    assert.match(source, /wymaga autoryzowanej funkcji serwerowej i audytu/, file);
  }
});

test("frontend nie zwiększa bezpośrednio sald SMS, pojazdowych ani user_credits", () => {
  const protectedFiles = [
    "src/components/quota/QuotaGuardProvider.tsx",
    "src/components/vehicle/VehicleLookupCreditsModal.tsx",
    "src/hooks/usePayment.ts",
    "src/hooks/useUserCredits.ts",
    "src/hooks/useVehicleLookup.ts",
    "src/pages/BuyCredits.tsx",
  ];
  for (const file of protectedFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /\.from\(["'](?:user_credits|vehicle_lookup_credits|vehicle_lookup_credit_transactions)["']\)[\s\S]{0,180}\.(?:insert|upsert|update|delete)\s*\(/, file);
    assert.doesNotMatch(source, /\.from\(["']service_providers["']\)[\s\S]{0,180}\.update\s*\(\s*\{[^}]*sms_balance/, file);
  }
});

test("webhook P24 pozostaje jawnie fail-closed do czasu adaptera podpisu", () => {
  const source = read("supabase/functions/payment-core-webhook/index.ts");
  assert.match(source, /phaseABlockedResponse/);
  const handler = source.match(/Deno\.serve\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*)/);
  assert.ok(handler);
  assert.match(handler[1].trimStart(), /^return\s+phaseABlockedResponse\(/);
});

test("migracja rozliczeń używa integer minor units i kanonicznego katalogu", () => {
  const migration = phaseBMigration();
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.billing_products/);
  assert.match(migration, /amount_minor\s+bigint\s+NOT NULL/i);
  assert.match(migration, /amount_minor\s*>\s*0/i);
  assert.match(migration, /currency\s+text\s+NOT NULL/i);
  assert.match(migration, /credit-package:/);
  assert.match(migration, /round\([^)]*price[^)]*\*\s*100/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.credit_packages FROM PUBLIC, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.credit_packages TO service_role/i,
  );
});

test("migracja wiąże intencję z aktorem i chroni idempotencję oraz replay", () => {
  const migration = phaseBMigration();
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.billing_payment_orders/);
  assert.match(migration, /idempotency_key\s+uuid\s+NOT NULL/i);
  assert.match(migration, /UNIQUE\s*\([^)]*(?:actor_(?:user_)?id[^)]*idempotency_key|idempotency_key[^)]*actor_(?:user_)?id)[^)]*\)/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.billing_payment_events/);
  assert.match(migration, /external_event_id/);
  assert.match(migration, /(?:UNIQUE|PRIMARY KEY)\s*\([^)]*(?:provider[^)]*external_event_id|external_event_id[^)]*provider)[^)]*\)/i);
  assert.match(migration, /pg_advisory_xact_lock|FOR UPDATE/i);
});

test("zweryfikowana płatność i przyznanie wartości są jedną funkcją transakcyjną", () => {
  const migration = phaseBMigration();
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.billing_apply_verified_payment/);
  assert.match(migration, /amount_minor/i);
  assert.match(migration, /currency/i);
  assert.match(migration, /gateway_session_id/i);
  assert.match(migration, /status[^\n]*(?:paid|succeeded)/i);
  assert.match(migration, /INSERT INTO public\.billing_value_ledger/);
  assert.match(migration, /event_id/i);
  assert.match(migration, /ON CONFLICT|unique_violation/i);
});

test("ledger jest append-only, a klient nie może modyfikować sald ani płatności", () => {
  const migration = phaseBMigration();
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.billing_value_ledger/);
  assert.match(migration, /REVOKE ALL(?: PRIVILEGES)? ON TABLE public\.billing_value_ledger FROM PUBLIC, anon, authenticated/i);
  const dmlLockdown = migration.match(
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i,
  )?.[0] ?? "";
  const readGrant = migration.match(
    /GRANT SELECT\s+ON TABLE public\.payments,[\s\S]*?TO authenticated, service_role;/i,
  )?.[0] ?? "";
  for (const table of ["payments", "user_credits", "vehicle_lookup_credits"]) {
    assert.match(dmlLockdown, new RegExp(`public\\.${table}\\b`, "i"), `Brak blokady DML: ${table}`);
    assert.match(readGrant, new RegExp(`public\\.${table}\\b`, "i"), `Brak bezpiecznego SELECT: ${table}`);
  }
  for (const table of [
    "ai_user_credits",
    "coin_transactions",
    "user_wallets",
    "wallet_transactions",
    "wallet_pln_transactions",
    "marketplace_orders",
    "listing_promotions",
    "promo_code_redemptions",
    "parking_sessions",
    "rental_payments",
  ]) {
    assert.match(dmlLockdown, new RegExp(`public\\.${table}\\b`, "i"), `Brak blokady klientowego DML: ${table}`);
    assert.match(readGrant, new RegExp(`public\\.${table}\\b`, "i"), `Brak przywrócenia bezpiecznego odczytu: ${table}`);
  }
  assert.match(migration, /(?:append_only|immutable)/i);
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/);
});

test("admin grant wymaga roli administratora i zostawia audyt", () => {
  const migration = phaseBMigration();
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.billing_admin_grant/);
  assert.match(migration, /has_role\([^)]*'admin'/i);
  assert.match(migration, /INSERT INTO public\.security_audit_log/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.billing_admin_grant[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.billing_admin_grant/);
});

test("saldo SMS jest nieujemne i klient nie może zmienić go w UPDATE profilu", () => {
  const migration = phaseBMigration();
  assert.match(migration, /sms_balance[^\n]*(?:>=\s*0|nonnegative|non_negative)/i);
  assert.match(migration, /CREATE (?:OR REPLACE )?FUNCTION public\.billing_protect_sms_balance/i);
  assert.match(migration, /NEW\.sms_balance\s+IS NOT DISTINCT FROM\s+OLD\.sms_balance/i);
  assert.match(migration, /CREATE TRIGGER[^\n]*sms/i);
  assert.match(migration, /FROM public\.billing_value_balances/i);
  assert.match(migration, /beneficiary_type\s*=\s*'service_provider'/i);
  assert.match(migration, /benefit_type\s*=\s*'sms'/i);
  assert.match(migration, /sms_balance_must_match_canonical_ledger/i);
  assert.doesNotMatch(migration, /app\.billing_value_write/i);
});

test("ledger usługodawcy zachowuje niezmienny tenant i nie przenosi historii po zmianie firmy", () => {
  const migration = phaseBMigration();
  assert.match(migration, /public\.is_company_member\(tenant_id\)/i);
  assert.match(migration, /public\.is_company_owner\(tenant_id\)/i);
  assert.match(migration, /v_balance_tenant_id\s+uuid/i);
  assert.match(migration, /v_balance_tenant_id\s+IS DISTINCT FROM\s+v_tenant_id/i);
  assert.match(migration, /provider_tenant_changed/i);
  assert.doesNotMatch(
    migration,
    /SET\s+tenant_id\s*=\s*coalesce\(v_tenant_id,\s*tenant_id\)/i,
  );
});

test("właściciel firmy jest prawidłowym kontekstem płatności, a nieobsługiwane benefity są nieaktywne", () => {
  const migration = phaseBMigration();
  assert.match(migration, /company\.owner_user_id\s*=\s*p_actor_id/i);
  assert.match(
    migration,
    /lower\(trim\(cp\.credit_type\)\)\s+IN\s*\('sms',\s*'ai',\s*'vehicle_lookup'\)/i,
  );
  assert.match(migration, /ai_photo i listing_featured pozostają nieaktywne/i);
});

test("niegotowe operacje finansowe pozostają niewykonywalne nawet dla service_role", () => {
  const migration = phaseBMigration();
  for (const fn of [
    "billing_attach_gateway_session",
    "billing_apply_verified_payment",
    "billing_admin_grant",
    "deduct_vehicle_lookup_credit",
    "deduct_sms_credit",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*?service_role;`, "i"),
      `Brak fail-closed dla RPC ${fn}`,
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`, "i"),
      `RPC ${fn} nie może być jeszcze przyznane service_role`,
    );
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.billing_create_payment_order/);
});
