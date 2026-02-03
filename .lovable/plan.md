

# Plan Naprawy - 5 Problemów UI/UX i Funkcjonalności

## PODSUMOWANIE WYKONAWCZE

Na podstawie analizy kodu zidentyfikowano 5 głównych problemów do naprawy:

1. **Ikony w tab kategoriach zbyt blisko tekstu** - w `UniversalSearchResults.tsx` brakuje odpowiedniego odstępu między ikonami a tekstem
2. **Admin Portal niezgodny stylistycznie** - brak AccountSwitcherPanel i innych modułów (Marketplace, Mapy) w przełączniku
3. **Konta testowe nie istnieją** - warsztat@test.pl i detaling@test.pl nie zostały utworzone jako konta auth.users
4. **Nowi kierowcy z rozliczeń nie są rozpoznawani** - brak mechanizmu alertu i mapowania nowych kierowców Uber/Bolt/FreeNow
5. **AI Call Agent - brakujące elementy** - profil firmy, skrypty rozmów, zgody prawne

---

## PROBLEM 1: IKONY W KATEGORIACH ZA BLISKO TEKSTU

### Lokalizacja
`src/pages/UniversalSearchResults.tsx` (linie 192-233)

### Analiza
W TabsTrigger używana jest klasa `gap-2` ale ikony i tekst są wyrenderowane bez spacji między nimi:
```tsx
<Car className="h-4 w-4" />
Pojazdy
```

### Rozwiązanie
Dodać `gap-2` lub `gap-3` i upewnić się że elementy są w kontenerze flex:
```tsx
<TabsTrigger 
  value="vehicles" 
  className="px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-150 flex items-center gap-2 ..."
>
  <Car className="h-4 w-4" />
  <span>Pojazdy</span>
  ...
</TabsTrigger>
```

### Pliki do modyfikacji
- `src/pages/UniversalSearchResults.tsx` (linie 192-233)

---

## PROBLEM 2: ADMIN PORTAL NIEZGODNY STYLISTYCZNIE

### Analiza
1. **AdminPortal.tsx** nie ma `AccountSwitcherPanel` - nie można przełączyć się na inne konta
2. **AdminPortalSwitcher** jest widoczny, ale brak jest opcji "Marketplace" i "Mapy" w standardowym menu kont
3. Styl nagłówka różni się od innych dashboardów

### Rozwiązanie

#### 2.1 Dodać AccountSwitcherPanel do AdminPortal.tsx
```tsx
// W AdminPortal.tsx dodać import i użycie:
import { AccountSwitcherPanel } from '@/components/AccountSwitcherPanel';

// W render dodać sekcję "Twoje konta":
<AccountSwitcherPanel
  isDriverAccount={false}
  isFleetAccount={isFleetAdmin}
  isMarketplaceAccount={isMarketplaceAdmin}
  isRealEstateAccount={isRealEstateAdmin}
  isAdminAccount={true}
  isSalesAdmin={isSalesAdmin}
  isSalesRep={isSalesRep}
  isMarketplaceEnabled={true}
  currentAccountType="admin"
  navigate={navigate}
/>
```

#### 2.2 Dodać sprawdzanie ról dla innych modułów
- Dodać stany: `isFleetAdmin`, `isMarketplaceAdmin`, `isSalesAdmin`, etc.
- Pobrać role użytkownika z `user_roles`

### Pliki do modyfikacji
- `src/pages/AdminPortal.tsx` (dodać AccountSwitcherPanel + pobieranie ról)

---

## PROBLEM 3: KONTA TESTOWE NIE ISTNIEJĄ

### Analiza
Query `SELECT * FROM auth.users WHERE email IN ('warsztat@test.pl', 'detaling@test.pl')` zwraca pustą listę. Konta są w whitelist AI Call, ale same konta auth.users nie istnieją.

### Rozwiązanie
Utworzyć konta przez Supabase Admin API lub edge function:

#### 3.1 Nowa edge function: `create-test-accounts`
```typescript
// supabase/functions/create-test-accounts/index.ts
// Utworzy:
// - warsztat@test.pl (hasło: Test123!)
// - detaling@test.pl (hasło: Test123!)
// Z rolami: service_provider
```

#### 3.2 Struktura kont testowych
- Dodać wpisy do `entities` dla firm testowych (np. "Warsztat Testowy", "Detaling Testowy")
- Dodać role do `user_roles`: service_provider
- Utworzyć `ai_agent_configs` z przykładowymi danymi

### Pliki do utworzenia/modyfikacji
- `supabase/functions/create-test-accounts/index.ts` (nowy)
- Uruchomić ręcznie lub z Admin panelu

---

## PROBLEM 4: NOWI KIEROWCY Z ROZLICZEŃ NIE SĄ ROZPOZNAWANI

### Analiza
W `supabase/functions/settlements/index.ts` system automatycznie tworzy nowych kierowców gdy nie znajdzie dopasowania. Problem: użytkownik nie jest informowany o tym w UI i nie może ręcznie połączyć kierowców.

Funkcja `findOrCreateDriver` (linie 565-578) automatycznie tworzy kierowcę, ale nie ma mechanizmu:
1. Powiadomienia o nowych kierowcach
2. Ręcznego mapowania Uber ID → Driver

### Rozwiązanie

#### 4.1 Rozszerzyć odpowiedź settlements o listę nowych kierowców
W `settlements/index.ts` zwracać szczegóły nowych kierowców:
```typescript
return {
  success: true,
  settlement_id,
  stats: {
    processed: settlementsToInsert.length,
    new_drivers: newDriversCount,
    matched_drivers: matchedDriversCount,
    unmapped_drivers: unmappedDriversList // NOWE - lista kierowców do zmapowania
  }
}
```

#### 4.2 Dodać modal "Nowi kierowcy" w FleetSettlementImport.tsx
```tsx
// Po imporcie, jeśli są nowi kierowcy, pokaż modal:
interface UnmappedDriver {
  id: string;
  full_name: string;
  uber_id?: string;
  bolt_id?: string;
  freenow_id?: string;
  phone?: string;
}

// Modal z listą i możliwością połączenia:
<Dialog open={showUnmappedModal}>
  <DialogContent>
    <DialogTitle>Nowi kierowcy w rozliczeniu</DialogTitle>
    <p>System rozpoznał {unmappedDrivers.length} nowych kierowców...</p>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nazwa</TableHead>
          <TableHead>Uber ID</TableHead>
          <TableHead>Bolt ID</TableHead>
          <TableHead>FreeNow ID</TableHead>
          <TableHead>Połącz z...</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {unmappedDrivers.map(driver => (
          <TableRow>
            <TableCell>{driver.full_name}</TableCell>
            <TableCell>{driver.uber_id}</TableCell>
            <TableCell>{driver.bolt_id}</TableCell>
            <TableCell>{driver.freenow_id}</TableCell>
            <TableCell>
              <Select onValueChange={(id) => linkDriver(driver.id, id)}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kierowcę" />
                </SelectTrigger>
                <SelectContent>
                  {existingDrivers.map(d => (
                    <SelectItem value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </DialogContent>
</Dialog>
```

#### 4.3 Dodać endpoint do łączenia kierowców
```typescript
// Funkcja do łączenia platform_id z istniejącym kierowcą:
async function linkPlatformId(driverId: string, platform: string, platformId: string) {
  await supabase.from('driver_platform_ids').upsert({
    driver_id: driverId,
    platform,
    platform_id: platformId
  });
}
```

### Pliki do modyfikacji
- `supabase/functions/settlements/index.ts` (zwracać listę nowych kierowców)
- `src/components/fleet/FleetSettlementImport.tsx` (dodać modal mapowania)
- Opcjonalnie: `src/components/fleet/UnmappedDriversModal.tsx` (nowy komponent)

---

## PROBLEM 5: AI CALL AGENT - BRAKUJĄCE ELEMENTY

### Analiza stanu
- ✅ Tabele whitelist istnieją (`ai_call_user_whitelist`, `ai_call_company_whitelist`)
- ✅ Feature flags istnieją (`ai_call_enabled_global`, `ai_call_test_mode`, etc.)
- ✅ Test mode jest włączony
- ✅ Konta testowe są na whitelist
- ❌ Global flag `ai_call_enabled_global` jest **FALSE**
- ❌ Brak tabel: `ai_call_business_profiles`, `ai_call_scripts`, `ai_call_legal_consents`
- ❌ Brak UI do profilu firmy i skryptów rozmów
- ❌ Brak mechanizmu generowania skryptów przez AI

### Rozwiązanie

#### 5.1 Nowe tabele bazy danych

```sql
-- Profil firmy do rozmów AI
CREATE TABLE public.ai_call_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL UNIQUE,
  website_url TEXT,
  business_description TEXT,
  services_json JSONB DEFAULT '[]'::jsonb,
  faq_json JSONB DEFAULT '[]'::jsonb,
  rules_json JSONB DEFAULT '{}'::jsonb,
  pricing_notes TEXT,
  last_script_generation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Skrypty rozmów AI
CREATE TABLE public.ai_call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  language TEXT DEFAULT 'pl',
  voice_id TEXT,
  scenario_type TEXT DEFAULT 'lead_callback' 
    CHECK (scenario_type IN ('lead_callback','booking','pricing','upsell','objections_price','objections_time','objections_think','followup_missed','followup_summary','premium')),
  style TEXT DEFAULT 'friendly' CHECK (style IN ('concise','friendly','premium')),
  status TEXT DEFAULT 'draft_ai' CHECK (status IN ('draft_ai','approved','archived')),
  title TEXT,
  content_json JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Zgody prawne AI Call
CREATE TABLE public.ai_call_legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('ai_call_processing','ai_call_contacting','ai_call_recording_optional')),
  version TEXT NOT NULL,
  accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.ai_call_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_call_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_call_legal_consents ENABLE ROW LEVEL SECURITY;

-- Policies (uproszczone)
CREATE POLICY "Users manage own profiles" ON public.ai_call_business_profiles
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users manage own scripts" ON public.ai_call_scripts
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users manage own consents" ON public.ai_call_legal_consents
  FOR ALL USING (user_id = auth.uid());
```

#### 5.2 Nowe komponenty UI

**AIAgentBusinessProfile.tsx** - Panel profilu firmy:
- Pole "Website URL"
- Pole "Opis działalności" (textarea duże)
- Dynamiczna lista usług (nazwa, cena od/do, czas)
- Sekcja FAQ (pytania/odpowiedzi)
- Sekcja "Czego nie obiecywać"
- Przycisk "Zapisz i wygeneruj skrypty rozmów"

**AIAgentScriptsList.tsx** - Lista skryptów:
- Tabela: tytuł, typ scenariusza, język, status, data
- Podgląd skryptu (modal read-only)
- Akcje: Zatwierdź, Archiwizuj, Odśwież

**AIAgentLegalConsentsModal.tsx** - Modal zgód:
- Checkbox: "Zgadzam się na przetwarzanie danych do AI Call"
- Checkbox: "Zgadzam się na kontakt telefoniczny AI"
- Opcjonalny checkbox: "Zgadzam się na nagrywanie rozmów"
- Link do regulaminu
- Przycisk "Akceptuję i włączam AI oddzwanianie"

#### 5.3 Generowanie skryptów przez AI

**Edge function: ai-generate-call-scripts**
```typescript
// supabase/functions/ai-generate-call-scripts/index.ts
// Input: config_id, business_profile
// Output: 10 skryptów rozmów zapisanych w ai_call_scripts

const SCENARIO_TYPES = [
  'lead_callback',
  'booking', 
  'pricing',
  'upsell',
  'objections_price',
  'objections_time',
  'objections_think',
  'followup_missed',
  'followup_summary',
  'premium'
];

// Dla każdego typu wygeneruj skrypt na podstawie profilu firmy
for (const type of SCENARIO_TYPES) {
  const prompt = buildPromptForScenario(type, businessProfile);
  const script = await generateScript(prompt);
  await saveScript(configId, type, script);
}
```

#### 5.4 Rozszerzenie AIAgentDashboard.tsx

Dodać nowe zakładki:
- "Profil firmy" → `AIAgentBusinessProfile`
- "Skrypty" → `AIAgentScriptsList`

W zakładce "Konfiguracja":
- Dodać przycisk "Włącz AI oddzwanianie" który otwiera modal zgód
- Bez zaakceptowanych zgód blokować włączenie

### Pliki do utworzenia/modyfikacji
- `supabase/migrations/[timestamp]_ai_call_profiles_scripts.sql` (nowa migracja)
- `src/components/sales/ai-agent/AIAgentBusinessProfile.tsx` (nowy)
- `src/components/sales/ai-agent/AIAgentScriptsList.tsx` (nowy)
- `src/components/sales/ai-agent/AIAgentLegalConsentsModal.tsx` (nowy)
- `src/components/sales/ai-agent/AIAgentDashboard.tsx` (rozszerzyć)
- `src/hooks/useAICallBusinessProfile.ts` (nowy)
- `src/hooks/useAICallScripts.ts` (nowy)
- `supabase/functions/ai-generate-call-scripts/index.ts` (nowy)

---

## PODSUMOWANIE PLIKÓW DO MODYFIKACJI

| Problem | Pliki | Typ zmiany |
|---------|-------|------------|
| 1. Ikony spacing | `src/pages/UniversalSearchResults.tsx` | Edycja (dodać gap/span) |
| 2. Admin Portal | `src/pages/AdminPortal.tsx` | Edycja (dodać AccountSwitcher) |
| 3. Konta testowe | `supabase/functions/create-test-accounts/index.ts` | Nowy |
| 4. Nowi kierowcy | `settlements/index.ts`, `FleetSettlementImport.tsx` | Edycja + nowy modal |
| 5. AI Call Profile | 6+ nowych plików + 1 migracja | Nowe |

---

## KOLEJNOŚĆ WDROŻENIA

1. **Faza 1** - Szybkie poprawki UI (Problem 1, 2): ~2h
2. **Faza 2** - Konta testowe (Problem 3): ~1h
3. **Faza 3** - Mapowanie kierowców (Problem 4): ~4h
4. **Faza 4** - AI Call rozszerzenia (Problem 5): ~8h

**Łączny szacowany czas: ~15h**

---

## UWAGI TECHNICZNE

1. **NIE ZMIENIAMY** istniejących nazw tabel, ról ani modułów
2. **WYKORZYSTUJEMY** istniejącą infrastrukturę (`ai_agent_configs`, `feature_toggles`, etc.)
3. **ZACHOWUJEMY** izolację multi-tenant (RLS per config_id/user_id)
4. **PRZED WŁĄCZENIEM** AI Call global flag upewnić się że test mode działa

