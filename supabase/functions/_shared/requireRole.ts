/**
 * Sprawdzenie tożsamości i roli wywołującego — jedno miejsce dla funkcji,
 * które nie mogą być publiczne.
 *
 * Powstało po audycie z 16.08.2026: cztery funkcje pisały kluczem
 * `service_role` bez ŻADNEGO sprawdzenia wywołującego. Jedna kasowała konta
 * i resetowała hasła, druga nadawała role wprost z ciała żądania.
 *
 * Dwie zasady, których ten moduł pilnuje:
 *
 * 1. **Rola pochodzi z BAZY, nigdy z tokenu.** JWT niesie `user_metadata`,
 *    które użytkownik potrafi sobie ustawić przy rejestracji — rola z tokenu
 *    nie jest stwierdzeniem faktu, tylko życzeniem. Pytamy `user_roles`.
 * 2. **Fail-closed.** Brak tokenu, zły token, błąd odczytu ról, brak konfiguracji
 *    — wszystko to odmowa. Nie ma ścieżki, w której brak wiedzy przepuszcza.
 */
import { corsHeaders } from "./cors.ts";

export type Rola =
  | "admin"
  | "fleet_settlement"
  | "fleet_rental"
  | "driver";

export interface Wywolujacy {
  id: string;
  email: string | null;
  role: Rola[];
}

interface KlientAuth {
  auth: {
    getUser(token: string): PromiseLike<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
  from(tabela: string): any;
}

export function odmowa(status: number, komunikat: string): Response {
  return new Response(JSON.stringify({ error: komunikat }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Zwraca wywołującego, jeśli ma którąkolwiek z wymaganych ról. W przeciwnym
 * razie zwraca gotową odpowiedź odmowną — wołający ma ją po prostu zwrócić.
 *
 * Rozróżniamy 401 od 403 świadomie: „nie wiem, kim jesteś" i „wiem, i nie wolno
 * ci" to dla obsługi dwie różne sprawy.
 */
export async function wymagajRoli(
  admin: KlientAuth,
  req: Request,
  wymagane: Rola[],
): Promise<{ ok: true; kto: Wywolujacy } | { ok: false; odp: Response }> {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return { ok: false, odp: odmowa(401, "Musisz być zalogowany.") };
  }

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    return { ok: false, odp: odmowa(401, "Musisz być zalogowany.") };
  }

  const { data: wiersze, error: bladRol } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (bladRol) {
    // Nie wiemy, jakie ma role — więc nie wolno mu nic. Odwrotna domyślność
    // znaczyłaby, że awaria bazy otwiera funkcję kasującą konta.
    console.error("wymagajRoli: nie udało się odczytać ról", bladRol);
    return { ok: false, odp: odmowa(503, "Nie można zweryfikować uprawnień.") };
  }

  const role = ((wiersze ?? []) as Array<{ role: string }>).map((w) => w.role) as Rola[];
  const maRole = role.some((r) => wymagane.includes(r));

  if (!maRole) {
    console.warn(`wymagajRoli: odmowa dla ${user.id}, ma [${role.join(",")}], wymagane [${wymagane.join(",")}]`);
    return { ok: false, odp: odmowa(403, "Brak uprawnień do tej operacji.") };
  }

  return { ok: true, kto: { id: user.id, email: user.email ?? null, role } };
}
