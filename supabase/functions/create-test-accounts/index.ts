import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  SecurityError,
} from "../_shared/security.ts";
import { constantTimeEqual } from "../_shared/securityPrimitives.ts";

const LOCAL_TEST_ACCOUNTS = [
  { email: "warsztat@test.pl", companyName: "Warsztat Testowy" },
  { email: "detaling@test.pl", companyName: "Detaling Testowy" },
] as const;

function assertLocalRuntime(req: Request): void {
  const configuredUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let localHost = false;
  try {
    const parsed = new URL(configuredUrl);
    localHost = parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "host.docker.internal", "kong"].includes(parsed.hostname);
  } catch {
    localHost = false;
  }

  if (Deno.env.get("ENVIRONMENT") !== "local" || !localHost) {
    throw new SecurityError(404, "local_runtime_required", "Funkcja jest dostępna wyłącznie w lokalnym Supabase");
  }
  // Narzędzie seedujące jest przeznaczone dla CLI, nie dla kodu przeglądarki.
  if (req.headers.has("Origin")) {
    throw new SecurityError(403, "cli_only", "Lokalne konta testowe można utworzyć wyłącznie z CLI");
  }

  const expected = Deno.env.get("LOCAL_TEST_SETUP_SECRET") ?? "";
  const supplied = req.headers.get("x-local-test-secret") ?? "";
  if (expected.length < 32 || !constantTimeEqual(supplied, expected)) {
    throw new SecurityError(401, "invalid_local_setup_secret", "Brak prawidłowego sekretu lokalnego setupu");
  }
}

function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const random = crypto.getRandomValues(new Uint8Array(24));
  const suffix = Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("");
  return `Aa1!${suffix}`;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  try {
    assertLocalRuntime(req);
    const client = createServiceClient();
    const results: Array<Record<string, unknown>> = [];

    for (const account of LOCAL_TEST_ACCOUNTS) {
      const { data: existing, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const existingUser = existing.users.find((user) => user.email?.toLowerCase() === account.email);
      if (existingUser) {
        results.push({ email: account.email, status: "exists", userId: existingUser.id });
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      const { data: created, error: createError } = await client.auth.admin.createUser({
        email: account.email,
        password: temporaryPassword,
        // Ta gałąź jest fizycznie ograniczona do lokalnego stosu Supabase.
        email_confirm: true,
        user_metadata: { local_test_account: true, must_change_password: true },
      });
      if (createError || !created.user) throw createError ?? new Error("local_test_user_create_failed");

      const { data: entity, error: entityError } = await client.from("entities").insert({
        name: account.companyName,
        owner_user_id: created.user.id,
        type: "service_provider",
      }).select("id").single();
      const { error: roleError } = entityError
        ? { error: null }
        : await client.from("user_roles").insert({ user_id: created.user.id, role: "service_provider" });

      if (entityError || roleError) {
        const { error: compensationError } = await client.auth.admin.deleteUser(created.user.id);
        if (compensationError) console.error("local_test_compensation_failed", compensationError.code);
        throw entityError ?? roleError;
      }

      results.push({
        email: account.email,
        status: "created",
        userId: created.user.id,
        entityId: entity.id,
        temporaryPassword,
      });
    }

    return jsonResponse(req, 201, {
      success: true,
      localOnly: true,
      warning: "Hasła są wyświetlane jednorazowo i dotyczą wyłącznie lokalnej bazy",
      results,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
