import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Supabase Auth ma serwerową politykę nowych haseł i wyłączone konta anonimowe", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[auth\][\s\S]*?enable_anonymous_sign_ins = false/);
  assert.match(config, /\[auth\][\s\S]*?minimum_password_length = 12/);
  assert.match(config, /\[auth\][\s\S]*?password_requirements = "lower_upper_letters_digits_symbols"/);
});

test("Supabase Auth ogranicza logowanie, rejestrację, reset i weryfikację tokenów", () => {
  const config = read("supabase/config.toml");
  const section = config.match(/\[auth\.rate_limit\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
  assert.match(section, /email_sent = 2/);
  assert.match(section, /sms_sent = 10/);
  assert.match(section, /anonymous_users = 1/);
  assert.match(section, /token_refresh = 120/);
  assert.match(section, /sign_in_sign_ups = 10/);
  assert.match(section, /token_verifications = 10/);
});

test("formularze nie akceptują historycznego minimum 6/8 znaków", () => {
  const policy = read("src/security/passwordPolicy.ts");
  const indicator = read("src/components/auth/PasswordStrengthIndicator.tsx");
  const login = read("src/components/LoginModal.tsx");
  const marketplace = read("src/pages/MarketplaceRegister.tsx");
  const fleet = read("src/pages/FleetRegister.tsx");
  const insurance = read("src/pages/InsuranceAgentRegister.tsx");
  const account = read("src/components/fleet/AccountSettingsTab.tsx");
  const authService = read("src/services/authService.ts");
  const driver = read("src/pages/DriverRegister.tsx");
  const reset = read("src/pages/ResetPassword.tsx");
  const addUser = read("src/components/admin/AddUserDialog.tsx");
  const driverAdmin = read("src/components/DriverExpandedPanel.tsx");

  assert.match(policy, /PASSWORD_MIN_LENGTH = 12/);
  assert.match(policy, /LOWERCASE_PATTERN/);
  assert.match(policy, /UPPERCASE_PATTERN/);
  assert.match(policy, /DIGIT_PATTERN/);
  assert.match(policy, /SPECIAL_PATTERN/);
  for (const source of [indicator, login, marketplace, fleet, insurance, account, authService, driver, reset, addUser, driverAdmin]) {
    assert.match(source, /passwordPolicy|validatePassword|getPasswordRequirements/);
    assert.doesNotMatch(source, /password\.length < [68]|minimum [68] znaków|Min\. [68] znaków/);
  }
});

test("błąd rejestracji nie ujawnia, czy adres ma już konto", () => {
  const authService = read("src/services/authService.ts");
  assert.match(authService, /already registered\|already exists[\s\S]*?Nie udało się utworzyć konta/);
  assert.doesNotMatch(authService, /Ten email jest już zarejestrowany/);
});
