# Licznik minut — projekt. NIE ZBUDOWANY.

Trzeci licznik tej samej klasy co SMS-y i sprawdzenia pojazdu.

## Co już istnieje i czego NIE budujemy od nowa

```
credit_packages                 credit_type, name, credits_amount, price, is_active
service_providers.sms_balance   saldo per warsztat
payment-core                    zakup, naliczenie po opłaceniu (case "sms_credits")
TopBarCredits.tsx               wyświetlanie licznika w panelu
QuotaGuardProvider.tsx          blokada przy zerze
```

**Minuty to wiersz w `credit_packages` z `credit_type = 'voice_minutes'`, kolumna
`service_providers.voice_minutes_balance` i gałąź w `payment-core`.** Nic więcej.

⚠️ **Jest tam dług, którego NIE powielamy.** `payment-core:619` opisuje go wprost:
przy `sms_credits` środki lądują w jednym miejscu, a aplikacja czyta saldo
z `service_providers.sms_balance` — czyli z innego. Minuty mają mieć **jedno**
źródło od początku.

---

## 1. Gdzie naliczać — w `voice-call-postprocess`

Nie w `voice-call-commit`. Trzy powody:

```
commit  odpala się TYLKO gdy powstaje zlecenie — rozmowa bez rezerwacji
        byłaby darmowa, a kosztowała nas tyle samo
commit  nie zna długości rozmowy; postprocess dostaje ją z webhooka
postprocess  odpala się RAZ na rozmowę, po jej zakończeniu — czyli dokładnie
             wtedy, gdy znamy pełny czas
```

**Idempotencja przez `voice_calls.minutes_charged_at`**, nie przez osobną tabelę:
wiersz już istnieje i ma klucz `(provider_id, elevenlabs_conversation_id)`.
Naliczenie tylko gdy `minutes_charged_at IS NULL`, w tej samej transakcji
co zapis znacznika.

## 2. Zaokrąglanie — pełne minuty w górę

Zgadzam się z Twoją intuicją i mam na to liczbę: **ElevenLabs sam nalicza
ryczałtem** — 440 kredytów na minutę, kwartyle 439–443, a przy rozmowach
pięciosekundowych stawka skacze do 504. **Sekundowe rozliczanie po naszej
stronie znaczyłoby, że przy krótkich rozmowach dopłacamy.**

```
rozmowa 30 s    naliczamy 1 min    koszt nasz ~0,16 PLN    przychód 1,00
rozmowa 98 s    naliczamy 2 min    koszt ~0,52             przychód 2,00
rozmowa 185 s   naliczamy 4 min    koszt ~0,98             przychód 4,00
```

Dla warsztatu to jest zrozumiałe bez tłumaczenia — tak działa każda taryfa
telefoniczna, którą zna.

## 3. Przy zerze minut — trzy progi zamiast dwóch

Twoja propozycja (ostrzeżenie 20%, blokada 0) ma dziurę: **warsztat, któremu
minuty skończą się w środku dnia, przestaje odbierać telefony i dowiaduje się
o tym od klientów.**

```
20% pozostało    ostrzeżenie w panelu + e-mail
 0 minut         agent ODBIERA, ale mówi zdanie o oddzwonieniu i kończy;
                 zlecenie powstaje ze statusem „Oddzwonić"
 -30 minut       agent nie odbiera
```

Środkowy próg jest ważniejszy niż wygląda: **rozmowa, w której agent mówi
„oddzwonimy w ciągu godziny", jest warta więcej niż sygnał zajętości** —
i kosztuje nas 15 sekund, czyli jedną minutę z debetu.

**Debet 30 minut to nasz koszt około 10 PLN na warsztat.** Tanio jak na to,
że alternatywą jest klient, który dzwoni do konkurencji.

## 4. Pakiety — wzorowane na SMS-ach, z tym samym rabatem za wolumen

Istniejące pakiety SMS mają zniżkę od 0,38 do 0,258 PLN za sztukę (32%):

```
Pakiet SMS  50    19 PLN    0,380 / szt
Pakiet SMS 200    59 PLN    0,295 / szt
Pakiet SMS 500   129 PLN    0,258 / szt
```

Ta sama krzywa dla minut, przy koszcie 0,318 PLN/min:

```
                       cena     za minutę    nasz koszt    marża
Pakiet 100 minut      119 PLN     1,19          31,80      73%
Pakiet 300 minut      299 PLN     1,00          95,40      68%
Pakiet 1000 minut     849 PLN     0,85         318,00      63%
```

Cena bazowa 1,00 PLN/min wypada w środku, tak jak przy SMS-ach — **najmniejszy
pakiet jest droższy od stawki, największy tańszy.** To zachęca do większych
pakietów, a nie karze za małe.

## 5. Alerty — 80% i 100%, tym samym kanałem co SMS-y

Plus jeden, którego nie ma przy SMS-ach: **alert po pierwszej rozmowie z debetu.**
Warsztat musi wiedzieć, że agent już rozmawia na kredyt, zanim zobaczy fakturę.

---

## 🔴 CZEGO NIE UMIEM POLICZYĆ — i to blokuje pełny rachunek

Prosiłeś o pełny koszt minuty. **Mam tylko dwa z pięciu składników:**

```
głos (ElevenLabs)      0,318 PLN/min    ZMIERZONE, 76 rozmów
model językowy         0,045 PLN/min    ZMIERZONE, z liczników tokenów
─────────────────────────────────────────────────────────────
telefonia SuperVoIP         ?           NIE MAM — nie znam stawki za minutę przychodzącą
SMS potwierdzający          ?           znam CENĘ SPRZEDAŻY (0,26–0,38), nie NASZ koszt
Supabase                    ?           nie rozdzielone per rozmowa
```

**Nie zgaduję ich.** Przy marży, na której ma stanąć cennik, różnica między
0,05 a 0,25 PLN za telefonię zmienia wynik o 20 punktów procentowych.

**Trzy rzeczy do sprawdzenia po Twojej stronie:**

1. **SuperVoIP** — ile kosztuje minuta przychodząca na numer stacjonarny.
   Masz do nich dostęp, ja nie.
2. **Bramka SMS** — nasz koszt jednego SMS-a, nie cena w pakiecie.
   Średnio jeden SMS na rozmowę z rezerwacją.
3. **Supabase** — miesięczny rachunek podzielony przez liczbę rozmów.
   Przy dzisiejszym ruchu to grosze, ale przy 22 tysiącach rozmów już nie.

Gdy podasz te trzy liczby, policzę marżę produktu w pięć minut.

## Dwa scenariusze cennika — WSTĘPNIE, na dwóch znanych składnikach

Przy koszcie **0,363 PLN/min** (głos + model, bez trzech pozostałych):

**a) Abonament 249 zł z limitem**

```
249 zł + 150 minut w cenie, potem 1 zł/min
  koszt 150 minut        54 PLN
  marża na abonamencie  195 PLN = 78%
  próg opłacalności      warsztat płaci więcej dopiero powyżej 150 min
```

**b) Niższy abonament + wszystko per minuta**

```
99 zł + 1 zł/min od pierwszej minuty
  warsztat 50 min/mies    149 PLN   (wobec 249 w wariancie a — TANIEJ)
  warsztat 150 min        249 PLN   (tyle samo)
  warsztat 300 min        399 PLN   (wobec 399 w a — tyle samo)
  warsztat 500 min        599 PLN   (wobec 599 w a — tyle samo)
```

**Próg zrównania: 150 minut miesięcznie**, czyli około 90 rozmów.
Poniżej — wariant (b) jest tańszy dla warsztatu. Powyżej — identyczne.

**Rekomendacja: wariant (b).** Wariant (a) każe małemu warsztatowi płacić
za minuty, których nie użyje, a to jest dokładnie ten warsztat, który najłatwiej
stracić w pierwszym miesiącu. Wariant (b) ma niższy próg wejścia i **identyczny
przychód przy każdym większym kliencie.**

⚠️ Obie liczby wymagają domknięcia trzema brakującymi składnikami.
