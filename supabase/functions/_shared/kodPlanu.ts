/**
 * Sprawdzenie, czy kod planu istnieje w cenniku.
 *
 * ⚠️ POWÓD (16.08.2026): landing warsztatu przekazywał przy ogólnych
 * przyciskach literał `"pro"` — skrót, którego `billing_plans` nie zna
 * (kody mają postać `warsztat_pro`). Trafiał do `user_metadata.plan`
 * i do metadanych trialu, a wszystko, co potem szukało planu PO KODZIE
 * — baner konwersji, ekran „Twój plan" — po prostu milczało.
 *
 * Zapisanie kodu, którego billing nie rozpoznaje, jest gorsze niż zapisanie
 * niczego: `null` widać od razu, a martwy kod wygląda jak poprawna wartość
 * i psuje się dopiero po drodze, bez żadnego sygnału.
 */
interface KlientPlanow {
  from(tabela: string): any;
}

export async function sprawdzKodPlanu(
  admin: KlientPlanow,
  kod: unknown,
): Promise<string | null> {
  if (typeof kod !== "string" || !kod.trim()) return null;

  const { data, error } = await admin
    .from("billing_plans")
    .select("code")
    .eq("code", kod.trim())
    .maybeSingle();

  if (error) {
    // Awaria odczytu cennika nie może wywrócić rejestracji. Zapisujemy `null`
    // i zostawiamy głośny ślad — brak planu da się później uzupełnić, konta
    // którego nie założyliśmy, już nie.
    console.error("sprawdzKodPlanu: nie udało się sprawdzić cennika:", error.message);
    return null;
  }

  if (!data) {
    console.warn(`sprawdzKodPlanu: kod "${kod}" nie istnieje w billing_plans — zapisuję null`);
    return null;
  }

  return data.code as string;
}
