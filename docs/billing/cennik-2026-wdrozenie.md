# Rewizja cennika 2026 — co wyklikać w panelu

Stan wyjściowy: schemat rewizji wykonany (migracja `20260810180000_billing_revision.sql`,
część A + B), dane w bazie wciąż z zasiewu etapu 2. Ten dokument opisuje wyłącznie
wprowadzenie **danych**. Źródło decyzji cenowych: specyfikacja rewizji z 10.08.2026.

Panel: **/admin → Płatności → Funkcje / Plany** (obie zakładki widoczne tylko dla
`platform_admin`).

---

## 0. Kolejność, której nie wolno odwrócić

1. migracja `20260811120000_billing_plan_features_soft_limit.sql`
2. deploy edge `billing-admin-plans`
3. deploy frontu
4. dopiero teraz klikanie

Przed komplet­nym wdrożeniem tej trójki **nie otwieraj i nie zapisuj macierzy żadnego
planu**. Zapis macierzy to podmiana (DELETE + INSERT); dopóki RPC, edge i front nie
znają `soft_limit_value`, każdy zapis wyczyści progi miękkie Standard/Pro, które
właśnie ustawiła migracja rewizji — po cichu, bez błędu.

---

## 1. Zakładka Funkcje

| # | Co | Jak |
|---|---|---|
| F1 | `vehicle_lookup` → licznik | Edytuj → Rodzaj: **licznik**, Jednostka: **sprawdzenie** |
| F2 | nowa `voice_concurrent_calls` | Dodaj → klucz `voice_concurrent_calls`, nazwa **Połączenia równoczesne**, rodzaj **licznik**, jednostka **połączenie**, kolejność **215** |
| F3 | nowa `voice_numbers` | Dodaj → klucz `voice_numbers`, nazwa **Numery telefoniczne**, rodzaj **licznik**, jednostka **numer**, kolejność **216** |

Opisy (pole nieobowiązkowe):
- `voice_concurrent_calls` — „Ile rozmów agent obsługuje jednocześnie”
- `voice_numbers` — „Ile numerów telefonicznych obsługuje agent”

**Limity pojemnościowe, nie miesięczne.** Obie funkcje trzyma się w `metered`, bo
tylko taki rodzaj ma pole limitu. Kod ma je czytać przez `feature_limit()` w momencie
zestawiania połączenia — **nie** przez `check_usage()`, które sumuje zużycie przez
okres rozliczeniowy i dla pojemności nie ma sensu.

**Do decyzji:** istniejąca funkcja `voice_multi_number` (typ przełącznik, „Obsługa
wielu numerów”) pokrywa się z `voice_numbers`. Rekomendacja: zostawić do czasu
przebudowy `/cennik` (podetap 3.3) i wtedy wyłączyć — dziś siedzi w opisach kart.

---

## 2. Zakładka Plany — edycje

### warsztat_free
- Opis: `Baza klientów i pojazdów, terminarz, 10 zleceń miesięcznie`
- Cena netto **0**, cena docelowa **puste**, Trial **0**
- Funkcje: `workshop_orders` Limit **20 → 10**; zaznacz `vehicle_lookup` z Limitem **3**;
  `ai_repair_help` Limit **3** bez zmian (Próg pusty — na Free limit jest częścią lejka)

### warsztat_standard
- Opis: `Warsztat 1–3 stanowiska. Zlecenia, wyceny i faktury bez limitu, fiskalizacja, KSeF`
- Cena netto **89 → 99**, cena docelowa **139**, Trial **14 → 0**
- Funkcje bez zmian. Jeśli otworzysz macierz — sprawdź, że `ai_repair_help` ma Limit
  pusty / Próg **50**, a `ai_labor_pricing` Limit pusty / Próg **30**

### warsztat_pro
- Opis: `Warsztat od 4 stanowisk. Standard plus magazyn, hurtownie, panel pracowników`
- Cena netto **169** (bez zmian), cena docelowa **249**, Trial **14 → 0**
- Funkcje bez zmian (progi **300** / **100**)

### warsztat_sieci
- Opis: `Wiele lokalizacji. Wspólna baza, analityka sieci, wycena indywidualna`
- Cena indywidualna zostaje, Trial **0**
- Funkcje bez zmian

### agent
- Opis: `Voicebot odbiera telefon 24/7. 600 minut miesięcznie, 1 numer`
- Cena netto **139 → 199**, cena docelowa **249**, Trial **14 → 0**
- Funkcje: `voice_minutes` Limit **120 → 600**; zaznacz `voice_concurrent_calls` Limit **1**;
  zaznacz `voice_numbers` Limit **1**

### agent_pro
- Opis: `1000 minut, 3 połączenia równoczesne, 3 numery, wyceny AI i analityka rozmów`
- Cena netto **289 → 399**, cena docelowa **puste** (399 jest ceną stałą — to argument
  sprzedażowy wobec fonio Solo, nie promocja), Trial **14 → 0**
- Funkcje: `voice_minutes` Limit **300 → 1000**; `voice_concurrent_calls` Limit **3**;
  `voice_numbers` Limit **3**; **odznacz `dedicated_manager`** — opiekun jest wyłącznie
  w Sieciach

---

## 3. Zakładka Plany — nowe

### agent_sieci (nowy)
Dodaj plan:

| Pole | Wartość |
|---|---|
| Kod | `agent_sieci` |
| Nazwa | Agent Sieci |
| Linia produktowa | **Agent AI** |
| Opis | Agent dla sieci. Minuty, połączenia równoczesne i numery ustalane per umowa |
| Cena indywidualna | **włączona** |
| VAT | 23 |
| Trial | 0 |
| Kolejność | **70** |
| Interwał | Miesięcznie |

Funkcje (wszystkie bez limitu — limity sieci wpisuje się per subskrypcja
w `billing_subscription_limits`): `voice_agent`, `voice_creates_orders`,
`voice_callback`, `voice_transcriptions`, `voice_multi_number`, `voice_ai_quotes`,
`voice_priority_quality`, `voice_analytics`, `dedicated_manager`, `voice_minutes`,
`voice_concurrent_calls`, `voice_numbers`.

### trial_warsztat (nowy)
Wariant A z ustaleń: osobny plan trialowy o zakresie Pro, bez Agenta.

| Pole | Wartość |
|---|---|
| Kod | `trial_warsztat` |
| Nazwa | Okres próbny Warsztat |
| Linia produktowa | **Warsztat** |
| Opis | 30 dni pełnego dostępu bez karty, zakres planu Pro |
| Cena netto | 0 |
| Cena docelowa | puste |
| Trial | **30** |
| Kolejność | **95** |

Po utworzeniu **przestaw przełącznik „Aktywny” na wyłączony** — formularz zakłada plan
aktywny, a ten ma być przypisywalny, nie kupowalny (tak samo działał `trial_max`).
Uprawnienia działają niezależnie od tej flagi.

Funkcje = zakres Pro: `workshop_core`, `workshop_photos`, `marketplace_access`,
`workshop_invoices`, `tire_storage`, `fiscalization`, `ksef`, `reports_margin`,
`vehicle_lookup` (bez limitu), `dynamic_statuses`, `warehouse_ocr`,
`wholesaler_integrations`, `employees_panel`, `tecrmi`, `workshop_orders` (bez limitu),
`ai_repair_help` (Limit pusty, **Próg 300**), `ai_labor_pricing` (Limit pusty, **Próg 100**).

---

## 4. Dezaktywacje

Przełącznik „Aktywny” → wyłączony:

- `bundle_warsztat_agent`
- `bundle_max`
- `trial_max`

Okno potwierdzenia pokaże liczbę aktywnych subskrypcji — powinno być **0**. Jeśli
pokaże więcej niż zero, zatrzymaj się: te subskrypcje trzymają linię `other`, więc nie
blokują kupna Warsztatu ani Agenta, ale trzeba je przenieść świadomie, nie przy okazji.

Dezaktywacja nie odbiera nikomu uprawnień — plan znika z oferty, macierz zostaje.

---

## 5. Czego panel NIE zrobi

| Rzecz | Gdzie |
|---|---|
| `promo_enrollment_until = 2026-12-31` | jednolinijkowy UPDATE na `billing_settings` |
| `pack_validity_days` dla `voice_minutes` | brak pola w panelu Funkcji — UPDATE albo dołożenie pola |
| Cena doładowań (0,60 zł/min), pakiety 100/250/500, auto-doładowanie, sufit 200 zł, tryb awaryjny | podetap **3.8** (`billing_consume`) |
| `price_guarantee_until` na subskrypcji | ustawiane przy zakładaniu subskrypcji — etap 4 |
| Karty cennika (nagłówki segmentacyjne, przekreślona cena docelowa, brutto obok netto) | podetap **3.3** — `/cennik` z bazy |

---

## 6. Pułapka, o której trzeba wiedzieć przed kliknięciem

**Gwarancja ceny nie obejmuje limitów.** Cena jest zamrożona w `price_snapshot`
subskrypcji, więc zmiana ceny planu nie dotyka istniejących klientów. Limity działają
odwrotnie: `feature_limit()` czyta je z planu na żywo, więc każda zmiana w macierzy
**działa natychmiast i wstecz** na wszystkich klientach tego planu.

Konsekwencje dla dwóch pozycji z tej listy:

- `warsztat_free`, `workshop_orders` **20 → 10** — dzisiejsi użytkownicy Free z 12
  zleceniami w tym miesiącu wpadną w limit tego samego dnia. Przy dzisiejszej bazie
  to prawdopodobnie nikt, ale sprawdź przed kliknięciem.
- `agent`, minuty **600 → 400** po zakończeniu promocji — **nie da się tego zrobić
  zmianą planu**, bo obcięłoby minuty również klientom objętym gwarancją. Nie ma pola
  na „limit docelowy" i celowo go nie dokładamy. Właściwa ścieżka: przy końcu promocji
  wpisać 600 do `billing_subscription_limits` dla istniejących subskrypcji, dopiero
  potem zmienić plan na 400. Do zaplanowania razem z podetapem 3.7.
