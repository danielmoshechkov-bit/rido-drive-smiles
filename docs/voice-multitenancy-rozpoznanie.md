# Agent dla wielu warsztatów — rozpoznanie przed projektem

Stan na 15.08.2026. **Kodu nie ma** — to są odpowiedzi na trzy pytania,
od których zależy architektura.

## ⛔ ROZSTRZYGNIĘTE 17.08: architektura z JEDNYM numerem NIE DZIAŁA

**Test kontrolowany wykonany.** Właściciel ustawił przekierowanie i zadzwonił
z trzeciego telefonu. Dziewięć połączeń z 17.08, w tym kilka przekierowanych,
ma **identyczny zestaw nagłówków** jak połączenia bezpośrednie:

    Record-Route, Via, Max-Forwards, From, To, Contact, Call-ID, CSeq,
    User-Agent, Date, Allow, Supported, X-Callid, X-CallerID, Content-*

**Brak `Diversion`. Brak `History-Info`. Brak `P-Asserted-Identity`.**
`To` zawiera zawsze nasz numer techniczny — numeru, na który klient dzwonił
pierwotnie, nie da się odczytać z niczego.

Zapytanie do SuperVoIP wysłane (`docs/zgloszenie-supervoip-diversion.md`).
Do czasu odpowiedzi obowiązuje **wariant z pulą numerów**.

Poniższa sekcja opisuje wariant, który odpadł — zostaje jako zapis rozumowania.

## 1. (ODPADŁO) Jeden numer techniczny, nie pula

Zmierzone na naszej konfiguracji, nie przeczytane w dokumentacji:

```
GET /v1/convai/phone-numbers
  phone_number: +48221015896        provider: sip_trunk
  assigned_agent: { agent_id: ... }              <- JEDEN agent na numer
  inbound_trunk.attributes_to_headers: {}        <- mapowanie nagłówków SIP
  store_sip_messages: true
```

Dwa fakty rozstrzygają:

- **Numer ↔ agent jest 1:1.** Jeden numer nie obsłuży wielu agentów. Wiele
  numerów może wskazywać jednego agenta — nie odwrotnie.
- **ElevenLabs przekazuje nagłówki SIP do zmiennych dynamicznych.**
  W metadanych rozmowy siedzi już `sip_header_dynamic_variables`
  (`sip_callerid`, `sip_callid`), a `inbound_trunk.attributes_to_headers`
  pozwala zmapować dowolny nagłówek. To jest mechanizm na `Diversion`.

**Architektura: jeden numer, jeden agent, wiele warsztatów.** Tożsamość
warsztatu z nagłówka przekierowania, snapshot per warsztat z
`voice-agent-init`. Powitanie, język i głos personalizujemy już dziś —
złoty stan ma włączone `overrides` dla `agent.first_message`,
`agent.language` i `tts.voice_id`.

Dziś `voice-agent-init` rozpoznaje warsztat po `agent_id` (linia 165).
To jedyne miejsce do przepisania.

### Wariant zapasowy (zapisany, nierozwijany)

Gdyby `Diversion` nie dochodził: pula numerów, jeden na warsztat,
`assigned_agent` rozstrzyga tożsamość. Wymaga agenta per warsztat —
`POST /v1/convai/agents/create` istnieje i przyjmuje `conversation_config`,
czyli dokładnie to, co mamy w `config/elevenlabs-agent-ZLOTY-STAN.json`.
Droższe (numer + agent na warsztat), ale nie wymaga niczego od operatora.

## 2. Tworzenie agentów przez API — tak, ale niepotrzebne

`POST /v1/convai/agents/create` działa (422 z listą brakujących pól to
potwierdzenie istnienia, nie błąd). Przypisanie numeru, webhooki
i `platform_settings` też idą przez API.

Przy architekturze z punktu 1 **nie jest potrzebne** — agent jest jeden.
Zostaje jako plan B.

## 3. Limit współbieżności — jest, ale nie tam, gdzie trzeba

```
platform_settings.call_limits:
  { agent_concurrency_limit: -1, daily_limit: 100000, bursting_enabled: false }
```

`-1` znaczy bez limitu. Limit **da się** ustawić — ale jest **per agent**,
a przy jednym agencie dla wszystkich warsztatów ElevenLabs nie odróżni
warsztatu A od B.

**Limit z pakietu (Agent 1, Agent Pro 3) musimy egzekwować sami**,
w `voice-agent-init`: policzyć aktywne rozmowy tego `provider_id` i przy
przekroczeniu odesłać odpowiedź zajętości. Jedno zapytanie, mieści się
w budżecie 300 ms webhooka. To jedyny realny koszt architektury
„jeden numer".

---

# TEST NAGŁÓWKA DIVERSION — instrukcja

Rozstrzyga całą architekturę. Dziesięć minut.

## Co dziś przychodzi na numer techniczny

Zrzut prawdziwego INVITE z rozmowy `c0yn9bxn` (numery zamaskowane):

```
From:      <sip:+48******583@213.199.246.200>;tag=as1bc6003a
To:        <sip:+48******896@sip.rtc.elevenlabs.io:5060;transport=tcp>
Contact:   <sip:+48******583@213.199.246.213:5060>
X-Callid:  609f828f...@213.199.246.213
X-CallerID: +48******896
```

Nagłówki INVITE: `Record-Route, Via, Max-Forwards, From, To, Contact,
Call-ID, CSeq, User-Agent, Date, Allow, Supported, X-Callid, X-CallerID,
Content-Type, Content-Length`.

**Nie ma `Diversion`, `History-Info` ani `P-Asserted-Identity`** — ale to było
połączenie BEZPOŚREDNIE, więc ich nieobecność niczego nie dowodzi.
Cały test polega na sprawdzeniu, czy pojawią się przy przekierowaniu.

## Kroki

1. **Weź numer, który NIE jest naszym numerem technicznym** — dowolny
   Twój numer firmowy albo komórkowy. Nazwijmy go **W** (warsztat).
2. **Ustaw na W bezwarunkowe przekierowanie na `+48 22 101 58 96`.**
   Kody dla polskich operatorów (bezwarunkowe, wszystkie połączenia):
   - włączenie: `**21*48221015896#` i zadzwoń
   - wyłączenie: `##21#` i zadzwoń
   - sprawdzenie: `*#21#`
   Te kody (GSM MMI) działają w Orange, Play, T-Mobile i Plus. Jeśli
   operator ich nie przyjmie, przekierowanie jest też w panelu abonenta.
3. **Zadzwoń na W z trzeciego telefonu** — nie z W i nie z mojego numeru.
   Nazwijmy go **C** (klient). Ważne, żeby C ≠ W: inaczej nie odróżnimy,
   który numer niesie który nagłówek.
4. **Porozmawiaj kilkanaście sekund** (agent odbierze normalnie) i rozłącz.
5. **Wyłącz przekierowanie:** `##21#`.

## Co sprawdzę

`GET /v1/convai/conversations/{id}/sip-messages` — ten endpoint zwraca
**surowe wiadomości SIP**, a `store_sip_messages` mamy już włączone.
W INVITE szukam po kolei:

| nagłówek | co znaczy, jeśli jest |
|---|---|
| `Diversion: <sip:W@…>` | najlepszy wariant — standardowy nagłówek przekierowania, mapujemy go w `attributes_to_headers` i mamy tożsamość warsztatu |
| `History-Info: <sip:W@…>` | równie dobry, nowszy standard, obsługiwany tak samo |
| `P-Asserted-Identity` | zwykle niesie C, nie W — sprawdzę, ale nie liczę na to |
| `To:` = W zamiast naszego numeru | też wystarczy: `To` trafia do nas jako numer wybrany |
| `X-*` własne SuperVoIP | już dostajemy dwa takie — może dojść trzeci z numerem przekierowującym |

**Jeśli żaden nie niesie W** — przekierowanie jest przezroczyste i architektura
„jeden numer" odpada. Wtedy pula numerów, wariant zapasowy wyżej.

Po teście podaj mi `conversation_id` albo samą godzinę połączenia — resztę
odczytam sam.

---

# WARIANT OBOWIĄZUJĄCY: PULA NUMERÓW (od 17.08)

## Kluczowe ustalenie: potrzebujemy osobnego NUMERU, nie osobnego AGENTA

Sprawdzone na API:

- **Numer → agent jest 1:1**: pole `assigned_agent` na numerze przyjmuje
  jednego agenta.
- **Agent → numery jest 1:N**: nic w API nie ogranicza liczby numerów
  wskazujących tego samego agenta. Przypisanie jest atrybutem NUMERU,
  a nie listą po stronie agenta.

**Czyli jeden agent obsłuży wszystkie warsztaty, a warsztat rozpoznajemy
po numerze, na który przyszło połączenie.** Nie potrzeba `Diversion`,
nie potrzeba pytać operatora o cokolwiek, nie potrzeba agenta per warsztat.

To jest rozwiązanie tańsze niż wariant z agentem per warsztat: jeden komplet
promptu, jeden złoty stan, jedna konfiguracja do pilnowania.

### Czego jeszcze brakuje do potwierdzenia

`voice-agent-init` czyta dziś `agent_id` i `caller_id`. **Nie czyta numeru
docelowego** — a to on ma rozpoznawać warsztat. Nie wiem, czy platforma go
przysyła: dodałem log kluczy webhooka (bez wartości, numery nie trafiają
do logu) i odczytam to przy następnym prawdziwym połączeniu.

Jeśli webhook go nie niesie, zostaje `phone_call.agent_number` w metadanych
rozmowy — ale to dane PO rozmowie, za późno na snapshot.

## Dodawanie numerów przez API ElevenLabs — działa

```
POST /v1/convai/phone-numbers
  warianty dostawcy: Twilio | Exotel | SIPTrunk
  SIPTrunk wymaga:   phone_number, label  (+ konfiguracja trunku)
```

Przypisanie do agenta idzie przez `PATCH /v1/convai/phone-numbers/{id}`
(sprawdzone: pusty PATCH zwraca 200 z aktualnym stanem numeru).

**Krok „podepnij numer do agenta" w kreatorze jest wykonalny w całości
przez API.**

## Czego NIE mogę sprawdzić

**SuperVoIP nie ma u nas żadnej integracji** — w repozytorium nie ma ani
klienta ich API, ani danych dostępowych, ani śladu po dokumentacji.
Nie zweryfikuję, czy da się kupić numer programowo.

Te pytania trafiły do zgłoszenia (`docs/zgloszenie-supervoip-diversion.md`,
punkty 4–7): API do zamawiania numerów, czas aktywacji, limit numerów
na trunku, cena przy kilkudziesięciu sztukach.

**Do czasu odpowiedzi nie umiem policzyć kosztu puli** — a bez ceny numeru
nie da się rozstrzygnąć, czy wariant jest tani.

## Przepływ docelowy — co jest gotowe, a co czeka

| krok | stan |
|---|---|
| 1. warsztat klika „Aktywuj agenta" | do zbudowania (panel) |
| 2. zakup numeru w SuperVoIP | **nieznane — czeka na odpowiedź operatora** |
| 3. zapis numeru przy koncie warsztatu | trywialne (kolumna w bazie) |
| 4. podpięcie numeru do agenta w ElevenLabs | **API działa, sprawdzone** |
| 5. panel pokazuje numer i instrukcję | do zbudowania |
| 6. warsztat ustawia przekierowanie | instrukcja gotowa (kody GSM w tym dokumencie) |

Krok 2 jest jedynym, którego nie umiem dziś ocenić. Jeśli SuperVoIP nie ma
API, zostaje ręczne zamówienie numeru — i wtedy trzeba zmierzyć, ile to minut
na warsztat, bo przy pięćdziesięciu klientach to przesądza o modelu.
