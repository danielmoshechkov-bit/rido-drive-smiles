#!/usr/bin/env python3
"""Czy któryś numer wersji migracji nosi więcej niż jeden plik.

POWÓD (21.08.2026): numer `20260821090000` nosiły TRZY różne migracje naraz —
`paczki_niezaleznie_od_planu`, `rido_ai_jedna_pula` (z drugiej sesji) i mój
`wariant_a_1_trial_wygasa`. Git tego nie widzi, bo nazwy plików się różnią,
więc scalenie przechodzi bez słowa, a narzędzie migracyjne czyta wersję
z prefiksu i drugi plik o tym samym numerze może uznać za już zastosowany.

ZAKRES CELOWO ZAWĘŻONY DO PEŁNYCH ZNACZNIKÓW CZASU (14 cyfr).

Pierwsza wersja tej kontroli zgłaszała też prefiksy samą datą (`20260628`,
`20260714`, …) i wypisała ich trzydzieści. To był fałszywy alarm i dowód
przeciwko mojej własnej tezie: w tym repozytorium dziewięć migracji z 28 czerwca
i dziesięć z 14 lipca dzieli po jednym prefiksie, a wszystkie są na produkcji.
Gdyby narzędzie naprawdę pomijało powtórzony prefiks, połowa modułu fiskalnego
i poprawki bezpieczeństwa nigdy by się nie wykonały.

Data jako prefiks jest więc w tym repozytorium przyjętą konwencją i zgłaszamy ją
najwyżej jako informację. Pilnujemy uniqueness tam, gdzie prefiks JEST wersją:
przy pełnym znaczniku czasu, bo tylko on obiecuje jednoznaczność.

Ta kontrola nie ma stanu i nie zna historii — porównuje wyłącznie nazwy plików
w katalogu, więc działa też dla migracji, które przyszły z zewnątrz.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

KATALOG = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

# Zderzenia, które JUŻ SĄ na produkcji. Przenumerowanie zastosowanej migracji
# każe narzędziu uruchomić ją ponownie, więc te zostają jako są — a kontrola
# ma pilnować, żeby nie doszły nowe, nie zmuszać do naprawiania przeszłości.
# Dopisanie czegokolwiek do tej listy jest decyzją, nie formalnością.
ZNANE_I_WYKONANE = {
    "20260619140000",  # fix1_workspace_doc_rls_leak + workshop_bookings_rls_lockdown
    "20260821090000",  # paczki_niezaleznie_od_planu + rido_ai_jedna_pula (druga sesja)
}
# Prefiks to wiodące cyfry przed pierwszym podkreśleniem: 20260821090000_nazwa.sql
PREFIKS = re.compile(r"^(\d+)_")


def main() -> int:
    if not KATALOG.is_dir():
        print(f"nie ma katalogu {KATALOG}", file=sys.stderr)
        return 2

    wg_numeru: dict[str, list[str]] = defaultdict(list)
    wg_daty: dict[str, list[str]] = defaultdict(list)
    bez_numeru: list[str] = []

    for plik in sorted(KATALOG.glob("*.sql")):
        dopasowanie = PREFIKS.match(plik.name)
        if not dopasowanie:
            bez_numeru.append(plik.name)
            continue
        numer = dopasowanie.group(1)
        # Tylko pełny znacznik czasu jest WERSJĄ. Prefiks samą datą to w tym
        # repozytorium konwencja porządkowa — patrz opis u góry pliku.
        if len(numer) == 14:
            wg_numeru[numer].append(plik.name)
        else:
            wg_daty[numer].append(plik.name)

    zderzenia = {
        n: p for n, p in wg_numeru.items()
        if len(p) > 1 and n not in ZNANE_I_WYKONANE
    }
    stare = sum(1 for n in wg_numeru if n in ZNANE_I_WYKONANE and len(wg_numeru[n]) > 1)

    if stare:
        print(f"(informacja: {stare} zderzeń sprzed tej kontroli zostaje — "
              f"migracje są wykonane, przenumerowanie kazałoby uruchomić je ponownie)")

    powtorzone_daty = sum(1 for p in wg_daty.values() if len(p) > 1)
    if powtorzone_daty:
        print(f"(informacja: {powtorzone_daty} dat nosi po kilka migracji — "
              f"to przyjęta konwencja tego repozytorium, nie błąd)")

    if bez_numeru:
        print("Pliki bez numeru wersji (do sprawdzenia ręcznie):")
        for nazwa in bez_numeru:
            print(f"  {nazwa}")
        print()

    if not zderzenia:
        print(f"zielono — {len(wg_numeru)} pełnych znaczników czasu, każdy nosi jeden plik")
        return 0

    print("ZDERZENIE ZNACZNIKÓW CZASU — narzędzie migracyjne może pominąć drugi plik:\n")
    for numer in sorted(zderzenia):
        print(f"  {numer}:")
        for nazwa in sorted(zderzenia[numer]):
            print(f"      {nazwa}")
    print("\nNadaj nowemu plikowi wolny numer. Już wykonanych nie przenumerowuj —")
    print("zmiana nazwy zastosowanej migracji każe narzędziu uruchomić ją ponownie.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
