# Czy ktoś skorzystał z czterech luk — zapytania diagnostyczne

Wszystkie **tylko do odczytu**. Przy każdym napisane, co udowadnia i czego
**nie** udowadnia.

Uwaga ogólna: `auth.audit_log_entries` to dziennik Supabase i podlega retencji.
Jeśli luka była wykorzystana dawno, wpisu może już nie być. Brak wyniku nie jest
dowodem, że nic się nie stało — jest brakiem dowodu, że się stało.

---

## 1. `create-fleet-account` — konta i role z ciała żądania

Odcisk palca jest mocny: to **jedyna** ścieżka wpisująca do `user_roles` rolę
przyjętą wprost z żądania **razem z `fleet_id`**. Legalne konto flotowe dostaje
`fleet_settlement` albo `fleet_rental`. Cokolwiek innego z niepustym `fleet_id`
oznacza wywołanie z podstawioną rolą.

```sql
-- 🔴 NAJWAŻNIEJSZE: rola platformowa nadana razem z fleet_id.
SELECT ur.user_id, u.email, ur.role, ur.fleet_id, ur.created_at, ur.created_by
FROM user_roles ur
LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE ur.fleet_id IS NOT NULL
  AND ur.role NOT IN ('fleet_settlement', 'fleet_rental', 'driver')
ORDER BY ur.created_at DESC;
```
**Pusty wynik = nikt nie nadał sobie tędy roli platformowej.**

```sql
-- Wszystkie konta założone tą funkcją: rola z fleet_id, bez autora.
-- (created_by wypełnia dziś tylko FleetRoleDelegationModal, więc NULL sam
-- w sobie nie jest dowodem — ale w połączeniu z fleet_id zawęża pole.)
SELECT u.id, u.email, u.created_at, u.email_confirmed_at,
       array_agg(ur.role::text ORDER BY ur.role) AS role,
       count(*) FILTER (WHERE ur.created_by IS NULL) AS role_bez_autora
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id AND ur.fleet_id IS NOT NULL
GROUP BY u.id, u.email, u.created_at, u.email_confirmed_at
ORDER BY u.created_at DESC;
```
Konta zakładane tą funkcją mają `email_confirmed_at` **równe** `created_at`
(funkcja ustawia `email_confirm: true`) — konto potwierdzone bez kliknięcia
w link. Sam w sobie to nie dowód, bo inne funkcje robią tak samo, ale w parze
z resztą jest sygnałem.

---

## 2. Wszystkie konta z rolą `admin` i data nadania

Pytałeś o to wprost.

```sql
SELECT ur.user_id, u.email, u.created_at AS konto_utworzone,
       ur.created_at AS rola_nadana, ur.created_by, ur.fleet_id,
       u.last_sign_in_at
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin'
ORDER BY ur.created_at DESC;
```

Na co patrzeć:
- **`fleet_id` niepusty przy roli `admin`** — to wprost `create-fleet-account`.
- **`rola_nadana` znacznie późniejsza niż `konto_utworzone`** — ktoś dołożył
  rolę do istniejącego konta.
- **`last_sign_in_at` puste** przy roli admin — konto nadane i nigdy nieużyte.
  Albo pomyłka, albo przygotowane na później.
- Adresy, których nie rozpoznajesz.

---

## 3. `reset-driver-password` — resety haseł i kasowanie kont

Ta funkcja nie zostawia śladu we własnych tabelach. Jedynym źródłem jest
dziennik uwierzytelniania Supabase.

```sql
-- Kasowanie kont, resety haseł i zakładanie kont — z dziennika auth.
SELECT created_at,
       payload ->> 'action'         AS akcja,
       payload ->> 'actor_username' AS kto,
       payload ->> 'actor_id'       AS actor_id,
       payload -> 'traits'          AS szczegoly,
       ip_address
FROM auth.audit_log_entries
WHERE payload ->> 'action' IN (
        'user_deleted', 'user_updated_password', 'user_signedup',
        'user_modified', 'user_recovery_requested')
ORDER BY created_at DESC
LIMIT 200;
```

**Jak odróżnić wywołanie tą funkcją od normalnej pracy panelu:** operacje
kluczem `service_role` mają w `actor_id` wartość systemową albo pustą, a nie
identyfikator zalogowanego administratora. Przed dzisiejszą poprawką **każde**
wywołanie tej funkcji wyglądało tak samo, niezależnie od tego, kto ją wywołał —
bo nie wiedziała, kto ją wywołuje. Od dziś w logu funkcji jest adres e-mail
wywołującego.

```sql
-- Ile kont zniknęło: kierowcy z powiązaniem do konta, którego już nie ma.
-- (FK ma kaskadę, więc to raczej pokaże pustkę — ale warto sprawdzić.)
SELECT d.id, d.first_name, d.last_name, d.phone, d.created_at
FROM drivers d
WHERE NOT EXISTS (SELECT 1 FROM driver_app_users dau WHERE dau.driver_id = d.id)
  AND d.created_at < now() - interval '7 days'
ORDER BY d.created_at DESC
LIMIT 50;
```
To jest **słaby** sygnał: kierowca bez konta w aplikacji to także zupełnie
normalny stan. Traktować jako tło, nie jako dowód.

```sql
-- Konta techniczne @rido.internal — dotyczy naprawionego przy okazji błędu
-- (kasowanie PIERWSZEGO takiego konta w całej bazie, niezależnie od kierowcy).
SELECT u.id, u.email, u.created_at,
       (SELECT count(*) FROM driver_app_users dau WHERE dau.user_id = u.id) AS powiazan
FROM auth.users u
WHERE u.email LIKE '%@rido.internal'
ORDER BY u.created_at;
```
Jeśli takich kont było kiedykolwiek więcej niż jedno naraz, ten błąd mógł
skasować niewłaściwe.

---

## 4. `getrido-ai-execute` — koszt AI bez autora

Funkcja nie przekazywała żadnej tożsamości, więc zapytania szły do dziennika
z pustym `actor_user_id`.

```sql
SELECT date_trunc('day', created_at) AS dzien,
       feature, provider, model,
       count(*) AS zapytan,
       sum(COALESCE(cost_estimate, 0)) AS koszt_szac,
       sum(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) AS tokenow
FROM ai_requests_log
WHERE actor_user_id IS NULL
GROUP BY 1, 2, 3, 4
ORDER BY dzien DESC, zapytan DESC
LIMIT 100;
```
**Ograniczenie:** puste `actor_user_id` mają też legalne ścieżki anonimowe
(wyszukiwarka AI dla gości). To zapytanie **ogranicza od góry** koszt, którego
nie da się przypisać — nie wskazuje nadużycia wprost. Nagły skok w jednym dniu
albo `feature` niepasujący do ruchu publicznego jest sygnałem.

---

## 5. `drivers-search` — bez śladu

Funkcja tylko **czyta**. Nie zapisuje niczego, więc **w bazie nie ma po niej
żadnego śladu**. Jedynym źródłem są logi funkcji brzegowych w panelu Supabase
(Edge Functions → Logs → `drivers-search`), z ich retencją.

Mówię to wprost, bo brak wyniku łatwo pomylić z dowodem niewinności:
**nie da się z bazy ustalić, czy ktoś odpytał tę funkcję o dane kierowców.**

Jedna rzecz przemawia na korzyść: **nie ma ani jednego wywołania w kodzie
aplikacji**, więc jakikolwiek ruch w logach tej funkcji jest z definicji
podejrzany. Jeśli logi pokazują zero wywołań — sprawa czysta.

---

## Podsumowanie: co udowadnia dowód, a co nie

| Luka | Ślad w bazie | Rozstrzygalne? |
|---|---|---|
| `create-fleet-account` | mocny (`user_roles.fleet_id` + rola) | **tak** |
| role `admin` | mocny (daty nadania) | **tak** |
| `reset-driver-password` | tylko `auth.audit_log_entries`, z retencją | częściowo |
| `getrido-ai-execute` | pośredni (koszt bez autora) | ograniczenie od góry |
| `drivers-search` | **żaden** | tylko z logów funkcji |
