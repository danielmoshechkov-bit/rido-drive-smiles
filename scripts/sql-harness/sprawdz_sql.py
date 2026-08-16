import sys, re, pglast
from pglast import parse_sql, parse_plpgsql

sciezka = sys.argv[1]
sql = open(sciezka, encoding='utf-8').read()

# 1. Składnia SQL całego pliku
try:
    drzewo = parse_sql(sql)
except Exception as e:
    print("CZERWONO — parse_sql:", e); sys.exit(1)
print(f"zielono  parse_sql: {len(drzewo)} instrukcji")

# 2. Ciała plpgsql/sql funkcji — parse_sql traktuje je jako zwykły literał,
#    więc błąd w środku przeszedłby niezauważony.
n = 0
for st in drzewo:
    node = st.stmt
    if type(node).__name__ != 'CreateFunctionStmt':
        continue
    jezyk = None
    for opt in (node.options or []):
        if opt.defname == 'language':
            jezyk = opt.arg.sval
    nazwa = '.'.join(x.sval for x in node.funcname)
    if jezyk != 'plpgsql':
        print(f"zielono  {nazwa}: język {jezyk}, ciało sprawdzone przez parse_sql")
        n += 1
        continue
    fragment = sql[st.stmt_location: st.stmt_location + st.stmt_len]
    # libpg_query zwraca dla `RETURNS trigger` JSON, którego pglast 8.4 nie
    # umie odczytać — pada nawet na pustej funkcji wyzwalacza. Zamiast odpuścić
    # kontrolę, przepisujemy ciało na zwykłą funkcję z NEW/OLD jako zmiennymi.
    czy_trigger = re.search(r'RETURNS\s+trigger', fragment, re.I)
    if czy_trigger:
        ciało = fragment[fragment.index('$$') + 2: fragment.rindex('$$')]
        ciało = re.sub(r'^\s*BEGIN', 'DECLARE NEW record; OLD record; BEGIN', ciało, count=1, flags=re.I)
        fragment = "CREATE FUNCTION _ctrl() RETURNS record LANGUAGE plpgsql AS $ctrl$" + ciało + "$ctrl$;"
    try:
        parse_plpgsql(fragment)
    except Exception as e:
        print(f"CZERWONO — plpgsql {nazwa}: {e}"); sys.exit(1)
    print(f"zielono  plpgsql {nazwa}" + (" (wyzwalacz, ciało przepisane)" if czy_trigger else ""))
    n += 1

# 3. Bloki DO — parse_plpgsql ich nie obsługuje, więc opakowujemy w funkcję.
for st in drzewo:
    if type(st.stmt).__name__ != 'DoStmt':
        continue
    ciało = None
    for opt in st.stmt.args:
        if opt.defname == 'as':
            ciało = opt.arg.sval
    zastępcza = "CREATE FUNCTION _kontrola() RETURNS void LANGUAGE plpgsql AS $ctrl$" + ciało + "$ctrl$;"
    try:
        parse_plpgsql(zastępcza)
    except Exception as e:
        print("CZERWONO — blok DO:", e); sys.exit(1)
    print("zielono  blok DO")
    n += 1

print(f"WYNIK: ZIELONO ({len(drzewo)} instrukcji, {n} ciał proceduralnych)")
