#!/usr/bin/env bash
# Nowy plik migracji ze znacznikiem czasu CO DO SEKUNDY.
#
# ═══════════════════════════════════════════════════════════════════════════
# PO CO
# ═══════════════════════════════════════════════════════════════════════════
# Numer wybierany ręcznie to zawsze okrągła godzina — 20260823160000. Dwie
# sesje pracujące tego samego dnia wybierają ten sam numer, bo obie sięgają po
# najbliższą wolną godzinę. Zdarzyło się to TRZY RAZY. Git tego nie widzi,
# bo pliki mają różne nazwy; kolizja wychodzi dopiero przy scaleniu.
#
# Sekunda rozwiązuje to bez umawiania się: dwie sesje musiałyby założyć plik
# w tej samej sekundie, a i wtedy kontrola niżej to zatrzyma.
#
# Użycie:
#   ./scripts/nowa-migracja.sh dane_nabywcy_do_faktury
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Podaj nazwę migracji, np.: $0 dane_nabywcy_do_faktury" >&2
  exit 1
fi

NAZWA="$1"
if ! printf '%s' "$NAZWA" | grep -qE '^[a-z0-9_]+$'; then
  echo "Nazwa może zawierać wyłącznie małe litery, cyfry i podkreślenia." >&2
  exit 1
fi

KATALOG="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
ZNACZNIK="$(date -u +%Y%m%d%H%M%S)"
PLIK="$KATALOG/${ZNACZNIK}_${NAZWA}.sql"

# Znacznik zajęty — także przez plik o INNEJ nazwie. To jest ten przypadek,
# którego git nie zgłasza.
if compgen -G "$KATALOG/${ZNACZNIK}_*.sql" > /dev/null; then
  echo "Znacznik $ZNACZNIK jest już zajęty:" >&2
  ls -1 "$KATALOG/${ZNACZNIK}"_*.sql >&2
  echo "Odczekaj sekundę i uruchom ponownie." >&2
  exit 1
fi

cat > "$PLIK" <<NAGLOWEK
-- <jedno zdanie: co ta migracja zmienia i dlaczego>
--
-- Zanim uznasz ją za skończoną:
--   1. kto czyta te kolumny? grep po nazwie w src/ i supabase/functions/
--   2. co znaczyła PUSTKA, a co znaczy teraz?
--   3. czy dokładasz drugi klucz obcy do tej samej tabeli? (psuje zagnieżdżenia PostgREST)
--   4. czy wartość domyślna wchodzi w skład indeksu albo warunku?
--   5. co z wierszami, które powstały PRZED tą zmianą?

BEGIN;

-- …

COMMIT;

NOTIFY pgrst, 'reload schema';
NAGLOWEK

echo "$PLIK"
