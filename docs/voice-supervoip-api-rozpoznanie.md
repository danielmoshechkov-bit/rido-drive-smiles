# SuperVoIP API i integracja z ElevenLabs — co jest w dokumentacji

Źródła (pobrane 16.08, treść cytowana z oryginału):

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

---

# Odczyty na żywo (16.08) — co naprawdę stoi na koncie

## Ceny, zmierzone

| pozycja | brutto | netto |
|---|---|---|
| numer stacjonarny zwykły, **miesięcznie** | **1,23 zł** | 1,00 zł |
| aktywacja numeru zwykłego (`type=normal`) | **0 zł** | 0 zł |
| pakiet „SIP trunk 20 (dla centrali IP)" | 121,77 zł/mc | 99 zł |
| **usługa API** | **61,50 zł/mc** | 50 zł |
| usługa SIP trunk | 0 zł | 0 zł |
| dodatkowe konto SIP (`sip`) | 0 zł | 0 zł |
| dodatkowy kanał wychodzący | 1,23 zł/mc | 1 zł |
| kolejka połączeń (`connectionQueue`) | 36,90 zł/mc | 30 zł |
| nagrywanie przychodzących | 30,75 zł/mc | 25 zł |
| transkrypcja rozmów | 0 zł | 0 zł |

Wszystkie **49 polskich stref** mają identyczne warunki: `activationPrice: 0`,
`requireActivation: false`, `documentGroup: null` — bez dokumentów i bez
weryfikacji. Wolnych numerów zwykłych **8 824**, w strefie warszawskiej **527**.

⚠️ Niezgodność do potwierdzenia na pierwszej fakturze: `region.price` = 0,5,
ale przy każdym numerze wisi `servicePrice.landlineDomestic` = 1,23 brutto.
Biorę 1,23, bo jest przypięte do numeru, a nie do strefy.

## Limity — co jest limitem, a co opisem pakietu

`voipLimit: 0` i `mobileLimit: 0` **nie są limitami**. Siedzą w `bundlePrice`,
czyli w opisie tego, co pakiet zawiera. Dowód jest w tym samym ładunku: usługi
`sipTrunk` i `presentationManagement` mają `serviceLimit: 0`, a trunk DZIAŁA.
Zero znaczy „nie wliczone w pakiet", nie „zero dozwolonych".

Realne:

    sipLimit: 2            kont SIP (z pakietu), sipUsed: 1
    canBuyVoipNumber: true, voipNumberLock: false, voipNumberCount: 1
    creditLimit: 0, serviceType: prepaid

**Limitu liczby numerów nie ma.**

## Ile numerów na jedno konto SIP

`Sip.voipNumbers` to TABLICA, `VoipNumber.sip` to pojedyncza referencja —
relacja jeden do wielu. Nasze konto: `voipNumbers: [/api/numbers/4109]`.
Dowodem ostatecznym byłby drugi numer, czyli POST — nie wykonany.

**`VoipNumber.incomingCallLimit` = 0 na naszym numerze i jest TYLKO DO ODCZYTU**
— pola nie ma w `VoipNumber-voip-write`, więc przez API go nie ustawimy.
To zamyka pomysł egzekwowania pakietów (Agent = 1 rozmowa, Agent Pro = 3)
limitem po stronie operatora. Zero czyta się jak wszędzie indziej u nich:
brak limitu.

Zostaje `Sip.incomingCallQueueLimit` = 1 (specyfikacja: min 1, max 5),
zapisywalny. Czy to kolejka, czy równoległość — pytanie nr 1 do operatora.

## Limity szybkości — projekt automatu

Wszystkie odczyty **1 żądanie na sekundę**, zapisy **1 na 10 sekund**:

    GET  /api/customers/me, /api/regions, /api/numbers,
         /api/voip_numbers, /api/incoming_calls        1/1 s
    POST /api/sips, POST /api/voip_numbers             1/10 s
    PUT  /api/voip_numbers/{id}, /api/sips/{id}        1/10 s

Przekroczenie to **429** z pustym `detail` — sprawdzone w praktyce przy serii
GET-ów. Automat zakładania warsztatu musi mieć **kolejkę z odstępem
i ponawianiem**, nie pętlę `for`. Jeden warsztat to minimum ~20 s
(POST numeru + PUT konfiguracji), więc kolejka i tak jest wymagana,
niezależnie od 429.

Do tego przed każdym POST-em zakupu przechodzimy przez `supervoipZakup.ts`:
saldo prepaid, `creditLimit: 0`, więc brak środków zabiera numer warsztatowi,
który już za niego zapłacił.

## Rozmowy — luka, której nie ma

`GET /api/incoming_calls`: **85 połączeń** od 23.07, wszystkie `ANSWER`,
`pickedUp: true`, zero o długości 0. ElevenLabs: 90 rozmów (różnica to
symulacje, które nie idą przez telefon). Dopasowanie po czasie startu ±90 s:
**0 połączeń u operatora bez rozmowy w ElevenLabs**.

Hipoteza „mamy połączenia, których nie widzimy" się nie potwierdza.

Uwaga metodyczna: filtr `disposition=NO_ANSWER` zwrócił 0, ale to NIE jest
dowód — ta wartość może nie istnieć w ich słowniku. Dowodem jest zliczenie
wszystkich 85, nie pusty filtr.

`redirected: false` przy wszystkich 85, także przy tych, o których wiemy,
że szły przekierowaniem. Prawdopodobnie znaczy „my przekierowaliśmy dalej",
a nie „przyszło przekierowane" — ale to domysł, więc jest w zgłoszeniu.

## Odtworzenie konfiguracji numeru — jeden do jednego

Działający numer +48 22 101 58 96 (`/api/voip_numbers/386734`):

    localConnection: true, localConnectionType: "sip",
    localConnectionSIPs: [/api/sips/1291084],
    localConnectionAddPolishPrefix: true, localConnectionCallerIdExtras: null,
    redirect: false, conditionalRedirect: false, voicemail: false,
    findMe: false, queue: null, ivrScenario: null, recordIncoming: false

Konto SIP `/api/sips/1291084`:

    trunk: true, trunkAuthType: "ip",
    trunkIP: "sip.rtc.elevenlabs.io:5060;transport=tcp",
    trunkPresentation: "fromName", twilioAccountSid: null, supervoipTwilio: null,
    useTrunkPresentation: false,
    pcmu: true, pcma: true, amrwb: true, g722: FALSE, opus: false,
    incomingCallQueueEnabled: true, incomingCallQueueLimit: 1

**Każde z tych pól jest zapisywalne przez API** poza `incomingCallLimit`.
Konfiguracja odtwarza się jeden do jednego.

Do sprawdzenia przy okazji: `g722: false` wyłącza kodek szerokopasmowy.
ElevenLabs i tak zwykle bierze g711, więc to prawdopodobnie bez znaczenia —
ale nie sprawdzaliśmy, czy włączenie g722 poprawiłoby jakość ASR.
