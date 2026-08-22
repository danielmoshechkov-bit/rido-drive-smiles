#!/usr/bin/env python3
"""Czy nowa funkcja ruszająca salda albo dostęp jest odcięta od klienta.

═══════════════════════════════════════════════════════════════════════════════
POWÓD (22.08.2026)
═══════════════════════════════════════════════════════════════════════════════
Siedemnaście funkcji `SECURITY DEFINER` zmieniających salda było wywoływalnych
przez `authenticated`, a dwanaście z nich nawet przez `anon`. Wśród nich
`grant_sms_credits`, `credit_welcome_bonus`, `billing_wydaj_paczke`
i `complete_referral_on_first_purchase` — program poleceń zamknięty na poziomie
tabeli, z otwartą funkcją obok.

Przyczyna: pisaliśmy

    REVOKE ALL ON FUNCTION x FROM public;
    GRANT EXECUTE ON FUNCTION x TO service_role;

i uznawaliśmy sprawę za zamkniętą. `PUBLIC` w PostgreSQL to osobne uprawnienie
domyślne. Supabase nadaje `EXECUTE` rolom `anon` i `authenticated` JAWNIE, dla
każdej funkcji w schemacie `public` — a odebranie `PUBLIC` tych nadań nie rusza.

Linijka wyglądała jak zamknięcie i nim nie była. Przez trzy tygodnie.

═══════════════════════════════════════════════════════════════════════════════
CO SPRAWDZA
═══════════════════════════════════════════════════════════════════════════════
Dla każdej migracji: jeśli tworzy funkcję, której ciało PISZE do tabeli
pieniężnej albo zmienia dostęp, to ta sama migracja musi zawierać `REVOKE`
wymieniający `anon` I `authenticated` z nazwy.

Kontrola jest STATYCZNA — czyta pliki, nie bazę. Nie zastąpi sprawdzenia
uprawnień na produkcji, ale łapie wzorzec w chwili, gdy powstaje, czyli
w przeglądzie zmian. Sprawdzenie na żywej bazie:

    SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef;
"""
import re
import sys
from pathlib import Path

KATALOG = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

# Migracja, która odcięła wszystkie zastane funkcje hurtem.
#
# Wcześniejszych plików NIE sprawdzamy — nie dlatego, że były dobre, tylko
# dlatego, że są już naprawione w bazie, a przenumerowanie albo poprawianie
# wykonanych migracji jest gorsze od samego problemu. Kontrola ma pilnować,
# żeby NIE DOSZŁY NOWE, a nie zmuszać do naprawiania przeszłości — tak samo
# jak kontrola numerów wersji.
#
# Gdyby ktoś chciał sprawdzić stan faktyczny, a nie pliki, zapytanie jest
# w nagłówku niżej.
OD_WERSJI = "20260822185000"

# Funkcje zamknięte hurtem przez tę migrację. Wymienione z nazwy, bo numer
# wersji nie porządkuje ich chronologicznie: `20260823090000_ksiega_rejestr_decyzji`
# ma wyższy numer, a powstała WCZEŚNIEJ niż poprawka.
#
# Ponowne `CREATE OR REPLACE` na którejkolwiek z nich zachowuje uprawnienia
# (PostgreSQL nie resetuje ACL przy podmianie ciała), więc zostają zamknięte.
ZAMKNIETE_ZBIORCZO = {
    "billing_konczy_sie_trial", "billing_wydaj_paczke", "billing_wygas_porzucone",
    "billing_zejdz_do_read_only", "billing_zwrot", "complete_referral_on_first_purchase",
    "credit_welcome_bonus", "demo_sms_zapisz", "grant_sms_credits",
    "link_referral_on_signup", "onboarding_pojazd_za_darmo", "przyznaj_pakiet_startowy",
    "sms_wygas_paczki", "voice_nadaj_minuty", "voice_wyzeruj_minuty", "zwroc_sms_credit",
    "deduct_sms_credit", "deduct_vehicle_lookup_credit", "billing_znacznik_karencji",
    # Domknięta osobno migracją 20260822200000 — powstała po poprawce zbiorczej,
    # tym samym nieskutecznym wzorcem `REVOKE ... FROM public`.
    "przyznaj_start_rido_ai",
}

# Tabele, których zapis znaczy „pieniądze albo dostęp".
TABELE = (
    "billing_addon_packs|billing_subscriptions|billing_orders|billing_usage|billing_plans|"
    "user_wallets|user_credits|vehicle_lookup_credits|sms_credit_ledger|referral_uses|"
    "workshop_onboarding_usage|coin_transactions|billing_plan_features"
)

RE_FUNKCJA = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\((.*?)\)\s*\n?\s*RETURNS",
    re.I | re.S)
RE_ZAPIS = re.compile(rf"(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?({TABELE})\b", re.I)

# Funkcje TYLKO ODCZYTUJĄCE, które celowo zostają otwarte dla klienta.
# Dopisanie czegokolwiek tutaj jest decyzją, nie formalnością.
WYJATKI: dict[str, str] = {
    "check_usage":
        "Tylko odczyt. Interfejs pyta o stan licznika przed pokazaniem przycisku; "
        "odcięcie zgasiłoby liczniki SMS, VIN i Rido AI w całym panelu.",
    "sms_dostepne":
        "Tylko odczyt, jak wyżej — liczba w pasku u góry.",
    "moze_pracowac":
        "Tylko odczyt. Stoi w politykach RLS trzydziestu tabel, więc MUSI być "
        "wykonywalna przez rolę, która te tabele czyta.",
    "wolno_dokanczac":
        "Tylko odczyt, jak wyżej — druga odpowiedź bramki w trybie dokończenia.",
    "billing_consume":
        "WYJĄTEK CZASOWY, nie docelowy. Woła ją front (`src/lib/ridoAi.ts`, "
        "Rido Wycena), więc odcięcie zgasiłoby działającą funkcję. Pobranie ma "
        "przenieść się do funkcji brzegowej — wtedy ten wpis znika. `anon` jest "
        "już odcięty; zostaje `authenticated`.",
    "billing_wylicz_doladowanie":
        "Tylko odczyt — wycena suwaka doładowań przed przejściem do płatności.",
    "billing_cena_miesiaca":
        "Tylko odczyt — wycena miesiąca przed przejściem do płatności.",
    "billing_do_ostrzezenia":
        "Tylko odczyt; i tak nadana wyłącznie `service_role`.",
}


def main() -> int:
    problemy: list[tuple[str, str]] = []

    for plik in sorted(KATALOG.glob("*.sql")):
        if plik.name.split("_", 1)[0] < OD_WERSJI:
            continue
        tresc = plik.read_text(encoding="utf-8", errors="replace")
        bez_komentarzy = re.sub(r"--[^\n]*", " ", tresc)

        for m in RE_FUNKCJA.finditer(bez_komentarzy):
            nazwa = m.group(1)
            if nazwa in WYJATKI or nazwa in ZAMKNIETE_ZBIORCZO:
                continue

            # Ciało funkcji: od jej początku do końca pliku wystarczy — szukamy,
            # czy gdziekolwiek dalej pisze do tabeli pieniężnej przed kolejną
            # definicją funkcji.
            reszta = bez_komentarzy[m.end():]
            nastepna = RE_FUNKCJA.search(reszta)
            cialo = reszta[: nastepna.start()] if nastepna else reszta
            if not RE_ZAPIS.search(cialo):
                continue

            # Ta sama migracja musi wymieniać obie role z nazwy.
            revoke = re.search(
                rf"REVOKE\s+.*?ON\s+FUNCTION\s+(?:public\.)?{re.escape(nazwa)}\s*\(.*?FROM\s+([^;]+);",
                bez_komentarzy, re.I | re.S)
            role = (revoke.group(1) if revoke else "").lower()
            if "anon" not in role or "authenticated" not in role:
                problemy.append((plik.name, nazwa))

    if not problemy:
        print(f"zielono — każda funkcja pisząca do tabel pieniężnych odcina "
              f"`anon` i `authenticated` z nazwy")
        print(f"(sprawdzane od wersji {OD_WERSJI}; wcześniejsze zamknęła migracja zbiorcza, "
              f"{len(WYJATKI)} wyjątków tylko-do-odczytu)")
        return 0

    print("FUNKCJE PISZĄCE DO TABEL PIENIĘŻNYCH BEZ ODCIĘCIA anon/authenticated:\n")
    for plik, nazwa in problemy:
        print(f"  {nazwa}\n      {plik}")
    print("\n`REVOKE ... FROM public` NIE WYSTARCZY — Supabase nadaje EXECUTE")
    print("rolom `anon` i `authenticated` jawnie. Wymień je z nazwy:")
    print("\n    REVOKE ALL ON FUNCTION public.nazwa(...) FROM PUBLIC, anon, authenticated;")
    print("    GRANT EXECUTE ON FUNCTION public.nazwa(...) TO service_role;")
    print("\nJeśli funkcja tylko odczytuje i ma zostać otwarta — dopisz ją do WYJATKI")
    print("w tym pliku, z uzasadnieniem.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
