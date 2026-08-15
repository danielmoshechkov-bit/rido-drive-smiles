import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { wymagajRoli, odmowa } from "./requireRole.ts";

/** Atrapa klienta: sterujemy odpowiedzią auth i odczytem ról. */
function klient(opts: {
  user?: { id: string; email?: string | null } | null;
  authError?: unknown;
  role?: Array<{ role: string }>;
  roleError?: unknown;
}) {
  return {
    auth: {
      getUser(_t: string) {
        return Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.authError ?? null,
        });
      },
    },
    from(_t: string) {
      const wynik = Promise.resolve({
        data: opts.role ?? [],
        error: opts.roleError ?? null,
      });
      const builder = {
        select: () => builder,
        eq: () => wynik,
      };
      return builder;
    },
  };
}

const zadanie = (naglowek?: string) =>
  new Request("https://x/", {
    method: "POST",
    headers: naglowek ? { Authorization: naglowek } : {},
  });

Deno.test("bez nagłówka Authorization — 401", async () => {
  const w = await wymagajRoli(klient({}) as any, zadanie(), ["admin"]);
  assertEquals(w.ok, false);
  if (!w.ok) assertEquals(w.odp.status, 401);
});

Deno.test("token nierozpoznany — 401", async () => {
  const w = await wymagajRoli(
    klient({ user: null, authError: { message: "bad jwt" } }) as any,
    zadanie("Bearer xyz"),
    ["admin"],
  );
  assertEquals(w.ok, false);
  if (!w.ok) assertEquals(w.odp.status, 401);
});

Deno.test("zalogowany bez wymaganej roli — 403", async () => {
  const w = await wymagajRoli(
    klient({ user: { id: "u1" }, role: [{ role: "driver" }] }) as any,
    zadanie("Bearer ok"),
    ["admin"],
  );
  assertEquals(w.ok, false);
  if (!w.ok) assertEquals(w.odp.status, 403);
});

Deno.test("zalogowany bez ŻADNEJ roli — 403", async () => {
  const w = await wymagajRoli(
    klient({ user: { id: "u1" }, role: [] }) as any,
    zadanie("Bearer ok"),
    ["admin"],
  );
  assertEquals(w.ok, false);
  if (!w.ok) assertEquals(w.odp.status, 403);
});

Deno.test("FAIL-CLOSED: błąd odczytu ról to odmowa, nie przepuszczenie", async () => {
  // Awaria bazy nie może otwierać funkcji, która kasuje konta.
  const w = await wymagajRoli(
    klient({ user: { id: "u1" }, roleError: { message: "timeout" } }) as any,
    zadanie("Bearer ok"),
    ["admin"],
  );
  assertEquals(w.ok, false);
  if (!w.ok) assertEquals(w.odp.status, 503);
});

Deno.test("admin przechodzi", async () => {
  const w = await wymagajRoli(
    klient({ user: { id: "u1", email: "a@b.pl" }, role: [{ role: "admin" }] }) as any,
    zadanie("Bearer ok"),
    ["admin"],
  );
  assertEquals(w.ok, true);
  if (w.ok) {
    assertEquals(w.kto.id, "u1");
    assertEquals(w.kto.email, "a@b.pl");
  }
});

Deno.test("wystarczy JEDNA z wymaganych ról", async () => {
  const w = await wymagajRoli(
    klient({ user: { id: "u1" }, role: [{ role: "fleet_rental" }] }) as any,
    zadanie("Bearer ok"),
    ["admin", "fleet_settlement", "fleet_rental"],
  );
  assertEquals(w.ok, true);
});

Deno.test("nagłówek bez słowa Bearer też działa", async () => {
  const w = await wymagajRoli(
    klient({ user: { id: "u1" }, role: [{ role: "admin" }] }) as any,
    zadanie("surowy-token"),
    ["admin"],
  );
  assertEquals(w.ok, true);
});

Deno.test("odmowa niesie kod i komunikat", async () => {
  const r = odmowa(403, "nie wolno");
  assertEquals(r.status, 403);
  assertEquals((await r.json()).error, "nie wolno");
});
