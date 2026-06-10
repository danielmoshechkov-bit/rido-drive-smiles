
# Plan: Moduł Pracownika Warsztatu + Globalne Auto-Tłumaczenie

Dwa duże, powiązane systemy. Proponuję podzielić wdrożenie na **2 fazy** zamiast robić wszystko w jednej iteracji — to za duży zakres na jeden bezpieczny deploy (4 nowe tabele × 2, 5+ edge functions, ~15 komponentów frontu, nowy moduł użytkownika, hook tłumaczeń, integracje w 5+ miejscach insertów).

---

## FAZA 1 — Moduł Pracownika Warsztatu (1-2 dni)

### Baza danych (1 migracja)
- `workshop_employee_invitations` — zaproszenia (email, status pending/accepted/rejected/revoked)
- `workshop_order_assignments` — przypisanie zlecenia do pracownika + status workflow
- `workshop_employee_findings` — punkty protokołu (opis oryginał + PL, akcja, część, czas, status)
- `workshop_employees` — dodać kolumny: `user_id`, `status`, `language_preference`, `removed_at` (kolumny `role`, `is_active` już są)
- RLS: pracownik widzi tylko swoje przypisania; pracodawca widzi tylko swoje zlecenia
- GRANT-y do `authenticated` + `service_role`

### Edge Functions
- `workshop-invite-employee` — wysyła zaproszenie (in-app notification + email przez istniejący `send-employee-invitation`)
- `workshop-accept-employee-invitation` — accept/reject, tworzy/aktualizuje `workshop_employees`
- `workshop-translate` — Kimi AI (KIMI_API_KEY/MOONSHOT_API_KEY już są w secrets), cache w `workshop_translation_cache` (lub od razu w globalnym z Fazy 2)
- `workshop-employee-submit-findings` — tłumaczy każdy opis na PL, zapisuje findings, powiadamia pracodawcę
- `workshop-approve-findings` — przenosi zaznaczone findings jako pozycje `workshop_order_items`

### Frontend pracodawcy
- `WorkshopEmployeesPage.tsx` — dodać zakładki **Zaproszenia / Aktywni**, modal „Zaproś po emailu"
- `WorkshopOrderDetail.tsx`:
  - Dropdown „Przydziel pracownika"
  - Nowa zakładka **„Od pracowników"** z listą findings + checkbox + [Przenieś na kartę]

### Frontend pracownika (nowy moduł)
- Nowy hook `useIsWorkshopEmployee()` — sprawdza `workshop_employees.status='active'`
- Dodać kafel **„Warsztat & Auta"** w `EasyHub` widoczny warunkowo
- Strony:
  - `/pracownik-warsztat/zlecenia` — lista przydzielonych
  - `/pracownik-warsztat/zlecenia/:id` — karta + formularz protokołu (textarea z Web Speech API, dropdown akcji, autocomplete części reużywając `PartsSearchModal`, czas)
- Mobile-first, duże touch targets (44px+)

### Notyfikacje
- In-app via istniejący `workspace_notifications` lub `notification_log`
- SMS opcjonalnie przez `workshop-send-sms` (już istnieje)

---

## FAZA 2 — Globalne Auto-Tłumaczenie (1-2 dni, po akceptacji Fazy 1)

### Baza
- `content_translations` (content_type, content_id, source_text, translations jsonb, status)
- `translation_cache_global` (hash, source_lang, translations jsonb, hit_count)
- `profiles.preferred_language` (lub `marketplace_user_profiles` — używamy tej tabeli w projekcie)

### Edge Function
- `auto-translate-content` — batch Kimi AI (PL/EN/RU/UA/DE w 1 callu), cache hash-based, fallback do source przy błędzie, kolejka retry

### Frontend
- Hook `useTranslatedContent(type, id, fallback)` + komponent `<TranslatedText/>`
- Wykrywanie języka: `marketplace_user_profiles.preferred_language` → `navigator.language` → `pl`
- Ikonka „🌐 Przetłumaczone przez AI"

### Integracje (triggery DB lub w hookach mutacji)
- `marketplace_listings`, `real_estate_listings`, `general_listings`, `services`/`provider_services`, `workshop_orders.description`, `workshop_employee_findings` (z Fazy 1 — przepiąć z `workshop-translate` na unified)
- SMS/email do klienta — wybór języka z profilu klienta

### Spójność z Fazą 1
- Faza 2 zastępuje `workshop-translate` przez `auto-translate-content`
- `workshop_translation_cache` migrowana do `translation_cache_global` (lub od razu w Fazie 1 użyjemy globalnego)

---

## Decyzje do potwierdzenia

1. **Robimy obie fazy teraz, czy Faza 1 najpierw + osobny commit dla Fazy 2?**
   Rekomenduję Faza 1 → test → Faza 2. Mniej ryzyka regresji, łatwiejszy rollback.

2. **Cache tłumaczeń od razu globalny?** Tak — od razu zrobimy `translation_cache_global` w Fazie 1, żeby nie migrować później. `workshop_translation_cache` pomijamy.

3. **Web Speech API dla głosowego dodawania punktów** — działa tylko w Chrome/Safari, bez fallbacku. OK?

4. **Auto-tłumaczenie istniejących treści** (backfill ~tysięcy ogłoszeń) — robimy w Fazie 2 jako jednorazowy cron, czy tylko nowe od momentu wdrożenia? Backfill kosztuje ~20-50 USD jednorazowo.

---

Po Twojej akceptacji startuję **Fazą 1**. Daj znać czy:
- (a) zatwierdzasz plan w tej formie i jedziemy z Fazą 1,
- (b) chcesz coś zmienić w zakresie/kolejności,
- (c) chcesz mimo wszystko obie fazy w jednym podejściu (dłużej, większe ryzyko).
