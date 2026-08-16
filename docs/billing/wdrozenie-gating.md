# Wdrożenie gatingu — skrypt kolejności

Osiem kroków. **Po każdym można przerwać** — przy każdym jest napisane, co jest
prawdą po jego wykonaniu i jak go cofnąć.

Zasada nadrzędna: **migracje przed funkcjami brzegowymi.** Bramka G5 woła funkcję
SQL `moze_pracowac`; wdrożona przed migracją odmówi wszystkim, bo brak funkcji
w bazie liczy się jak brak zgody. To celowe i ma tak zostać.

---

## KROK 0 — kontrola przed startem (NIC nie zmienia)

Najważniejsze zapytanie całego wdrożenia. Odpowiada na pytanie: **czy po włączeniu
bramki nie zablokujesz sam siebie.**

```sql
-- Odtwarza dokładnie regułę, którą wprowadzi `moze_pracowac`, ale bez niej.
SELECT
  sp.id,
  sp.company_name,
  (SELECT bs.status FROM billing_subscriptions bs
    WHERE bs.subscriber_type = 'service_provider'
      AND bs.subscriber_id = sp.id
      AND bs.product_line = 'warsztat'
    ORDER BY bs.created_at DESC LIMIT 1)                       AS status_subskrypcji,
  (SELECT ps.status FROM paid_service_subscriptions ps
    WHERE ps.user_id = sp.user_id ORDER BY ps.created_at DESC LIMIT 1) AS status_trialu,
  (SELECT ps.expires_at FROM paid_service_subscriptions ps
    WHERE ps.user_id = sp.user_id ORDER BY ps.created_at DESC LIMIT 1) AS trial_do,
  CASE
    WHEN (SELECT bs.status FROM billing_subscriptions bs
           WHERE bs.subscriber_type = 'service_provider'
             AND bs.subscriber_id = sp.id AND bs.product_line = 'warsztat'
           ORDER BY bs.created_at DESC LIMIT 1)
         IN ('active','trialing','past_due') THEN 'BEDZIE PRACOWAC'
    WHEN (SELECT bs.status FROM billing_subscriptions bs
           WHERE bs.subscriber_type = 'service_provider'
             AND bs.subscriber_id = sp.id AND bs.product_line = 'warsztat'
           ORDER BY bs.created_at DESC LIMIT 1) IS NOT NULL THEN 'ZABLOKOWANY'
    WHEN (SELECT ps.status FROM paid_service_subscriptions ps
           WHERE ps.user_id = sp.user_id ORDER BY ps.created_at DESC LIMIT 1) = 'trial'
     AND COALESCE((SELECT ps.expires_at FROM paid_service_subscriptions ps
           WHERE ps.user_id = sp.user_id ORDER BY ps.created_at DESC LIMIT 1),
          now() + interval '1 day') > now() THEN 'BEDZIE PRACOWAC (trial)'
    ELSE 'ZABLOKOWANY'
  END AS werdykt
FROM service_providers sp
WHERE sp.status IN ('active','verified')
ORDER BY werdykt, sp.company_name;
```

**Czytaj wynik zanim ruszysz dalej.** Każdy warsztat z werdyktem `ZABLOKOWANY`
straci możliwość pracy w chwili wykonania kroku 1. Jeśli jest wśród nich Twój
własny albo któryś z trzech realnie używanych (CART78GARAGE, AUTO-SERWIS
HAWRYLUK, Beata Smosarska) — **najpierw** nadaj mu trial albo aktywną
subskrypcję, dopiero potem migracja.

### Zachowanie dostępu istniejącym warsztatom

Trzy realnie pracujące warsztaty mają zachować pełny dostęp do odwołania.
Rozważane były trzy drogi; **wybrana jest druga** i poniżej jest napisane,
dlaczego pierwsza jest pułapką.

**❌ Ręczna subskrypcja `active` w `billing_subscriptions` — NIE.**
Wygląda najczyściej, a zamyka drogę do zakupu:

- `billing-checkout:100-113` odmawia z `ALREADY_SUBSCRIBED`, gdy istnieje wiersz
  o statusie `trialing`/`active`/`past_due`/`read_only` w tej linii. Warsztat
  kliknąłby „Kup" i usłyszał „masz już aktywną subskrypcję". Koniec konwersji.
- Gdyby jednak doszło do zakupu, webhook robi `INSERT`, a indeks
  `billing_subscriptions_one_active` dopuszcza jedną aktywną subskrypcję na
  podmiot — dostalibyśmy `23505` i zdarzenie zamknięte jako `failed`
  z adnotacją „sprawdź zwrot". Klient płaci, subskrypcja nie powstaje.

Czyli wariant, który miał uniknąć sprzątania, wymagałby pamiętania o skasowaniu
wiersza **dokładnie przed** pierwszym zakupem — czyli dokładnie tego długu,
którego chcieliśmy uniknąć.

**✅ Przedłużony okres próbny w `paid_service_subscriptions` — TAK.**
Sprząta się sam:

- `moze_pracowac` sprawdza NAJPIERW `billing_subscriptions`; przy braku wiersza
  schodzi do triala. Trial z odległą datą → pełny dostęp.
- `billing-checkout` nie zagląda do tej tabeli, więc zakup działa normalnie.
- Po zakupie pojawia się wiersz w `billing_subscriptions` i **od tej chwili
  decyduje on**, a trial przestaje mieć znaczenie sam z siebie. Zero sprzątania.

Podgląd — najpierw sprawdź, kogo obejmie:
```sql
SELECT sp.id, sp.company_name, sp.user_id,
       ps.id AS trial_id, ps.status, ps.expires_at
FROM service_providers sp
LEFT JOIN LATERAL (
  SELECT * FROM paid_service_subscriptions p
  WHERE p.user_id = sp.user_id ORDER BY p.created_at DESC LIMIT 1
) ps ON true
WHERE sp.company_name ILIKE ANY (ARRAY['%cart78%','%hawryluk%','%smosarska%']);
```

Nadanie — dwa polecenia, bo część może już mieć wiersz triala:
```sql
-- 1) przedłużenie istniejących
UPDATE paid_service_subscriptions ps
SET status     = 'trial',
    expires_at = timestamptz '2027-12-31 23:59:59+01',
    metadata   = COALESCE(ps.metadata, '{}'::jsonb) || jsonb_build_object(
                   'module', 'warsztat', 'trial', true,
                   'source', 'dostep_zachowany_przed_gatingiem')
FROM service_providers sp
WHERE sp.user_id = ps.user_id
  AND sp.company_name ILIKE ANY (ARRAY['%cart78%','%hawryluk%','%smosarska%']);

-- 2) założenie brakujących
INSERT INTO paid_service_subscriptions (user_id, status, started_at, expires_at, amount_paid, metadata)
SELECT sp.user_id, 'trial', now(), timestamptz '2027-12-31 23:59:59+01', 0,
       jsonb_build_object('module', 'warsztat', 'trial', true,
                          'source', 'dostep_zachowany_przed_gatingiem')
FROM service_providers sp
WHERE sp.company_name ILIKE ANY (ARRAY['%cart78%','%hawryluk%','%smosarska%'])
  AND sp.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM paid_service_subscriptions p WHERE p.user_id = sp.user_id);
```

Kontrola po nadaniu — trzy razy `true`:
```sql
SELECT sp.company_name, public.moze_pracowac(sp.id, 'warsztat')
FROM service_providers sp
WHERE sp.company_name ILIKE ANY (ARRAY['%cart78%','%hawryluk%','%smosarska%']);
```
(to zapytanie zadziała dopiero PO migracji z kroku 1)

**Planu nie przypisujemy.** Trial nie ma `plan_id` i nie potrzebuje go: dostęp
jest dziś rozstrzygany zerojedynkowo, a ograniczenia funkcji per plan
(`has_feature`, `feature_limit`) nie mają jeszcze ani jednego wywołania.
Wpisanie `warsztat_pro` do metadanych uruchomiłoby za to baner namawiający ich
do kupna Pro i stworzyło obietnicę, której nikt nie składał.

Do rozstrzygnięcia później, przy 4.10: gdy wejdą limity per plan, trial bez
planu nie będzie miał zdefiniowanych limitów — wtedy trzeba tym trzem albo
przypisać plan, albo zamienić dostęp na prawdziwą subskrypcję.

**Stan po kroku 0:** nic nie zmienione.

---

## KROK 0b — kontrola rozjazdu schematu (NIC nie zmienia)

Nie blokuje wdrożenia, ale wykonaj przed nim, żeby wiedzieć, na czym stoisz.
Pełne zapytania i wyjaśnienie: `docs/security/rozjazd-repo-produkcja.md`.

Minimum dla ścieżki billingu — obie kolumny muszą istnieć **po kroku 4**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='billing_plans'
  AND column_name IN ('stripe_product_id','stripe_price_id_target');
```
Jeśli przed migracją zwraca dwa wiersze — istniały poza repo i migracja 4.20
tylko dopisuje je do repozytorium. Jeśli zero lub jeden — synchronizacja cennika
była zepsuta i migracja 4.20 ją naprawia.

---

## KROK 1 — migracja G4 (bramka zapisu + widoczność publiczna)

Plik: `supabase/migrations/20260815120000_gating_g4_bramka_zapisu.sql`

Kontrola po wykonaniu — oczekiwane **29 wierszy po `3`**:
```sql
SELECT tablename, count(*) AS polityk FROM pg_policies
WHERE schemaname='public' AND policyname LIKE 'warsztat_zapis_%'
GROUP BY tablename ORDER BY tablename;
```
Oczekiwane `1` (tylko INSERT) dla rezerwacji:
```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'workshop_client_bookings' AND policyname LIKE 'warsztat_zapis_%';
```
Funkcje odpowiadają zgodnie z krokiem 0:
```sql
SELECT sp.company_name,
       public.moze_pracowac(sp.id,'warsztat')       AS moze_pracowac,
       public.jest_klientem_linii(sp.id,'warsztat') AS klient_warsztatu
FROM service_providers sp WHERE sp.status IN ('active','verified')
ORDER BY sp.company_name;
```

⚠️ Sprawdź też, że **usługodawcy spoza warsztatów nie zniknęli**:
```sql
SELECT count(*) FILTER (WHERE public.jest_klientem_linii(id,'warsztat')) AS warsztaty,
       count(*) FILTER (WHERE NOT public.jest_klientem_linii(id,'warsztat')) AS pozostali
FROM service_providers WHERE status IN ('active','verified');
```
„Pozostali" muszą być nadal widoczni na `/uslugi` — otwórz stronę w oknie
incognito i sprawdź, że lista nie jest pusta.

**Stan po kroku 1:** zapis do tabel warsztatowych wymaga subskrypcji. Odczyt
i eksport działają. Funkcje brzegowe działają jak dotąd (omijają RLS).

**Cofnięcie:**
```sql
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY public.warsztat_tabele_wprost() || public.warsztat_tabele_przez_zlecenie() LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_delete', t);
  END LOOP;
  DROP POLICY IF EXISTS warsztat_zapis_insert ON public.workshop_client_bookings;
END $$;
```
Widoczność publiczną cofa się przywróceniem trzech polityk sprzed migracji —
ich pierwotne treści są w `20260124211812_*.sql` i `20260802095950_*.sql`.

---

## KROK 2 — migracja G0 (okna serwisowe administratora)

Plik: `supabase/migrations/20260815130000_gating_g0_admin_okna_serwisowe.sql`
**Wymaga kroku 1** — używa procedury `warsztat_zaloz_bramke` założonej w G4.

Kontrola — sześć razy `Admin podglad …` i **zero** `Admin full access …`:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE policyname LIKE 'Admin %' AND tablename LIKE 'workshop%'
ORDER BY tablename, policyname;
```
Test działania okna (na własnym koncie admina, w aplikacji — nie w SQL Editorze,
bo tam jesteś `postgres`, a nie `authenticated`):
```sql
-- powinno zwrócić false, dopóki okna nie otworzysz
SELECT public.ma_okno_serwisowe('…'::uuid);
```

**Stan po kroku 2:** administrator widzi dane warsztatów, ale ich nie zapisze bez
otwarcia okna z podanym powodem. Każde okno to wiersz w `admin_okna_serwisowe`.

**Cofnięcie:** przywrócić sześć polityk `FOR ALL` z `20260710_PERFA3_workshop_rls.sql`
i ponownie `CALL public.warsztat_zaloz_bramke();` (bez argumentu).

---

## KROK 3 — migracja G6 (zejście z karencji)

Plik: `supabase/migrations/20260815140000_gating_g6_karencja_do_read_only.sql`

Kontrola:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='billing_subscriptions' AND column_name='past_due_since';

SELECT jobname, schedule FROM cron.job WHERE jobname='billing-karencja-read-only';

-- Sucha próba: NIE zmienia nic, jeśli nikt nie przekroczył karencji.
SELECT public.billing_zejdz_do_read_only();
```
Zwrócona liczba to liczba przestawionych subskrypcji. Przy dzisiejszym stanie
oczekiwane **0**.

**Stan po kroku 3:** `past_due` przestaje być stanem wiecznym. Zadanie chodzi
codziennie o 3:15.

**Cofnięcie:** `SELECT cron.unschedule('billing-karencja-read-only');`
Kolumnę i trigger można zostawić — same z siebie nic nie blokują.

---

## KROK 4 — migracja 4.20 (gwarancja ceny)

Plik: `supabase/migrations/20260816100000_billing_4_20_gwarancja_ceny.sql`

Kontrola:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='billing_plans' AND column_name='stripe_price_id_target';

SELECT column_name FROM information_schema.columns
WHERE table_name='billing_subscriptions'
  AND column_name IN ('price_guarantee_notified_at','price_target_applied_at');

SELECT jobname, schedule FROM cron.job WHERE jobname='billing-gwarancja-ceny';
```

**Stan po kroku 4:** zadanie zaplanowane, ale **odmówi**, dopóki nie ustawisz
sekretu (krok 5). To zamierzone.

**Cofnięcie:** `SELECT cron.unschedule('billing-gwarancja-ceny');`

---

## KROK 5 — sekrety

W panelu Supabase (Edge Functions → Secrets):
- `BILLING_CRON_SECRET` — min. 16 znaków
- `SEED_DEMO_SECRET` — min. 16 znaków

W bazie — przez **Vault**, nie przez `ALTER DATABASE`. Dwa powody:
SQL Editor nie ma uprawnień do ustawiania parametrów bazy
(`42501: permission denied to set parameter`), a nawet gdyby miał, sekret
wklejony w treść zadania leżałby jawnie w `cron.job.command`.

```sql
SELECT vault.create_secret(
  'TA-SAMA-WARTOSC-CO-W-PANELU',
  'billing_cron_secret',
  'Bramka zadania billing-price-guarantee'
);
```

Kontrola — bez pokazywania samej wartości:
```sql
SELECT name, length(decrypted_secret) AS dlugosc
FROM vault.decrypted_secrets WHERE name = 'billing_cron_secret';
```

**Stan po kroku 5:** zadania cykliczne mogą działać. `seed-services-demo`
przestaje być otwartym przyciskiem kasującym giełdę usług.

---

## KROK 6 — deploy funkcji brzegowych

**Dopiero teraz.** Wcześniej bramka G5 odmawiałaby wszystkim.

Bramka subskrypcji (8):
`workshop-send-sms`, `workshop-notify-employee`, `workshop-parts-api`,
`workshop-tire-reminders`, `workshop-invite-employee`,
`workshop-accept-employee-invitation`, `workshop-approve-findings`,
`workshop-employee-submit-findings`

Billing (3): `billing-portal`, `billing-price-guarantee`, `billing-stripe-webhook`

Pozostałe (4): `register-marketplace-user`, `activate-workshop-trial`,
`send-invoice-email`, `seed-services-demo`

**Stan po kroku 6:** bramka działa także tam, gdzie RLS nie sięga.

**Cofnięcie:** redeploy poprzedniej wersji funkcji z `main`.

---

## KROK 7 — kontrola nadpisania przez Lovable

Dla każdej z 15 funkcji: pobierz kod z produkcji i porównaj skrót z gałęzią.
Numer wersji nie wystarcza — Lovable potrafi nadpisać kod, zostawiając wyższy numer.

```bash
supabase functions download <nazwa> --project-ref wclrrytmrscqvsyxyvnn
shasum -a 256 <sciezka-pobrana>/index.ts
shasum -a 256 supabase/functions/<nazwa>/index.ts
```
Skróty muszą się zgadzać. Jeśli nie — funkcja została nadpisana, deploy powtórzyć.

---

## KROK 8 — test dymny w aplikacji

1. **Warsztat aktywny** — załóż zlecenie. Ma się udać.
2. **Warsztat zablokowany** (przestaw status na `read_only`):
   ```sql
   UPDATE billing_subscriptions SET status='read_only'
   WHERE subscriber_id='…'::uuid AND product_line='warsztat';
   ```
   - Kafelki: karta „Wybierz plan", ale kafelki **klikalne**
   - Terminarz: **działa w pełni**
   - Zlecenia: lista pod nakładką, Rezerwacje **nad** nią i używalne
   - Nakładka → „Przeglądaj i eksportuj swoje dane" → eksport z Raportów działa
   - Próba założenia zlecenia → odmowa z bazy
   - ⚠️ **Edycja istniejącego zlecenia po odsłonięciu nakładki**: baza nie zmieni
     ani jednego wiersza (sprawdzone na lokalnym Postgresie), ale polityka
     RESTRICTIVE przy `UPDATE`/`DELETE` **filtruje wiersze zamiast rzucać
     wyjątek** — więc formularz nie pokaże błędu. Zapisz zmianę, odśwież stronę
     i sprawdź, że jej nie ma. Naprawa po stronie interfejsu jest osobnym
     zadaniem (patrz niżej).
   - „Przenieś do zleceń" w Rezerwacjach → komunikat po polsku, nie błąd bazy
   - Potwierdzenie rezerwacji → **udaje się**
3. **Widoczność publiczna** — w oknie incognito warsztat zniknął z `/uslugi`,
   a pozostali usługodawcy są widoczni.
4. **Powrót** — przestaw status na `active`; dostęp wraca w ≤30 s (odświeżenie
   przy powrocie do karty), a warsztat wraca na `/uslugi` **do stanu sprzed**
   blokady (kolumny `status` nie ruszaliśmy).
5. **Portal płatności** — Konto → „Twój plan" → „Zarządzaj płatnościami".

---

## Gdzie jesteś, jeśli przerwiesz

| Przerwane po | Co działa | Co nie działa |
|---|---|---|
| 0 | wszystko jak dotąd | gating nie istnieje |
| 1 | bramka zapisu w bazie, widoczność publiczna | funkcje brzegowe nadal bez bramki |
| 2 | + admin bez cichego zapisu | — |
| 3 | + karencja się kończy | — |
| 4 | + zadanie gwarancji zaplanowane | zadanie odmawia (brak sekretu) |
| 5 | + zadania mogą działać | funkcje brzegowe wciąż bez bramki |
| 6 | pełny gating | — |
| 7 | potwierdzone, że nic nie nadpisane | — |


---

## Znany brak do domknięcia po wdrożeniu

**Cicha „udana" edycja po odsłonięciu nakładki.** Polityki RESTRICTIVE chronią
dane w pełni — zapis nie przechodzi. Ale przy `UPDATE` i `DELETE` Postgres
*filtruje wiersze*, zamiast zgłaszać błąd, więc `supabase.update()` wraca bez
błędu i z zerem zmienionych wierszy. Formularz, który nie sprawdza liczby
zmienionych wierszy, pokaże „zapisano".

Dotyczy wyłącznie ścieżki po świadomym kliknięciu „Przeglądaj i eksportuj swoje
dane" — przy nietkniętej nakładce formularze są niedostępne (`inert`).

Dane są bezpieczne w obu wariantach; problemem jest mylący komunikat.
Naprawa: przy zapisach dopisać `.select()` i potraktować pustą odpowiedź jak
odmowę, z komunikatem „Zapis wymaga aktywnego planu". Do zrobienia po
uruchomieniu sprzedaży — nie blokuje wdrożenia.
