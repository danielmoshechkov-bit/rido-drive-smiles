#!/usr/bin/env bash
# =============================================================================
# diagnose-call.sh — pelna diagnostyka jednej rozmowy agenta glosowego.
#
#   ./scripts/diagnose-call.sh conv_8501kz7ks42ze1hva18zp5d13srn
#
# Zastepuje reczne grzebanie w trzech miejscach po kazdym telefonie: laczy
# raport ElevenLabs, logi Edge Functions i stan bazy w jeden wydruk.
#
# Wymaga w .env.local (w korzeniu repo):
#   ELEVENLABS_API_KEY     — odczyt rozmowy z ElevenLabs (tylko GET)
#   SUPABASE_ACCESS_TOKEN  — logi funkcji + zapytania do bazy (Management API)
#
# Skrypt jest WYLACZNIE do odczytu. Nie zmienia konfiguracji ani danych.
# =============================================================================
set -uo pipefail

CONV="${1:-}"
if [ -z "$CONV" ]; then
  echo "uzycie: $0 <conversation_id>"
  echo "przyklad: $0 conv_8501kz7ks42ze1hva18zp5d13srn"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
[ -f "$ENV_FILE" ] || { echo "BRAK $ENV_FILE"; exit 1; }
set -a; . "$ENV_FILE"; set +a

PROJECT_REF="${SUPABASE_PROJECT_REF:-wclrrytmrscqvsyxyvnn}"
: "${ELEVENLABS_API_KEY:?brak ELEVENLABS_API_KEY w .env.local}"
: "${SUPABASE_ACCESS_TOKEN:?brak SUPABASE_ACCESS_TOKEN w .env.local}"
command -v jq >/dev/null || { echo "brak jq"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

hr()  { printf '%s\n' "-------------------------------------------------------------------------------"; }
sec() { echo; hr; echo "$1"; hr; }

# --- zrodla danych ------------------------------------------------------------
db() {  # SQL na stdin -> JSON na stdout
  curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    --data "$(jq -Rn --arg q "$(cat)" '{query:$q}')"
}

fnlogs() {  # $1=function_id  $2=iso_start  $3=iso_end
  local sql="select function_logs.timestamp, event_message, metadata.execution_id
             from function_logs cross join unnest(metadata) as metadata
             where metadata.function_id = '$1' order by timestamp asc limit 500"
  curl -s -G "https://api.supabase.com/v1/projects/$PROJECT_REF/analytics/endpoints/logs.all" \
    --data-urlencode "sql=$sql" \
    --data-urlencode "iso_timestamp_start=$2" --data-urlencode "iso_timestamp_end=$3" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
}

# --- 0. rozmowa z ElevenLabs --------------------------------------------------
curl -s "https://api.elevenlabs.io/v1/convai/conversations/$CONV" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" > "$TMP/conv.json"

if ! jq -e '.transcript' "$TMP/conv.json" >/dev/null 2>&1; then
  echo "ElevenLabs nie zwrocil rozmowy $CONV:"
  jq -r '.detail // .' "$TMP/conv.json" 2>/dev/null | head -5
  exit 1
fi

T0=$(jq -r '.metadata.start_time_unix_secs' "$TMP/conv.json")
DUR=$(jq -r '.metadata.call_duration_secs' "$TMP/conv.json")
START_ISO=$(date -u -r "$((T0 - 15))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$((T0 - 15))" +%Y-%m-%dT%H:%M:%SZ)
END_ISO=$(date -u -r "$((T0 + DUR + 180))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@$((T0 + DUR + 180))" +%Y-%m-%dT%H:%M:%SZ)

echo "==============================================================================="
echo " DIAGNOSTYKA ROZMOWY  $CONV"
echo "==============================================================================="
jq -r '"  start        : " + (.metadata.start_time_unix_secs|strftime("%Y-%m-%d %H:%M:%S UTC"))
     + "\n  czas trwania : " + (.metadata.call_duration_secs|tostring) + " s"
     + "\n  zakonczenie  : " + (.metadata.termination_reason // "-")
     + "\n  jezyk        : " + (.metadata.main_language // "-")
     + "\n  tury         : " + (.transcript|length|tostring)
     + "\n  agent        : " + ((.agent_id // "-")|.[0:28]) + "..."' "$TMP/conv.json"

# --- pobranie logow -----------------------------------------------------------
FID_CHAT=c2840003-6b62-4864-9b70-5b0ef2c60bd4
FID_LLM=829e47f9-e92f-4736-ba9c-70228e7d3fcc
FID_TOOLS=52747c32-4fa3-4504-925b-820a01fa4bb2

fnlogs "$FID_CHAT"  "$START_ISO" "$END_ISO" > "$TMP/chat.json"
fnlogs "$FID_LLM"   "$START_ISO" "$END_ISO" > "$TMP/llm.json"
fnlogs "$FID_TOOLS" "$START_ISO" "$END_ISO" > "$TMP/tools.json"

# znormalizowane zdarzenia: {t (sek. od startu rozmowy), exec, ev (obiekt JSON), raw}
norm() {
  jq --argjson t0 "$T0" '[ .result[]?
    | { t: (.timestamp/1000000 - $t0),
        ts: (.timestamp/1000000),
        exec: (.execution_id[0:8]),
        raw: (.event_message|gsub("\n";" ")),
        ev: ((.event_message | capture("(?<j>\\{.*\\})") | .j | fromjson?) // null) }
    | select(.raw|test("booted|Listening|shutdown")|not) ]' "$1"
}
norm "$TMP/chat.json"  > "$TMP/chat.n.json"
norm "$TMP/llm.json"   > "$TMP/llm.n.json"
norm "$TMP/tools.json" > "$TMP/tools.n.json"

# UWAGA: execution_id to IZOLAT, nie zadanie. Ciepla instancja obsluguje wiele
# zadan pod tym samym identyfikatorem, wiec grupowanie po nim skleja rozne tury
# (widac to jako "narzedzia 8785 ms" obok "total 2851 ms" w jednym wierszu).
# Zadanie wyodrebniamy po znaczniku otwierajacym: dla chat to stage "prepare",
# dla llm stage "auth". Kazde wystapienie zaczyna nowe zadanie.
requests() {  # $1=plik znormalizowany  $2=stage otwierajacy
  jq --arg open "$2" '
    def pick($s): map(select(.ev.stage==$s)|.ev.duration_ms)|first;
    group_by(.exec)
    | map( sort_by(.ts)
         | reduce .[] as $e ([];
             if (length==0) or ($e.ev.stage == $open)
             then . + [[$e]] else (.[0:-1] + [(.[-1] + [$e])]) end) )
    | add
    | map({
        exec:  .[0].exec,
        t:     (map(.t)|min),
        prep:  pick("prepare"),
        auth:  pick("auth"),
        cfg:   pick("config"),
        ftxt:  pick("first_text"),
        mdl:   ([.[]|select(.ev.stage=="model_round")|.ev.duration_ms]|add),
        tls:   ([.[]|select(.ev.stage=="tool")|.ev.duration_ms]|add),
        tot:   pick("total"),
        ct:    (map(select(.ev.stage=="total")|.ev.client_tools)|first),
        trunc: (any(.[]; .ev.truncated == true)),
        names: ([.[]|select(.ev.stage=="tool")|(.ev.tool + (if .ev.ok then "" else "(BLAD)" end))]
                + [.[]|select(.ev.event=="client_tool_requested")|((.ev.tools|join(","))+"*")]),
        dead:  (any(.[]; .raw|test("connection closed")))
      })
    | sort_by(.t)' "$1"
}
requests "$TMP/chat.n.json" prepare > "$TMP/chat.req.json"
requests "$TMP/llm.n.json"  auth    > "$TMP/llm.req.json"

# tura = zadania startujace w odstepie < 3 s
CLUSTER='def cluster: reduce .[] as $r ([]; if (length==0) or (($r.t - (.[-1]|.[-1].t)) > 3)
                                            then . + [[$r]] else (.[0:-1] + [(.[-1] + [$r])]) end);'

# --- 1. rownolegle wykonania --------------------------------------------------
# Tura = grupa wykonan startujacych w odstepie < 3 s. Wiecej niz jedno
# execution_id w turze oznacza, ze ElevenLabs wystrzelil zadanie dwa razy,
# a kazde z nich ma pelne uprawnienia zapisu do bazy.
sec "1. ROWNOLEGLE WYKONANIA  (ma byc JEDNO execution_id na ture)"

jq -r "$CLUSTER"'
  cluster as $turns
  | ($turns | to_entries[]
      | "  tura " + ((.key+1)|tostring|(" "*(2-length))+.) + "   t=" + ((.value[0].t)|floor|tostring) + "s"
        + ("     "[0:(4-((.value[0].t)|floor|tostring|length))]) + "   "
        + (.value|length|tostring) + "x  ["
        + (.value|map(.exec)|join(", ")) + "]"
        + (if (.value|length) > 1 then "   <-- ROWNOLEGLE" else "" end)),
    "",
    "  razem tur: " + ($turns|length|tostring)
      + "   zadan: " + ($turns|map(length)|add|tostring)
      + "   tur z duplikatem: " + ($turns|map(select(length>1))|length|tostring)
' "$TMP/chat.req.json"

echo
echo "  to samo po stronie voice-agent-llm (wejscie z ElevenLabs):"
jq -r "$CLUSTER"'
  cluster
  | "  zadan z ElevenLabs: " + (map(length)|add|tostring)
    + "   tur: " + (length|tostring)
    + "   tur z duplikatem: " + (map(select(length>1))|length|tostring)
' "$TMP/llm.req.json"

ABORTED=$(jq -r '[.[] | select(.raw|test("connection closed before message completed"))] | length' "$TMP/chat.n.json")
echo "  przerwanych polaczen (ElevenLabs porzucil odpowiedz): $ABORTED"

# --- 2. os czasu tura po turze ------------------------------------------------
sec "2. OS CZASU  (kazde wykonanie voice-agent-chat)"
printf "  %-7s%-10s%-9s%-10s%-8s%-8s%-8s%s\n" "t" "exec" "prepare" "first_txt" "model" "tools" "total" "narzedzia"
jq -r '
  def pad(n): tostring as $s | ($s + " "*n)[0:n];
  .[]
  | "  " + (((.t|floor|tostring)+"s")|pad(7))
      + (.exec|pad(10))
      + ((.prep//"-")|pad(9))
      + ((.ftxt//"-")|pad(10))
      + ((.mdl//"-")|pad(8))
      + ((.tls//"-")|pad(8))
      + ((.tot//"URWANE")|pad(8))
      + (.names|join(" "))
      + (if .dead then "  <-- PORZUCONE PRZEZ ELEVENLABS" else "" end)
' "$TMP/chat.req.json"
echo "  (* = narzedzie klienta ElevenLabs, np. end_call;  wartosci w ms)"

# --- 3. gdzie ucieka czas -----------------------------------------------------
sec "3. GDZIE UCIEKA CZAS  (suma zadan zakonczonych; porzucone pomijamy)"
jq -r --slurpfile llm "$TMP/llm.req.json" '
  map(select(.tot != null)) as $done
| ([$done[].prep]|map(select(.))|add // 0) as $prep
| ([$done[].mdl] |map(select(.))|add // 0) as $mdl
| ([$done[].tls] |map(select(.))|add // 0) as $tls
| ([$done[].tot] |map(select(.))|add // 0) as $tot
| ($tot - $prep - $mdl - $tls)             as $rest
| (($llm[0]|map(select(.tot != null))) )   as $ldone
| (([$ldone[].auth] + [$ldone[].cfg]|map(select(.))|add) // 0) as $llmov
| (([$ldone[].tot]|map(select(.))|add) // 0)                   as $llmtot
| def pct($v): if $tot > 0 then ((($v*1000/$tot)|round)/10|tostring) + "%" else "-" end;
  def pad(n): tostring as $s | ($s + " "*n)[0:n];
  "  warstwa                          ms        udzial",
  "  -----------------------------------------------------",
  "  chat: prepare (baza przed AI)    " + ($prep|pad(10)) + pct($prep),
  "  chat: model (Anthropic)          " + ($mdl |pad(10)) + pct($mdl),
  "  chat: narzedzia (baza/SMS)       " + ($tls |pad(10)) + pct($tls),
  "  chat: reszta (SSE, sklejanie)    " + ($rest|pad(10)) + pct($rest),
  "  -----------------------------------------------------",
  "  suma voice-agent-chat            " + ($tot |pad(10)) + "100%",
  "",
  "  narzut voice-agent-llm (auth+cfg)" + ($llmov|pad(11)),
  "  suma voice-agent-llm             " + ($llmtot|pad(11)) + "<- tyle czeka ElevenLabs",
  "  z tego poza chatem               " + (($llmtot-$tot)|pad(11)),
  "",
  "  najwolniejsza tura: " + (($done|max_by(.tot)|.tot)|tostring) + " ms w t="
    + (($done|max_by(.tot)|.t)|floor|tostring) + "s"
' "$TMP/chat.req.json"

# --- 4. porownanie z raportem ElevenLabs --------------------------------------
sec "4. POROWNANIE Z RAPORTEM ELEVENLABS  (co slyszal klient)"
printf "  %-7s %-9s %-10s %-14s %s\n" "t" "ttfb" "tt_last" "cisza->audio" "tura"
jq -r '.transcript[] | select(.role=="agent")
  | (.conversation_turn_metrics.metrics // {}) as $m
  | "  " + ((.time_in_call_secs|tostring)+"s"|(.+" "*7)[0:7])
      + ((($m.convai_llm_service_ttfb.elapsed_time // 0)*100|round/100|tostring)|(.+" "*9)[0:9])
      + ((($m.convai_llm_service_tt_last_sentence.elapsed_time // 0)*100|round/100|tostring)|(.+" "*10)[0:10])
      + ((($m.convai_ttf_audio_since_silence.elapsed_time // 0)*100|round/100|tostring)|(.+" "*14)[0:14])
      + (if .message then (.message|.[0:46]) else "(bez tekstu) " + ((.tool_calls|map(.tool_name)|join(","))) end)
' "$TMP/conv.json"
echo "  ttfb = pierwszy token modelu; tt_last = ostatnie zdanie; cisza->audio = ile klient czekal"

echo
echo "  narzedzia ElevenLabs w tej rozmowie:"
jq -r '[.transcript[].tool_calls[]?] as $c | [.transcript[].tool_results[]?] as $r
  | if ($c|length)==0 then "    (brak)" else
      ($c[] | "    -> " + .tool_name + "  params=" + (.params_as_json // "{}")),
      ($r[] | "    <- " + .tool_name + "  wynik=" + (.result_value // "-") + "  " + ((.tool_latency_secs*1000|round|tostring)) + "ms")
    end' "$TMP/conv.json"

# --- 5. stan bazy -------------------------------------------------------------
sec "5. STAN BAZY  (co ta rozmowa naprawde zapisala)"
FROM_TS=$(date -u -r "$((T0 - 5))" +'%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -d "@$((T0 - 5))" +'%Y-%m-%d %H:%M:%S')
TO_TS=$(date -u -r "$((T0 + DUR + 180))" +'%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -d "@$((T0 + DUR + 180))" +'%Y-%m-%d %H:%M:%S')

cat > "$TMP/state.sql" <<SQL
with w as (select timestamptz '$FROM_TS+00' as a, timestamptz '$TO_TS+00' as b)
select 'service_bookings' as tabela, count(*)::text as n,
       coalesce(string_agg(to_char(created_at,'HH24:MI:SS')||' '||scheduled_date||' '||scheduled_time||' '||status, ' | '),'-') as szczegoly
  from service_bookings, w where created_at between w.a and w.b
union all
select 'workshop_client_bookings (GRAFIK)', count(*)::text,
       coalesce(string_agg(to_char(created_at,'HH24:MI:SS')||' '||appointment_date||' '||appointment_time||
         case when station_id is null then '  station_id=BRAK -> NIEWIDOCZNE W GRAFIKU' else '  station_id=OK' end, ' | '),'-')
  from workshop_client_bookings, w where created_at between w.a and w.b
union all
select 'workshop_orders', count(*)::text,
       coalesce(string_agg(to_char(created_at,'HH24:MI:SS')||' '||order_number||' "'||coalesce(description,'')||'"', ' | '),'-')
  from workshop_orders, w where created_at between w.a and w.b
union all
select 'workshop_sms_log', count(*)::text,
       coalesce(string_agg(to_char(created_at,'HH24:MI:SS')||' '||sms_type||' '||status, ' | '),'-')
  from workshop_sms_log, w where created_at between w.a and w.b
union all
select 'voice_calls (po conversation_id)', count(*)::text,
       coalesce(string_agg(to_char(created_at,'HH24:MI:SS')||' '||coalesce(linked_entity_type,'BRAK POWIAZANIA')||' '||
         coalesce(linked_entity_id::text,''), ' | '),'-')
  from voice_calls where elevenlabs_conversation_id = '$CONV'
union all
select 'voice_transcripts', count(*)::text,
       coalesce(string_agg(to_char(t.created_at,'HH24:MI:SS')||' '||jsonb_array_length(t.turns)||' tur', ' | '),'-')
  from voice_transcripts t join voice_calls c on c.id = t.call_id
 where c.elevenlabs_conversation_id = '$CONV';
SQL
db < "$TMP/state.sql" > "$TMP/state.json"

if jq -e '.message' "$TMP/state.json" >/dev/null 2>&1; then
  echo "  BLAD zapytania: $(jq -r '.message' "$TMP/state.json" | head -2)"
else
  jq -r '.[] | "  " + (.tabela|(.+" "*36)[0:36]) + (.n|(.+" "*4)[0:4]) + .szczegoly' "$TMP/state.json"
fi

# --- 6. czerwone flagi --------------------------------------------------------
sec "6. CZERWONE FLAGI"
FLAGS=0
flag() { echo "  [!] $1"; FLAGS=$((FLAGS+1)); }

DUP=$(jq -r "$CLUSTER"'cluster|map(select(length>1))|length' "$TMP/chat.req.json")
[ "$DUP" -gt 0 ] && flag "$DUP tur wykonanych rownolegle — kazda kopia moze zapisac do bazy (duplikaty rezerwacji)"
[ "$ABORTED" -gt 0 ] && flag "$ABORTED odpowiedzi porzuconych przez ElevenLabs (connection closed) — praca wykonana, wynik wyrzucony"

# Najgrozniejszy przypadek: zadanie porzucone, ale zdazylo zapisac do bazy.
DEADW=$(jq -r '[.[]|select(.dead == true and ((.tls//0) > 0))]|length' "$TMP/chat.req.json")
[ "$DEADW" -gt 0 ] && flag "$DEADW porzuconych zadan zdazylo wywolac narzedzia zapisujace — to jest zrodlo duplikatow w bazie"

SLOW=$(jq -r '[.[]|select((.tot//0) > 4000)]|length' "$TMP/chat.req.json")
[ "$SLOW" -gt 0 ] && flag "$SLOW tur ponad 4 s po naszej stronie — klient slyszy cisze (soft_timeout to 4 s)"

WAIT=$(jq -r '[.transcript[]|select(.role=="agent")|(.conversation_turn_metrics.metrics.convai_ttf_audio_since_silence.elapsed_time // 0)|select(. > 5)]|length' "$TMP/conv.json")
[ "$WAIT" -gt 0 ] && flag "$WAIT razy klient czekal ponad 5 s na dzwiek (metryka ElevenLabs, nie nasza)"

TRUNC=$(jq -r '[.[]|select(.trunc == true)]|length' "$TMP/chat.req.json")
[ "$TRUNC" -gt 0 ] && flag "$TRUNC odpowiedzi urwanych na max_tokens"

if [ -f "$TMP/state.json" ] && ! jq -e '.message' "$TMP/state.json" >/dev/null 2>&1; then
  NOSTATION=$(jq -r '[.[]|select(.tabela|test("GRAFIK"))|select(.szczegoly|test("station_id=BRAK"))]|length' "$TMP/state.json")
  [ "$NOSTATION" -gt 0 ] && flag "rezerwacja bez station_id — NIE POJAWI SIE w grafiku warsztatu"
  NCALL=$(jq -r '.[]|select(.tabela|test("voice_calls"))|.n' "$TMP/state.json")
  [ "$NCALL" = "0" ] && flag "brak wiersza voice_calls dla tego conversation_id — webhook po rozmowie nie dotarl"
  NTR=$(jq -r '.[]|select(.tabela=="voice_transcripts")|.n' "$TMP/state.json")
  [ "$NTR" = "0" ] && flag "brak transkryptu w bazie"
  NOLINK=$(jq -r '[.[]|select(.tabela|test("voice_calls"))|select(.szczegoly|test("BRAK POWIAZANIA"))]|length' "$TMP/state.json")
  [ "$NOLINK" -gt 0 ] && flag "rozmowa zapisana, ale NIEPOWIAZANA ze zleceniem — zakladka bedzie pusta"
  NBK=$(jq -r '.[]|select(.tabela=="service_bookings")|.n' "$TMP/state.json")
  NSMS=$(jq -r '.[]|select(.tabela=="workshop_sms_log")|.n' "$TMP/state.json")
  [ "$NBK" != "0" ] && [ "$NSMS" = "0" ] && flag "powstala rezerwacja, ale NIE WYSZEDL SMS potwierdzenia"
  [ "$NBK" = "0" ] && flag "zadna nowa rezerwacja nie powstala (dedup? blad? sam create_order?)"
  NBK2=$(jq -r '.[]|select(.tabela|test("GRAFIK"))|.n' "$TMP/state.json")
  [ "${NBK2:-0}" -gt 1 ] 2>/dev/null && flag "DUPLIKAT: $NBK2 wpisow w grafiku z jednej rozmowy"
fi

EMPTY=$(jq -r '[.transcript[]|select(.role=="agent" and .message==null and ((.tool_calls|length)>0))]|length' "$TMP/conv.json")
[ "$EMPTY" -gt 0 ] && flag "$EMPTY tur agenta bez wypowiedzianego tekstu (samo narzedzie) — klient slyszy cisze albo nagle rozlaczenie"

[ "$FLAGS" -eq 0 ] && echo "  brak — rozmowa czysta."
echo
echo "  znaleziono flag: $FLAGS"
hr
