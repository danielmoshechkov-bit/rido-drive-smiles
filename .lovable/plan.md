
# Plan implementacji: AI Sales Agent dla GetRido

## Podsumowanie

Tworzymy moduł **AI Sales Agent** - inteligentnego asystenta sprzedaży, który automatycznie dzwoni do leadów, kwalifikuje ich i umawia spotkania w kalendarzu GetRido. Na start dostępny dla konta handlowca, z miejscem na ustawienia API (do późniejszego podpięcia).

---

## Architektura modułu

```text
┌─────────────────────────────────────────────────────────────────┐
│                     PANEL HANDLOWCA                             │
│  (SalesPortal.tsx - nowa zakładka "AI Agent")                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Onboarding   │  │ Konfiguracja │  │   Dziennik   │           │
│  │   Firmy      │  │     Głosu    │  │   Rozmów     │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              LEAD INBOX + AI CALLING                        ││
│  │  [Lead] → [Kwalifikacja] → [AI Dzwoni] → [Umawia termin]   ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                 USTAWIENIA SYSTEMOWE (Admin)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ API Keys    │  │   Limity    │  │  Feature    │              │
│  │ (później)   │  │   Kosztów   │  │   Flags     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Faza 1: Baza danych (nowe tabele)

### 1.1 `ai_agent_configs` - Konfiguracja agenta per firma
```sql
CREATE TABLE ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Dane firmy (onboarding)
  company_name TEXT NOT NULL,
  company_description TEXT,
  services JSONB, -- lista usług z cenami
  working_hours JSONB, -- {"mon": {"start": "09:00", "end": "18:00"}, ...}
  service_area TEXT, -- obszar działania
  faq JSONB, -- FAQ dla AI
  booking_rules JSONB, -- zasady rezerwacji
  -- Głos
  voice_id TEXT DEFAULT 'JBFqnCBsd6RMkjVDRZzb', -- George (męski)
  voice_gender TEXT DEFAULT 'male',
  conversation_style TEXT DEFAULT 'professional', -- professional/casual
  -- Limity
  max_calls_per_day INTEGER DEFAULT 20,
  max_minutes_per_month INTEGER DEFAULT 120,
  max_retries_per_lead INTEGER DEFAULT 3,
  -- Status
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.2 `ai_agent_calls` - Log połączeń AI
```sql
CREATE TABLE ai_agent_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES ai_agent_configs(id),
  lead_id UUID REFERENCES sales_leads(id),
  -- Status połączenia
  call_status TEXT, -- 'pending', 'in_progress', 'completed', 'failed', 'no_answer'
  call_sid TEXT, -- ID z Twilio
  -- Metryki
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- Wynik
  outcome TEXT, -- 'booked', 'callback', 'not_interested', 'escalate_human'
  booking_slot_id UUID, -- jeśli umówiono termin
  -- Transkrypcja i analiza
  transcript TEXT,
  ai_summary TEXT,
  sentiment TEXT, -- 'positive', 'neutral', 'negative'
  -- Koszty
  cost_minutes NUMERIC(10,2),
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.3 `ai_agent_calendar_slots` - Sloty kalendarza GetRido
```sql
CREATE TABLE ai_agent_calendar_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES ai_agent_configs(id),
  -- Slot
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  -- Status
  status TEXT DEFAULT 'available', -- 'available', 'booked', 'blocked'
  -- Rezerwacja
  lead_id UUID REFERENCES sales_leads(id),
  call_id UUID REFERENCES ai_agent_calls(id),
  booking_notes TEXT,
  -- Potwierdzenie
  confirmed_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 1.4 `ai_agent_usage` - Zużycie i limity
```sql
CREATE TABLE ai_agent_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES ai_agent_configs(id),
  month DATE NOT NULL, -- pierwszy dzień miesiąca
  calls_count INTEGER DEFAULT 0,
  minutes_used NUMERIC(10,2) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  -- Hard cap
  is_limit_reached BOOLEAN DEFAULT false,
  UNIQUE(config_id, month)
);
```

### 1.5 Rozszerzenie `sales_leads` - zgoda na AI
```sql
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS 
  ai_consent BOOLEAN DEFAULT false,
  ai_preferred_time TEXT, -- 'now', 'today_afternoon', 'tomorrow', 'custom'
  ai_call_status TEXT DEFAULT 'pending', -- 'pending', 'called', 'booked', 'failed'
  ai_last_call_at TIMESTAMPTZ;
```

### 1.6 Feature flag dla AI Agent
```sql
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('ai_sales_agent_enabled', 'AI Agent Sprzedaży', 'Automatyczne połączenia AI do leadów', false, 'sales');
```

---

## Faza 2: Komponenty UI

### 2.1 Nowa zakładka w SalesPortal - "AI Agent"
**Plik:** `src/pages/SalesPortal.tsx`
- Dodanie nowej zakładki "AI Agent" z ikoną Bot
- Warunkowe wyświetlanie (feature flag)

### 2.2 Panel konfiguracji AI Agenta
**Nowy plik:** `src/components/sales/ai-agent/AIAgentConfigPanel.tsx`
- Onboarding firmy (formularz z danymi)
- Lista usług z cenami
- Godziny pracy
- FAQ

### 2.3 Wybór głosu
**Nowy plik:** `src/components/sales/ai-agent/AIAgentVoiceSelector.tsx`
- Wybór płci (męski/żeński)
- Lista głosów ElevenLabs
- Przycisk "Odsłuchaj próbkę" (placeholder)
- Styl rozmowy

### 2.4 Dziennik rozmów AI
**Nowy plik:** `src/components/sales/ai-agent/AIAgentCallsLog.tsx`
- Lista wszystkich połączeń AI
- Status, czas trwania, wynik
- Transkrypcja (rozwijana)
- Filtry (data, status)

### 2.5 Kalendarz GetRido (rozszerzony)
**Modyfikacja:** `src/components/sales/SalesCalendar.tsx`
- Dodanie slotów z `ai_agent_calendar_slots`
- Oznaczenie rezerwacji AI vs ręcznych
- Możliwość blokowania slotów

### 2.6 Panel limitów i zużycia
**Nowy plik:** `src/components/sales/ai-agent/AIAgentUsagePanel.tsx`
- Wykres zużycia minut
- Liczba połączeń vs limit
- Procent konwersji
- Ostrzeżenie przy 80% limitu

---

## Faza 3: Panel ustawień systemowych (Admin)

### 3.1 Rozszerzenie AdminSettingsView
**Modyfikacja:** `src/components/AdminSettingsView.tsx`
- Nowa pod-zakładka "AI Voice Agent"

### 3.2 Panel API Keys (placeholder)
**Nowy plik:** `src/components/admin/AIVoiceAgentSettings.tsx`
- Pole na ELEVENLABS_API_KEY (placeholder, disabled)
- Pole na TWILIO_ACCOUNT_SID (placeholder, disabled)
- Pole na TWILIO_AUTH_TOKEN (placeholder, disabled)
- Pole na TWILIO_PHONE_NUMBER (placeholder, disabled)
- Info: "API keys będą dodane później"

### 3.3 Globalne limity
- Max minut na użytkownika/miesiąc
- Max połączeń dziennie (globalnie)
- Godziny dzwonienia (np. 9:00-20:00)

---

## Faza 4: Hooki React

### 4.1 Hook do konfiguracji agenta
**Nowy plik:** `src/hooks/useAIAgentConfig.ts`
```typescript
- useAIAgentConfig() - pobiera konfigurację
- useUpdateAIAgentConfig() - zapisuje zmiany
- useAIAgentServices() - zarządza listą usług
```

### 4.2 Hook do połączeń
**Nowy plik:** `src/hooks/useAIAgentCalls.ts`
```typescript
- useAIAgentCalls() - lista połączeń
- useAIAgentCallStats() - statystyki
- useTriggerAICall() - uruchom połączenie (później)
```

### 4.3 Hook do kalendarza
**Nowy plik:** `src/hooks/useAIAgentCalendar.ts`
```typescript
- useCalendarSlots() - dostępne sloty
- useCreateSlot() - dodaj slot
- useBookSlot() - zarezerwuj slot
```

---

## Faza 5: Edge Functions (struktura, bez API)

### 5.1 ai-voice-agent (główna funkcja)
**Nowy plik:** `supabase/functions/ai-voice-agent/index.ts`
- Struktura do późniejszej integracji z Twilio
- Placeholder dla STT/TTS
- Logika rozmowy (GPT prompt)

### 5.2 Struktura promptu rozmowy
```typescript
const SALES_AGENT_PROMPT = `
Jesteś asystentem sprzedaży GetRido dla firmy {company_name}.
Twoje zadania:
1. Potwierdź zainteresowanie usługą
2. Zbierz informacje: {required_fields}
3. Zaproponuj termin z dostępnych: {available_slots}
4. Zakończ rezerwację lub oznacz "potrzebna rozmowa z człowiekiem"

Usługi: {services}
FAQ: {faq}
`;
```

---

## Faza 6: Integracja z istniejącym systemem

### 6.1 Rozszerzenie Lead Form
- Checkbox "Zgoda na kontakt AI"
- Pole "Preferowany czas kontaktu"

### 6.2 Lead Detail - przycisk AI
- "Uruchom AI połączenie" (disabled do czasu API)
- Status połączenia AI
- Historia rozmów AI

### 6.3 Powiadomienia
- Toast po zakończeniu połączenia AI
- Badge w header (nowe rezerwacje AI)

---

## Lista plików do utworzenia/modyfikacji

### Nowe pliki:
1. `src/components/sales/ai-agent/AIAgentConfigPanel.tsx`
2. `src/components/sales/ai-agent/AIAgentVoiceSelector.tsx`
3. `src/components/sales/ai-agent/AIAgentCallsLog.tsx`
4. `src/components/sales/ai-agent/AIAgentUsagePanel.tsx`
5. `src/components/sales/ai-agent/AIAgentDashboard.tsx`
6. `src/components/admin/AIVoiceAgentSettings.tsx`
7. `src/hooks/useAIAgentConfig.ts`
8. `src/hooks/useAIAgentCalls.ts`
9. `src/hooks/useAIAgentCalendar.ts`
10. `supabase/functions/ai-voice-agent/index.ts`

### Modyfikacje:
1. `src/pages/SalesPortal.tsx` - nowa zakładka AI Agent
2. `src/components/AdminSettingsView.tsx` - nowa pod-zakładka
3. `src/components/sales/SalesCalendar.tsx` - sloty AI
4. `src/components/sales/SalesLeadForm.tsx` - checkbox zgody AI
5. `src/components/sales/SalesLeadDetail.tsx` - przycisk AI call

### Migracje SQL:
1. Tabela `ai_agent_configs`
2. Tabela `ai_agent_calls`
3. Tabela `ai_agent_calendar_slots`
4. Tabela `ai_agent_usage`
5. Kolumny w `sales_leads`
6. Feature flag
7. RLS policies

---

## Głosy ElevenLabs (do wyboru)

| Nazwa | ID | Płeć | Styl |
|-------|-----|------|------|
| Roger | CwhRBWXzGAHq8TQ4Fs17 | Męski | Profesjonalny |
| George | JBFqnCBsd6RMkjVDRZzb | Męski | Neutralny |
| Brian | nPczCjzI2devNBz1zQrb | Męski | Przyjazny |
| Sarah | EXAVITQu4vr4xnSDxMaL | Żeński | Profesjonalny |
| Laura | FGY2WhTYpPnrIDTdsKH5 | Żeński | Ciepły |
| Alice | Xb7hH8MSUJpSbSDYk0k2 | Żeński | Neutralny |

---

## Co NIE będzie działać (do późniejszego podpięcia API)

1. ❌ Faktyczne dzwonienie (wymaga Twilio)
2. ❌ Synteza mowy (wymaga ElevenLabs)
3. ❌ Rozpoznawanie mowy (wymaga Whisper/Deepgram)
4. ❌ Próbki głosów (wymaga ElevenLabs)
5. ❌ Integracja z Meta Ads (wymaga Facebook API)

---

## Kontrola kosztów (już w MVP)

1. **Hard cap minut** - automatyczne wyłączenie po przekroczeniu
2. **Limit dzienny połączeń** - max X na dzień
3. **Limit prób na lead** - max 3 próby
4. **Godziny dzwonienia** - tylko w ustawionych godzinach
5. **Dashboard zużycia** - widoczne % wykorzystania

---

## Kolejność implementacji

1. Migracje SQL (tabele + RLS)
2. Hooki React
3. UI: AIAgentDashboard z zakładkami
4. UI: Onboarding firmy
5. UI: Wybór głosu
6. UI: Kalendarz slotów
7. UI: Dziennik rozmów (puste)
8. UI: Panel zużycia
9. Admin: Ustawienia systemowe
10. Edge function: struktura ai-voice-agent
11. Integracja z SalesPortal
