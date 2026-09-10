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


def z_migracji() -> dict[str, tuple[str, str]]:
    """nazwa -> (znormalizowane ciało, plik). Wygrywa NAJPÓŹNIEJSZA migracja."""
    ostatnie: dict[str, tuple[str, str]] = {}
    for plik in sorted(KATALOG.glob("*.sql")):
        tresc = plik.read_text(encoding="utf-8", errors="replace")
        for dopasowanie in WZORZEC.finditer(tresc):
            nazwa = dopasowanie.group(1).lower()
            ostatnie[nazwa] = (znormalizuj(dopasowanie.group(3)), plik.name)
    return ostatnie


def main() -> int:
    if len(sys.argv) < 2:
        print("Podaj plik ze stanem bazy (JSON z pól nazwa/cialo).", file=sys.stderr)
        return 2

    dane = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    wiersze = dane["rows"] if isinstance(dane, dict) and "rows" in dane else dane
    baza = {w["nazwa"].lower(): w.get("cialo") or "" for w in wiersze}

    repo = z_migracji()

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
