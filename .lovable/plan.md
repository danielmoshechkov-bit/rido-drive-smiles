
# Kompleksowy Plan: Diagnostyka Bugów + Moduły Stron WWW i AI Agentów

---

## SEKCJA 0: DIAGNOSTYKA BUGÓW (BEZ ZMIAN LOGIKI)

### Problem 1: Kierowca Paweł Koziarek NIE wykryty

**Diagnoza techniczna:**
- UUID `6c252dc6-0767-47e0-aec1-283eee321c7d` NIE istnieje w `driver_platform_ids`
- NIE istnieje w `unmapped_settlement_drivers` (tabela jest pusta)
- Parser CSV albo: (a) dopasował go fuzzy matching do istniejącego kierowcy, (b) pominął wiersz z błędem

**Rozwiązanie - NOWY MECHANIZM DIAGNOSTYCZNY:**

Utworzę nową tabelę `settlement_import_diagnostics` i logging endpoint:

```sql
-- Nowa tabela do diagnostyki importów
CREATE TABLE settlement_import_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id),
  import_timestamp TIMESTAMPTZ DEFAULT now(),
  platform TEXT NOT NULL, -- 'uber', 'bolt', 'freenow', 'fuel'
  csv_row_number INTEGER,
  raw_driver_name TEXT,
  raw_platform_id TEXT,
  raw_phone TEXT,
  raw_email TEXT,
  match_result TEXT, -- 'matched_exact', 'matched_fuzzy', 'created_new', 'skipped'
  match_score INTEGER,
  matched_driver_id UUID,
  created_driver_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Zmiany w Edge Function `settlements/index.ts`:**
Dodać logowanie każdego wiersza CSV do tabeli diagnostycznej - NIE zmieniając istniejącej logiki parsowania.

---

### Problem 2: Karta paliwowa 10206980198 nie wykryta

**Diagnoza techniczna:**
- Karta istnieje w `fuel_transactions` jako `0010206980198` (z wiodącymi zerami)
- Przypisane karty mają format `10206980xxx` (bez zer)
- Logika `fetchUnmappedFuelCards` normalizuje zera, ALE problem może być w porównywaniu

**Rozwiązanie - DIAGNOSTIC LOGGING:**

Dodać w `UnmappedDriversModal.tsx` logowanie:

```typescript
console.log('🔍 FUEL DIAGNOSTIC:', {
  assignedCards: Array.from(assignedCards),
  transactionCards: transactions?.map(t => t.card_number),
  normalizedMatches: // szczegóły porównania
});
```

**Dodatkowo - Nowa tabela `fuel_cards`:**

```sql
-- Centralna baza kart paliwowych
CREATE TABLE fuel_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT UNIQUE NOT NULL,
  card_number_normalized TEXT GENERATED ALWAYS AS (LTRIM(card_number, '0')) STORED,
  driver_id UUID REFERENCES drivers(id),
  fleet_id UUID,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_transaction_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## SEKCJA 1: MODUŁ TWORZENIA STRON WWW

### Struktura Bazy Danych

```sql
-- Główna tabela stron WWW
CREATE TABLE website_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider_id UUID REFERENCES service_providers(id),
  
  -- Pakiet
  package_type TEXT NOT NULL CHECK (package_type IN ('one_page', 'multi_page')),
  seo_addon BOOLEAN DEFAULT false,
  domain_setup_addon BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'form_completed', 'ai_questions', 'generating', 
    'preview_ready', 'editing', 'published'
  )),
  
  -- Limity
  corrections_used INTEGER DEFAULT 0,
  corrections_limit INTEGER NOT NULL,
  
  -- Wygenerowana strona
  generated_html TEXT,
  generated_css TEXT,
  generated_pages JSONB DEFAULT '[]',
  
  -- Domena
  custom_domain TEXT,
  subdomain TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dane formularza WWW
CREATE TABLE website_form_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES website_projects(id) ON DELETE CASCADE,
  
  -- Firma i kontakt
  company_name TEXT NOT NULL,
  slogan TEXT,
  city_area TEXT,
  phone TEXT,
  email TEXT,
  working_hours TEXT,
  social_facebook TEXT,
  social_instagram TEXT,
  social_whatsapp TEXT,
  google_maps_link TEXT,
  
  -- Opis firmy
  about_short TEXT,
  why_us_points JSONB DEFAULT '[]',
  
  -- CTA
  cta_type TEXT DEFAULT 'call' CHECK (cta_type IN ('call', 'form', 'whatsapp', 'all')),
  
  -- Logo
  has_logo BOOLEAN DEFAULT false,
  logo_url TEXT,
  logo_description TEXT,
  generated_logo_url TEXT,
  
  -- AI questions/answers
  ai_questions JSONB DEFAULT '[]',
  ai_answers JSONB DEFAULT '{}',
  
  -- Styl
  tone_of_voice TEXT,
  visual_style TEXT,
  language TEXT DEFAULT 'pl',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usługi na stronie
CREATE TABLE website_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_data_id UUID REFERENCES website_form_data(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_from NUMERIC,
  description TEXT,
  inclusions JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0
);

-- Poprawki na stronie
CREATE TABLE website_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES website_projects(id) ON DELETE CASCADE,
  
  -- Lokalizacja poprawki
  page_id TEXT,
  element_selector TEXT,
  element_description TEXT,
  
  -- Opis poprawki
  short_note TEXT,
  full_description TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'rejected')),
  
  -- Wynik AI
  ai_response TEXT,
  applied_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ceny pakietów (Admin)
CREATE TABLE website_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type TEXT UNIQUE NOT NULL,
  base_price NUMERIC NOT NULL,
  corrections_included INTEGER NOT NULL,
  seo_addon_price NUMERIC DEFAULT 0,
  domain_setup_price NUMERIC DEFAULT 0,
  extra_corrections_price NUMERIC DEFAULT 0,
  generation_cost NUMERIC DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Komponenty React

**Nowe pliki:**

| Plik | Opis |
|------|------|
| `src/components/website-builder/WebsiteBuilderWizard.tsx` | Główny wizard |
| `src/components/website-builder/PackageSelection.tsx` | Wybór pakietu |
| `src/components/website-builder/WebsiteFormStep.tsx` | Formularz danych |
| `src/components/website-builder/AIQuestionsStep.tsx` | Pytania AI |
| `src/components/website-builder/PreviewStep.tsx` | Podgląd strony |
| `src/components/website-builder/CorrectionEditor.tsx` | Edytor poprawek |
| `src/components/website-builder/PublishStep.tsx` | Publikacja |
| `src/components/admin/WebsitePricingPanel.tsx` | Panel cen admina |

### Edge Functions

| Funkcja | Opis |
|---------|------|
| `website-generate` | Generowanie strony z AI (Gemini) |
| `website-correction` | Aplikowanie poprawek (fragment) |
| `website-logo-generate` | Generowanie logo (Nano Banana) |
| `website-publish` | Publikacja strony |

### Flow użytkownika

```text
1. Wybór pakietu → One-page / Multi-page
         ↓
2. Formularz danych → Firma, usługi, CTA, logo
         ↓
3. AI dopytuje → Max 1-2 rundy pytań
         ↓
4. Generuj podgląd → Koszt X zł
         ↓
5. Podgląd → Desktop/Mobile iframe
         ↓
6. Poprawki → Kliknij element → Notatka
         ↓
7. Publikacja → Domena, hosting
```

---

## SEKCJA 2: MODUŁ AI AGENTÓW (Rozbudowa istniejącego)

### Istniejąca infrastruktura

Moduł AI Agent już istnieje w:
- `src/components/sales/ai-agent/*` - 13 komponentów
- Tabele: `ai_agent_configs`, `ai_call_business_profiles`, `ai_call_scripts`, `ai_call_queue`, itd.
- Panel: `ServiceProviderDashboard.tsx` → zakładka "AI Agent"

### Rozszerzenia do dodania

**Nowe tabele:**

```sql
-- Typy agentów
CREATE TABLE ai_agent_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key TEXT UNIQUE NOT NULL, -- 'sales', 'reception', 'confirmation', 'support'
  name_pl TEXT NOT NULL,
  description TEXT,
  base_prompt TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Globalna baza wiedzy (uczenie między agentami)
CREATE TABLE ai_agent_global_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'objection_handling', 'booking_patterns', 'closing_techniques'
  pattern TEXT NOT NULL,
  success_rate NUMERIC,
  usage_count INTEGER DEFAULT 0,
  source_config_id UUID REFERENCES ai_agent_configs(id),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sesje rozmów AI (dla uczenia)
CREATE TABLE ai_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES ai_agent_configs(id),
  call_id UUID REFERENCES ai_agent_calls(id),
  lead_id UUID REFERENCES sales_leads(id),
  
  transcript JSONB, -- pełna transkrypcja
  outcome TEXT, -- 'booked', 'callback', 'rejected', 'no_answer'
  outcome_details JSONB,
  
  -- Metryki uczenia
  sentiment_scores JSONB,
  successful_patterns JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ceny AI agentów (Admin)
CREATE TABLE ai_agent_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  price_per_minute NUMERIC NOT NULL,
  price_per_booking NUMERIC,
  monthly_base_fee NUMERIC DEFAULT 0,
  free_minutes_per_month INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);
```

### Nowe komponenty

| Plik | Opis |
|------|------|
| `src/components/ai-agents/AgentTypeSelector.tsx` | Wybór typu agenta |
| `src/components/ai-agents/KnowledgeBaseEditor.tsx` | Baza wiedzy |
| `src/components/ai-agents/ConversationAnalytics.tsx` | Analityka rozmów |
| `src/components/ai-agents/GlobalLearningPanel.tsx` | Panel uczenia globalnego |
| `src/components/admin/AIAgentsPricingPanel.tsx` | Ceny agentów (Admin) |

### Zakładki w ServiceProviderDashboard

Nowe zakładki do dodania:
- **AI Agenci** (rozbudowa istniejącej "AI Agent")
  - Panel główny
  - Typy agentów
  - Baza wiedzy
  - Harmonogram dzwonienia
  - Analityka

---

## PODSUMOWANIE PLIKÓW DO UTWORZENIA

### Baza danych (migracje)
1. `settlement_import_diagnostics` - diagnostyka importów
2. `fuel_cards` - centralna baza kart
3. `website_*` - 6 tabel dla modułu WWW
4. `ai_agent_*` - 4 nowe tabele dla agentów

### Edge Functions
1. `website-generate`
2. `website-correction`
3. `website-logo-generate`
4. `website-publish`
5. `settlement-diagnostics` (logging endpoint)

### Komponenty React
**Website Builder (7 plików):**
- `WebsiteBuilderWizard.tsx`
- `PackageSelection.tsx`
- `WebsiteFormStep.tsx`
- `AIQuestionsStep.tsx`
- `PreviewStep.tsx`
- `CorrectionEditor.tsx`
- `PublishStep.tsx`

**AI Agents (5 plików):**
- `AgentTypeSelector.tsx`
- `KnowledgeBaseEditor.tsx`
- `ConversationAnalytics.tsx`
- `GlobalLearningPanel.tsx`
- Admin: `AIAgentsPricingPanel.tsx`

**Admin (2 pliki):**
- `WebsitePricingPanel.tsx`
- Rozbudowa `AICallAdminPanel.tsx`

### Zmiany w istniejących plikach
- `ServiceProviderDashboard.tsx` - nowa zakładka "Strona WWW"
- `settlements/index.ts` - dodanie logowania diagnostycznego
- `UnmappedDriversModal.tsx` - dodanie logowania kart

---

## FEATURE TOGGLES (Admin)

```sql
INSERT INTO feature_toggles (feature_key, feature_name, category, is_enabled, description) VALUES
('website_builder_enabled', 'Kreator stron WWW', 'services', false, 'Moduł tworzenia stron WWW dla usługodawców'),
('website_builder_seo_addon', 'SEO Addon', 'services', true, 'Opcja SEO w kreatorze stron'),
('ai_agents_global_learning', 'AI Uczenie globalne', 'ai', false, 'Agregacja wiedzy między agentami'),
('ai_agents_free_tier', 'AI Agenci darmowy tier', 'ai', true, 'Darmowy dostęp do AI agentów (beta)');
```

---

## SZACOWANY CZAS IMPLEMENTACJI

| Sekcja | Czas |
|--------|------|
| SEKCJA 0: Diagnostyka bugów | 3-4h |
| SEKCJA 1: Moduł WWW (szkielet + podstawy) | 12-16h |
| SEKCJA 2: Rozbudowa AI Agentów | 8-10h |
| **RAZEM** | **23-30h** |

---

## KOLEJNOŚĆ IMPLEMENTACJI

1. **Faza 1**: Diagnostyka bugów (SEKCJA 0) - natychmiast
2. **Faza 2**: Tabele + feature toggles dla obu modułów
3. **Faza 3**: Szkielet UI modułu WWW (zakładka + wizard)
4. **Faza 4**: Edge functions generowania strony
5. **Faza 5**: Rozbudowa AI Agentów
6. **Faza 6**: Panel admina dla obu modułów
