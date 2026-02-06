

# Plan Integracji ASARI CRM z Portalem Nieruchomości

## Cel

Umożliwienie agencjom nieruchomości automatycznego importu ogłoszeń z systemu ASARI CRM na portal, z obsługą hierarchii agencja-pracownik oraz automatyczną synchronizacją.

## Istniejąca Infrastruktura

Projekt ma już przygotowane podstawy:

| Element | Status |
|---------|--------|
| Tabela `real_estate_listings` | Gotowa (ma `external_id`, `crm_source`) |
| Tabela `real_estate_agents` | Gotowa (ma `parent_agent_id` dla hierarchii) |
| Tabela `agency_crm_integrations` | Gotowa (pełna konfiguracja XML/FTP/API) |
| Tabela `crm_integration_providers` | Gotowa (lista dostawców CRM) |
| Panel admin CRM | Gotowy (`CRMIntegrationsPanel.tsx`) |

## Struktura Eksportu ASARI

Na podstawie dokumentacji ASARI:

1. **Format**: XML w formacie EbiuroV2
2. **Kodowanie**: UTF-8 (lub WIN1250, ISO8859-2)
3. **Tryby transferu**: URL XML, FTP (RFC3659)
4. **Kolejność przesyłania**:
   - `definictions.xml` (słowniki)
   - Pliki zdjęć
   - Pliki ofert `*_001.xml, *_002.xml, ...`
   - Plik konfiguracyjny `*_CFG.xml`

### Kluczowe Pola do Mapowania

```text
ASARI XML ID → real_estate_listings
----------------------------------------
ID:1   numer oferty        → external_id
ID:491 tytuł ogłoszenia    → title
ID:10  cena ofertowa PLN   → price
ID:58  pow. użytkowa [m2]  → area
ID:79  liczba pokoi        → rooms
ID:62  piętro              → floor
ID:63  ilość pięter        → total_floors
ID:71  rok budowy          → build_year
ID:48  miejscowość         → city
ID:49  dzielnica           → district
ID:300 ulica               → address
ID:201,202 współrzędne     → latitude, longitude
ID:64  uwagi dodatkowe     → description
ID:170 agent - telefon     → contact_phone
ID:171 agent - e-mail      → contact_email
ID:305 agent               → contact_person
ID:36  nieruchomość        → property_type (mapowanie słownika)
ID:43  operacja            → transaction_type (SPRZEDAŻ/WYNAJEM)
ID:82  przynależne         → has_balcony, has_garden, has_parking (parsowanie)
```

### Słowniki do Mapowania

| ID Słownika | Nazwa | Mapowanie |
|-------------|-------|-----------|
| 1 | typ oferty | SPRZEDAŻ → sale, WYNAJEM → rent |
| 68 | nieruchomość | DOM, MIESZKANIE, DZIAŁKA, LOKAL, OBIEKT |
| 74 | rodzaj mieszkania | BLOK, KAMIENICA, APARTAMENTOWIEC itp. |
| 75 | typ domu | WOLNOSTOJĄCY, BLIŹNIAK, SZEREGOWIEC itp. |

---

## Plan Implementacji

### Faza 1: Migracja Bazy Danych

**Dodać tabelę logów importu i rozszerzyć strukturę:**

```sql
-- Tabela logów pojedynczych importów
CREATE TABLE crm_import_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES agency_crm_integrations(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  total_in_feed INTEGER DEFAULT 0,
  added_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  deactivated_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_details JSONB
);

-- Tabela mapowania pracownik-agent CRM
CREATE TABLE crm_agent_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES agency_crm_integrations(id),
  crm_agent_id TEXT NOT NULL,
  crm_agent_name TEXT,
  crm_agent_email TEXT,
  crm_agent_phone TEXT,
  agent_id UUID REFERENCES real_estate_agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id, crm_agent_id)
);

-- Dodać kolumny do real_estate_listings
ALTER TABLE real_estate_listings 
ADD COLUMN IF NOT EXISTS crm_last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS crm_raw_data JSONB,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS virtual_tour_url TEXT;
```

### Faza 2: Edge Function - Parser ASARI XML

**Plik:** `supabase/functions/crm-import-asari/index.ts`

```text
Funkcja edge do parsowania XML ASARI:

1. Pobieranie XML
   - Z URL (HTTP GET z opcjonalnym Basic Auth)
   - Z FTP (połączenie, pobranie pliku)

2. Parsowanie XML
   - Parsuj definictions.xml (słowniki) 
   - Parsuj pliki ofert *_001.xml, *_002.xml
   - Obsłuż sekcję <DELETE> - deaktywacja ogłoszeń

3. Mapowanie pól
   - Konwersja ID parametrów ASARI → pola tabeli
   - Tłumaczenie słowników (MIESZKANIE → apartment)
   - Obsługa współrzędnych GPS
   - Parsowanie przynależnych (balkon, piwnica, garaż)

4. Import zdjęć
   - Pobieranie zdjęć z URL-i w ofercie
   - Upload do Supabase Storage
   - Generowanie miniatur

5. Mapowanie agentów
   - Dopasowanie agent CRM → agent w systemie
   - Tworzenie nowych agentów-pracowników automatycznie
   - Przypisanie kontaktów (telefon, email) do ogłoszenia

6. Upsert do bazy
   - INSERT nowych ofert
   - UPDATE istniejących (po external_id)
   - Deaktywacja usuniętych z feeda
```

### Faza 3: Scheduler Importu (Cron)

**Konfiguracja automatycznego importu:**

```text
Harmonogramy (do wyboru w konfiguracji):
- Co 1 godzinę
- Co 3 godziny
- Co 6 godzin
- Co 12 godzin
- Co 24 godziny

Trigger: pg_cron lub zewnętrzny scheduler
```

### Faza 4: Panel Agencji - Konfiguracja CRM

**Plik:** `src/pages/AgencyDashboard.tsx` (lub nowy komponent)

Dodać sekcję dla agencji do samodzielnej konfiguracji:

```text
UI dla agencji:
┌─────────────────────────────────────────────────────────┐
│ Integracja z CRM                                        │
├─────────────────────────────────────────────────────────┤
│ [Dropdown: Wybierz system CRM] ASARI ▼                  │
│                                                         │
│ Tryb importu: ○ URL XML  ○ FTP  ○ API                   │
│                                                         │
│ URL do pliku XML: [________________________]            │
│ Login (opcjonalnie): [____________]                     │
│ Hasło (opcjonalnie): [____________]                     │
│                                                         │
│ Harmonogram: [Co 24 godziny ▼]                          │
│                                                         │
│ [Testuj połączenie]  [Zapisz konfigurację]              │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ Ostatni import: 2026-02-05 14:30                        │
│ Status: ✅ Sukces                                       │
│ Ofert w feedzie: 45 | Dodanych: 3 | Zaktualizowanych: 12│
│                                                         │
│ Mapowanie pracowników:                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Jan Kowalski (CRM) → [Wybierz agenta ▼] Jan K. ✓    │ │
│ │ Anna Nowak (CRM)   → [Wybierz agenta ▼] Nowy agent  │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Faza 5: Obsługa Hierarchii Agencja-Pracownik

**Logika przypisywania ogłoszeń:**

```text
Scenariusz:
1. Agencja "ABC Nieruchomości" rejestruje się → agent_id = A1
2. Dodaje pracownika "Jan Kowalski" → agent_id = A2, parent_agent_id = A1
3. Konfiguruje ASARI CRM z integration_id = I1

Import ogłoszenia z CRM:
- XML zawiera: agent="Jan Kowalski", email="jan@abc.pl"
- System sprawdza crm_agent_mappings:
  - Jeśli istnieje mapowanie → użyj przypisanego agent_id
  - Jeśli nie → szukaj po email w real_estate_agents
  - Jeśli nie znaleziono → utwórz nowego agenta jako pracownika (parent_agent_id = A1)

Wynik:
- Ogłoszenie ma agent_id = A2 (pracownik)
- Ogłoszenie ma agency_id = A1 (agencja)
- Dane kontaktowe: telefon i email pracownika z CRM
```

---

## Pliki do Utworzenia/Modyfikacji

| Plik | Akcja | Opis |
|------|-------|------|
| `supabase/functions/crm-import-asari/index.ts` | Nowy | Parser XML ASARI, główna logika importu |
| `supabase/functions/crm-import-asari/parser.ts` | Nowy | Parsowanie XML i mapowanie pól |
| `supabase/functions/crm-import-asari/dictionaries.ts` | Nowy | Słowniki mapowania ASARI → system |
| `supabase/functions/crm-import-scheduler/index.ts` | Nowy | Scheduler uruchamiający importy |
| `src/pages/AgencyDashboard.tsx` | Modyfikacja | Dodać sekcję konfiguracji CRM |
| `src/components/agency/AgencyCRMSettings.tsx` | Nowy | Komponent ustawień CRM dla agencji |
| SQL Migration | Nowy | Tabele `crm_import_logs`, `crm_agent_mappings` |

---

## Mapowanie Typów Nieruchomości

```text
ASARI (słownik 68 - nieruchomość):
DOM        → house
MIESZKANIE → apartment
DZIAŁKA    → land
LOKAL      → commercial
OBIEKT     → commercial
POKÓJ      → room

ASARI (słownik 74 - rodzaj mieszkania):
BLOK           → apartment
KAMIENICA      → apartment
APARTAMENTOWIEC → apartment
LOFT           → apartment

ASARI (słownik 75 - typ domu):
WOLNOSTOJĄCY → house
BLIŹNIAK     → house
SZEREGOWIEC  → house
SEGMENT      → house
```

---

## Obsługa Sekcji DELETE

Zgodnie z dokumentacją ASARI, sekcja `<DELETE>` zawiera tylko numery ofert do usunięcia:

```xml
<DELETE>
  <offers>
    <signature>110/9/OMS</signature>
    <signature>111/9/OMS</signature>
  </offers>
  <pictures />
</DELETE>
```

**Logika:**
1. Pobierz listę signature z `<DELETE><offers>`
2. Znajdź ogłoszenia w `real_estate_listings` gdzie `external_id` = signature
3. Ustaw `status = 'inactive'` (soft delete)
4. NIE usuwaj z bazy - zachowaj historię

---

## Bezpieczeństwo

1. **Hasła/Tokeny** - przechowywane jako Supabase Secrets
2. **Walidacja XML** - sanityzacja danych przed zapisem
3. **Rate limiting** - max 1 import na 15 minut
4. **RLS** - agencja widzi tylko swoje integracje

---

## Testowanie (zgodnie z dokumentacją ASARI)

Scenariusze testowe:
1. Dodanie oferty (minimum po jednej na dział)
2. Usunięcie oferty (wycofanie z eksportu)
3. Zmiana danych w ofercie (cena, opis, lokalizacja)
4. Dodanie zdjęcia
5. Usunięcie zdjęcia
6. Aktualizacja zdjęcia (znak wodny)
7. Przestawienie kolejności zdjęć
8. Pełny eksport - czy stan zgodny
9. Wycofanie + pełny eksport

---

## Kolejność Wdrożenia

1. **Faza 1** - Migracja SQL (tabele logów, mapowania)
2. **Faza 2** - Edge Function parser ASARI
3. **Faza 3** - Panel agencji do konfiguracji
4. **Faza 4** - Scheduler automatycznych importów
5. **Faza 5** - Testy integracyjne z kontem testowym ASARI

**Szacowany czas: ~8-10h**

