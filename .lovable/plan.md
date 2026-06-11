# Plan: Tłumaczenia UI + AI live-translate zleceń

## Zakres
Portal Klienta, Portal Pracownika Warsztatu (Moja Praca), Warsztat ERP (panel admina/managera) + dwukierunkowe AI tłumaczenie treści zleceń (opis, pozycje, części, notatki).

## Część 1 — Tłumaczenia UI (statyczne stringi)

### Audit i klucze
- Przeskanować pliki:
  - `src/pages/ClientPortal*.tsx`, `src/components/client-portal/**`
  - `src/pages/WorkshopEmployeePortal.tsx`, `src/components/workshop/**`
  - `src/pages/Workshop*.tsx` (ERP)
- Wyciągnąć wszystkie hardcoded polskie stringi (etykiety, przyciski, statusy, komunikaty toastów, placeholdery, nagłówki dialogów).

### Klucze i18n
- Dodać sekcje do `src/i18n/locales/pl.json` + 6 pozostałych (`en, ru, ua, de, vi, kz`):
  - `client_portal.*` (start, ogłoszenia, moje auta, oglądania, wiadomości, polecenia, ustawienia, wybierz moduł, dodaj ogłoszenie, wyloguj…)
  - `employee_portal.*` (moja praca, moje zlecenia, w trakcie, zakończone, dostępne, start/moje/aktywne/historia, akceptuj, przypisany, mechanik, myjnia…)
  - `workshop.*` (statusy zleceń, akcje, pola formularzy, dialogi, komunikaty)
  - `common.*` (zapisz, anuluj, usuń, edytuj, tak, nie, ładowanie, błąd…)
- Zamienić twarde stringi na `t('klucz')` w komponentach.
- Tłumaczenia PL pisze człowiek (oryginalne), pozostałe 6 języków wygenerować jednorazowo skryptem przez Kimi (`supabase/functions/workshop-translate` → użyć do batch generowania JSON-ów lokalnie).

### Selektor języka na portalach
- Upewnić się że `LanguageSwitcher` jest widoczny w nagłówku Portalu Klienta i Portalu Pracownika (na foto 1 jest tylko flaga PL/RU obok "Wyloguj" — sprawdzić czy faktycznie zmienia `i18n.language`).
- Zapisywać wybór w `localStorage` (`rido_lang`) — już jest w `src/i18n/index.ts`.

## Część 2 — Live AI tłumaczenie zleceń (dwukierunkowe)

### Schemat (migracja)
- Dodać kolumnę `preferred_language` do `workshop_employees` (default `pl`).
- Tabela `workshop_translations_cache`:
  - `entity_type` (order|item|finding|note), `entity_id`, `field`, `source_lang`, `target_lang`, `source_hash`, `translated_text`, unique index na (entity_type,entity_id,field,target_lang).
- Wpis w `ai_agents_config` dla `agent_id='workshop_translation'` z default `model='moonshot-v1-8k'` (Kimi).

### Edge function
- Rozszerzyć istniejący `workshop-translate` (lub nowy `workshop-order-translate`):
  - Input: `{ texts: [{id, field, text}], target_lang, source_lang }` — batch.
  - Czyta model z `ai_agents_config` (agent_id=`workshop_translation`).
  - Cache hit → zwraca natychmiast; miss → woła Kimi/wybrany model, zapisuje cache.
  - Działa w obie strony (PL→RU dla pracownika, RU→PL dla admina po zapisie notatki).

### Frontend hook `useOrderTranslation`
- W Portalu Pracownika: po pobraniu zleceń, batchem tłumaczy `title/description/items[].name/findings` na `i18n.language` i renderuje tłumaczone wersje (z fallbackiem do oryginału do czasu załadowania).
- W formularzu pracownika (wpisanie notatki/findingu): po zapisie woła tłumacza w tle by przygotować PL wersję (cachowaną), żeby admin/warsztat zobaczył od razu PL.
- W panelu admina warsztatu (`WorkshopOrderDetail`): jeśli notatka/finding ma `source_lang ≠ pl`, pobiera z cache PL tłumaczenie i pokazuje pod oryginałem ("Tłumaczenie: …").

### Admin AI Core — model picker
- W `AdminAIBrain` / odpowiedniku zarządzającym `ai_agents_config`, dodać pozycję "Tłumaczenia warsztatu" pozwalającą wybrać model (Kimi/Claude/Gemini). Default Kimi.

## Etapy wdrożenia (kolejność)
1. Migracja DB (kolumna preferred_language, tabela cache, wpis ai_agents_config).
2. Rozszerzenie `workshop-translate` o batch + routing modelu z DB.
3. Hook `useOrderTranslation` + integracja w Portalu Pracownika.
4. Integracja zwrotna w Portalu Admina (WorkshopOrderDetail).
5. Audit + zamiana stringów Portal Klienta na klucze i18n.
6. Audit + zamiana stringów Portal Pracownika na klucze i18n.
7. Audit + zamiana stringów Warsztat ERP na klucze i18n.
8. Wygenerowanie tłumaczeń EN/RU/UA/DE/VI/KZ przez Kimi do JSON-ów locale.
9. Test końcowy: 3 razy z rzędu przełączenie języka + utworzenie/edycja zlecenia w innym języku.

## Uwagi techniczne
- Cache jest kluczowe — bez niego każde odświeżenie strony = wywołanie Kimi = koszty.
- Hash źródła (sha256 trim+lowercase) wykrywa zmiany tekstu i unieważnia cache.
- Wszystkie tłumaczenia AI-generated zostają w bazie (nie tylko sessionStorage).
- Skala UI to ~300-500 stringów — etap 5-8 to największa praca; podzielić na sub-PR-y per portal jeśli chcesz iteracyjnie weryfikować.

## Pytanie operacyjne
Czy mam realizować plan etapami (etap 1-4 jako pierwsza dostawa = backend + live translate zleceń działa), a UI i18n (etap 5-8) jako kolejna dostawa? Czy "wszystko za jednym zamachem"?