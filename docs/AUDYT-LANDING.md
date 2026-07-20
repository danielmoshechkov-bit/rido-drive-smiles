# AUDYT stron publicznych (landing, bez logowania)

Data: 2026-07-20 · Kontekst: rebranding na Getrido Sp. z o.o. + Meta App Review (recenzent wchodzi bez konta).
Metoda: analiza statyczna routera (`src/App.tsx`), stron i komponentów. Kod nie był zmieniany.

---

## Mapa tras publicznych (z routera `src/App.tsx:183-287`)

**Landing / marketing (przedmiot audytu):**

| Trasa | Komponent | Uwagi |
|---|---|---|
| `/`, `/easy` | `EasyHub` | strona główna — hub kafelkowy |
| `/cennik` | `CennikPage` | |
| `/jak-zaczac` | `JakZaczacPage` | |
| `/kontakt` | `KontaktPage` → `Kontakt` | |
| `/prawne` | `LegalPage` | 4 zakładki: polityka / rodo / regulamin / cookies |
| `/regulamin`, `/polityka-prywatnosci`, `/rodo`, `/cookies` | redirecty do `/prawne?tab=…` | działają |
| `/warsztat-info` | `WorkshopLanding` | landing SaaS warsztatowego |
| `/ksiegowosc-info` | `InvoicingLanding` | landing księgowości |
| `/kierowca-info` | `DriverInfoLanding` | landing portalu kierowcy |
| `/fleet` | `FleetLanding` | landing flotowy |
| `/install` | `Install` | instrukcja instalacji PWA |

**Pozostałe trasy publiczne bez linku w menu landingowym** (dostępne bez logowania, nie audytowane szczegółowo): `/gielda` (+ `/gielda/ogloszenie/:id`, `/gielda/porownaj`, `/gielda/logowanie`, `/gielda/rejestracja`), `/marketplace` (+ podstrony listing/cart/wishlist/compare/seller), `/nieruchomosci` (+ kategorie/ogłoszenie/porownaj/agent-rejestracja), `/uslugi` (+ `/uslugi/uslugodawca/:id`), `/wyniki`, `/auth`, `/reset-password`, `/fleet/rejestracja`, `/driver/register`, `/register-success`, `/email-confirmed`, `/aktywacja` (+ warianty), `/rido-ai`, `/mapy`, `/dodaj`, `/dodaj-ogloszenie`, `/payment/success`, `/payment/cancel`, `/umowa/:rentalId`, `/warsztat/klient/:code`, `/r/:token`, `/potwierdz-termin/:token`, `/sprzedaz`, `/handlowiec`, `*` → `NotFound`.

**Uwaga:** `/oferta` (`OfertaPage.tsx:11-39`) NIE jest publiczna — wymaga sesji + roli admin, bez sesji przekierowuje na `/auth`. Renderuje starą stronę `Index` (z `CallButton`/`ChatWidget`). Nie stanowi problemu dla recenzenta.

---

## 1. `/kontakt` — status: **DZIAŁA Z BŁĘDAMI (najgorsza strona audytu)**

Renderuje się bez auth (Header + `Kontakt` + Footer, `KontaktPage.tsx`). Wszystkie problemy siedzą w `src/components/Kontakt.tsx`:

| # | Problem | Miejsce |
|---|---|---|
| 1 | **Formularz jest martwy, ale udaje że działa.** `handleSubmit` nie wysyła nic nigdzie — komentarz `// Here would be actual form submission logic` — po czym pokazuje toast „Formularz wysłany! Skontaktujemy się z Tobą w ciągu 24 godzin." i czyści pola. Recenzent Meta / klient wysyła wiadomość w próżnię z fałszywym potwierdzeniem. W `supabase/functions/` NIE ma żadnej edge function dla formularza kontaktowego. | `Kontakt.tsx:20-36` |
| 2 | **Atrapa telefonu jako realny kontakt:** „Telefon +48 600 000 000" w sekcji „Szybki kontakt". | `Kontakt.tsx:141` |
| 3 | **Atrapa WhatsApp:** „WhatsApp +48 600 000 000". | `Kontakt.tsx:151` |
| 4 | **E-mail `biuro@getrido.pl`** — niezgodny z configiem (`LEGAL_ENTITY.email = kontakt@getrido.pl`, `src/config/legal.ts`); nieustalone czy skrzynka `biuro@` istnieje (wszystkie edge functions używają `kontakt@`/`noreply@`). | `Kontakt.tsx:161` |
| 5 | **Martwy przycisk „Rozpocznij chat"** — `<Button>` bez `onClick`, obiecuje „czat na żywo 24/7, konsultant dołączy". Nic nie robi. | `Kontakt.tsx:175-177` |
| 6 | **Placeholder ze starego produktu:** „Chcę zostać kierowcą Get RIDO..." w polu wiadomości — niezgodny z obecnym pozycjonowaniem (SaaS warsztatowy + giełda). Ten sam tekst powielony w 7 plikach locales (`contact.placeholders.message`). | `Kontakt.tsx:116` + `src/i18n/locales/*.json` |
| 7 | **Zero i18n** — komponent nie używa `useTranslation`, mimo że pełny zestaw kluczy `contact.*` ISTNIEJE we wszystkich 7 językach (`pl.json` klucze `contact.title`…`contact.placeholders`). Przełącznik języka w Headerze nie zmienia treści strony. | cały `Kontakt.tsx` |
| 8 | Brak danych spółki (Getrido Sp. z o.o., NIP, adres) na stronie kontaktu — recenzent nie zweryfikuje podmiotu. | — |

**Propozycja naprawy:** podpiąć submit pod edge function (nowa `send-contact-form` wysyłająca na `kontakt@getrido.pl` przez `_shared/smtpSend.ts`, z obsługą błędów — toast sukcesu tylko po 2xx); usunąć/podmienić fałszywy telefon i WhatsApp (albo wpisać realny numer firmowy, albo usunąć kafelki); ujednolicić mail na `LEGAL_ENTITY.email`; przycisk chatu podpiąć pod istniejący `RidoAIChatPanel` (używany na EasyHub) albo usunąć kartę Live Chat; placeholder wiadomości zmienić na neutralny; przejść na klucze `contact.*` z i18n; dodać blok danych spółki z `LEGAL_ENTITY`.

---

## 2. `/cennik` — status: **DZIAŁA** (treść realna, lejek ślepy)

Renderuje się bez auth. Treść merytoryczna jest prawdziwa i aktualna (nie lorem): plany aut 25/45/79 zł (`CennikPage.tsx:60-101`), warsztat 0/99/175/249 zł (`:126-185`), marketplace 0–29 zł (`:204-265`), księgowość 29/59 zł (`:765-801`), AI 29/99 zł (`:302-347`), nieruchomości — promo „za darmo" z cenami docelowymi (`:645-763`).

| # | Problem | Miejsce |
|---|---|---|
| 1 | **Każdy przycisk CTA planu (`goCta`) prowadzi do `/kontakt`** — czyli do martwego formularza z pkt 1. Cały lejek sprzedażowy cennika kończy się w próżni. | `CennikPage.tsx:869` |
| 2 | Deklaracje porównawcze wymieniające konkurencję z konkretnymi liczbami: „taniej niż u konkurencji", „U konkurencji plany dla agencji: 2.000–3.000 zł/msc … Nawet 87% taniej", „U konkurencji programy fakturowe: 49–69 zł/msc". Reklama porównawcza — ryzyko prawne/UOKiK, jeśli liczby nie są udokumentowane. | `CennikPage.tsx:57, 754-761, 820-828` |
| 3 | „Voice Tour 360° (6 języków) — 49 zł" sprzedawany w dodatkach AI, a funkcja **nie istnieje w kodzie** (potwierdzone wcześniejszym reconem giełdy). Sprzedaż nieistniejącej usługi = problem przy review i prawnie. | `CennikPage.tsx:354` |
| 4 | Zero i18n — brak `useTranslation`, całość hardcoded PL. | cały plik |
| 5 | Brak SEO per strona — nie używa `SEOHead`; title/description zostają globalne z `index.html`. | — |

**Propozycja naprawy:** CTA planów kierować do właściwych flow (`/auth`, `/gielda/dodaj-pojazd`, rejestracja warsztatu) zamiast `/kontakt`; usunąć lub oznaczyć „wkrótce" Voice Tour 360°; zweryfikować/złagodzić porównania z konkurencją; docelowo migracja na i18n + `useSEO`.

---

## 3. `/jak-zaczac` — status: **DZIAŁA** (spójna z produktem)

Renderuje się bez auth. Treść opisuje FAKTYCZNY obecny produkt (ogłoszenia, usługi 5%, warsztat ERP, KSeF) — nie jest to szkic z ery „portalu kierowców". Linki ścieżek (`/gielda`, `/nieruchomosci`, `/uslugi`, `/cennik`, `/faktury`, `/auth`) — wszystkie istnieją w routerze, brak 404.

| # | Problem | Miejsce |
|---|---|---|
| 1 | „AI Wycena, Voice Tour 360°" w opisie ścieżki nieruchomości — Voice Tour nie istnieje (jw.). | `JakZaczacPage.tsx:59` |
| 2 | „Auta 50% taniej niż Otomoto, agencje nieruchomości 87% taniej niż Otodom" — nazwy konkurentów wprost + procenty; to samo ryzyko co w cenniku. | `JakZaczacPage.tsx:183` |
| 3 | Zero i18n (brak `useTranslation`), brak `SEOHead`. | cały plik |

---

## 4. `/` i `/easy` (EasyHub, strona główna) — status: **DZIAŁA**

Najlepiej utrzymana strona publiczna: pełne i18n (`t('home.*')`), `SEOHead` z configiem per kategoria (`EasyHub.tsx:428-437`), `LanguageSwitcher` (`:480`), realny czat AI — `RidoAIChatPanel` podpięty i działający (`:938`). Kafelki linkują do istniejących tras. Globalnie pod trasami montowany jest też `GlobalRidoAIButton` (`App.tsx:297`), więc wejście w czat z każdej strony istnieje.

Brak znalezionych atrap danych kontaktowych i danych starej spółki. Problemów blokujących nie stwierdzono.

## 5. `/prawne` (regulamin, polityka, RODO, cookies) — status: **DZIAŁA**

Renderuje się bez auth, dane spółki w 100% z `LEGAL_ENTITY` (Getrido Sp. z o.o., NIP 5223377431, REGON 545163303, KRS 0001251247 + sąd i kapitał w Regulaminie) — zgodne z configiem po ostatniej zmianie. Redirecty `/regulamin` itd. działają.

| # | Problem | Miejsce |
|---|---|---|
| 1 | **Brak daty „ostatnia aktualizacja"** w którymkolwiek dokumencie — `LEGAL_ENTITY.lastUpdated` istnieje w configu, ale nie jest nigdzie renderowane. Standard prawny (i oczekiwanie Meta przy privacy policy) to widoczna data wersji. | `LegalPage.tsx` (całość) |
| 2 | Zero i18n — dokumenty tylko po polsku (dla PL-podmiotu akceptowalne, ale przełącznik języka w Headerze sugeruje inaczej). | cały plik |
| 3 | Brak SEO per zakładka (privacy policy pod własnym URL-em z tytułem to plus przy Meta review; działa przez redirect `/polityka-prywatnosci`, ale title się nie zmienia). | — |

## 6. Landingi produktowe `/warsztat-info`, `/ksiegowosc-info`, `/kierowca-info`, `/fleet`, `/install` — status: **DZIAŁAJĄ**

Wszystkie renderują się bez wymuszania logowania (`getSession` używany tylko do przełączania CTA „Zaloguj/Panel" — `WorkshopLanding.tsx:78`, `FleetLanding.tsx:52`). Brak atrap kontaktowych (grep `+48`/mail — czysto). `/kierowca-info` opisuje portal kierowcy (Uber/Bolt/FreeNow) — to wciąż realny moduł produktu, nie relikt. `/install` używa i18n.

## 7. `NotFound` (`*`) — status: **DZIAŁA, kosmetyka**

Strona 404 po angielsku („Oops! Page not found"), surowe kolory Tailwind (`bg-gray-100`, `text-blue-500`) poza design systemem (`NotFound.tsx:14-20`). Widoczna dla recenzenta przy literówce w URL.

## 8. SEO / meta tagi — przekrojowo

- `index.html:19-68` — solidny globalny zestaw: title, description, OG (z obrazkiem 1200×630), Twitter, JSON-LD, canonical. ✅
- Mechanizm per strona istnieje (`SEOHead.tsx` + `useSEO`), ale z audytowanych stron używa go tylko EasyHub. `/cennik`, `/jak-zaczac`, `/kontakt`, `/prawne` mają globalny title z index.html — recenzent na polityce prywatności widzi title „Portal Ogłoszeń…".
- SPA bez SSR — meta OG per podstrona i tak nie będą widoczne dla crawlera FB; nie blokuje App Review (recenzent = człowiek), ale warto wiedzieć.

## 9. i18n — przekrojowo

7 locale (`pl, en, ru, ua, kz, de, vi`). Header/Footer/EasyHub/Install przetłumaczone. **`/cennik`, `/jak-zaczac`, `/kontakt`, `/prawne` — 0 użyć `useTranslation`** (hardcoded PL), mimo że dla kontaktu komplet kluczy `contact.*` już istnieje we wszystkich językach. Efekt: przełącznik języka zmienia menu i stopkę, a treść strony zostaje po polsku — wygląda na zepsute.

---

## TABELA ZBIORCZA wg priorytetu

### BLOKUJĄCE (widzi recenzent Meta / klient; kompromitujące)

| # | Problem | Plik:linia |
|---|---|---|
| B1 | Formularz kontaktowy nic nie wysyła, pokazuje fałszywy sukces „skontaktujemy się w 24h" | `src/components/Kontakt.tsx:20-36` |
| B2 | Fałszywy telefon „+48 600 000 000" prezentowany jako realny kontakt | `Kontakt.tsx:141` |
| B3 | Fałszywy WhatsApp „+48 600 000 000" | `Kontakt.tsx:151` |
| B4 | Martwy przycisk „Rozpocznij chat" przy obietnicy „czat 24/7" | `Kontakt.tsx:175-177` |
| B5 | Wszystkie CTA cennika prowadzą do martwego formularza | `CennikPage.tsx:869` |
| B6 | Placeholder „Chcę zostać kierowcą Get RIDO..." — stary produkt, niespójny z pozycjonowaniem | `Kontakt.tsx:116` + locales |
| B7 | Sprzedaż nieistniejącej usługi „Voice Tour 360° — 49 zł" | `CennikPage.tsx:354`, wzmianka `JakZaczacPage.tsx:59` |

### WAŻNE

| # | Problem | Plik:linia |
|---|---|---|
| W1 | Mail `biuro@getrido.pl` niezgodny z `LEGAL_ENTITY.email` (kontakt@), skrzynka niepotwierdzona | `Kontakt.tsx:161` |
| W2 | Brak daty aktualizacji w regulaminie/polityce/cookies (`lastUpdated` w configu nieużywane) | `LegalPage.tsx` |
| W3 | Porównania cenowe z nazwaną konkurencją (Otomoto/Otodom, „87% taniej") bez udokumentowania | `JakZaczacPage.tsx:183`, `CennikPage.tsx:57,754-761,820-828` |
| W4 | Brak i18n na /cennik, /jak-zaczac, /kontakt, /prawne przy widocznym przełączniku języka | całe pliki |
| W5 | Brak danych spółki na stronie kontaktu | `Kontakt.tsx` |
| W6 | Brak `SEOHead` na stronach landingowych (globalny title wszędzie) | `CennikPage/JakZaczacPage/KontaktPage/LegalPage` |

### KOSMETYKA

| # | Problem | Plik:linia |
|---|---|---|
| K1 | 404 po angielsku, poza design systemem | `NotFound.tsx:14-20` |
| K2 | Stopka: „© 2025" (jest 2026) | `Footer.tsx:76` |
| K3 | Nieużywany klucz `contact.placeholders.phone` z realnym numerem +48 519 474 583 w 7 locale | `src/i18n/locales/*.json` |
| K4 | `CallButton`/`ChatWidget` z twardym numerem +48 519 474 583 — montowane tylko na admin-gated `Index` (przez `/oferta`), niepubliczne, ale do decyzji czyj to numer | `CallButton.tsx:6`, `ChatWidget.tsx:11,51` |

---

## Fałszywe / niespójne dane kontaktowe — lista do podmiany lub usunięcia

| Wartość | Gdzie | Status |
|---|---|---|
| `+48 600 000 000` (telefon) | `Kontakt.tsx:141` | ATRAPA wyświetlana jako realny kontakt — usunąć lub podmienić na prawdziwy numer |
| `+48 600 000 000` (WhatsApp) | `Kontakt.tsx:151` | ATRAPA — jw. |
| `biuro@getrido.pl` | `Kontakt.tsx:161` | niepotwierdzona skrzynka; config i edge functions używają `kontakt@getrido.pl` — ujednolicić |
| `+48 519 474 583` | `CallButton.tsx:6`, `ChatWidget.tsx:11,51`, `locales/*.json` (`contact.placeholders.phone`) | realny numer nieznanego pochodzenia (prawdopodobnie stary numer Car4Ride/floty) — potwierdzić właściciela; usunąć z locales (nieużywany klucz) |
| „Chcę zostać kierowcą Get RIDO..." | `Kontakt.tsx:116` + `locales/*.json` (`contact.placeholders.message`) | relikt starego produktu — podmienić w komponencie i 7 plikach locale |
| obietnica „czat na żywo 24/7 / konsultant dołączy" | `Kontakt.tsx:173` | nieprawdziwa przy martwym przycisku — podpiąć RidoAI albo przeformułować |

---

*Raport wyłącznie diagnostyczny — żaden plik źródłowy nie został zmieniony. Czekam na decyzję, co naprawiamy.*
