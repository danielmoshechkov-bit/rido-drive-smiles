# Funkcje brzegowe bez `verify_jwt` — inwentarz

Stan na 16.08.2026. **Diagnoza, nic nienaprawione** poza tym, co wymieniono
jako zamknięte.

`config.toml` ma **132 wpisy** z `verify_jwt = false`. Osiemnaście to funkcje
agenta głosowego (poza zakresem tego wątku) → **114 w zakresie**. Dwa wpisy
(`ai-chat-support`, `ai-admin-assistant`) wskazują na katalogi, których nie ma.

Dla porządku: `seed-services-demo` był piątą luką tej klasy i został zamknięty
sekretem `SEED_DEMO_SECRET`. Poniżej reszta.

---

## Zweryfikowane osobiście (czytałem pliki, nie tylko raport)

| Funkcja | Co robi | Autoryzacja | Werdykt |
|---|---|---|---|
| `reset-driver-password` | Resetuje hasło dowolnego konta, **usuwa konta** (`auth.admin.deleteUser`), nadaje rolę `driver` | **BRAK** — w 206 liniach nie ma słowa `Authorization` | 🔴 LUKA |
| `create-fleet-account` | Zakłada konto i wpisuje **role wprost z ciała żądania** do `user_roles` | **BRAK** | 🔴 LUKA — `{"roles":["admin"]}` tworzy administratora |
| `getrido-ai-execute` | 22 linie: przekazuje całe ciało żądania do `ai-chat` **z kluczem service_role jako bearer** | **BRAK** | 🔴 LUKA — klasyczny „zdezorientowany zastępca" |
| `drivers-search` | Wyszukiwarka kierowców po e-mailu, telefonie, identyfikatorach platform, kluczem serwisowym | **BRAK** | 🔴 LUKA — wyciek danych osobowych |

`create-fleet-account` jest równie groźny co `admin-bootstrap`, który był
pierwszym znaleziskiem tej klasy: obie tworzą konto administratora bez sesji,
tylko jedna robi to jawnie tokenem z repo, a druga polem w JSON-ie.

---

## Zgłoszone przez przegląd, niezweryfikowane linia po linii

Poniższe wynikają z przeglądu, którego **nie potwierdzałem osobiście**.
Traktować jako listę do sprawdzenia, nie jako ustalenia.

### Bez żadnej autoryzacji, z zapisem lub kosztem

**Konta i role:** `cleanup-fake-auth-accounts` (kasuje konta `@rido.internal`),
`create-driver-accounts`, `create-test-accounts` (konta ze znanym hasłem i rolą
`service_provider`).

**Finanse floty:** `settlements` (1999 linii, silnik rozliczeń), `csv-import`,
`update-driver-debt`, `rebuild-drivers`, `sync-driver-ids`, `sanitize-getrido`,
`import-drivers`, `fuel-import`, `rental-payment-reminders`, `rental-dispatcher`.

**Poczta jako otwarta przekaźnia:** `send-rental-invitation`,
`send-rental-confirmation`, `send-registration-email`,
`send-fleet-registration-email`, `send-price-change-email`, `send-driver-invoice`,
`send-invoice-email`. Wspólny wzorzec: **adresat i treść (w tym link
aktywacyjny) pochodzą z ciała żądania** — czyli wysyłka dowolnej wiadomości
z naszej domeny i z naszym brandingiem.

**SMS-y:** `send-sms` — bramka salda działa tylko przy nagłówku z kontem
użytkownika; bez niego wysyła bez ograniczeń.

**Koszt AI** (każde wywołanie płatne): `ai-chat`, `ai-service`, `ai-assistant`,
`ai-invoice-assistant`, `ai-seo-generator`, `ai-listing-assessment`,
`ai-generate-call-scripts`, `seo-agent`, `generate-document-ai`,
`parse-general-listing`, `generate-provider-description`, `translate-content`,
`workshop-translate`, `workshop-translate-batch`, `auto-translate-ui`,
`auto-translate-listing`, `auto-translate-daily`, `translation-queue-worker`,
`translation-queue-add`, `google-location-data`.

**Pozostałe:** `admin-ai-agent` (narzędzia na kluczu serwisowym: przełączniki
funkcji, zrzuty użytkowników i flot), `ai-call-webhook-meta` (token weryfikacyjny
to literał `"META_VERIFY_TOKEN"` z komentarzem `TODO: proper check`),
`ai-call-webhook-telegram`, `ai-call-worker`, `reminders`, `fleet-alerts`,
`insurance-alerts`.

### Ryzykowne — autoryzacja istnieje, ale opiera się na wartości z ciała żądania

To ten sam wzorzec, który dał nam wszystkie dotychczasowe luki.

| Funkcja | Co jest jedynym poświadczeniem |
|---|---|
| `invoice-pdf` | `invoice_id` — pełna faktura z danymi kontrahenta |
| `workshop-accept-employee-invitation` | `invitation_id` — nadaje dostęp do warsztatu |
| `ksef-integration` | `nip` i `token` z ciała; bez JWT wyprowadza `user_id` z `invoice_id` |
| `support-notify`, `support-ai-reply` | `conversation_id` — wyzwala SMS, e-mail i koszt AI |
| `crm-import-asari` | `integration_id` — decyduje, czyje ogłoszenia zostaną nadpisane |
| `verify-vat` | `driver_id` — decyduje, którego kierowcę zaktualizować |
| `ai-photo-edit` | obecność `featureKey` decyduje, **czy sprawdzenie JWT w ogóle się wykona** |
| `ai-service`, `ai-search` | `userId` — czyj limit zostanie obciążony |

Osobno: `vehicles`, `documents`, `document-templates` tworzą klienta z kluczem
anonimowym, **nie przekazując nagłówka `Authorization`** — działają więc jako
`anon`, a jedynym zabezpieczeniem jest RLS.

`workshop-send-scheduled-sms` i `workshop-tire-reminders` mają sekret crona,
ale **tylko jeśli zmienna środowiskowa jest ustawiona**; komentarz w kodzie mówi
„domyślnie WYŁĄCZONE". To nie jest fail-closed.

### Publiczne z założenia — bez zastrzeżeń

`billing-stripe-webhook` (HMAC na surowych bajtach, fail-closed),
`payment-core-webhook` (podpis P24, porównanie w czasie stałym),
`contact-form` (honeypot + limit), rejestracje (`register-driver`,
`register-fleet`, `register-marketplace-user`), `resend-activation-email`,
`send-password-reset-email`, `driver-bank-change-confirm` (token 64 znaki, 24 h,
jednorazowy), `gus-lookup`, `registry-whitelist`, `ai-search` (limity dla gości),
`ai-service-search`, `sitemap`, `foto-proxy`, `track-listing-interaction`.

### Z własną autoryzacją — w porządku

`admin-list-users`, `admin-create-user`, `admin-users`, `admin-ai-secrets`,
`billing-checkout`, `billing-portal`, `billing-stripe-sync`,
`billing-price-guarantee`, `seed-services-demo`, `fleet-invitations`,
`client-verify-vehicle-ownership`, `activate-workshop-trial`,
`workshop-send-sms`, `workshop-invite-employee`,
`workshop-employee-submit-findings`, `workshop-approve-findings`,
`driver-bank-change-request`, `submit-category-request`, `ai-extract-services`,
`ticket-ai-chat`, `generate-repair-prompt`, `location-integrations`,
`fiscalize-receipt`, `fiscal-printer-test`, `fiscal-day-report`,
`fiscal-receipt-session`, `rental-availability`.

---

## Odwrotny problem: 63 katalogi bez wpisu w `config.toml`

Domyślnie dostają `verify_jwt = true`. Wśród nich są **webhooki przychodzące**,
które z definicji nie wysyłają tokenu Supabase: `external-lead-webhook`,
`meta-leads-webhook`, `meta-leads-receiver`, `invoice-email-webhook`.
Jeśli działają, to znaczy, że konfiguracja produkcyjna różni się od repo —
a jeśli nie działają, to nikt tego nie zauważył. Do sprawdzenia osobno.

---

## Wniosek

Nie jest to piąta luka tej klasy — to **wzorzec obejmujący większość
starszych funkcji floty**. Wspólny mianownik: funkcja powstała jako narzędzie
wewnętrzne, dostała `verify_jwt = false`, żeby dało się ją wywołać z konsoli,
i nikt tego nie cofnął.

Naprawianie pojedynczo będzie trwało w nieskończoność. Sensowniejsza kolejność:

1. **Natychmiast** — cztery zweryfikowane luki wyżej plus `admin-bootstrap`.
   Każda z nich daje przejęcie konta albo dostęp do danych osobowych.
2. **Potem** — otwarta przekaźnia pocztowa (7 funkcji, jeden wzorzec, jedna
   poprawka: adresat z bazy, nie z żądania).
3. **Potem** — funkcje z kosztem AI (20 pozycji, wspólna bramka wystarczy).
4. **Na końcu** — reszta, według tego, co realnie jest wołane z aplikacji.

Punkt 1 to zakres jednej sesji. Punkty 2–3 to po jednej wspólnej poprawce.
