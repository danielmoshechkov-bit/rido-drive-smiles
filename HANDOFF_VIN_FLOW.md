# HANDOFF: VIN-first parts flow dla "Znajdź części z Rido"

Sesja CC przekazała pracę z powodu pełnego kontekstu. Ten plik = pełen stan.
Cel: nowa sesja CC otwiera ten plik, naprawia Strategy V_Cat w workshop-parts-api,
deployuje, testuje, raportuje.

---

## CO LIVE NA PRODUKCJI (Supabase project `wclrrytmrscqvsyxyvnn`)

### Migracje zaaplikowane
- `20260523_fix_driver_self_access_rls.sql` — RLS dla kierowców (z poprzedniej sesji)
- `20260524180000_vin_caches.sql` — tabele `vehicle_vin_cache` (puste, gotowe) + `ic_vin_endpoint_cache` (puste, gotowe)
- `20260524190000_ic_category_tree.sql` — tabela `ic_category_tree` z 4787 wierszami (L1=45, L2=425, L3=2759, L4=1558)

### Edge Function `workshop-parts-api` (live)
Dostępne akcje (oprócz wcześniejszych chunków 1-4 + 1.5):
- `decode_vin` — probuje 23 URL-i IC dla VIN, wszystkie zwracają HTTP 404. Cache w `vehicle_vin_cache`. Zwraca `{success:false, fallbackToOEFlow:true}` dla wszystkich VIN'ów (IC nie ma endpointu).
- `sync_ic_categories` — rekurencyjny BFS, parallel batches po 8. Zaktualizowane do `maxLevel=3`/`batchSize=8` (28s wall time, 490 requests). Już odpalone raz, drzewo w bazie.
- `ic_raw_get` — TYMCZASOWA akcja diagnostyczna (tylko z service-role). Przyjmuje `params.path`, zwraca raw IC response. Usunąć po skończonej iteracji.
- `resolve_query` (rozszerzony) — pre-filtruje 30 candidate categories z `ic_category_tree` (JS scoring po keyword matches w label+full_path), AI Claude Haiku klasyfikuje query do dokładnie jednej `categoryId` + zwraca `expectedManufacturers[5-10]` + `oeNumbers[]` + `searchTermsMultiLang{pl,en,de}`. Max tokens podniesione z 400 → 1500 (poprzednio truncated JSON).
- `find_in_other_wholesalers` (z chunka B) — bez zmian.

### Backend logika
- `buildSearchTerms(resolved, query, vehicle?)` — gdy `vehicle` podane, dodaje `brand+model+year` jako sufiks do każdego terminu (per język). Max 6 terms (3 lang × 2 wariants).
- `getCandidateCategoriesForAI(supabase, query)` — pobiera leaf categories z `ic_category_tree`, JS scoring po liczbie keyword match (label×10, path×3, level bonus, label length penalty), zwraca top 30.
- `extractCarId(data)` / `extractVehicleInfo(data)` — extraktory z dowolnego shape'u (dla `decode_vin`).
- **Service-role bypass dla testów z terminala** w main `serve()` handler: jeśli `Authorization: Bearer SERVICE_ROLE_KEY` → omija `userClient.auth.getUser()`. `isUserAdmin=true` automatycznie. Pozwala na curl-test bez user JWT.

---

## CO ODKRYTE EMPIRYCZNIE Z IC API (`https://api.webapi.intercars.eu`)

### DZIAŁA ✅
- `POST /oauth2/token` (OAuth2 Basic Auth z clientId/clientSecret)
- `GET /ic/catalog/category` (bez param) → 45 top-level kategorii (`SalesClassificationNode_X`)
- `GET /ic/catalog/category?categoryId={X}` → dzieci X (rekurencyjnie buduje drzewo)
- `GET /ic/catalog/products?categoryId={X}&pageSize=N&pageNumber=M` → produkty w kategorii (z paginacją, `totalResults`, `hasNextPage`)
- `GET /ic/catalog/products?index={OE}` → search po dokładnym OE (Strategy A)
- `POST /ic/inventory/stock` → dostępność per SKU array
- `POST /ic/sales/requisition` → zamówienie

### NIE DZIAŁA ❌ (potwierdzone empirycznie)
- **23 próby VIN endpoint** → wszystkie HTTP 404 z `{"code":"404","description":"No matching resource found"}`. Lista próbowanych w decode_vin code (linia ~635-680). IC tego konta po prostu nie ma endpointu VIN.
- `GET /ic/catalog/products?phrase={X}` BEZ categoryId → HTTP 400 z `{"code":"ICF101","details":"CategoryId, sku or index is required"}`
- `phrase` razem z `categoryId` → ignorowane (zwraca `totalResults: 36772` jak bez filtra)
- `?vehicleBrand=BMW`, `?carBrand=BMW`, `?makeName=BMW`, `?manufacturerId=16`, `?linkageTargetId=137088`, `?tecdocVehicleId=137088`, `?oem=BMW`, `?applicable=BMW`, `?vehicles.brand=BMW`, `?fits=BMW` — wszystkie ZIGNOROWANE (zwracają te same 36772)
- `/ic/swagger.json`, `/ic/api-docs`, `/ic/catalog` (root) → 404
- Filtry `?manufacturer=`, `?manufacturerName=`, `?producerName=`, `?brandName=`, `?brandReference.name=` z categoryId — wszystkie ZIGNOROWANE

### PROBLEM SORTOWANIA — KLUCZOWY
- IC sortuje produkty w kategorii **alfabetycznie po brand**
- Strona 1 (pageSize=100) = wszystkie firmy "4MAX"/"ABE"
- Strona 2-5 = nadal ABE
- Pobranie 500 produktów (5 stron) — wszystko ABE/4MAX, ZERO Brembo/Textar
- Brembo/Textar zaczynają się prawdopodobnie ~strona 30-50
- Pobranie 20+ stron sekwencyjnie = timeout edge function (60s WORKER_RESOURCE_LIMIT)

### NIEZWERYFIKOWANE (Daniel'a hipoteza, do potwierdzenia w nowej sesji)
- `GET /ic/catalog/products?categoryId=X&brand=Brembo&pageSize=10` —
  **Daniel mówi że zwraca 3 produkty Brembo** (z jego wcześniejszej sesji testowej).
  **JA testowałem to i zwrócił ABE/4MAX** (nie Brembo) — czyli wg moich testów `brand=` jest też ignorowany.
  **Niejednoznaczność — nowa sesja MUSI niezależnie zweryfikować** przed implementacją per-mfg loop.

---

## CO ZROBIONE LOKALNIE ALE DZIAŁA ŹLE

### Strategy V_Cat w `workshop-parts-api/index.ts` (~linia 1820)
Aktualny kod (deployed):
- Per `expectedManufacturer` z `resolved.expectedManufacturers` (max 10)
- `GET /ic/catalog/products?categoryId={X}&brand={MFG}&pageSize=10` (Promise.all parallel)
- Merge results, dedupe po SKU, optional vehicle filter

Test wynik (E2E z BMW X5 G05 + klocki):
- AI klasyfikuje `categoryId=GenericArticle_402` ✅
- AI zwraca `expectedManufacturers=[Brembo,Textar,ATE,Bosch,TRW,Ferodo,Pagid,Mintex]` ✅
- Per-mfg loop wywołuje 10 calls równolegle (po jednym per producent)
- **WSZYSTKIE 10 calls zwraca te same produkty** (9× ABE, 1× 4MAX, zero Brembo)
- Czyli IC ignoruje `brand=` parametr — wszystkie 10 calls = same wynik = top 10 alfabetycznie

### Wynik testu (curl z 2026-05-24 ~21:00)
```
TOTAL: 10
BY MANUFACTURER:
  ABE                  9
  4MAX                 1
```
Brak Brembo/Textar/ATE/Bosch/TRW/Ferodo/Pagid/Mintex.

---

## ROZWIĄZANIE DLA NOWEJ SESJI

Daniel proponuje pętlę per producent (która JEST już zaimplementowana — patrz wyżej).
**Możliwe powody dlaczego nie zadziałało:**

1. **`brand=` faktycznie ignorowany przez IC** (moja empiryczna obserwacja).
   Sprawdź:
   ```bash
   PAT=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
   SERVICE_KEY=$(curl -s "https://api.supabase.com/v1/projects/wclrrytmrscqvsyxyvnn/api-keys" \
     -H "Authorization: Bearer $PAT" | \
     python3 -c "import sys, json; print([k for k in json.load(sys.stdin) if k['name']=='service_role'][0]['api_key'])")
   curl -s -X POST "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-parts-api" \
     -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
     -d '{"action":"ic_raw_get","provider_id":"664ed87b-a20f-457b-a9fa-97ca13dcae7c","params":{"path":"/ic/catalog/products?categoryId=GenericArticle_402&brand=Brembo&pageSize=5"}}' | jq
   ```
   Sprawdź `brand` field w pierwszych 5 produktach. Jeśli wszystkie != Brembo → filtr ignorowany.

2. **Inny case-sensitivity / encoding** — spróbuj `brand=BREMBO`, `brand=brembo`, `Brand=Brembo`, `?brand[]=Brembo` (array syntax).

3. **POST zamiast GET** — może IC wymaga POST body z filtrem.

4. **Inny parametr w IC docs** — Daniel'a wcześniejsza informacja może pochodziła z dokumentacji której nie mamy (docs.webapi.intercars.eu jest za partner login). Sprawdź IC publisher portal `https://cp.webapi.intercars.eu/`.

### Jeśli `brand=` faktycznie ignorowany — alternatywy:

**A. Wertical scrape paginacji**
Pobierz wszystkie ~36k produktów per kategoria (370 stron × 100), zapisz w `ic_category_products` table z `brand` indexed, potem filter SQL. Cache 1 dzień. Pierwszy sync per kategoria 5-10 min (musi być async/cron, nie inline).

**B. Pokaż wszystko + frontend filter**
Pobierz top 50 z `?categoryId=X&pageSize=50`, pokaż user'owi w UI z infem "wybierz wariant — system poszuka w innych hurtowniach". UX kompromisowy, ale działa.

**C. TecDoc Pegasus zewnętrzny** (€500-2000/msc)
Bypass IC katalogu. Deterministyczne VIN→tecDocVehicleId→prawdziwe OE.

---

## STAN PLIKÓW (na branchu `responsywnosc-etap-a`)

### Lokalnie zmienione (NIE COMMITNIĘTE od `460fce71`)
- `supabase/functions/workshop-parts-api/index.ts` — deployed na prod, +500 linii vs PRE-VIN backup
- `supabase/migrations/20260524180000_vin_caches.sql` — nowy
- `supabase/migrations/20260524190000_ic_category_tree.sql` — nowy
- `supabase/migrations/20260524*_lovable.sql` — 5 plików pulled z origin/main (renamed do match IC migration history IDs); to ICH praca, nie nasza, nie commituj
- `package-lock.json`, `src/pages/AdminRealEstate.tsx`, `src/pages/EasyHub.tsx`, `src/pages/UniversalSearchResults.tsx`, `supabase/functions/ai-search/index.ts`, `src/components/ui/responsive-table.tsx` — modyfikacje z poprzednich sesji (nie commitować razem z VIN flow)

### Backupy w `_local-rollbacks/` (NIE w gicie)
- `workshop-parts-api-PRE-VIN.ts.bak` — pre-VIN backup (przed decode_vin/sync_ic_categories)
- `workshop-parts-api-PROD-BEFORE.ts` — backup z chunka 4 (najstarszy)
- `RidoPartsSearchModal-PROD-BEFORE.tsx`, `ic-catalog-sync-PROD-BEFORE.ts`, `ai-search-index-*` — backupy z poprzednich iteracji

### Migration history quirk
- Lovable commits 5 migracji 2026-05-24 (`20260524101220` etc) — applied na remote DB
- `supabase migration repair --status applied <ids> --linked` zostało wykonane żeby zsynchronizować local
- Pliki `*_lovable.sql` zostały lokalnie z renamed timestamps żeby CLI je rozpoznał (są zignorowane przez `responsywnosc-etap-a` branch — nie commitujemy)

---

## CO MA ZROBIĆ NOWA SESJA CC

### Krok 1 — Verify hipoteza Daniela o `brand=` filtrze
Wykonaj curl test z `ic_raw_get` (powyżej). Sprawdź czy `?categoryId=X&brand=Brembo` faktycznie zwraca Brembo produkty czy ABE.

### Krok 2A — jeśli `brand=` DZIAŁA (czyli moja obserwacja była błędna):
- Sprawdź obecny kod Strategy V_Cat (~linia 1820 w `workshop-parts-api/index.ts`)
- Jest ON JUŻ zaimplementowany jako per-mfg loop
- Może mieć bug w mapping wyników. Sprawdź mapping IC products (~linia 1915-1925)
- Test E2E ponownie z BMW X5 klocki, sprawdź czy są Brembo
- Jeśli sukces → raport, idziemy do chunku frontend (UI wyboru wariantu)

### Krok 2B — jeśli `brand=` IGNOROWANY (moja obserwacja potwierdzona):
- Spróbuj alternatywne case/encoding/POST body
- Jeśli nic — wybierz alternativę A/B/C z sekcji "Jeśli `brand=` faktycznie ignorowany"
- Najpragmatyczniej: **Opcja B (pokaż top 50 + frontend wybór)** — szybko działa, daje user'owi kontrolę

### Krok 3 — finalny test + raport
Po implementacji wybranego wariantu:
- curl test z BMW X5 G05 klocki przez service-role bypass
- Sprawdź czy zwraca > 0 wyników z prawdziwymi producentami
- Sprawdź czy frontend (`RidoPartsSearchModal.tsx`) pokazuje je poprawnie
- Raport końcowy

### Krok 4 — cleanup
- Usuń `ic_raw_get` action (tymczasowa, security risk)
- Zachowaj service-role bypass (przydatne dla diagnostyki)
- Backup `_local-rollbacks/workshop-parts-api-AFTER-VIN.ts.bak` przed commit
- Commit + push jeśli Daniel zatwierdzi

---

## DANE TESTOWE

### Auth
- **PAT (Personal Access Token)**: `security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d`
- **Service role key**: pobierz przez Management API:
  ```bash
  PAT=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
  SERVICE_KEY=$(curl -s "https://api.supabase.com/v1/projects/wclrrytmrscqvsyxyvnn/api-keys" \
    -H "Authorization: Bearer $PAT" | \
    python3 -c "import sys, json; print([k for k in json.load(sys.stdin) if k['name']=='service_role'][0]['api_key'])")
  ```

### Project / Provider
- **Supabase project ref**: `wclrrytmrscqvsyxyvnn`
- **Provider ID (test workshop)**: `664ed87b-a20f-457b-a9fa-97ca13dcae7c` (Cart78Garage sp. z o.o., user `warsztat@test.pl`)
- **IC integration**: aktywne, customerNumber `9AE06V`

### Test VIN / pojazd
- **VIN**: `WBA41EU0X09S67757`
- **Vehicle**: BMW X5 G05 xDrive50e (2023, hybryda plug-in, 2998cm3)
- **Test query**: `"klocki hamulcowe przednie"`
- **Expected categoryId**: `GenericArticle_402` (Układ hamulcowy > Hamulce tarczowe > Klocki hamulcowe > Klocki hamulcowe kpl.)

### Przykładowy E2E test
```bash
PAT=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
SERVICE_KEY=$(curl -s "https://api.supabase.com/v1/projects/wclrrytmrscqvsyxyvnn/api-keys" \
  -H "Authorization: Bearer $PAT" | \
  python3 -c "import sys, json; print([k for k in json.load(sys.stdin) if k['name']=='service_role'][0]['api_key'])")

# Full E2E: resolve_query potem search
curl -s -X POST "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-parts-api" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{
    "action": "resolve_query",
    "provider_id": "664ed87b-a20f-457b-a9fa-97ca13dcae7c",
    "params": {
      "query": "klocki hamulcowe przednie",
      "vin": "WBA41EU0X09S67757",
      "vehicle": {"brand":"BMW","model":"X5 G05 xDrive50e","year":2023}
    }
  }' | jq

# Potem search z preResolvedQuery (skopiuj z resolve_query response)
curl -s -X POST "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-parts-api" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{
    "action": "search",
    "provider_id": "664ed87b-a20f-457b-a9fa-97ca13dcae7c",
    "supplier_code": "inter_cars",
    "params": {
      "query": "klocki hamulcowe przednie",
      "vehicle": {"brand":"BMW","model":"X5 G05 xDrive50e","year":2023},
      "preResolvedQuery": { /* skopiuj z resolve_query output */ }
    }
  }' | jq
```

### Diagnostyczny raw IC call
```bash
curl -s -X POST "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-parts-api" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{
    "action": "ic_raw_get",
    "provider_id": "664ed87b-a20f-457b-a9fa-97ca13dcae7c",
    "params": {"path": "/ic/catalog/products?categoryId=GenericArticle_402&brand=Brembo&pageSize=5"}
  }' | jq
```

### Management API SQL query (bypass migration history)
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/wclrrytmrscqvsyxyvnn/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query": "SELECT level, COUNT(*) FROM public.ic_category_tree GROUP BY level"}' | jq
```

---

## REFERENCJE I WAŻNE LINIE KODU

### `workshop-parts-api/index.ts` (~2700 linii)
- L1-200: imports, consts, helpers (`extractCarId`, `extractVehicleInfo`, `isAdminUser`)
- L200-300: `ResolvedQuery` interface, `getCandidateCategoriesForAI`, `buildSearchTerms` (z vehicle context)
- L300-500: `resolvePartsQuery` z rozszerzonym promptem (categoryId + expectedManufacturers + searchTermsMultiLang)
- L500-700: main `serve()` z action routing — `decode_vin`, `sync_ic_categories`, `ic_raw_get`, `find_in_other_wholesalers`, `resolve_query`, `check_config`
- L900-1100: `handleAutoPartner`
- L1100-1500: `handleHart`
- L1700-2100: `handleInterCars` — **Strategy V_Cat ~linia 1820** (to ten kod do zmiany)

### Migracje (zaaplikowane, ale niezacommitowane)
- `supabase/migrations/20260524180000_vin_caches.sql`
- `supabase/migrations/20260524190000_ic_category_tree.sql`

### Git
- Branch: `responsywnosc-etap-a` (ahead of origin: 0 commits — wszystko wcześniej pushnięte)
- Lokalne zmiany: NIE COMMITNIĘTE od `460fce71 feat(workshop): Znajdź części z Rido - FAZA 1 + FAZA 1.5`
- `main` na origin ma 15+ commits Lovable (telegram bot UI, RPC fixes) — Daniel mówił nie ruszać

---

## KONTRAKT KOŃCOWY DLA NOWEJ SESJI

Wpisać w pierwszej wiadomości do CC:
> "Wczytaj HANDOFF_VIN_FLOW.md. Stan obecny: per-mfg Strategy V_Cat dla IC nie zadziałał (wszystko ABE). Najpierw zweryfikuj empirycznie czy `?brand=` w IC API filtruje (Daniel mówi tak, ja widzę że nie). Następnie wybierz ścieżkę A/B/C z sekcji 'Jeśli brand= faktycznie ignorowany'. Pracuj na branchu `responsywnosc-etap-a`. NIE COMMITUJ bez zgody."
