#!/usr/bin/env python3
"""
Czy funkcje w bazie to nadal ta wersja, którą ostatnio wgraliśmy migracją.

═══════════════════════════════════════════════════════════════════════════
POWÓD ISTNIENIA (10.09.2026)
═══════════════════════════════════════════════════════════════════════════
Funkcja brzegowa ma SHA i da się ją porównać z `main`. Funkcja w bazie nie ma
NIC — jest wgrywana raz, a potem może zostać po cichu nadpisana i nikt tego
nie zobaczy, bo `CREATE OR REPLACE` nie zostawia śladu.

Tego dnia wyszły dwie takie regresje naraz:

  • `prevent_duplicate_invoice_number` wróciła do wersji sprzed 09.09 —
    numer skasowanej faktury znowu dawał się użyć ponownie,
  • `deduct_sms_credit` wróciła do wersji z `RAISE WARNING` zamiast wyjątku,
    czyli tej, przez którą SMS-y wychodziły ZA DARMO przy odmowie zużycia
    (naprawione 22.08 migracją `20260822090000_sms_fail_closed`).

Obie naprawy „weszły" i obie zniknęły. Bez tej kontroli dowiadujemy się o tym
dopiero wtedy, gdy coś przestanie działać — albo wcale.

═══════════════════════════════════════════════════════════════════════════
JAK TO DZIAŁA
═══════════════════════════════════════════════════════════════════════════
Dla każdej funkcji bierzemy OSTATNIĄ jej definicję w `supabase/migrations/`
(po znaczniku czasu w nazwie pliku) i porównujemy CIAŁO z tym, co siedzi
w bazie. Ciało porównujemy po normalizacji: białe znaki i komentarze nie mają
znaczenia, treść ma.

Wywołanie:
    python3 scripts/sql-harness/sprawdz_dryf_funkcji.py stan.json

gdzie `stan.json` to wynik zapytania:

    SELECT p.proname AS nazwa, p.prosrc AS cialo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f';

CZEGO NIE ROBI: nie sprawdza funkcji, których w migracjach nie ma (powstały
w edytorze SQL albo przez Lovable) — o nich mówi osobno, jako o „nieznanych
pochodzeniu", bo to też jest informacja.
"""
import json
import shutil
import tempfile
import re
import sys
from pathlib import Path

KATALOG = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

# `CREATE [OR REPLACE] FUNCTION [public.]nazwa(...) ... AS $tag$ CIAŁO $tag$`
WZORZEC = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\("
    r"[\s\S]*?"
    r"AS\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\2",
    re.IGNORECASE,
)


def znormalizuj(cialo: str) -> str:
    """Porównujemy TREŚĆ, nie formatowanie. Komentarz i wcięcie nie zmieniają
    zachowania funkcji, a zmieniają każdy odcisk liczony wprost z tekstu."""
    bez_blokowych = re.sub(r"/\*[\s\S]*?\*/", " ", cialo)
    bez_liniowych = re.sub(r"--[^\n]*", " ", bez_blokowych)
    return re.sub(r"\s+", " ", bez_liniowych).strip().lower()


# `DROP FUNCTION` liczy się tak samo jak `CREATE` — decyduje PÓŹNIEJSZA
# migracja. Bez tego funkcja skasowana świadomie wygląda jak brakująca.
WZORZEC_DROP = re.compile(
    r"DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([A-Za-z_]\w*)\"?",
    re.I,
)


def z_migracji() -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    """(nazwa -> (ciało, plik), nazwa -> plik_kasujący). Wygrywa NAJPÓŹNIEJSZA migracja.

    🔴 POPRAWIONE 13.09.2026. Wcześniej brany był pod uwagę wyłącznie ostatni
    `CREATE`, więc `billing_active_plan` i `billing_active_subscription` —
    skasowane świadomie migracją `20260810180000_billing_revision.sql` —
    były zgłaszane jako „są w migracjach, nie ma ich w bazie" PRZY KAŻDYM
    PRZEBIEGU. Bramka krzycząca bez powodu uczy ignorowania siebie, a wtedy
    prawdziwego rozjazdu nikt w tym szumie nie zobaczy.
    """
    ostatnie: dict[str, tuple[str, str]] = {}
    skasowane: dict[str, str] = {}
    for plik in sorted(KATALOG.glob("*.sql")):
        tresc = plik.read_text(encoding="utf-8", errors="replace")
        bez_komentarzy = re.sub(r"--[^\n]*", " ", tresc)
        for dopasowanie in WZORZEC.finditer(tresc):
            nazwa = dopasowanie.group(1).lower()
            ostatnie[nazwa] = (znormalizuj(dopasowanie.group(3)), plik.name)
            skasowane.pop(nazwa, None)          # późniejszy CREATE unieważnia DROP
        for dopasowanie in WZORZEC_DROP.finditer(bez_komentarzy):
            nazwa = dopasowanie.group(1).lower()
            # `DROP IF EXISTS` tuż przed `CREATE` w tym samym pliku to zwykłe
            # przygotowanie gruntu, nie skasowanie — stąd sprawdzenie kolejności.
            if nazwa in ostatnie and ostatnie[nazwa][1] == plik.name:
                continue
            skasowane[nazwa] = plik.name
            ostatnie.pop(nazwa, None)
    return ostatnie, skasowane


def _kontrola_wlasna() -> bool:
    """Czy bramka W OGÓLE rozróżnia trzy przypadki, o które tu chodzi.

    Bez tego zielony wynik znaczyłby tylko tyle, że skrypt się nie wywrócił.
    W tym repozytorium pięć razy w jednej sesji zielono brało się z narzędzia,
    które nie działało — stąd kontrola przed właściwym przebiegiem.
    """
    global KATALOG
    prawdziwy = KATALOG
    katalog = Path(tempfile.mkdtemp(prefix="kontrola-dryfu-"))
    try:
        (katalog / "20200101000000_a.sql").write_text(
            "CREATE OR REPLACE FUNCTION public.zostaje() RETURNS int LANGUAGE sql AS $$ SELECT 1; $$;\n"
            "CREATE OR REPLACE FUNCTION public.kasowana() RETURNS int LANGUAGE sql AS $$ SELECT 2; $$;\n"
            "CREATE OR REPLACE FUNCTION public.wraca() RETURNS int LANGUAGE sql AS $$ SELECT 3; $$;\n",
            encoding="utf-8")
        (katalog / "20200102000000_b.sql").write_text(
            "DROP FUNCTION IF EXISTS public.kasowana();\n"
            "DROP FUNCTION IF EXISTS public.wraca();\n",
            encoding="utf-8")
        (katalog / "20200103000000_c.sql").write_text(
            "CREATE OR REPLACE FUNCTION public.wraca() RETURNS int LANGUAGE sql AS $$ SELECT 4; $$;\n",
            encoding="utf-8")

        KATALOG = katalog
        repo, skasowane = z_migracji()
    finally:
        KATALOG = prawdziwy
        shutil.rmtree(katalog, ignore_errors=True)

    bledy = []
    if "zostaje" not in repo:
        bledy.append("zwykła funkcja zniknęła z zestawienia")
    if "kasowana" in repo or "kasowana" not in skasowane:
        bledy.append("DROP nie został zauważony — fałszywe alarmy wrócą")
    if "wraca" not in repo:
        bledy.append("CREATE po DROPie nie unieważnił skasowania")

    if bledy:
        print("❌ KONTROLA WŁASNA PADŁA — wynik na prawdziwych migracjach jest bez wartości:")
        for b in bledy:
            print(f"     {b}")
        return False
    return True


def main() -> int:
    if len(sys.argv) < 2:
        print("Podaj plik ze stanem bazy (JSON z pól nazwa/cialo).", file=sys.stderr)
        return 2

    if not _kontrola_wlasna():
        return 2

    dane = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    wiersze = dane["rows"] if isinstance(dane, dict) and "rows" in dane else dane
    baza = {w["nazwa"].lower(): w.get("cialo") or "" for w in wiersze}

    repo, skasowane = z_migracji()

    dryf: list[tuple[str, str]] = []
    brakuje: list[str] = []
    for nazwa, (cialo_repo, plik) in sorted(repo.items()):
        if nazwa not in baza:
            brakuje.append(f"{nazwa} (ostatnio w {plik})")
            continue
        if znormalizuj(baza[nazwa]) != cialo_repo:
            dryf.append((nazwa, plik))

    nieznane = sorted(set(baza) - set(repo))

    print(f"funkcji w migracjach: {len(repo)}, w bazie: {len(baza)}")

    if brakuje:
        print(f"\n⚠️  W MIGRACJACH SĄ, W BAZIE ICH NIE MA ({len(brakuje)}):")
        for b in brakuje:
            print(f"     {b}")

    if nieznane:
        print(f"\nℹ️  W bazie, ale nie w migracjach ({len(nieznane)}) — powstały poza repozytorium:")
        print("     " + ", ".join(nieznane[:12]) + (" …" if len(nieznane) > 12 else ""))

    if dryf:
        print(f"\n❌ DRYF — baza ma INNĄ TREŚĆ niż ostatnia migracja ({len(dryf)}):")
        for nazwa, plik in dryf:
            print(f"     {nazwa:44} ostatnio wgrana przez {plik}")
        print("\n   Funkcja mogła zostać nadpisana poza repozytorium. Sprawdź, czy to")
        print("   świadoma zmiana — jeśli nie, wgraj tamtą migrację ponownie.")
        return 1

    print("\n✅ Wszystkie funkcje z migracji mają w bazie tę samą treść.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
