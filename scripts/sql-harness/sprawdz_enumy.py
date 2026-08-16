"""
Wykrywa porównania kolumny ENUMOWEJ z parametrem/zmienną tekstową bez rzutowania.

Powód powstania: migracja G4 przeszła trzy przebiegi parsera składni i padła
na produkcji z `operator does not exist: billing_product_line = text`.
Parser skladni NIE ZNA SCHEMATU, więc typów nie sprawdza — ta kontrola
uzupełnia dokładnie tę lukę.
"""
import re, sys, pathlib

MIGRACJE = pathlib.Path('/Users/moshechkov/rido-pay-lock/supabase/migrations')

# 1. Nazwy typów enum
typy = set()
for f in MIGRACJE.glob('*.sql'):
    t = f.read_text(encoding='utf-8', errors='ignore')
    for m in re.finditer(r"CREATE TYPE\s+(?:public\.)?(\w+)\s+AS ENUM", t, re.I):
        typy.add(m.group(1).lower())

# 2. Kolumny zadeklarowane tymi typami (CREATE TABLE i ADD COLUMN)
kolumny = {}   # nazwa kolumny -> typ enum
for f in MIGRACJE.glob('*.sql'):
    t = f.read_text(encoding='utf-8', errors='ignore')
    t = re.sub(r'--[^\n]*', '', t)
    for m in re.finditer(r"^\s*(\w+)\s+(?:public\.)?(\w+)\b", t, re.M):
        kol, typ = m.group(1).lower(), m.group(2).lower()
        if typ in typy:
            kolumny[kol] = typ
    for m in re.finditer(r"ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)\s+(?:public\.)?(\w+)", t, re.I):
        kol, typ = m.group(1).lower(), m.group(2).lower()
        if typ in typy:
            kolumny[kol] = typ

print(f"typów enum: {len(typy)}, kolumn enumowych: {len(kolumny)}")
print("  kolumny:", ", ".join(sorted(kolumny)))

# 3. Skan wskazanych plików
problemy = []
for sciezka in sys.argv[1:]:
    t = pathlib.Path(sciezka).read_text(encoding='utf-8')
    bez_kom = re.sub(r'--[^\n]*', lambda m: ' ' * len(m.group(0)), t)
    for kol, typ in kolumny.items():
        # kolumna = COŚ, gdzie COŚ nie jest literałem w apostrofach i nie ma rzutowania
        for m in re.finditer(rf"(?<![\w.]){re.escape(kol)}\s*(=|<>|!=)\s*([^\s;,)]+)", bez_kom):
            prawa = m.group(2)
            if prawa.startswith("'"):        # literał — Postgres dopasuje typ
                continue
            if '::' in prawa or '::' in bez_kom[max(0,m.start()-25):m.start()]:
                continue
            if prawa.lower() in ('null', 'true', 'false', 'any', 'now()'):
                continue
            linia = t[:m.start()].count('\n') + 1
            problemy.append((sciezka, linia, kol, typ, m.group(0).strip()))

if problemy:
    print("\n🔴 PORÓWNANIA ENUM BEZ RZUTOWANIA:")
    for s, l, k, t_, frag in problemy:
        print(f"  {s.split('/')[-1]}:{l}  {k} ({t_})  →  {frag}")
    sys.exit(1)
print("\nzielono — brak porównań enum bez rzutowania")
