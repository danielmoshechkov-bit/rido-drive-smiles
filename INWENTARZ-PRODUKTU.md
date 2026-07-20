# INWENTARZ PRODUKTU — GetRido / RIDO

> Wygenerowano 19.07.2026 na podstawie pełnej analizy kodu (frontend, ~171 funkcji Edge Supabase, ~616 migracji bazy, konfiguracja, komentarze/TODO). Analiza tylko do odczytu.
>
> **Stack:** Vite + React 18 + TypeScript + Tailwind/shadcn (SPA, PWA) · Supabase (Postgres + RLS + Edge Functions/Deno) · Lovable Cloud · deploy FTP na LH.pl (getrido.pl). AI: Lovable AI Gateway (Gemini/GPT), Anthropic Claude, Kimi/Moonshot, Deepgram (STT), ElevenLabs (głos/telefonia).

---

## 1. Architektura i przepływ pracy

### 1.1 Co to jest

GetRido to **multi-portalowa platforma SaaS na rynek polski** — jeden SPA (`App.tsx`) spina kilkanaście portali: **Warsztat/CRM** (konkurencja PilotGo/Zilo), **Flota** (rozliczenia Uber/Bolt/FreeNow, paliwo, dokumenty), **Wynajem pojazdów**, **Giełda aut** (`/gielda`), **Rido Market** (`/marketplace`), **Nieruchomości** (`/nieruchomosci`), **Usługi** (`/uslugi`), **Księgowość + Faktury + KSeF** (`/ksiegowosc`, `/faktury`), **Ubezpieczenia**, **Portal handlowca** (`/sprzedaz`), **AI Pro / RidoAI / agenci głosowi**, **Workspace/Workflow**, **Meetings**, **RidoMail**, **Mapy**. Landing/hub: `EasyHub` (`/`).

### 1.2 Role w systemie

**Role platformowe** (tabela `user_roles`, użytkownik może mieć wiele naraz): `admin`, `fleet_settlement`, `fleet_rental`, `driver`, `real_estate_agent`, `real_estate_admin`, `marketplace_user`, `accounting_admin`, `accountant`, `sales_admin`, `sales_rep`, `service_provider`. Do tego **role delegowane** we flocie (`fleet_delegated_roles` — właściciel floty nadaje własne stanowiska z uprawnieniami per-zakładka JSON) oraz twardo zakodowany allowlist właścicieli platformy (`useOwnerAccess`).

**Role w module Warsztat** (`workshop_employees.role`): `owner` (właściciel), `reception` (biuro/recepcja), `mechanic` (mechanik) + platformowy `admin`. **Klient warsztatu** nie ma konta — dostaje publiczny link z sekretnym kodem (`/warsztat/klient/:code`).

### 1.3 Statusy zlecenia — DYNAMICZNE (konfigurowalne)

Statusy **nie są enumem** — to tabela `workshop_order_statuses` per warsztat (`provider_id`): nazwa, kolor, kolejność, `is_default`, `sends_sms` + szablon SMS. Edycja w UI (`settings/OrderStatusesPage.tsx`), seed przez RPC `init_workshop_default_statuses`. Dwa tryby pracy: `auto` (automatyczne przechodzenie) i `manual` (`workshop_status_settings.status_mode`). Domyślny zestaw:

1. **Przyjęcie do serwisu** (domyślny)
2. **Nowe zlecenie**
3. **Zaakceptowano** (wysyła SMS)
4. **W trakcie naprawy**
5. **Zadania wykonane**
6. **Gotowy do odbioru** (wysyła SMS)
7. **Zakończone** (ustawia `completed_at`)
+ **Umówiony telefonicznie** (tworzony przez agenta głosowego AI)

Każda zmiana statusu trafia do `workshop_order_status_history` / `workshop_order_events` z rolą aktora (`client` / `employee` / `admin`) — pełna oś czasu zlecenia (`OrderHistoryTimeline`).

### 1.4 Przepływ zlecenia end-to-end (diagram)

```
 ŹRÓDŁA ZLECENIA
 ┌──────────────────────────────────────────────────────────────┐
 │ • Telefon → Agent głosowy AI (ElevenLabs + Claude)           │
 │   → voice-agent-tools.create_order → status "Umówiony telef."│
 │ • Rezerwacja online z portalu (sloty + weryfikacja SMS kodem)│
 │ • Recepcja/biuro ręcznie (WorkshopNewOrderDialog)            │
 └──────────────┬───────────────────────────────────────────────┘
                ▼
 BIURO / RECEPCJA (WorkshopDashboard, panel zleceń)
 • przyjęcie auta: protokół przyjęcia, zdjęcia, VIN/rejestracja
   (dekoder RegCheck), klient+pojazd z bazy lub nowy
 • przypisanie do mechanika / stanowiska (workshop_stations)
                │  powiadomienie: dzwonek in-app + SMS
                ▼
 MECHANIK (osobny portal /pracownik-warsztat)
 • karta zlecenia, lista prac, zgłasza USTALENIA/usterki
   (workshop-employee-submit-findings)
                │
                ▼
 BIURO — akceptacja ustaleń (workshop-approve-findings)
 • buduje KOSZTORYS (pozycje, części z magazynu FIFO,
   "Znajdź części z Rido" → Hart / Auto Partner / Inter Cars)
 • wysyła klientowi link do karty klienta
                │
                ▼
 KLIENT (publiczny link /warsztat/klient/:code — bez logowania)
 • widzi status NA ŻYWO (realtime), protokół, kosztorys
 • AKCEPTUJE i PODPISUJE elektronicznie (e-podpis, zamrożony
   snapshot dokumentu) • może zaproponować zmianę terminu
                │  status → "Zaakceptowano" (SMS)
                ▼
 NAPRAWA → "Zadania wykonane" → "Gotowy do odbioru"
                │  automatyczny SMS do klienta
                ▼
 WYDANIE AUTA • protokół wydania • płatność
 (WorkshopPaymentDialog: completed_at = data raportowa,
  paid_at = data wpływu; nieopłacone = Dług)
                │
                ▼
 FAKTURA / PARAGON (user_invoices → PDF → e-mail → KSeF)
 KASA (zamknięcie dnia/miesiąca) • RAPORTY • prośba o opinię SMS
                │
                ▼
 HISTORIA NAPRAW pojazdu (per VIN) — z mostem do konta klienta
 w GetRido (client-verify-vehicle-ownership: transfer po VIN)
```

### 1.5 Backend w skrócie

- **~171 funkcji Edge** (Deno) — wszystkie z `verify_jwt=false` na bramce, autoryzacja wewnątrz funkcji (część cronowych bez auth — patrz audyt bezpieczeństwa).
- **~500+ tabel**, RLS włączone wszędzie; multi-tenancy po `provider_id` / `fleet_id` / `company_id` / `entity_id` / `user_id`.
- **PWA**: autoUpdate, cache NetworkFirst na domenę Supabase; brak natywnego Web Push (kanały: in-app realtime, SMS, e-mail, Telegram).

---

## 2. Pełna lista funkcji

Legenda: **GOTOWE** = działa w kodzie produkcyjnym · **W BUDOWIE (x%)** = częściowo, z opisem braków · **PLANOWANE** = stub/TODO.

### 2.A Warsztat / CRM (rdzeń „PilotGo-killer")

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Zlecenia napraw (pełny cykl) | GOTOWE | 95 | Przyjęcie → naprawa → wydanie z pełną historią i numeracją ZLP-… | Supabase, realtime |
| Dynamiczne statusy zleceń | GOTOWE | 100 | Własne statusy z kolorami, kolejnością i auto-SMS-em per status | `workshop_order_statuses` |
| Terminarz drag&drop (stanowiska) | GOTOWE | 90 | Planowanie napraw na stanowiskach przeciągnięciem | `WorkshopScheduler` (~105 KB) |
| Rezerwacje online z portalu | GOTOWE | 90 | Klient sam rezerwuje termin; potwierdzenie kodem SMS | `booking-*`, SMSAPI |
| Agent głosowy AI (odbiera telefon, umawia, tworzy zlecenia) | W BUDOWIE | 80 | AI odbiera telefon, sprawdza terminy, umawia wizytę i zakłada zlecenie. Brakuje: produkcyjnej konfiguracji telefonii per klient (numer/SIP), dzwonienie WYCHODZĄCE to stub | ElevenLabs Conversational AI, Claude, `voice-agent-llm/chat/tools` |
| Transkrypcja rozmów w karcie zlecenia | GOTOWE | 90 | Pełny zapis i podsumowanie rozmowy telefonicznej przy zleceniu | `voice_calls/transcripts/outcomes`, `OrderCallPanel` |
| Trening agenta self-play + baza wiedzy | GOTOWE | 85 | Agent sam trenuje na symulowanych klientach i uczy się reguł | `voice-agent-simulate`, `voice-call-analyze` |
| SMS: wysyłka, harmonogram, historia, centrum SMS | GOTOWE | 95 | Automatyczne SMS-y statusowe, przypomnienia 24h/2h, pełna historia (`/warsztat/sms`) | SMSAPI / JustSend, `workshop_sms_log` |
| Zdjęcia i pliki przy zleceniu | GOTOWE | 100 | Zdjęcia auta przy przyjęciu i naprawie, prywatny bucket, podpisane URL-e | Storage `workshop-order-photos` |
| Karta klienta online (publiczny link) | GOTOWE | 95 | Klient śledzi naprawę na żywo, akceptuje kosztorys i podpisuje elektronicznie | realtime, e-podpis, auto-tłumaczenie |
| Kosztorysy (wycena) | GOTOWE | 95 | Kosztorys z pozycjami, wysyłka do klienta, śledzenie akceptacji i zmian po wysyłce | `WorkshopEstimatePreviewDialog` |
| Faktury/paragony ze zlecenia | GOTOWE | 90 | Jeden klik: zlecenie → faktura → PDF → e-mail → KSeF; blokada duplikatów | `user_invoices`, `invoice-pdf`, KSeF |
| Baza klientów i pojazdów + historia napraw | GOTOWE | 95 | Kartoteka klientów i aut z historią zleceń, zadań, przebiegów | `workshop_clients/vehicles` |
| Most historii napraw → konto klienta (transfer po VIN) | GOTOWE | 90 | Historia napraw „podąża" za autem do konta właściciela w GetRido | `client-verify-vehicle-ownership` |
| Dekoder VIN / tablic rejestracyjnych | GOTOWE | 90 | Wpisujesz rejestrację lub VIN — dane auta uzupełniają się same (kredytowane) | RegCheck Poland (`vehicle-check`) |
| Magazyn części (FIFO) | GOTOWE | 85 | Stany magazynowe, partie FIFO, zdejmowanie części przy zleceniu | `workshopStock.ts`, `inventory_*` |
| Przyjęcie towaru z faktury zakupu (OCR) | GOTOWE | 85 | Zdjęcie faktury zakupowej → AI czyta pozycje → magazyn się uzupełnia | Claude OCR (`parse-purchase-invoice`, `process-purchase-inventory`) |
| „Znajdź części z Rido" (hurtownie) | W BUDOWIE | 70 | Opis usterki po polsku → AI znajduje numery OE → ceny/dostępność z hurtowni → koszyk → zamówienie. Działa: Hart, Auto Partner, Inter Cars (wymaga kont/kluczy). Stub (nieaktywne): Gordon, Motorro, Feber, Elit, Autos, Stahlgruber, Autodoc Pro. Brak dekodera VIN→TecDoc | Hart API, Auto Partner API, Inter Cars OAuth, Claude Haiku |
| Portal pracownika (mechanika) | GOTOWE | 90 | Osobny, prosty portal dla mechanika: jego zlecenia, lista prac, zgłaszanie ustaleń | `/pracownik-warsztat` |
| Ustalenia mechanika → akceptacja biura | GOTOWE | 90 | Mechanik zgłasza usterki, biuro zatwierdza — nic nie ginie „na gębę" | `workshop-employee-submit/approve-findings` |
| Pracownicy: zaproszenia, role, powiadomienia | GOTOWE | 90 | Zapraszanie pracowników e-mailem, role (właściciel/recepcja/mechanik), dzwonek powiadomień | `workshop-invite-employee`, realtime |
| Stanowiska / działy warsztatu | GOTOWE | 90 | Stanowiska pracy z przypisaniami i notatkami przekazania | `workshop_stations` |
| Kasa + finanse warsztatu | GOTOWE | 90 | Kasa dzienna, zamknięcia, wydatki, koszty stałe, rozróżnienie przychód (completed_at) vs wpływ (paid_at), długi klientów | `workshop_payments/cash_closures` |
| Raporty (firma, statystyki, sprzedaż, payroll) | GOTOWE | 85 | Raporty przychodów, zysku, wypłat pracowników, sprzedaży | `WorkshopReports/Payroll/...` |
| Przechowalnia opon | GOTOWE | 90 | Ewidencja przechowywanych opon/kół z zadaniami | `workshop_tire_storage` |
| Cenniki usług / szablony zadań / checklisty | GOTOWE | 85 | Własne cenniki, szablony zadań i checklisty przyjęcia | `TaskTemplatesPage`, `ChecklistItemsPage` |
| Auto-tłumaczenie treści zleceń | GOTOWE | 85 | Karta klienta czyta się w języku klienta (UA/RU/EN…) | `workshop-translate*`, cache |
| Moduł „dane naprawcze" | PLANOWANE | 10 | Dane serwisowe/naprawcze — kafelek „Już wkrótce" (beta testerzy) | — |
| Trial modułu warsztat (14 dni) | W BUDOWIE | 60 | Aktywacja triala działa; brak logiki wygaszania po terminie (TODO) | `activate-workshop-trial` |

### 2.B Flota (rozliczenia przewozów)

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Pojazdy floty (CRUD, przypisania, historia) | GOTOWE | 95 | Pełna kartoteka aut z historią kierowców i przychodem per auto | Supabase |
| Kierowcy (kartoteka, długi, opłaty, dokumenty) | GOTOWE | 95 | Kierowcy z długami tygodniowymi, opłatami dodatkowymi, statusami dokumentów | `weekly-debt-*` |
| Rozliczenia CSV Uber/Bolt/FreeNow | GOTOWE | 95 | Wrzucasz CSV z platform — system sam rozlicza tydzień każdego kierowcy | `settlements` (1999 linii), fuzzy match |
| Dopasowanie kierowca↔platforma (`driver_platform_ids`) | GOTOWE | 95 | Automatyczne łączenie wierszy CSV z kierowcami (Levenshtein, polskie znaki) + ręczne dopasowanie | `fuzzyMatch.ts` |
| Plany rozliczeniowe (settlement_plans) | GOTOWE | 90 | Pakiety opłat floty za rozliczanie kierowcy (abonament bazowy + %) | `settlement_plans` |
| Karty paliwowe + import transakcji | GOTOWE | 90 | Import CSV paliwa, przypisanie kart do kierowców | `fuel-import` |
| Dokumenty + alerty wygasania (OC, przeglądy) | GOTOWE | 90 | Pilnuje terminów polis i przeglądów, wysyła przypomnienia | `reminders`, `insurance-alerts`, Resend |
| Umowy + e-podpis (szablony, wysyłka) | W BUDOWIE | 75 | Generowanie umów z szablonów i podpis elektroniczny; portal umowy po tokenie jeszcze cienki | `fleet-documents/`, SignaturePad |
| Panel kierowcy | GOTOWE | 95 | Rozliczenia, paliwo, dokumenty, własne/wynajęte auta, profil B2B, zmiana konta bankowego z potwierdzeniem e-mail | `DriverDashboard` (1777 linii) |
| Panel właściciela floty / floty partnerskie | GOTOWE | 90 | Rozliczenia właścicieli aut, floty partnerskie, wypłaty | `FleetOwnersTab` |
| Panel admina (multi-miasto) | GOTOWE | 90 | Zarządzanie wszystkimi flotami, użytkownikami, alertami | `UnifiedDashboard` |
| Delegowanie ról we flocie | W BUDOWIE | 80 | Właściciel nadaje własne stanowiska z uprawnieniami per zakładka; delegacja dla osoby spoza floty (nie-kierowcy) nie działa | `fleet_delegated_roles` |
| Raport dzienny e-mail | GOTOWE | 85 | Automatyczny dzienny raport floty na e-mail | `send-daily-report` |

### 2.C Wynajem (Flota & Wynajem)

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Rezerwacje/zlecenia wynajmu | GOTOWE | 85 | Rezerwacje pojazdów z workspace rezerwacji i kokpitem | `rental-availability`, `rental-dispatcher` (outbox) |
| Pojazdy wynajmu | GOTOWE | 85 | Kartoteka przedmiotów wynajmu | `RentalVehiclesList` |
| Kalendarz wynajmu | W BUDOWIE | 60 | Komponent istnieje, kafelek „wkrótce" | `RentalCalendar` |
| Cennik wynajmu | W BUDOWIE | 60 | Komponent istnieje, kafelek „wkrótce" | `RentalPricing` |
| Płatności wynajmu + przypomnienia | W BUDOWIE | 65 | Panel płatności + przypomnienia SMS/e-mail (5 TODO) | `rental-payment-reminders`, SMSAPI, Resend |
| Portal klienta umowy (`/umowa/:rentalId`) | W BUDOWIE | 70 | Klient widzi umowę wynajmu, podpis; wariant po tokenie ledwo zaczęty | `RentalClientPortal` |
| Protokoły, ubezpieczenia, faktury wynajmu | W BUDOWIE | 70 | Protokół zdawczo-odbiorczy, panel ubezpieczeń, faktury | `RentalProtocol/Insurance/Invoices` |
| Gating per firma (entitlement `rental`) | GOTOWE | 95 | Moduł włączany per firma (trial/enabled), fail-safe ukryty | `company_modules`, `can_use_module` |

### 2.D Giełda aut (`/gielda`) i Rido Market (`/marketplace`)

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Ogłoszenia pojazdów (najem/sprzedaż/leasing) | GOTOWE | 95 | Przeglądanie, filtry, widoki, kreator dodawania (1197 linii) | Supabase |
| Wyszukiwanie po mapie (promień, klastry) | GOTOWE | 90 | Rysowanie obszaru na mapie, wyniki geograficzne | Google Maps, supercluster |
| Porównywarka (do 4 aut) | GOTOWE | 95 | Porównanie aut obok siebie ze zdjęciami | `CompareContext` |
| Ulubione / schowek | GOTOWE | 95 | Zapisywanie ogłoszeń (konto lub gość) | `user_wishlists` |
| Opis ogłoszenia przez AI | GOTOWE | 90 | Jeden klik — AI pisze profesjonalny opis auta | `ai-service` |
| AI poprawa zdjęć (before/after) | GOTOWE | 90 | Płatne AI-czyszczenie zdjęć ze suwakiem przed/po (kredyty) | `ai-photo-edit` (Gemini), creditGate |
| Kontakt kupujący↔sprzedający | GOTOWE | 80 | Odsłonięcie telefonu/e-maila (BEZ czatu w giełdzie aut) | `track-listing-interaction` |
| foto-proxy (zdjęcia z legacy CRM) | GOTOWE | 90 | Stare zdjęcia z getrido.pl/Asari działają dalej | edge `foto-proxy` + PHP proxy |
| Rido Market — ogłoszenia ogólne | GOTOWE | 85 | Uniwersalne ogłoszenia z kategoriami, atrybutami, koszykiem | `marketplace_*` |
| Czat kupujący↔sprzedający (Rido Market) | GOTOWE | 85 | Konwersacje i wiadomości przy ogłoszeniach ogólnych | `marketplace_conversations` |
| AI ocena ogłoszenia (jakość/cena) | GOTOWE | 85 | AI ocenia ogłoszenie i cenę (Rido Market + nieruchomości; NIE w /gielda) | `ai-listing-assessment` |
| Parsowanie ogłoszenia z tekstu przez AI | GOTOWE | 85 | Wklej tekst — AI wypełnia formularz ogłoszenia | `parse-general-listing`, `parse-listing-ai` |
| Koszyk + wysyłka InPost | W BUDOWIE | 50 | Koszyk działa; InPost Geowidget czeka na umowę ShipX (TODO) | `payments.product_type='inpost_label'` |
| Promowanie/wyróżnianie ogłoszeń | GOTOWE | 80 | Płatne wyróżnienie ogłoszenia | `listing_promotions`, `payment-core` |
| Uniwersalna wyszukiwarka AI (`/wyniki`) | GOTOWE | 85 | Jedno pole — AI rozumie intencję i szuka w autach/nieruchomościach/usługach | `ai-search` (Gemini) |

### 2.E Nieruchomości (`/nieruchomosci`)

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Ogłoszenia + landingi SEO + filtry + mapy | GOTOWE | 95 | Pełny portal nieruchomości z mapami i porównywarką | Google Maps |
| Panel agenta (ogłoszenia, zespół, CRM, kalendarz) | GOTOWE | 90 | Kompletny pulpit agenta z CRM leadów | `RealEstateAgentDashboard` |
| Umówienie oglądania + potwierdzenia | GOTOWE | 90 | Klient prosi o oglądanie, potwierdza linkiem; agent ma kalendarz | `schedule-viewings`, SMSAPI |
| Synchronizacja Google Calendar agenta | GOTOWE | 85 | Oglądania wpadają do kalendarza Google | Google Calendar |
| Import z CRM Asari (XML) | GOTOWE | 85 | Automatyczny import ogłoszeń z Asari | `crm-import-asari` |
| Wiadomości klient↔agent | GOTOWE | 90 | Czat przy ogłoszeniu | `property_messages` |
| AI wyszukiwanie naturalnym językiem | W BUDOWIE | 60 | „3 pokoje do 800 tys. z balkonem" → filtry; zamknięte na e-maile właścicieli (beta) | `ai-search` |
| SEO-agent (auto-klasyfikacja ogłoszeń) | GOTOWE | 85 | AI porządkuje typy nieruchomości i SEO | Claude (`seo-agent`) |

### 2.F Usługi (`/uslugi`) + Ubezpieczenia + Sprzedaż

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Marketplace usługodawców (kategorie, profile) | GOTOWE | 90 | Katalog usługodawców z mediami i opiniami | Supabase |
| Rezerwacja z weryfikacją SMS (OTP) | GOTOWE | 90 | Rezerwacja terminu potwierdzana 4-cyfrowym kodem SMS | `booking-send-verification/verify-code` |
| Obowiązkowa recenzja po usłudze | GOTOWE | 90 | Automatyczna prośba o opinię — buduje wiarygodność | `booking-review-reminder` |
| Panel usługodawcy (rezerwacje, kalendarz, księgowość) | GOTOWE | 90 | Pełny pulpit usługodawcy (1392 linie) | Supabase |
| Prowizje miesięczne (auto-fakturowanie) | GOTOWE | 85 | Platforma sama wystawia usługodawcy fakturę prowizyjną 1. dnia miesiąca | `commission-monthly-billing` |
| Opis usługodawcy przez AI | GOTOWE | 90 | AI pisze opis marketingowy firmy | Kimi→Claude fallback |
| Portal agenta ubezpieczeniowego | GOTOWE | 85 | Leady z wygasających polis flotowych + składanie ofert OC/AC | `insurance-alerts` |
| Portal handlowca (leady, callbacki, kalendarz, statystyki) | GOTOWE | 90 | CRM sprzedażowy z automatyzacjami | `score-lead`, `smart-followup` |
| AI agent sprzedażowy (auto-kontakt, scoring, kolejka telefonów) | W BUDOWIE | 75 | AI pisze do leadów, punktuje ich i kolejkuje „gorących"; auto-dzwonienie wychodzące = stub | Claude, Meta Leads, Twilio (stub) |
| Webhooki leadów (Meta Ads, Zapier/Make, Sheets, Telegram) | GOTOWE | 85 | Leady z reklam i zewnętrznych źródeł wpadają same | Meta Graph API, Google Sheets, Telegram |
| Marketing: kreacje AI, A/B testy, rotacja, GMB, Instagram | GOTOWE | 80 | Auto-generowanie kreacji, testy A/B, posty Google Moja Firma i Instagram | Claude Vision, GMB API, Meta Graph |

### 2.G Księgowość / Faktury / KSeF

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| Program do faktur (`/faktury`) | GOTOWE | 95 | Faktury VAT, proformy, zaliczkowe, korekty, VAT-RR, „w stu", zw/np/oo/WDT/EX | jsPDF/html2pdf |
| Numeracja faktur (wzorce, tryby, bez martwego licznika) | GOTOWE | 95 | Własne wzorce numeracji (RRRR/MM/NNN…), tryby ciągły/luki/ręczny | `invoiceNumbering.ts` |
| MPP (split payment) | GOTOWE | 95 | Automatyczna adnotacja mechanizmu podzielonej płatności | — |
| KSeF — wysyłka faktur sprzedaży + UPO | GOTOWE | 90 | Wysyłka do KSeF (API v2, FA(3)), status, pobranie UPO — środowiska test/demo/prod | `ksef-integration` (2354 linie) |
| KSeF — odbiór/eksport faktur zakupowych | GOTOWE | 90 | Paczki zakupowe z KSeF, deduplikacja po numerze KSeF | fflate, SHA-256 |
| KSeF Monitor (AI pilnuje zmian w KSeF) | GOTOWE | 85 | AI skanuje komunikaty MF i alarmuje e-mailem o zmianach API | Claude, Resend |
| OCR faktur zakupowych | GOTOWE | 90 | Zdjęcie/PDF faktury → AI wyciąga pozycje z oceną pewności | Claude Sonnet |
| Weryfikacja kontrahenta (GUS, biała lista, VIES) | GOTOWE | 90 | NIP → dane firmy + status VAT + biała lista + VIES UE | GUS BIR1.1, wl-api.mf.gov.pl, VIES SOAP |
| Pulpit księgowości (`/ksiegowosc`) | GOTOWE | 85 | Skrzynka dokumentów, raporty miesięczne, eksporty, przeglądy podatkowe | rola `accounting_admin` |
| Faktury cykliczne + przypomnienia o płatnościach | GOTOWE | 85 | Automatyczne faktury cykliczne i windykacja miękka | `invoice_recurring_rules` |
| Asystent AI faktur (komendy naturalne) | GOTOWE | 85 | „Wystaw fakturę dla X na 500 zł" — AI robi resztę | Gemini |
| Miękkie kasowanie faktur sprzedaży | PLANOWANE | 0 | Znany dług techniczny: dziś twarde DELETE | — |

### 2.H AI / komunikacja / pozostałe

| Funkcja | Status | % | Opis dla klienta | Integracje |
|---|---|---|---|---|
| RidoAI — czat globalny (maskotka) | GOTOWE | 90 | Asystent AI na każdej stronie: rozmowy, projekty, głos | `ai-chat` (841 linii, multi-provider, SSE) |
| AI Pro (pakiet premium AI) | GOTOWE | 85 | 6 funkcji AI dla firm (analiza marż, OCR, asystent magazynu, copy, compliance, doradca podatkowy) — trial 14 dni, 99 zł/mc | `ai_pro_subscriptions`, paywall |
| Konfiguracja agentów AI per moduł (admin) | GOTOWE | 90 | Admin ustawia model/prompt/ikonę agenta dla każdego portalu | `ai_agents_config`, `aiModels.ts` |
| Multi-provider AI (Gemini/GPT/Claude/Kimi + własne klucze) | GOTOWE | 90 | Domyślnie Lovable Gateway; użytkownik może podpiąć własny klucz | `AISettingsPanel`, AES-GCM `ai_secret_store` |
| Meetings — nagrywanie + notatki AI ze spotkań | W BUDOWIE | 80 | Nagraj/wgraj audio → transkrypcja → podsumowanie + action items; zamknięte na 1 e-mail (beta wewnętrzna) | Deepgram, MediaRecorder |
| RidoMail — klient e-mail z AI | W BUDOWIE | 70 | Skrzynka IMAP/SMTP z AI (priorytety, streszczenia, odpowiedzi); hasła IMAP w plaintext (TODO AES-256) | IMAP/SMTP, Gemini |
| Workspace/Workflow (zadania, kanban, czat, docs, automatyzacje) | GOTOWE | 85 | ClickUp-owy moduł zespołowy: zadania, kalendarz, czat, dokumenty, automatyzacje, onboarding zespołu | `useWorkspace`, `run-automations` |
| Tłumaczenia UI — 7 języków | GOTOWE | 97 | PL/EN/RU/UA/DE/VI/KZ (~3800–3926 kluczy, plural CLDR) | i18next |
| Auto-tłumaczenie treści użytkowników (do 15 języków) | GOTOWE | 90 | Ogłoszenia/opinie/wiadomości tłumaczą się same (globalny cache hash) | `translate-content`, `translation_cache_global` |
| Onboarding (tury po modułach, pomoc, wideo) | GOTOWE | 85 | Interaktywne przewodniki per moduł | `OnboardingContext` |
| Motywy UI z panelu admina | W BUDOWIE | 40 | Dziś tylko kolor paska nawigacji (realtime) | `ui_settings` |
| PWA + auto-aktualizacja | GOTOWE | 95 | Instalacja jak aplikacja, sama się aktualizuje po deployu | vite-plugin-pwa, Workbox |
| Mapy GetRido (`/mapy`) | GOTOWE | 80 | Mapy z danymi POI/dojazdów | Google Places/Distance Matrix |
| Rejestracje (kierowca/flota/marketplace/agent/usługodawca) | GOTOWE | 90 | Osobne ścieżki rejestracji z mailami aktywacyjnymi (fix CRLF dla qmail w toku na tej gałęzi) | SMTP denomailer + Resend |
| Powiadomienia (in-app, e-mail, SMS, Telegram) | W BUDOWIE | 75 | Dzwonki realtime + e-mail + SMS; wspólny dyspozytor `_shared/notifications.ts` zbudowany, ale NIEPODPIĘTY; brak Web Push | Resend, SMSAPI, Telegram |
| System zgłoszeń/ticketów z AI | GOTOWE | 80 | Czat AI do wsparcia (whitelist) | `ticket-ai-chat` |

---

## 3. Potwierdzenie konkretnych obszarów

| Obszar | Jest? | Status |
|---|---|---|
| **AI agent telefoniczny (jak PilotGo/Zilo)** | ✅ JEST | **W BUDOWIE ~80%.** Architektura realna: ElevenLabs Conversational AI (telefonia+STT+TTS) + własny „mózg" Claude (`voice-agent-llm/chat`). Narzędzia działają: sprawdzanie terminów, tworzenie rezerwacji i **tworzenie zleceń** ze statusem „Umówiony telefonicznie" (klient+pojazd zakładane po numerze telefonu/rejestracji). Do domknięcia: konfiguracja numerów/SIP per warsztat (plan: Play SIP), dzwonienie WYCHODZĄCE (`ai-call-worker`) to jawny placeholder |
| **Transkrypcja rozmów** | ✅ JEST | **GOTOWE.** `OrderCallPanel` w karcie zlecenia: pełna transkrypcja, podsumowanie, wynik rozmowy, obiekcje (tabele `voice_calls/transcripts/outcomes`). Osobno Deepgram (PL, diaryzacja) dla spotkań |
| **SMS + historia SMS** | ✅ JEST | **GOTOWE.** SMSAPI/JustSend, auto-SMS per status (flaga `sends_sms` + szablon), przypomnienia 24h/2h, harmonogram, centrum SMS `/warsztat/sms`, historia w `workshop_sms_log`, licznik SMS przy zleceniu, dokupowanie pakietów SMS |
| **Zdjęcia aut przy zleceniach** | ✅ JEST | **GOTOWE.** Prywatny bucket `workshop-order-photos`, zakładka plików w zleceniu, podpisane URL-e + miniatury, zdjęcia przy przyjęciu |
| **Dynamiczne statusy zleceń** | ✅ JEST | **GOTOWE.** Tabela per warsztat (nazwa/kolor/kolejność/auto-SMS), edytor w ustawieniach, tryb auto/manual, pełna historia zmian z rolą aktora |
| **Terminarz/kalendarz + rezerwacje online** | ✅ JEST | **GOTOWE.** Terminarz drag&drop po stanowiskach, rezerwacje z portalu z weryfikacją SMS-OTP, link do zmiany terminu `/r/:token`, agent głosowy też umawia |
| **Magazyn/części + hurtownie** | ✅ JEST | **W BUDOWIE ~70–85%.** Magazyn FIFO gotowy. Hurtownie: 3 żywe integracje (Hart, Auto Partner, Inter Cars OAuth) — wymagają kont klienta; 7 hurtowni to stuby `active:false`. AI zamienia opis usterki na numery OE (Claude). Brak TecDoc/dekodera VIN→części |
| **Faktury i wyceny** | ✅ JEST | **GOTOWE.** Kosztorys z e-akceptacją i e-podpisem klienta; faktura/paragon ze zlecenia → PDF → e-mail → KSeF; blokada duplikatów |
| **Baza klientów i pojazdów z historią napraw** | ✅ JEST | **GOTOWE.** Kartoteki + historia zleceń/zadań/przebiegów per auto + unikalny most przenoszący historię do konta nowego właściciela po VIN |
| **Dekodowanie VIN / tablic** | ✅ JEST | **GOTOWE.** RegCheck Poland (CheckPoland SOAP) — po rejestracji lub VIN, kredytowane (`vehicle_lookup_credits`) |
| **Osobny panel pracownika vs biura** | ✅ JEST | **GOTOWE.** `/pracownik-warsztat` (mechanik: karta zlecenia, lista prac, ustalenia) vs `WorkshopDashboard` (biuro/właściciel). Obieg: mechanik zgłasza → biuro zatwierdza |
| **Uprawnienia/role** | ✅ JEST | **GOTOWE (z lukami).** Warsztat: owner/reception/mechanic + RLS. Platforma: 12 ról + delegacje we flocie + toggle'y funkcji + widoczność modułów per rola. Luki: delegacja dla nie-kierowcy nie działa, hardcoded allowlist właścicieli |
| **Powiadomienia push/e-mail** | ⚠️ CZĘŚCIOWO | E-mail (Resend + SMTP) i in-app realtime: GOTOWE. **Natywnego Web Push BRAK** (zero VAPID/pushManager w kodzie) — kanał „push" to Telegram/SMS. Wspólny dyspozytor `_shared/notifications.ts` zbudowany, ale niepodpięty |
| **Ogłoszenia/marketplace** | ✅ JEST | **GOTOWE.** Cztery portale: giełda aut, Rido Market, nieruchomości, usługi (szczegóły w sekcji 2.D–F) |
| **Płatności (Stripe/inne)** | ✅ JEST | **GOTOWE (Przelewy24, nie Stripe).** `payment-core` + webhook: init/confirm, sandbox/prod, tryb symulowany bez bramki. Produkty: zakupy marketplace, pakiety AI foto, kredyty SMS, kredyty AI, wyróżnienie ogłoszenia, subskrypcja, etykieta InPost. **Stripe/PayU/Tpay-checkout: brak** (Tpay w kodzie = tylko pola wypłat kierowców) |

---

## 4. Ślady komercyjne (monetyzacja w kodzie)

**Bramka płatności:** wyłącznie **Przelewy24** (`payment-core`, `payment-core-webhook`, `payment_gateway_config`, sekret `P24_CRC_KEY`, tryb sandbox + fallback „symulowana płatność"). Strony `/payment/success`, `/payment/cancel`, `/buy-credits`, publiczna strona **`/cennik`** (CennikPage).

**Produkty płatne** (CHECK w tabeli `payments.product_type`): `marketplace_purchase`, `ai_photo_package`, `sms_credits`, `ai_credits`, `listing_featured`, `subscription`, `inpost_label`.

**Subskrypcje / plany:**
- **AI Pro**: `ai_pro_pricing_config` — **99 PLN/mc**, trial **14 dni**, `show_paywall=true`, statusy `trial_active/trial_expired/active_paid/active_comped/pending_payment`, wyjątki per e-mail (`ai_pro_exemptions`), per firma (`entity_id`).
- **Trial warsztatu 14 dni** (`activate-workshop-trial`; logika wygaszania = TODO).
- **Entitlement 3-warstwowy** (migracja WYN3): `feature_toggles` (globalny kill-switch) ∧ `company_modules` (per firma: `module_key` rental/invoicing/payments/calendar/gielda/telematics, `enabled`, **`trial_until`**) ∧ `module_visibility` (per rola). Funkcje SQL `company_module_enabled`, `can_use_module`.
- **Plany rozliczeniowe flot** (`settlement_plans`: base_fee + tax% + service_fee, audyt zmian, `is_plan_available`).
- `paid_services` + `paid_service_subscriptions` (panel admina).

**Kredyty (pay-per-use):**
- **Kredyty AI**: `user_credits` (50 gratis na start), pakiety `ai_credit_packages`: **Starter 100/19,99 zł, Pro 250/39,99 zł, Business 500/69,99 zł**; bramka `_shared/creditGate.ts` + cennik `ai_pricing.credits_per_use` (wpięte w AI foto).
- **Kredyty SMS**: `deduct_sms_credit`, modal „Dokup pakiet SMS", `QuotaGuardProvider` (łapie brak środków → otwiera dokup → ponawia akcję).
- **Kredyty sprawdzeń pojazdu (VIN/rejestracja)**: `vehicle_lookup_credits` + transakcje + `deduct_vehicle_lookup_credit`.
- **Limity AI**: `ai_limits_config` (dzienne requesty/tokeny/dokumenty/obrazy, budżet PLN/mc, tryb block/warn), `ai_guest_usage`, `voice_usage_monthly`.

**Prowizje:** `commission-monthly-billing` — miesięczne faktury prowizyjne dla usługodawców (`service_commission_settings/invoices`).

**Feature flagi / gating:** `feature_toggles` (m.in. `marketplace_enabled`, `fleet_registration_enabled`, `ai_call_enabled_global`, `inventory_*` ×8), `ai_feature_flags` (np. `ai_photo_edit`), `module_visibility`, whitelisty (`ai_call_user_whitelist`, NIP-owa, `beta_testers`, `ticket_chat_whitelist`), hardcoded `OWNER_EMAILS` (super-dostęp) i gating Meetings do 1 e-maila.

**Rabaty/wzrost:** `promo_codes` (+ redempcje, `validate_promo_code`), `referral_codes/uses/settings` + `complete_referral_on_first_purchase` (hook w payment-core), `loyalty_programs`, `promotion_pricing`, portfele (`user_wallets`, transakcje PLN/coins).

**Czego NIE ma:** Stripe, PayU, Tpay-checkout (Tpay tylko jako pola wypłat kierowców w rozliczeniach), brak kluczy płatności w `.env` (sekrety w Supabase).

---

## 5. Gotowe teksty na stronę sprzedażową (funkcje GOTOWE)

**Zlecenia, które prowadzą się same**
Od telefonu klienta po fakturę — jedno zlecenie, zero karteczek. Każdy etap naprawy widzisz na tablicy, a historia zmian zapisuje się sama.

**Twoje statusy. Twoje SMS-y. Zero konfiguracji u informatyka**
Ustaw własne etapy naprawy z kolorami, a system sam wyśle klientowi SMS, gdy auto będzie gotowe. Ty naprawiasz — GetRido informuje.

**Klient widzi naprawę na żywo — i przestaje dzwonić**
Wysyłasz jeden link. Klient sam sprawdza status, ogląda kosztorys i podpisuje go palcem na telefonie. Mniej telefonów „co z moim autem?", więcej czasu na naprawy.

**Kosztorys zaakceptowany na piśmie — koniec sporów przy odbiorze**
Elektroniczny podpis klienta pod protokołem przyjęcia i kosztorysem, z zamrożoną kopią dokumentu. „Nie zgadzałem się na to" przestaje być argumentem.

**Terminarz, który układa dzień za Ciebie**
Przeciągnij zlecenie na stanowisko i gotowe. Klienci rezerwują terminy online z potwierdzeniem SMS — kalendarz zapełnia się sam, nawet po godzinach.

**SMS-y, które zarabiają**
Automatyczne przypomnienia 24h i 2h przed wizytą tną nieobecności, a prośba o opinię po naprawie buduje Ci gwiazdki w Google. Pełna historia każdej wiadomości w jednym miejscu.

**Wpisz rejestrację — resztę zrobimy my**
Numer rejestracyjny albo VIN i dane auta uzupełniają się same. Przyjęcie pojazdu w minutę, bez przepisywania z dowodu.

**Historia naprawy przypięta do auta, nie do zeszytu**
Każdy pojazd ma pełną kartotekę: zlecenia, przebiegi, zadania. Gdy auto zmienia właściciela, historia bezpiecznie przechodzi za nim — po numerze VIN.

**Mechanik ma swój panel. Biuro ma spokój**
Prosty portal dla mechanika: jego zlecenia, jego lista prac, zgłaszanie usterek jednym kliknięciem. Biuro zatwierdza i wycenia — nic nie ginie po drodze.

**Rozmowa z klientem? Masz ją na piśmie w karcie zlecenia**
Zapis i podsumowanie rozmowy telefonicznej trafia prosto do zlecenia. Wiesz, co ustalono, nawet jeśli odbierał ktoś inny.

**Magazyn, który sam się pilnuje**
Części schodzą ze stanu przy zleceniu (FIFO), a fakturę zakupową wystarczy sfotografować — AI wczyta pozycje do magazynu za Ciebie.

**Zdjęcie faktury → gotowa pozycja w kosztach**
OCR oparty na AI czyta faktury zakupowe z PDF-a lub zdjęcia i podpowiada pozycje z oceną pewności. Koniec ręcznego przepisywania.

**Faktura w KSeF jednym kliknięciem**
Ze zlecenia robisz fakturę, wysyłasz do KSeF i pobierasz UPO — bez wychodzenia z programu. Numeracja, MPP i stawki VAT pilnują się same.

**Kasa się zgadza co do złotówki**
Osobno przychód, osobno realne wpływy, osobno długi klientów. Zamknięcie dnia i miesiąca, wydatki, koszty stałe i wypłaty pracowników — w jednym raporcie.

**Przechowalnia opon bez arkusza w Excelu**
Ewidencja kompletów, przypisanie do klienta i zadania sezonowe. Wiosną wiesz dokładnie, czyje koła leżą na której półce.

**Sprawdzisz kontrahenta, zanim odpuścisz VAT**
NIP → dane z GUS, biała lista MF i VIES w kilka sekund, prosto w fakturze.

**Warsztat, który mówi językiem klienta**
Karta zlecenia tłumaczy się automatycznie na ukraiński, rosyjski, angielski i inne języki. Klient zza granicy rozumie kosztorys bez tłumacza.

**Cały zespół w jednej aplikacji**
Zaproś pracowników e-mailem, nadaj role (właściciel, recepcja, mechanik) i śpij spokojnie — każdy widzi tylko to, co powinien.

*(Do landing page'a NIE wystawiać jeszcze jako „gotowe": agenta telefonicznego AI — działa przyjmowanie zgłoszeń, ale telefonia produkcyjna per klient jest w konfiguracji; integracji z hurtowniami — żywe są 3 z 10 i wymagają kont w hurtowniach; powiadomień push — brak natywnego Web Push.)*

---

## Aneks: największe luki przed komercjalizacją

1. **Bezpieczeństwo**: globalne `verify_jwt=false` + część funkcji cron/webhook bez żadnej autoryzacji; znane blokery z audytu RLS warsztatu (anon `USING(true)`); hasła IMAP w RidoMail w plaintext (TODO AES-256).
2. **Telefonia produkcyjna** dla agenta głosowego (numery/SIP per warsztat) + wychodzące połączenia (`ai-call-worker` = placeholder).
3. **Trial warsztatu bez wygaszania** (brak enforcement po 14 dniach).
4. **Hurtownie części**: 7/10 to stuby; brak TecDoc → ograniczona trafność wyszukiwania części.
5. **Web Push**: brak; warto dodać (VAPID) albo świadomie komunikować SMS/Telegram jako kanał.
6. **Wynajem**: kalendarz/cennik/płatności oznaczone „wkrótce".
7. Brak testów automatycznych (poza 1 plikiem) — weryfikacja wyłącznie ręczna w dev serwerze.
