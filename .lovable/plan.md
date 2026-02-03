
# Plan Implementacji Modułu "AI Call Agent" (MVP)

## PODSUMOWANIE WYKONAWCZE

Moduł "AI Call Agent" to nowy, niezależny dodatek do platformy GetRido umożliwiający automatyczne oddzwanianie do leadów przy użyciu AI. Moduł wykorzysta istniejącą infrastrukturę (feature flags, role sales_admin/sales_rep, tabele ai_agent_*) i rozszerzy ją o nowe funkcjonalności whitelist, import leadów i kolejkę połączeń.

**WAŻNE**: Większość podstawowej infrastruktury AI Agenta już istnieje w projekcie:
- Tabele: `ai_agent_configs`, `ai_agent_calls`, `ai_agent_calendar_slots`, `ai_agent_usage`
- Feature flag: `ai_sales_agent_enabled`
- Komponenty: `AIAgentDashboard`, `AIAgentConfigPanel`, `AIAgentVoiceSelector`, `AIAgentCallsLog`, `AIAgentCalendarPanel`, `AIAgentUsagePanel`
- Hooki: `useAIAgentConfig`, `useAIAgentCalls`, `useAIAgentCalendar`, `useAIAgentQueue`, `useAIAgentAccess`

Plan skupia się na **rozszerzeniu** istniejącej funkcjonalności, nie budowaniu od zera.

---

## FAZA 1: ROZSZERZENIE BAZY DANYCH

### 1.1 Nowe tabele - Whitelist i Access Control

```sql
-- Whitelist firm po NIP
CREATE TABLE public.ai_call_company_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip TEXT NOT NULL UNIQUE,
  company_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  valid_from DATE,
  valid_to DATE,
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Whitelist użytkowników po email
CREATE TABLE public.ai_call_user_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  valid_from DATE,
  valid_to DATE,
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Kolejka połączeń AI
CREATE TABLE public.ai_call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE CASCADE NOT NULL,
  priority INTEGER DEFAULT 5,
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rozszerzenie ai_agent_configs o język
ALTER TABLE public.ai_agent_configs
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pl',
ADD COLUMN IF NOT EXISTS lead_sources JSONB DEFAULT '["manual"]'::jsonb,
ADD COLUMN IF NOT EXISTS calling_hours_start TIME DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS calling_hours_end TIME DEFAULT '20:00';
```

### 1.2 Nowe feature flags

```sql
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES 
  ('ai_call_enabled_global', 'AI Call - Global', 'Globalny przełącznik modułu AI Call', false, 'ai'),
  ('ai_call_recording_enabled', 'AI Call - Nagrywanie', 'Nagrywanie rozmów AI (domyślnie OFF)', false, 'ai'),
  ('ai_call_test_mode', 'AI Call - Tryb testowy', 'Tryb testowy dla kont demo', true, 'ai'),
  ('ai_call_meta_enabled', 'AI Call - Meta Leads', 'Import leadów z Meta/Facebook', false, 'ai'),
  ('ai_call_sheets_enabled', 'AI Call - Google Sheets', 'Import leadów z Google Sheets', false, 'ai'),
  ('ai_call_telegram_enabled', 'AI Call - Telegram', 'Import leadów z Telegram', false, 'ai')
ON CONFLICT (feature_key) DO NOTHING;
```

### 1.3 RLS Policies

```sql
-- ai_call_company_whitelist - tylko sales_admin
ALTER TABLE public.ai_call_company_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales admins manage company whitelist" ON public.ai_call_company_whitelist
  FOR ALL USING (public.is_sales_admin(auth.uid()));

-- ai_call_user_whitelist - tylko sales_admin
ALTER TABLE public.ai_call_user_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sales admins manage user whitelist" ON public.ai_call_user_whitelist
  FOR ALL USING (public.is_sales_admin(auth.uid()));

-- ai_call_queue - użytkownicy widzą swoje
ALTER TABLE public.ai_call_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own queue" ON public.ai_call_queue
  FOR SELECT USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );
CREATE POLICY "Users manage own queue" ON public.ai_call_queue
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );
CREATE POLICY "Sales admins view all queue" ON public.ai_call_queue
  FOR SELECT USING (public.is_sales_admin(auth.uid()));
```

---

## FAZA 2: PANEL ADMINA SPRZEDAŻY

### 2.1 Nowa zakładka w AdminSettingsView

**Plik:** `src/components/AdminSettingsView.tsx`

Dodać nową zakładkę "AI Call Admin" widoczną tylko dla `sales_admin`:

```tsx
// W subTabs dodać:
{ value: "ai-call-admin", label: "AI Call Admin", visible: true }

// W render:
{activeSubTab === "ai-call-admin" && <AICallAdminPanel />}
```

### 2.2 Nowy komponent: AICallAdminPanel

**Plik:** `src/components/admin/AICallAdminPanel.tsx`

Zawartość:
- **Globalny przełącznik** - toggle `ai_call_enabled_global`
- **Whitelist firm** - tabela z dodawaniem po NIP (multi-add z textarea)
- **Whitelist użytkowników** - tabela z dodawaniem po email
- **Konfiguracja API** - placeholders dla:
  - Telephony provider (Twilio/Plivo)
  - STT provider (Deepgram/Google)
  - TTS provider (ElevenLabs/Azure)
  - LLM provider (OpenAI/Gemini)
- **Globalne limity** - max minut/dzień, godziny dzwonienia

```
+--------------------------------------------------+
|  AI Call Agent - Panel Admina                     |
+--------------------------------------------------+
|  [Switch] Włącz globalnie moduł AI Call          |
+--------------------------------------------------+
|  Whitelist Firm (po NIP)           [+ Dodaj NIP] |
|  ┌────────────────────────────────────────────┐  |
|  │ NIP          │ Firma       │ Status │ Akcje│  |
|  │ 5223252793   │ Car4Ride    │ Active │ [X]  │  |
|  └────────────────────────────────────────────┘  |
|                                                   |
|  Whitelist Użytkowników            [+ Dodaj]     |
|  ┌────────────────────────────────────────────┐  |
|  │ Email              │ Status  │ Akcje       │  |
|  │ warsztat@test.pl   │ Active  │ [X]         │  |
|  └────────────────────────────────────────────┘  |
+--------------------------------------------------+
```

### 2.3 Nowy hook: useAICallAdmin

**Plik:** `src/hooks/useAICallAdmin.ts`

```tsx
// CRUD dla ai_call_company_whitelist
export function useAICallCompanyWhitelist() {...}
export function useAddCompanyToWhitelist() {...}
export function useRemoveCompanyFromWhitelist() {...}

// CRUD dla ai_call_user_whitelist
export function useAICallUserWhitelist() {...}
export function useAddUserToWhitelist() {...}
export function useRemoveUserFromWhitelist() {...}
```

---

## FAZA 3: ROZSZERZENIE PANELU FIRMY (AI Agent Dashboard)

### 3.1 Aktualizacja useAIAgentAccess

**Plik:** `src/hooks/useAIAgentAccess.ts`

Obecnie używa hardcoded whitelist - zmienić na query do tabel whitelist:

```tsx
export function useAIAgentAccess() {
  return useQuery({
    queryKey: ["ai-agent-access"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return { hasAccess: false, isGloballyEnabled: false };

      // Check global flag
      const { data: globalFlag } = await supabase
        .from("feature_toggles")
        .select("is_enabled")
        .eq("feature_key", "ai_call_enabled_global")
        .single();

      if (!globalFlag?.is_enabled) {
        return { hasAccess: false, isGloballyEnabled: false };
      }

      // Check user whitelist
      const { data: userWhitelist } = await supabase
        .from("ai_call_user_whitelist")
        .select("id")
        .eq("email", user.email?.toLowerCase())
        .eq("status", "active")
        .maybeSingle();

      if (userWhitelist) {
        return { hasAccess: true, isGloballyEnabled: true };
      }

      // Check company whitelist (via user's entities/NIP)
      // ... sprawdzenie po NIP firmy użytkownika

      return { hasAccess: false, isGloballyEnabled: true };
    },
  });
}
```

### 3.2 Rozszerzenie AIAgentConfigPanel

**Plik:** `src/components/sales/ai-agent/AIAgentConfigPanel.tsx`

Dodać nowe sekcje:
- **Język rozmowy** - select: PL/EN/RU/UA/DE/ES/AR
- **Źródła leadów** - checkboxy: Meta/Sheets/Telegram/Manual
- **Godziny połączeń** - time inputs start/end
- **Pole "Link do strony"** + przycisk "Pobierz propozycję opisu z AI"

### 3.3 Nowy komponent: AIAgentLeadInbox

**Plik:** `src/components/sales/ai-agent/AIAgentLeadInbox.tsx`

Lead Inbox dedykowany dla AI Call z:
- Filtrami: źródło, status AI, data
- Akcjami:
  - "Zadzwoń teraz" (manual trigger)
  - "Dodaj do kolejki"
  - "Oznacz do ręcznej obsługi"
- Statusy AI: `scheduled`, `in_progress`, `completed`, `failed`, `callback_requested`, `booking_made`

```
+--------------------------------------------------+
|  Lead Inbox                    [+ Import] [Filtry]|
+--------------------------------------------------+
|  ┌────────────────────────────────────────────┐  |
|  │ Firma        │ Tel      │ Źródło │ Status  │  |
|  │ AutoSerwis   │ 500...   │ Meta   │ Pending │  |
|  │              │          │        │[Zadzwoń]│  |
|  └────────────────────────────────────────────┘  |
+--------------------------------------------------+
```

### 3.4 Nowy komponent: AIAgentQueuePanel (rozszerzenie)

**Plik:** `src/components/sales/ai-agent/AIAgentQueuePanel.tsx`

Panel kolejki z:
- Lista leadów w kolejce
- Priorytetyzacja (drag & drop lub manual priority)
- Akcje: Start, Pause, Cancel
- Status procesingu

---

## FAZA 4: IMPORT LEADÓW (MVP)

### 4.1 Meta Leads Webhook

**Plik:** `supabase/functions/ai-call-webhook-meta/index.ts`

Placeholder webhook dla Facebook Lead Ads:
- Przyjmuje dane z Meta
- Mapuje pola do `sales_leads`
- Ustawia `source = 'meta'`
- Dodaje do kolejki jeśli spełnia warunki

### 4.2 Google Sheets Import

**Plik:** `src/components/sales/ai-agent/AIAgentSheetsImport.tsx`

Modal do importu CSV/Sheets:
- Upload CSV lub link do Google Sheets
- Mapowanie kolumn: phone, name, email, interest
- Preview przed importem
- Batch insert do `sales_leads` z `source = 'google_sheets'`

### 4.3 Telegram Webhook

**Plik:** `supabase/functions/ai-call-webhook-telegram/index.ts`

Placeholder webhook dla Telegram bota:
- Endpoint `/api/leads/telegram`
- Parsuje wiadomość, wyciąga telefon i dane
- Ustawia `source = 'telegram'`

---

## FAZA 5: MECHANIZM DZWONIENIA (PLACEHOLDER)

### 5.1 Edge Function: ai-call-worker

**Plik:** `supabase/functions/ai-call-worker/index.ts`

Worker do przetwarzania kolejki (placeholder):

```typescript
// Pobiera leady z kolejki status=pending
// Sprawdza godziny pracy
// Sprawdza limity użytkownika
// Inicjuje połączenie (PLACEHOLDER - Twilio integration later)
// Zapisuje wynik do ai_agent_calls
// Aktualizuje status leada
```

### 5.2 Manual "Zadzwoń teraz"

**Plik:** `src/components/sales/ai-agent/AICallNowButton.tsx`

Przycisk do ręcznego wywołania połączenia AI:
- Sprawdza czy API skonfigurowane
- Tworzy wpis w `ai_call_queue` z priority=1
- Wywołuje worker

---

## FAZA 6: KONTA TESTOWE

### 6.1 Seed data dla testowych firm

```sql
-- Dodaj do whitelist
INSERT INTO public.ai_call_user_whitelist (email, status, notes)
VALUES 
  ('warsztat@test.pl', 'active', 'Konto testowe MVP'),
  ('detaling@test.pl', 'active', 'Konto testowe MVP'),
  ('anastasiia.shapovalova1991@gmail.com', 'active', 'Tester'),
  ('majewskitest@test.pl', 'active', 'Tester')
ON CONFLICT (email) DO NOTHING;

-- Włącz test mode
UPDATE public.feature_toggles 
SET is_enabled = true 
WHERE feature_key = 'ai_call_test_mode';
```

---

## FAZA 7: AUDIT LOG

### 7.1 Tabela audit

Rozszerzyć istniejący system logów lub stworzyć dedykowany:

```sql
CREATE TABLE public.ai_call_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  target_type TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Logowane akcje:
- `module_enabled/disabled`
- `company_added/removed`
- `user_added/removed`
- `call_initiated`
- `call_completed`
- `booking_made`

---

## STRUKTURA PLIKÓW (NOWE)

```
src/
├── components/
│   ├── admin/
│   │   ├── AICallAdminPanel.tsx          # Panel admina sprzedaży
│   │   └── AICallWhitelistManager.tsx    # Manager whitelist
│   └── sales/
│       └── ai-agent/
│           ├── AIAgentLeadInbox.tsx      # Lead inbox dla AI
│           ├── AIAgentSheetsImport.tsx   # Import z Google Sheets
│           ├── AICallNowButton.tsx       # Przycisk "Zadzwoń teraz"
│           └── AIAgentLanguageSelector.tsx # Wybór języka
├── hooks/
│   ├── useAICallAdmin.ts                 # CRUD whitelist
│   └── useAICallQueue.ts                 # Queue management
│
supabase/
├── functions/
│   ├── ai-call-webhook-meta/             # Webhook Meta
│   ├── ai-call-webhook-telegram/         # Webhook Telegram
│   └── ai-call-worker/                   # Worker kolejki
└── migrations/
    └── [timestamp]_ai_call_module.sql    # Wszystkie zmiany DB
```

---

## DEFINICJA "DONE" (CHECKLIST)

- [ ] Admin Sprzedaży ma panel "AI Call Admin" i może:
  - [ ] Włączyć/wyłączyć globalnie moduł
  - [ ] Dodać whitelistę maili
  - [ ] Dodać whitelistę firm po NIP
  - [ ] Zobaczyć placeholders dla API keys

- [ ] Firma z dostępem widzi zakładkę "AI Agent" i może:
  - [ ] Włączyć AI oddzwanianie
  - [ ] Ustawić język, głos, godziny, limit prób
  - [ ] Wypełnić profil firmy + pobrać propozycję z AI
  - [ ] Zobaczyć Lead Inbox z filtrowaniem

- [ ] Działa import leadów:
  - [ ] CSV/Sheets import z mapowaniem
  - [ ] Webhook Meta (placeholder)
  - [ ] Webhook Telegram (placeholder)

- [ ] Jest kolejka połączeń:
  - [ ] Tabela `ai_call_queue`
  - [ ] UI do zarządzania kolejką
  - [ ] Przycisk "Zadzwoń teraz"
  - [ ] Zapis wyników do `ai_agent_calls`

- [ ] Konta testowe działają:
  - [ ] warsztat@test.pl w whitelist
  - [ ] detaling@test.pl w whitelist
  - [ ] Widoczna zakładka AI Agent

- [ ] Audit log zapisuje kluczowe akcje

---

## SZACOWANY NAKŁAD PRACY

| Faza | Opis | Szacunek |
|------|------|----------|
| 1 | Rozszerzenie bazy danych | ~1h |
| 2 | Panel admina sprzedaży | ~3h |
| 3 | Rozszerzenie panelu firmy | ~4h |
| 4 | Import leadów | ~3h |
| 5 | Mechanizm dzwonienia (placeholder) | ~2h |
| 6 | Konta testowe | ~0.5h |
| 7 | Audit log | ~1h |
| **SUMA** | | **~14.5h** |

---

## UWAGI KOŃCOWE

1. **Nie zmieniamy istniejących modułów** - tylko dodajemy nowe komponenty
2. **Wykorzystujemy istniejącą infrastrukturę** - tabele `ai_agent_*`, hooki, komponenty
3. **API integracje są placeholders** - na MVP przygotowujemy architekturę bez działających połączeń
4. **Multi-tenant isolation** - każda firma widzi tylko swoje dane
5. **Feature flags kontrolują wszystko** - gdy OFF, UI nie istnieje
