import { supabase } from "@/integrations/supabase/client";

/**
 * Wspólny serwis rejestracji i aktywacji kont.
 *
 * Jeden mechanizm dla wszystkich punktów wejścia:
 * - KLIENT (LoginModal): signUp z meta account_type + emailRedirectTo,
 *   mail potwierdzający wysyła Supabase Auth (wymaga custom SMTP w Auth!).
 * - KLIENT GIEŁDY (/gielda/rejestracja): edge fn `register-marketplace-user`
 *   (service-role: konto + profil + rola + referral + mail przez SMTP LH.pl).
 * - BIZNES / FLOTA (/fleet/rejestracja): edge fn `register-fleet`.
 * - Ponowna wysyłka linku aktywacyjnego: edge fn `resend-activation-email`.
 */

export type SignupResult = {
  success: boolean;
  /** Konto powstało, ale mail aktywacyjny nie wyszedł — pokaż opcję "wyślij ponownie". */
  emailFailed?: boolean;
  requiresActivation?: boolean;
  message?: string;
  error?: string;
  /** Nazwa pola formularza, którego dotyczy błąd (np. "email"). */
  field?: string;
};

const activationRedirect = () => `${window.location.origin}/email-confirmed`;

/** Rejestracja KLIENTA (LoginModal): mail potwierdzający wysyła Supabase Auth. */
export async function signUpClient(email: string, password: string): Promise<SignupResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { account_type: "client" },
      emailRedirectTo: activationRedirect(),
    },
  });

  if (error) {
    return { success: false, error: mapAuthError(error.message) };
  }
  return {
    success: true,
    requiresActivation: true,
    message: "Konto utworzone! Sprawdź email, aby potwierdzić rejestrację.",
  };
}

export type MarketplaceSignupPayload = {
  first_name: string;
  last_name?: string;
  phone?: string;
  email: string;
  password: string;
  referral_code?: string;
};

/** Rejestracja KLIENTA GIEŁDY przez edge fn (konto + profil + rola + referral + mail). */
export async function signUpMarketplace(payload: MarketplaceSignupPayload): Promise<SignupResult> {
  const response = await supabase.functions.invoke("register-marketplace-user", { body: payload });

  if (response.data?.error) {
    return { success: false, error: response.data.error, field: response.data.field };
  }
  if (response.error) {
    return { success: false, error: response.error.message };
  }
  return {
    success: true,
    requiresActivation: response.data?.requires_activation !== false,
    emailFailed: response.data?.email_sent === false,
    message: response.data?.message,
  };
}

export type FleetSignupPayload = Record<string, unknown>;

/** Rejestracja BIZNESU (floty) przez edge fn. */
export async function signUpFleet(payload: FleetSignupPayload): Promise<SignupResult> {
  const response = await supabase.functions.invoke("register-fleet", { body: payload });

  if (response.data?.error) {
    return { success: false, error: response.data.error, field: response.data.field };
  }
  if (response.error) {
    return { success: false, error: response.error.message };
  }
  return {
    success: true,
    requiresActivation: response.data?.requires_activation === true,
    emailFailed: response.data?.email_sent === false,
    message: response.data?.message,
  };
}

/** Ponowna wysyłka linku aktywacyjnego dla niepotwierdzonego konta. */
export async function resendActivationEmail(email: string, language = "pl"): Promise<SignupResult> {
  const response = await supabase.functions.invoke("resend-activation-email", {
    body: { email, language },
  });

  // invoke() zwraca error przy statusach != 2xx — treść błędu jest w context
  if (response.error) {
    const body = await extractErrorBody(response.error);
    if (body?.error === "already_confirmed") {
      return { success: false, error: body.message || "To konto jest już aktywne. Możesz się zalogować." };
    }
    return { success: false, error: body?.error || "Nie udało się wysłać linku. Spróbuj ponownie." };
  }
  return {
    success: true,
    message: response.data?.message || "Jeśli konto istnieje i wymaga aktywacji, link został wysłany.",
  };
}

/** Czy błąd logowania oznacza niepotwierdzony email (pokaż opcję ponownej wysyłki linku). */
export function isEmailNotConfirmedError(message: string | undefined): boolean {
  return !!message && /email not confirmed/i.test(message);
}

async function extractErrorBody(error: unknown): Promise<{ error?: string; message?: string } | null> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      return await ctx.json();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function mapAuthError(message: string): string {
  if (/already registered|already exists/i.test(message)) {
    return "Ten email jest już zarejestrowany. Użyj logowania lub resetu hasła.";
  }
  if (/password/i.test(message)) {
    return "Hasło nie spełnia wymagań bezpieczeństwa (minimum 6 znaków).";
  }
  if (/invalid.*email/i.test(message)) {
    return "Niepoprawny format adresu email.";
  }
  return message;
}
