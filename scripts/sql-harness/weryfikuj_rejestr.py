#!/usr/bin/env python3
"""Które migracje spoza rejestru da się POTWIERDZIĆ w produkcyjnej bazie.

═══════════════════════════════════════════════════════════════════════════════
PO CO
═══════════════════════════════════════════════════════════════════════════════
`supabase_migrations.schema_migrations` stoi na 3 sierpnia 2026, a w repozytorium
są 63 nowsze migracje — wklejane ręcznie w SQL Editorze, z pominięciem rejestru.
Dopóki tak jest, `db push` i `db reset` uznają je za niewykonane i spróbują nałożyć
ponownie. Przy migracjach ruszających salda drugie uruchomienie kasuje jednostki
klientom.

Trzeba dopisać brakujące wpisy. Ale wpisanie ich „bo pewnie się wykonały" tworzy
FIKCJĘ: rejestr mówiłby „zastosowane", a nikt tego nie sprawdził.

Ten skrypt zbiera DOWODY. Dla każdej migracji wyciąga z jej treści obiekty, które
tworzy, i sprawdza w bazie, czy istnieją.

═══════════════════════════════════════════════════════════════════════════════
SIŁA DOWODU — DLACZEGO TRZY KUBEŁKI, NIE DWA
═══════════════════════════════════════════════════════════════════════════════
Nie każdy obiekt jest tak samo dobrym świadkiem:

  MOCNY   nowa tabela, nowa kolumna, nowy typ, nowa polityka po nazwie.
          Takich rzeczy przed migracją NIE BYŁO. Ich obecność znaczy, że
          migracja przeszła.

  SŁABY   `CREATE OR REPLACE FUNCTION`. Funkcja o tej nazwie mogła istnieć
          wcześniej — jej obecność nie mówi NIC o tym, czy ta konkretna wersja
          została nałożona. Tak samo `UPDATE`, `GRANT`, `DROP POLICY`.

Migracja mająca wyłącznie słabe świadectwa trafia do osobnego kubełka i wymaga
spojrzenia człowiekiem. Udawanie, że wiemy, byłoby dokładnie tą fikcją, której
unikamy.

═══════════════════════════════════════════════════════════════════════════════
CO TEN SKRYPT USTALIŁ PRZY PIERWSZYM URUCHOMIENIU (22.08.2026)
═══════════════════════════════════════════════════════════════════════════════
Rejestr NIE JEST osiemnaście dni w tyle. On nigdy nie opisywał tych plików:

    wpisów w rejestrze:            535
    unikalnych prefiksów w repo:   638
    WSPÓLNYCH:                      41

494 wpisy rejestru wskazują wersje, dla których w repozytorium nie ma pliku;
597 plików repozytorium nie ma wpisu. To dwa rozłączne rejestry, nie jeden
zaległy. Lovable nakłada migracje pod WŁASNĄ numeracją, a pliki w repozytorium
są równoległym zapisem tej samej pracy.

Wniosek praktyczny: dopisanie 597 wersji przez `migration repair` nie naprawiłoby
rejestru, tylko dopisało historię, której nie było. Jeśli kiedyś chcemy czystego
rejestru, właściwą drogą jest `supabase db pull` — odtworzenie punktu wyjścia
z żywego schematu, nie wstawianie wymyślonych wierszy.

Do tego czasu jedyną realną ochroną jest to, co i tak obowiązuje:
NIE URUCHAMIAMY `db push` ANI `db reset` NA PRODUKCJI.

═══════════════════════════════════════════════════════════════════════════════
OGRANICZENIE, O KTÓRYM TRZEBA WIEDZIEĆ
═══════════════════════════════════════════════════════════════════════════════
Skrypt czyta treść pliku, a nie wykonuje go. Nie widzi więc WARUNKÓW. Migracja
`20260820140000_podpis_najmu_i_widocznosc` trafiła do kubełka „niepotwierdzone",
bo dwie polityki, które tworzy, nie istnieją — a nie istnieją SŁUSZNIE: powstają
tylko wtedy, gdy po zdjęciu starych nie zostałaby żadna polityka odczytu,
i ten warunek nie zaszedł. Migracja wykonała się poprawnie.

Czerwony kubełek znaczy więc „spójrz na to", a nie „nie wykonano".
"""
import json
import re
import subprocess
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parents[2]
KATALOG = KORZEN / "supabase" / "migrations"

# --- wyciąganie obiektów -----------------------------------------------------
RE_TABELA = re.compile(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)", re.I)
RE_TYP = re.compile(r"CREATE\s+TYPE\s+(?:public\.)?(\w+)", re.I)
RE_KOLUMNA = re.compile(
    r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?(\w+)\s+"
    r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)", re.I)
RE_POLITYKA = re.compile(r"CREATE\s+POLICY\s+(?:\"([^\"]+)\"|(\w+))\s+ON\s+(?:public\.)?(\w+)", re.I)
RE_FUNKCJA = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)", re.I)


def bez_komentarzy(t: str) -> str:
    t = re.sub(r"--[^\n]*", " ", t)
    return re.sub(r"/\*.*?\*/", " ", t, flags=re.S)


def obiekty(tresc: str) -> dict:
    t = bez_komentarzy(tresc)
    polityki = [(p[0] or p[1], p[2]) for p in RE_POLITYKA.findall(t)]
    return {
        "tabele": sorted(set(RE_TABELA.findall(t))),
        "typy": sorted(set(RE_TYP.findall(t))),
        "kolumny": sorted({f"{a}.{b}" for a, b in RE_KOLUMNA.findall(t)}),
        "polityki": sorted({f"{b}|{a}" for a, b in polityki}),
        "funkcje": sorted(set(RE_FUNKCJA.findall(t))),
    }


def zapytanie(wszystkie: dict) -> str:
    """Jedno zapytanie sprawdzające WSZYSTKIE obiekty naraz."""
    czesci = []
    for rodzaj, nazwy in wszystkie.items():
        for n in sorted(nazwy):
            if rodzaj == "tabele":
                war = f"to_regclass('public.{n}') IS NOT NULL"
            elif rodzaj == "typy":
                war = f"EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace s ON s.oid=t.typnamespace WHERE s.nspname='public' AND t.typname='{n}')"
            elif rodzaj == "kolumny":
                tab, kol = n.split(".", 1)
                war = f"EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='{tab}' AND column_name='{kol}')"
            elif rodzaj == "polityki":
                tab, pol = n.split("|", 1)
                war = f"EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='{tab}' AND policyname='{pol.replace(chr(39), chr(39) * 2)}')"
            else:
                war = f"EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='{n}')"
            klucz = f"{rodzaj}:{n}".replace("'", "''")
            czesci.append(f"SELECT '{klucz}' AS klucz, ({war}) AS jest")
    return "\nUNION ALL\n".join(czesci) + ";"


def pytaj(sql: str) -> dict:
    tmp = Path("/tmp/_weryfikacja.sql")
    tmp.write_text(sql, encoding="utf-8")
    out = subprocess.run(
        ["supabase", "db", "query", "--linked", "-f", str(tmp)],
        capture_output=True, text=True, cwd=KORZEN,
    ).stdout
    start = out.find("{")
    if start < 0:
        print("nie udało się odczytać odpowiedzi bazy:\n" + out[:800], file=sys.stderr)
        sys.exit(2)
    dane = json.loads(out[start:out.rfind("}") + 1])
    return {w["klucz"]: w["jest"] for w in dane["rows"]}


def main() -> int:
    zarejestrowane = set(pytaj(
        "SELECT version AS klucz, true AS jest FROM supabase_migrations.schema_migrations;"
    ).keys())

    doSprawdzenia = []
    for plik in sorted(KATALOG.glob("*.sql")):
        wersja = plik.name.split("_", 1)[0]
        if wersja in zarejestrowane:
            continue
        doSprawdzenia.append((plik, obiekty(plik.read_text(encoding="utf-8", errors="replace"))))

    if not doSprawdzenia:
        print("zielono — rejestr zna wszystkie migracje z repozytorium")
        return 0

    wszystkie: dict = {"tabele": set(), "typy": set(), "kolumny": set(), "polityki": set(), "funkcje": set()}
    for _, ob in doSprawdzenia:
        for rodzaj, nazwy in ob.items():
            wszystkie[rodzaj].update(nazwy)

    stan = pytaj(zapytanie(wszystkie))

    MOCNE = ("tabele", "typy", "kolumny", "polityki")
    zielone, czerwone, szare = [], [], []

    for plik, ob in doSprawdzenia:
        mocne = [(r, n) for r in MOCNE for n in ob[r]]
        if not mocne:
            szare.append((plik.name, len(ob["funkcje"])))
            continue
        brak = [f"{r}:{n}" for r, n in mocne if not stan.get(f"{r}:{n}", False)]
        if brak:
            czerwone.append((plik.name, brak))
        else:
            zielone.append((plik.name, len(mocne)))

    print(f"Migracji spoza rejestru: {len(doSprawdzenia)}\n")
    print(f"■ POTWIERDZONE ({len(zielone)}) — wszystkie tworzone obiekty istnieją w bazie")
    for n, ile in zielone:
        print(f"    {n}  ({ile} obiektów)")
    print(f"\n■ NIEPOTWIERDZONE ({len(czerwone)}) — brakuje obiektów, które migracja tworzy")
    for n, brak in czerwone:
        print(f"    {n}")
        for b in brak[:6]:
            print(f"        brak: {b}")
        if len(brak) > 6:
            print(f"        … i {len(brak) - 6} więcej")
    print(f"\n■ NIE DA SIĘ ROZSTRZYGNĄĆ ({len(szare)}) — tylko funkcje, UPDATE, GRANT")
    for n, ile in szare:
        print(f"    {n}  ({ile} funkcji — obecność nie dowodzi, że nałożono TĘ wersję)")

    print("\nDo rejestru wolno dopisać WYŁĄCZNIE kubełek pierwszy:")
    print("  supabase migration repair --status applied <wersja>")
    print("Pozostałe dwa wymagają spojrzenia człowiekiem.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
