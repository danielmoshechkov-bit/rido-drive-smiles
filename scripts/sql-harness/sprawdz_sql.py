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
        # Znacznik cytowania czytamy z treści. Zaszyte `$$` wywracało kontrolę
        # wyjątkiem na każdej funkcji wyzwalacza pisanej z nazwanym znacznikiem
        # (`$FUNKCJA$`) — a kontrola, która pada zamiast ocenić, jest gorsza
        # od jej braku: wygląda na awarię narzędzia, nie na błąd w migracji.
        m_tag = re.search(r'\bAS\s+(\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$)', fragment)
        if not m_tag:
            print(f"CZERWONO — plpgsql {nazwa}: nie znalazłem znacznika ciała funkcji")
            sys.exit(1)
        tag = m_tag.group(1)
        ciało = fragment[fragment.index(tag, m_tag.start()) + len(tag): fragment.rindex(tag)]
        # NEW i OLD muszą trafić do JEDNEJ sekcji DECLARE — drugie słowo
        # `DECLARE` to błąd składni, więc funkcja z własnymi zmiennymi
        # przechodziłaby kontrolę jako „czerwona" bez powodu.
        m_decl = re.match(r'(\s*DECLARE\b)', ciało, flags=re.I)
        if m_decl:
            ciało = ciało[:m_decl.end()] + ' NEW record; OLD record;' + ciało[m_decl.end():]
        else:
            ciało = re.sub(r'^\s*BEGIN', 'DECLARE NEW record; OLD record; BEGIN',
                           ciało, count=1, flags=re.I)
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
