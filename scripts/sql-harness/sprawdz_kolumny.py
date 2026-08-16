"""
Wykrywa odwołania do KOLUMN, których w tabeli nie ma.

Powód powstania (16.08.2026): trzy razy w jednej sesji napisałem nazwę kolumny
z pamięci zamiast sprawdzić ją w migracji tworzącej tabelę — `referrer_id`
zamiast `referrer_user_id`, `amount` zamiast `credits`, `created_at` zamiast
`przyznany_at`. Za każdym razem parser składni przechodził na zielono, bo
NIE ZNA SCHEMATU, i błąd wychodził dopiero przy uruchomieniu na produkcji.

Ta kontrola buduje schemat z CREATE TABLE i ALTER TABLE ADD COLUMN w całej
historii migracji, a potem sprawdza odwołania w plikach wskazanych w wywołaniu.

ŚWIADOME OGRANICZENIA — czego ta kontrola NIE zrobi:
  * nie rozwija aliasów tabel poza prostymi przypadkami `FROM tabela alias`,
  * nie zna kolumn tabel spoza migracji (auth.users, tabele Lovable),
  * nie sprawdza typów — od tego jest sprawdz_enumy.py i uruchomienie.
Zgłoszenie z tej kontroli to POWÓD DO SPRAWDZENIA, nie wyrok.
"""
import re, sys, pathlib

KATALOG = pathlib.Path(__file__).resolve().parents[2] / 'supabase' / 'migrations'

# Tabele, których nie opisują nasze migracje — nie mamy jak znać ich kolumn.
POMIJANE = {'users', 'objects', 'buckets', 'job', 'decrypted_secrets'}


def zbuduj_schemat(do_pliku: str | None = None) -> dict[str, set[str]]:
    """
    Schemat W MOMENCIE danej migracji, nie po wszystkich.

    Bez tego kontrola zgłasza fałszywe trafienia: migracja z 16.08 poprawnie
    używa kolumny, którą migracja z 19.08 dopiero usuwa. Wersja bez tego
    parametru zgłosiła cztery takie „błędy” na `sms_balance`.
    """
    schemat: dict[str, set[str]] = {}
    for plik in sorted(KATALOG.glob('*.sql')):
        if do_pliku and plik.name > do_pliku:
            break
        tekst = plik.read_text(encoding='utf-8', errors='ignore')
        tekst = re.sub(r'--[^\n]*', '', tekst)

        for m in re.finditer(
            r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)\s*\((.*?)\n\s*\);",
            tekst, re.S | re.I,
        ):
            tabela, ciało = m.group(1).lower(), m.group(2)
            kolumny = schemat.setdefault(tabela, set())
            for linia in ciało.split('\n'):
                linia = linia.strip()
                if not linia or linia.startswith(('CONSTRAINT', 'PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'EXCLUDE')):
                    continue
                dopasowanie = re.match(r'"?(\w+)"?\s+\w', linia)
                if dopasowanie:
                    kolumny.add(dopasowanie.group(1).lower())

        # `ALTER TABLE x ADD COLUMN a ..., ADD COLUMN b ...` — jedna instrukcja,
        # wiele kolumn. Pierwsza wersja łapała tylko pierwszą i przez to
        # zgłaszała jako brakujące kolumny, które istnieją.
        for m in re.finditer(
            r"ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)\s+(.*?);", tekst, re.S | re.I,
        ):
            tabela, reszta = m.group(1).lower(), m.group(2)
            for k in re.finditer(r"ADD COLUMN\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?", reszta, re.I):
                schemat.setdefault(tabela, set()).add(k.group(1).lower())

        for m in re.finditer(
            r"ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)\s+DROP COLUMN\s+(?:IF EXISTS\s+)?\"?(\w+)\"?",
            tekst, re.I,
        ):
            schemat.get(m.group(1).lower(), set()).discard(m.group(2).lower())

    return schemat


def sprawdz(sciezki: list[str], schemat: dict[str, set[str]]) -> list[str]:
    problemy = []
    for sciezka in sciezki:
        tekst = pathlib.Path(sciezka).read_text(encoding='utf-8')
        tekst = re.sub(r'--[^\n]*', '', tekst)
        nazwa = pathlib.Path(sciezka).name

        # INSERT INTO tabela (kolumny...)
        for m in re.finditer(r"INSERT INTO\s+(?:public\.)?(\w+)\s*\(([^)]*)\)", tekst, re.I):
            tabela = m.group(1).lower()
            if tabela in POMIJANE or tabela not in schemat:
                continue
            for kol in re.findall(r'\b(\w+)\b', m.group(2)):
                if kol.lower() not in schemat[tabela]:
                    problemy.append(f"{nazwa}: INSERT INTO {tabela} — nie ma kolumny „{kol}”")

        # UPDATE tabela SET kolumna = ...
        for m in re.finditer(r"UPDATE\s+(?:public\.)?(\w+)\s+SET\s+(.*?)(?:\bWHERE\b|\bFROM\b|;)", tekst, re.I | re.S):
            tabela = m.group(1).lower()
            if tabela in POMIJANE or tabela not in schemat:
                continue
            for kol in re.findall(r"(?:^|,)\s*\"?(\w+)\"?\s*=", m.group(2)):
                if kol.lower() not in schemat[tabela]:
                    problemy.append(f"{nazwa}: UPDATE {tabela} — nie ma kolumny „{kol}”")

        # alias.kolumna, gdy alias da się rozwinąć z FROM/JOIN
        # Alias użyty w pliku dla DWÓCH różnych tabel jest nierozstrzygalny bez
        # parsowania zakresów — pomijamy go zamiast zgadywać. („p” bywa raz
        # `billing_plans`, raz `billing_addon_packs”.)
        kandydaci: dict[str, set[str]] = {}
        for m in re.finditer(r"\b(?:FROM|JOIN|UPDATE)\s+(?:public\.)?(\w+)\s+(?:AS\s+)?(\w+)\b", tekst, re.I):
            tabela, alias = m.group(1).lower(), m.group(2).lower()
            if alias not in {'set', 'where', 'on', 'using', 'select', 'values', 'as', 'join', 'left', 'inner'}:
                kandydaci.setdefault(alias, set()).add(tabela)
        aliasy = {a: list(t)[0] for a, t in kandydaci.items() if len(t) == 1}
        for alias, tabela in aliasy.items():
            if tabela in POMIJANE or tabela not in schemat:
                continue
            for m in re.finditer(rf"\b{re.escape(alias)}\.(\w+)\b", tekst):
                kol = m.group(1).lower()
                if kol not in schemat[tabela] and kol != '*':
                    problemy.append(f"{nazwa}: {alias}.{kol} — tabela {tabela} nie ma kolumny „{kol}”")

    # Powtórzenia tego samego problemu nie wnoszą nic.
    return sorted(set(problemy))


if __name__ == '__main__':
    problemy = []
    for sciezka in sys.argv[1:]:
        nazwa = pathlib.Path(sciezka).name
        problemy += sprawdz([sciezka], zbuduj_schemat(do_pliku=nazwa))
    problemy = sorted(set(problemy))
    if problemy:
        print(f"\n🔴 {len(problemy)} podejrzanych odwołań:\n")
        for p in problemy:
            print(f"  {p}")
        sys.exit(1)
    print("\nzielono — wszystkie kolumny znalezione w schemacie")
