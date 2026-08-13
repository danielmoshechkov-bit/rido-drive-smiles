// Długość okresu próbnego modułu warsztatowego.
//
// Liczba dni pochodzi z `billing_plans.trial_days` — z tego samego pola, które
// czytają /cennik i /warsztat-info. Dzięki temu obietnica na stronie i data
// realnie zapisana w bazie nie mają jak się rozjechać: jedna zmiana w panelu
// przestawia oba naraz. Wcześniej w obu edge functions siedziało zaszyte 14,
// a strona mówiła co innego.
//
// Fallback jest świadomie hojny: jeśli zapytanie padnie albo żaden plan
// warsztatowy nie ma ustawionego triala, lepiej dać klientowi pełny okres niż
// przypadkiem skrócić go do zera i zamknąć konto w dniu rejestracji.

export const WORKSHOP_TRIAL_FALLBACK_DAYS = 30;

/** Maksimum z `trial_days` aktywnych planów linii warsztatowej. */
export async function resolveWorkshopTrialDays(
  admin: { from: (t: string) => any },
): Promise<number> {
  try {
    const { data, error } = await admin
      .from("billing_plans")
      .select("trial_days")
      .eq("product_line", "warsztat")
      .eq("is_active", true);

    if (error) {
      console.error("workshopTrial: nie odczytano trial_days, fallback", error.message);
      return WORKSHOP_TRIAL_FALLBACK_DAYS;
    }

    const max = (data ?? []).reduce(
      (acc: number, row: { trial_days: number | null }) => Math.max(acc, Number(row?.trial_days) || 0),
      0,
    );
    return max > 0 ? max : WORKSHOP_TRIAL_FALLBACK_DAYS;
  } catch (e) {
    console.error("workshopTrial: wyjątek przy odczycie trial_days, fallback", e);
    return WORKSHOP_TRIAL_FALLBACK_DAYS;
  }
}

/** Data końca triala liczona od teraz. */
export function workshopTrialExpiresAt(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
