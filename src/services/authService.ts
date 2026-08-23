import { supabase } from "@/integrations/supabase/client";
import { odczytajBladFunkcji } from '@/utils/bladFunkcji';

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
  /**
   * Kod błędu z funkcji brzegowej, np. `EMAIL_EXISTS`, `RATE_LIMITED`.
   * Interfejs reaguje na KOD, nie na treść komunikatu — dopasowywanie po
   * słowach w zdaniu psuło się przy każdej zmianie tekstu i przy tłumaczeniu.
   */
  code?: string;
};

const activationRedirect = () => `${window.location.origin}/email-confirmed`;

/**
 * Rejestracja KLIENTA (LoginModal) — przez funkcję brzegową, nie przez
 * `supabase.auth.signUp`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE `auth.signUp`
 * ═══════════════════════════════════════════════════════════════════════════
 * GoTrue WYCOFUJE utworzenie konta, gdy nie uda się wysłać maila
 * potwierdzającego, i oddaje 500 „Error sending confirmation email".
 * Klient z adresem w domenie, której nasz przekaźnik nie obsłuży, dostawał
 * błąd serwera i zostawał BEZ KONTA — bez wskazówki, co dalej.
 *
 * Sprawdzone obiema drogami na tym samym adresie w tej samej minucie:
 *   • `auth.signUp`               → HTTP 500, konta nie ma,
 *   • `register-marketplace-user` → HTTP 200, konto jest, `email_sent: false`.
 *
 * Tego nie da się skonfigurować po stronie Supabase — funkcja brzegowa zakłada
 * konto kluczem serwisowym i traktuje wysyłkę jako OSOBNY krok.
 *
 * `account_type: 'client'` znaczy: samo konto. Bez profilu giełdowego i bez
 * roli `marketplace_user` — okno logowania nie deklaruje handlu na giełdzie.
 */
export async function signUpClient(email: string, password: string): Promise<SignupResult> {
  const response = await supabase.functions.invoke("register-marketplace-user", {
    body: { email, password, first_name: "", account_type: "client" },
  });

  if (response.data?.error) {
    return {
      success: false,
      error: response.data.error,
      field: response.data.field,
      code: response.data.code,
    };
  }
  if (response.error) {
    // Treść odpowiedzi funkcji siedzi w `error.context`, nie w `error.message`.
    const blad = await odczytajBladFunkcji(response.error);
    return {
      success: false,
      error: blad.komunikat,
      field: blad.pole,
      code: typeof blad.surowe?.code === 'string' ? blad.surowe.code : undefined,
    };
  }

  // Nieudana wysyłka NIE jest porażką rejestracji: konto istnieje i klient ma
  // dostać przycisk „wyślij ponownie", a nie komunikat o błędzie.
  const mailPoszedl = response.data?.email_sent !== false;
  return {
    success: true,
    requiresActivation: true,
    emailFailed: !mailPoszedl,
    message: mailPoszedl
      ? "Konto utworzone! Sprawdź email, aby potwierdzić rejestrację."
      : "Konto utworzone, ale nie udało się wysłać maila aktywacyjnego. Użyj opcji „Wyślij link ponownie”.",
  };
}

export type MarketplaceSignupPayload = {
  first_name: string;
  last_name?: string;
  phone?: string;
  email: string;
  password: string;
  referral_code?: string;
  /** Rejestracja z landingu modułu (np. 'warsztat') — edge fn zakłada wpis usługodawcy + trial. */
  module?: string;
  plan?: string;
};

/** Rejestracja KLIENTA GIEŁDY przez edge fn (konto + profil + rola + referral + mail). */
export async function signUpMarketplace(payload: MarketplaceSignupPayload): Promise<SignupResult> {
  const response = await supabase.functions.invoke("register-marketplace-user", { body: payload });

  if (response.data?.error) {
    return {
      success: false,
      error: response.data.error,
      field: response.data.field,
      code: response.data.code,
    };
  }
  if (response.error) {
    // Treść odpowiedzi funkcji siedzi w `error.context`, nie w `error.message`
    // — bez tego użytkownik widzi „Edge Function returned a non-2xx status
    // code" zamiast zdania, które funkcja naprawdę odesłała.
    const blad = await odczytajBladFunkcji(response.error);
    return {
      success: false,
      error: blad.komunikat,
      field: blad.pole,
      code: typeof blad.surowe?.code === 'string' ? blad.surowe.code : undefined,
    };
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
    return {
      success: false,
      error: response.data.error,
      field: response.data.field,
      code: response.data.code,
    };
  }
  if (response.error) {
    // Treść odpowiedzi funkcji siedzi w `error.context`, nie w `error.message`
    // — bez tego użytkownik widzi „Edge Function returned a non-2xx status
    // code" zamiast zdania, które funkcja naprawdę odesłała.
    const blad = await odczytajBladFunkcji(response.error);
    return {
      success: false,
      error: blad.komunikat,
      field: blad.pole,
      code: typeof blad.surowe?.code === 'string' ? blad.surowe.code : undefined,
    };
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
    const blad = await odczytajBladFunkcji(response.error);
    if (blad.surowe?.error === "already_confirmed") {
      return {
        success: false,
        error: (blad.surowe.message as string) || "To konto jest już aktywne. Możesz się zalogować.",
      };
    }
    return { success: false, error: blad.komunikat };
  }
  return {
    success: true,
    message: response.data?.message || "Jeśli konto istnieje i wymaga aktywacji, link został wysłany.",
  };
}

/** Aktywacja modułu warsztatowego na istniejącym, zalogowanym koncie (rola + provider + trial). */
export async function activateWorkshopTrial(plan?: string): Promise<SignupResult> {
  const response = await supabase.functions.invoke("activate-workshop-trial", {
    body: { plan },
  });
  if (response.error) {
    const blad = await odczytajBladFunkcji(response.error);
    return { success: false, error: blad.komunikat };
  }
  return { success: true, message: response.data?.message };
}

/**
 * Redirect po zalogowaniu dla kont zarejestrowanych na moduł (user_metadata.module).
 * Zwraca ścieżkę panelu modułu albo null (wtedy obowiązuje routing wg ról).
 */
export function getModuleRedirect(
  user: { user_metadata?: Record<string, unknown> } | null | undefined
): string | null {
  if (user?.user_metadata?.module === "warsztat") {
    return "/uslugi/panel";
  }
  return null;
}

/** Czy błąd logowania oznacza niepotwierdzony email (pokaż opcję ponownej wysyłki linku). */
export function isEmailNotConfirmedError(message: string | undefined): boolean {
  return !!message && /email not confirmed/i.test(message);
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
