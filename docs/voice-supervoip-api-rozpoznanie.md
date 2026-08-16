# SuperVoIP API i integracja z ElevenLabs — co jest w dokumentacji

Źródła (pobrane 18.08, treść cytowana z oryginału):

- `https://pomoc.supervoip.pl/5182951714333-supervoip-api/` — opis usługi API
- `https://restapi.supervoip.pl/` — **pełna specyfikacja OpenAPI 3.0.2** (Redoc,
  spec osadzony w `__redoc_state`; 125 ścieżek)
- `https://pomoc.supervoip.pl/elevenlabs/` — **gotowa instrukcja integracji z ElevenLabs**
- `https://pomoc.supervoip.pl/4870873673501-sip-trunk-konfiguracja/` — SIP trunk
- `https://pomoc.supervoip.pl/5174226744093-jak-kupic-numer-telefonu/` — zakup numeru

---

## 1. Czy da się kupić numer przez API — TAK

Trzy wywołania, bez klikania w panelu:

    GET  /api/numbers?inUse=false&country=…&region=…
         → wolne numery PSTN; pola: number, price, activationPrice,
           golden, silver, mobile, sms, operator, servicePrice
         („inUse — Must be set to false to return only available numbers")

    POST /api/sips                       → nowe konto SIP

    POST /api/voip_numbers
         { "number": "/api/numbers/{id}", "sip": "/api/sips/{id}",
           "firstSubscriptionPeriod": null }   // wymagane tylko dla komórkowych

`POST /api/voip_numbers` jest opisany jako „Creates a voip number" i bierze numer
z puli — czyli to jest ZAKUP. Ceny są w `GET /api/numbers` i `GET /api/service_prices`,
więc **wycenę puli numerów policzymy sami, gdy będzie klucz** — nie trzeba o nią pytać.

Limity zapisu: `POST /api/sips` 1 żądanie / 10 s, `POST /api/asterisk/do_call` 1/s,
`POST /api/sms_messages` 10/s. Przy zakładaniu warsztatu to bez znaczenia.

### Czego w API NIE MA

- **Przeniesienia numeru (portacji).** Schematy `NumberTransferForm*` istnieją,
  ale nie ma dla nich żadnej ścieżki — czyli warsztat, który chce zachować swój
  numer, przechodzi przez formularz, nie przez API.
- **Pola `x-twilio-accountsid`** z instrukcji ElevenLabs (potrzebne tylko dla
  połączeń WYCHODZĄCYCH ElevenLabs → SuperVoIP). Reszta trunku jest w API.

## 2. Uwierzytelnianie

    Authorization: Bearer <token>

„Value for the Authorization header in the following format: »Bearer token«".

Klucz: **Wirtualna Centrala > Usługi > Dodaj usługę > SuperVoIP API**, potem
w ustawieniach REST „będziesz mógł wygenerować własne klucze API".
SOAP odpada z góry: „SoAP API nie jest dostępna dla kont zarejestrowanych po 01.01.2026".

## 3. Cała konfiguracja pod ElevenLabs jest w API

Instrukcja z bazy wiedzy (przychodzące SuperVoIP → ElevenLabs):

1. włącz SIP trunk na koncie SIP,
2. autoryzacja **adresem IP**, w polu wpisz `sip.rtc.elevenlabs.io:5060;transport=tcp`
   (TLS: `…:5061;transport=tls`),
3. na numerze zaznacz „Dodawaj prefiks +48 do numerów polskich",
4. w ElevenLabs: Numery telefonów → **Importuj numer / z SIP trunk**,
5. ⚠️ „ten numer musi być skierowany na konto SIP, które ma przypisaną usługę
   SIP trunk w SuperVoIP".

Odpowiedniki w API:

    PUT /api/sips/{id}
        { "trunk": true, "trunkAuthType": "ip",
          "trunkIP": "sip.rtc.elevenlabs.io:5060;transport=tcp" }

    PUT /api/voip_numbers/{id}
        { "localConnection": true, "localConnectionType": "sip",
          "localConnectionSIPs": ["/api/sips/{id}"],
          "localConnectionAddPolishPrefix": true }

Czyli **cała ścieżka „nowy warsztat → własny numer → agent gotowy" jest
automatyzowalna**, poza wpisaniem numeru po stronie ElevenLabs (to robimy ich API,
`POST /v1/convai/phone-numbers`, provider SIPTrunk).

## 4. Numer docelowy przy przekierowaniu — dokumentacja NIE odpowiada

To było najważniejsze pytanie i **odpowiedzi nie ma**. Co jest:

- Strona SIP trunk: usługa pozwala „podłączyć centralę IP do konta SIP
  i **rozróżniać w urządzeniu na jaki numer telefonu przychodzi połączenie**".
  Nie piszą, w którym polu — zakładamy `To`/R-URI, ale to założenie, nie fakt.
  Dotyczy to wielu numerów NASZYCH, na jednym trunku.
- Ta sama strona, jedno zdanie o przekierowaniach: „Dla połączeń przekierowanych
  połączenie przychodzące **może prezentować się numerem przychodzącym**."
  To zdanie o CLI (`From`), nie o numerze, na który dzwoniono.
- W API: `redirectPresentation` i `conditionalRedirectPresentation` z wartościami
  **`incoming` | `redirect`** — przy przekierowaniu ustawiasz, czy prezentuje się
  numer dzwoniącego, czy numer przekierowujący. **Albo — albo. Nigdy oba.**

Wniosek zgodny z tym, co zmierzyliśmy na dziewięciu INVITE: SuperVoIP nie
wysyła `Diversion` ani `History-Info`, a jedyny mechanizm, jaki opisują,
podmienia `From` — więc znając warsztat, tracimy numer klienta.

**Ale to dotyczy tylko numerów hostowanych u nich.** Przekierowanie z numeru
Orange/Play na nasz numer jest poza ich systemem i o tym nie piszą nic.

### Boczne wyjście, którego wcześniej nie mieliśmy

    GET /api/incoming_calls?callId=…

zwraca m.in. `calledNumber`, `callerNumber`, `callId`, `date`, `time`, `duration`.
`callId` to SIP Call-ID — a ten sam Call-ID widzimy w ElevenLabs przez
`GET /v1/convai/conversations/{id}/sip-messages`. Czyli **każdą rozmowę
umiemy skleić z rekordem SuperVoIP**. Do rozliczeń per warsztat to wystarczy.
Do rozpoznania warsztatu przy przekierowaniu z obcej sieci — nie, bo
`calledNumber` będzie nasz numer techniczny.

## 5. Webhook SuperVoIP (osobny od ElevenLabs)

Adres URL wpisuje się w ustawieniach usługi. Dla połączeń przychodzących wysyła:

    status (callstart|callend|queuestart), direction=in, numberA (źródłowy),
    numberB (docelowy), disposition, sipnumber, billseconds, createdat, callid

`numberB` to znów numer, na który przyszło połączenie do SuperVoIP — ta sama
granica co wyżej.

---

## Co z tego wynika dla architektury

Wariant „osobny NUMER per warsztat, jeden agent" jest **w pełni automatyzowalny
przez API** — to była największa niewiadoma i już nie jest. Zostaje pytanie
handlowe (cena przy kilkudziesięciu numerach, czas aktywacji, limity) i jedno
techniczne (czy przy przekierowaniu z obcej sieci da się w ogóle odzyskać numer
docelowy). Tylko te idą do zgłoszenia.
