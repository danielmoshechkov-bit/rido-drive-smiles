# Audyt: rachunek u operatorów + zakładki „Mój Agent" i „Asystent głosowy"

Wszystko poniżej z odczytu, 16.08. Nic nie zostało wyłączone ani usunięte.

---

# CZĘŚĆ 1 — SuperVoIP: za co płacimy

## Rachunek miesięczny

| pozycja | brutto | netto | potrzebne? |
|---|---|---|---|
| pakiet „SIP trunk 20 (dla centrali IP)" | 121,77 | 99,00 | **do zakwestionowania** |
| usługa API | 61,50 | 50,00 | tak — automat |
| numer stacjonarny ×1 | 1,23 | 1,00 | tak |
| **RAZEM** | **184,50** | **150,00** | |

Usługi aktywne i **darmowe**: `sipTrunk`, `presentationManagement`, `voicemail`,
`IVR`, `smsService`, `webPhone`, `callTranscription`, `sip` (dodatkowe konto SIP).

## Największe znalezisko: płacimy za 20 kanałów WYCHODZĄCYCH

Pakiet nazywa się „SIP trunk **20**", a na koncie stoi `outgoingCallLimit: 20`
i `defaultOutgoingCallLimit: 20`. To dwadzieścia równoczesnych połączeń
**wychodzących**.

**Nasz agent tylko odbiera.** Nie dzwoni do nikogo. Sam trunk kosztuje 0 zł,
dodatkowe konto SIP kosztuje 0 zł, a pojedynczy kanał wychodzący 1,23 zł.
Czyli 99 zł netto miesięcznie idzie prawie w całości za coś, czego nie używamy
— **1 188 zł rocznie**.

Nie wyłączam sam, bo nie wiem, czy pakiet nie warunkuje czegoś jeszcze
(np. `sipLimit: 2`). To pytanie do operatora: *jaki jest najtańszy wariant,
w którym mamy trunk, wiele numerów i ZERO kanałów wychodzących?*

## Flagi usług — stan faktyczny

| usługa | włączona | koszt/mc | używamy? |
|---|---|---|---|
| `sipTrunk` | **tak** | 0 | tak — to nią chodzi ElevenLabs |
| `presentationManagement` | **tak** | 0 | pośrednio (prezentacja numeru) |
| `IVR` (`{type: prepaid, active: true}`) | **tak** | 0 | **nie** — nasz numer ma `ivrScenario: null` |
| `voicemail` | **tak** | 0 | **nie** — numer ma `voicemail: false` |
| `smsService` (`/api/sms_services/3033`) | **tak** | 0 | **nie** — SMS-y idą naszym kanałem |
| `soapApi` | **tak**, ale `soapApiEnabled: false` | brak pozycji | **nie** — i tak nie działa dla kont po 01.01.2026 |
| `webPhone` | nie (`webPhoneAvailable: true`) | 0 | nie |
| `queueManagement`, `internalNumbersManagement`, `conferences`, `web2Call` | nie | 36,90 / 1,23 / 24,60 / — | nie |
| `incomingCallRecording`, `outgoingCallRecording`, `outgoingCallMonitoring` | nie | 30,75 każda | nie |
| `voicemailRecognition` | nie | 61,50 | nie |
| `chatGpt`, `voiceBot` (ich własne AI) | nie | 553,50 każda | nie — mamy swoje |
| `priorityCustomerService` | nie | 123,00 | nie |
| `faxService`, `incomingFax`, `outgoingFax` | nie | 3,69 | nie |
| `miniCrm`, `customSmsName` | nie | 12,30 | nie |
| `foreignNumberPresentation` | nie | 36,90 | nie |
| `office` | nie | 30,75 | nie |

**Do wyłączenia nie ma nic, co kosztuje.** Wszystko płatne poza trzema
pozycjami rachunku jest wyłączone. To dobra wiadomość i warto ją powiedzieć
wprost, zamiast szukać oszczędności tam, gdzie ich nie ma.

### Ale trzy rzeczy do wyłączenia z innego powodu niż pieniądze

1. **`soapApi: true`** — nieużywany interfejs z własnym kluczem, który
   wygenerował się automatycznie. Nie kosztuje, ale jest to druga droga
   do konta, której nikt nie pilnuje. Wyłączyć.
2. **`voicemail: true`** — dziś nieszkodliwa, bo na numerze wyłączona.
   Ale gdyby ktoś włączyła ją na numerze, połączenie trafiałoby na pocztę
   **zamiast do agenta** i wyglądałoby to jak awaria agenta.
3. **`IVR active`** — to samo: scenariusz IVR na numerze przechwyciłby
   połączenie przed ElevenLabs.

To nie są oszczędności, tylko zamykanie ścieżek, którymi da się przypadkiem
zepsuć odbieranie.

---

# CZĘŚĆ 2 — ElevenLabs

```
plan:      creator, aktywny
kredyty:   106 209 / 121 098   (88 % zużyte)
reset:     2026-09-03          (18 dni)
głosy:     0/30, profesjonalne 0/1
```

**Zostało 14 889 kredytów na 18 dni.** Przy dotychczasowym tempie to nie
wystarczy — a przekroczenie limitu na Creatorze znaczy, że agent przestaje
mówić.

Rozbicie za 30 dni:

| produkt | kredyty | udział |
|---|---|---|
| Conversational AI (nasz agent) | 66 401 | 57 % |
| **TTS (zwykła synteza)** | **49 710** | **43 %** |

**Prawie połowa budżetu poszła na TTS, nie na agenta.** Nie wiem, co go zużywa
— podgląd głosów w panelu warsztatu (`previewVoice`) syntezuje próbki na żywo
i to jest pierwszy podejrzany. To ta sama klasa co 24 dolary u Anthropic:
koszt, o którym dowiadujemy się przypadkiem.

---

# CZĘŚĆ 3 — Zakładka „Mój Agent"

**To jest inny produkt niż asystent głosowy.** Pisze do `ai_agent_configs`
i `ai_call_business_profiles`, które czytają `ai-generate-call-scripts`
i `ai-call-worker` — czyli agent SPRZEDAŻOWY dzwoniący na zewnątrz.
Z warsztatowym asystentem nie ma wspólnego kodu ani wspólnej tabeli.

Zawiera ~40 pól (dane firmy, opis usługi, ceny, idealny klient, obiekcje,
ton, godziny kontaktu). Dla warsztatu odbierającego telefony to jest
**druga, konkurencyjna ankieta o tej samej firmie** — warsztat wypełnia
„Opisz firmę w 3–5 zdaniach" dwa razy, w dwóch zakładkach, i żadna z nich
nie wie o drugiej.

Znalezione przy okazji: przełączniki **„Automatyczny kontakt z leadami"**
i **„Powiadomienia o umówionych spotkaniach"** są czystym stanem Reacta —
nigdzie nie zapisywane, znikają po odświeżeniu strony.

---

# CZĘŚĆ 4 — Zakładka „Asystent głosowy", pole po polu

Sprawdzone tak: co panel ZAPISUJE do `voice_agent_configs` kontra co funkcje
brzegowe z tej tabeli ODCZYTUJĄ.

**Czytane przez kod:** `business_context`, `display_name`, `languages`,
`calendar_access`, `orders_access`, `learning_mode`, `contribute_to_global`,
`provider_id`, `persona_key`, `elevenlabs_agent_id`.

**Zapisywane i nieczytane przez nikogo:** `is_active`, `voice_id`, `voice_mode`,
`voice_per_language`, `voice_speed`, `voice_stability`, `voice_similarity`,
`voice_style`, `sample_text`, `inbound_mode`, `inbound_rings`, `calling_hours`.

## ZOSTAJE — działa i warsztat tego potrzebuje

| pole | co robi naprawdę |
|---|---|
| „O Twojej firmie" — 9 pól (`business_context`) | trafia do promptu przez `voice-agent-llm` |
| Języki rozmowy (`languages`) | trafia do promptu |
| Dostęp do kalendarza (`calendar_access`) | bramkuje narzędzia w `voice-agent-tools` |
| Tworzenie zleceń (`orders_access`) | bramkuje narzędzia |
| Nazwa agenta (`display_name`) | używana w prompcie |

⚠️ **„Dodatkowe informacje dla AI" to jedyne pole, którym warsztat NAPRAWDĘ
może zepsuć agenta** — jego treść ląduje w prompcie bez ograniczenia długości
i bez sprawdzenia. Zostaje, ale wymaga limitu znaków i podglądu „tak to
zobaczy agent".

## NAPRAWIĆ — pole jest, nic nie robi

| pole | stan | co ma robić |
|---|---|---|
| **„Agent aktywny"** (`is_active`) | **nikt tego nie czyta** — wyłączenie nic nie daje, agent dalej odbiera | ma być twardym wyłącznikiem sprawdzanym w `voice-agent-init` |
| „Godziny aktywności agenta" (`calling_hours`) | zapisywane, nieczytane | albo działa, albo znika; tu wchodzi też URLOP |
| „Uczenie z rozmów" (`learning_mode`) | czytane przez `voice-call-analyze` | **to nie jest ustawienie warsztatu** — patrz niżej |

## USUNĄĆ — nasze narzędzie deweloperskie albo rzecz, której warsztat nie ma prawa ruszać

| element | co się stanie, jeśli zostanie |
|---|---|
| **„Trening agenta — 10 / 25 symulacji"** | **najgroźniejszy przycisk w panelu.** Wywołuje `voice-agent-simulate` — wydaje NASZE pieniądze (kredyty ElevenLabs + tokeny modelu) i dopisuje reguły do `voice_agent_knowledge`, które są wstrzykiwane do promptu. To jest dokładnie mechanizm, przez który agent zrobił się gadatliwy i przez który wyczyściliśmy 108 wpisów. Jedno kliknięcie warsztatu przewraca 7/8. |
| **Suwaki: stabilność, podobieństwo, styl, tempo** | dziś nie robią nic — obiecują kontrolę, której nie ma. Gdyby kiedykolwiek zaczęły działać, warsztat ustawiający tempo 1,15 wróciłby do seplenienia, które naprawialiśmy złotym stanem. |
| **Wybór głosu + tryb „głos per język" + podgląd** | głos jest w konfiguracji agenta ElevenLabs (złoty stan), nie w naszej bazie. Podgląd dodatkowo **syntezuje próbki na żywo** — to realny koszt kredytów, prawdopodobny sprawca 43 % zużycia TTS. |
| „Tekst do odsłuchu / powitanie" (`sample_text`) | nieczytane; powitanie jest w prompcie |
| „Tryb odbioru" + „liczba sygnałów" (`inbound_mode`, `inbound_rings`) | nieczytane. Odbieranie ustawia SuperVoIP i ElevenLabs — pole sugeruje kontrolę, której nie ma. |
| **„Telefonia na żywo (ElevenLabs)" — adresy webhooków** | instrukcja dla NAS z czasu ręcznej konfiguracji. Warsztat nigdy nie zobaczy panelu ElevenLabs. Zostawienie tego pokazuje klientowi wewnętrzne adresy naszych funkcji. |
| „Uczenie z rozmów" | decyzja o karmieniu wspólnej bazy wiedzy jest nasza, nie warsztatu |

---

# ZASADA 39 — panel warsztatu opisuje FIRMĘ, nie agenta

Warsztat widzi wyłącznie to, co dotyczy jego działalności: godziny, cennik,
politykę wyceny, języki, urlop, przekierowanie.

Wszystko, co dotyczy **mechaniki agenta** — model, głos, parametry syntezy,
prompt, webhooki, uczenie, symulacje — jest nasze i nie ma prawa być w panelu
klienta. Jedna zmiana jednego warsztatu nie może psuć konfiguracji, którą
pilnujemy złotym stanem i pięciowarstwową kontrolą.

Kryterium przy każdym nowym polu: **czy warsztat wie, co ta wartość znaczy,
i czy odpowiada za skutek jej zmiany?** Jeśli nie — to pole jest nasze.

---

# CZĘŚĆ 5 — Nowa zakładka „Asystent głosowy" (projekt)

Kolejność zakładek: **Asystent głosowy** przed Dashboardem — to jest rzecz,
po którą warsztat wchodzi.

## Trzy sekcje, nic więcej

### 1. Wyłącznik i urlop (na górze, widoczne od razu)

    ┌──────────────────────────────────────────────┐
    │  Asystent głosowy       [ ●━━ WŁĄCZONY ]     │
    │  Odbiera telefony pod numerem 22 101 58 96   │
    │                                              │
    │  ☐ Urlop / przerwa                           │
    │     od [ 2026-08-20 ]  do [ 2026-08-27 ]     │
    │     Co ma powiedzieć: [ Wracamy 28 sierpnia ]│
    └──────────────────────────────────────────────┘

Wyłącznik musi **naprawdę** wyłączać — sprawdzany w `voice-agent-init`.
Urlop nie wyłącza odbierania: agent odbiera, mówi zdanie o przerwie
i nie umawia terminów. Wyłączenie całkowite znaczy, że telefon dzwoni
w pustkę, a to gorsze dla klienta niż zdanie o urlopie.

Zdanie o urlopie idzie do wzorców w czterech językach, jak komunikaty awarii.

### 2. Jak uruchomić przekierowanie — sekcja główna

To jest sedno zakładki i dziś nie istnieje.

    Twój numer techniczny:  22 101 58 96          [kopiuj]

    Aby asystent odbierał telefony z Twojego numeru firmowego,
    ustaw przekierowanie u swojego operatora:

    Orange / Play / T-Mobile / Plus  →  **21*221015896#      [kopiuj]
    (przekierowanie natychmiastowe — wszystkie połączenia)

    Przekierowanie po 15 sekundach:   **61*221015896*11*15#
    (dzwoni u Ciebie, agent odbiera dopiero gdy nie odbierzesz)

    Wyłączenie przekierowania:        ##21#

    ⚠️ Przekierowanie jest płatne u Twojego operatora
       według jego cennika — my za nie nie pobieramy opłat.

⚠️ **KODY GSM WYŻEJ SĄ NIEZWERYFIKOWANE.** `**21*numer#` i `**61*numer*11*15#`
to składnia standardu GSM, a nie coś, co sprawdziłem u polskich operatorów.
Nie mam jak potwierdzić tego kodem, bazą ani logiem. Zanim trafią do panelu
warsztatu, muszą zostać sprawdzone na żywej karcie w każdej z czterech sieci
albo potwierdzone na stronach operatorów. Instrukcja, która nie zadziała
za pierwszym razem, kosztuje więcej zaufania, niż jest warta.

Numer bierze się z `voice_numbers` po `provider_id` — a jeśli warsztat go
jeszcze nie ma, w tym miejscu stoi przycisk **„Aktywuj numer"**, który zakłada
zadanie w kolejce i pokazuje jego status.

**Wariant zalecany to przekierowanie po 15 sekundach**, nie natychmiastowe:
warsztat odbiera sam, gdy może, a agent wchodzi dopiero, gdy nikt nie odbiera.
Tak najłatwiej zacząć bez ryzyka.

### 3. O firmie — to, co już działa

`business_context` bez zmian (dziewięć pól), języki, dostęp do kalendarza
i zleceń. Plus limit znaków i podgląd „tak to zobaczy agent" dla pola
„Dodatkowe informacje".

## Czego w tej zakładce NIE MA

Głosu, suwaków, treningu, webhooków, trybu odbioru, tekstu do odsłuchu.
Wszystko to przenosi się do panelu administratora — tam już jest
`AIVoiceAgentSettings` i tam jest właściwe miejsce.
