# GetRido Platform - Version 1.0.0

## Data: 2025-11-02
## Baseline Production Release

### Funkcjonalności:
- Panel administratora z zarządzaniem kierowcami i flotą
- Panel floty z możliwością delegowania uprawnień
- Portal kierowcy z widokiem dokumentów, rozliczeń i paliwa
- Zarządzanie dokumentami z alertami wygaśnięcia
- System rozliczeń tygodniowych z importem CSV
- Zarządzanie paliwem i kartami paliwowymi
- System alertów systemowych i powiadomień
- Zarządzanie pojazdami i historią przypisań
- System ról i uprawnień użytkowników

### Konfiguracja techniczna:
- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS z custom design system
- Backend: Supabase (PostgreSQL + Authentication + Edge Functions)
- Deployment: Lovable Cloud

### Uwagi:
- **Wersja bez strony głównej (landing page)** - dostępne tylko panele aplikacji
- **Tylko język polski** - system i18n dostępny, ale interfejs wielojęzyczny wyłączony
- **Przygotowane do wdrożenia na: panel.getrido.online**
- Secure RLS policies dla wszystkich tabel
- Edge Functions dla złożonych operacji backendowych

### Konfiguracja przed wdrożeniem:
1. **Supabase Authentication → URL Configuration:**
   - Site URL: `https://panel.getrido.online`
   - Redirect URLs: Dodać `https://panel.getrido.online/**`

2. **DNS Configuration dla getrido.online:**
   - CNAME record: `panel` → `[lovable-url].lovable.app`

3. **Wymagany płatny plan Lovable** dla custom domain

### Znane ograniczenia:
- Responsywność wymaga poprawy na urządzeniach mobilnych (zaplanowane w v1.1.0)
- Landing page zostanie dodany w przyszłej wersji
- Wielojęzyczność wyłączona do czasu pełnego przetłumaczenia

### Bezpieczeństwo:
- ✅ RLS policies dla wszystkich tabel
- ✅ Secure functions (SECURITY DEFINER) dla operacji backendowych
- ✅ Authentication przez Supabase Auth
- ✅ Brak hardcoded credentials w kodzie
- ✅ Walidacja input na formach logowania i rejestracji

---

**Baseline commit:** Ten release stanowi bazową wersję produkcyjną systemu GetRido.
Wszystkie przyszłe zmiany będą wersjonowane zgodnie z semantic versioning (MAJOR.MINOR.PATCH).
