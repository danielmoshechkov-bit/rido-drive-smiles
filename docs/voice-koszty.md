# Koszt rozmowy — dane z NASZYCH rachunków, nie z cennika

Wszystkie liczby z pola `charging` w metadanych 78 rozmów.

## Stawka jest PŁASKA: 440 kredytów za minutę rozmowy

76 rozmów telefonicznych, wszystkie po polsku. Kredyty na minutę:

```
mediana    441
kwartyle   439 – 443
zakres     390 – 694
```

**Rozrzut w kwartylach to cztery kredyty na 440 — czyli mniej niż jeden procent.**
To nie jest średnia z rozstrzelonych wartości, tylko stawka ryczałtowa.

Skrajne 390 i 504 to rozmowy **pięcio- i sześciosekundowe**, gdzie zaokrąglenie
naliczania widać w procentach. Górne 694 pochodzi wyłącznie z lipcowych rozmów
na `v3_conversational` — patrz niżej.

### Per model — i tu jest odpowiedź na „czy rosyjski kosztuje tyle samo"

```
model                 n    mediana kred/min   zakres
multilingual_v2       9         440           420–442
turbo_v2_5            7         441           390–504
flash_v2_5           45         440           420–475
v3_conversational    15         624           429–694
```

**Trzy modele produkcyjne kosztują identycznie.** Rosyjski w rozmowie
dwujęzycznej `26v8jtt8`: **442 kredyty na minutę** — czyli dokładnie tyle samo
co polski.

`v3_conversational` z 23.07–04.08 wychodzi o 40% drożej. To rozmowy sprzed
przejścia na Flash i nie mam dla tej różnicy wyjaśnienia — możliwe, że to inna
stawka za model wtedy dostępny w Agents. **Nie zgaduję.**

## Koszt w złotówkach

```
stawka        0,00018046 USD za kredyt   (mediana z 78 rozmów)
minuta        440 kredytów = 0,0794 USD = 0,318 PLN      (kurs 4,00)
```

```
rozmowa 1,5 min      660 kredytów      0,48 PLN
rozmowa 2 min        880 kredytów      0,64 PLN
rozmowa 3 min      1 320 kredytów      0,95 PLN
```

## 💰 MODEL „ZŁOTÓWKA ZA MINUTĘ" — marża

```
przychód                     1,000 PLN / min
koszt głosu (ElevenLabs)     0,318 PLN / min
koszt modelu językowego      0,045 PLN / min      (Haiku, z naszych metadanych)
─────────────────────────────────────────────
razem zmierzone              0,363 PLN / min
MARŻA                        0,637 PLN / min  =  64%
```

Model językowy policzony z prawdziwych liczników: **mediana 21 320 tokenów
wejścia i 279 wyjścia na rozmowę**. Wejście jest duże, bo snapshot i prompt
lecą w każdej turze — i to jest dodatkowy argument za trzymaniem snapshotu
w ryzach.

⚠️ **Czego te 64% NIE obejmuje:** telefonii SuperVoIP, SMS-ów potwierdzających,
naszej infrastruktury Supabase i podatku. Marża na samym głosie i modelu to
nie jest marża produktu.

⚠️ I drugie zastrzeżenie, ważniejsze: **to jest stawka planu Creator, czyli
najgorsza możliwa.** Przy 4–17 mln kredytów miesięcznie cena jednostkowa niemal
na pewno spada. **Wycena „złotówka za minutę" na podstawie 0,318 PLN jest
bezpieczna, ale prawdopodobnie zbyt ostrożna.**

## 🔴 GDZIE NAPRAWDĘ POSZŁY KREDYTY

```
rozmowy telefoniczne (76)      58 383   63%
rozmowy przez przeglądarkę (2)    709    1%
MOJE PRÓBKI PRZEZ TTS API      33 799   36%
──────────────────────────────────────
licznik konta                  92 891
```

**Ponad trzecia część miesięcznego limitu poszła na moje pomiary** — dwadzieścia
syntez powitania, dwadzieścia na wariant liczebników, osiem na kombinację przy
językach, dziesięć powtórzeń rosyjskiego. Twoje podejrzenie było trafne, choć
rozmowy i tak zjadły więcej.

To nie jest zmarnowane: te próbki dały odpowiedzi, których nie dałoby się
dostać inaczej. Ale **przy następnych pomiarach warto liczyć budżet z góry** —
100 syntez po 150 znaków to około 15 tysięcy kredytów, czyli 12% miesiąca.

## Ile zostało do 3 września

```
kredytów            28 207
minut rozmowy           64
rozmów po 98 s          39
rozmów po 2 min         32
próbek po 150 znaków  ~188
```

**Na testy wystarczy, na demo dla klienta już nie.** Jeśli w tym okresie ma być
pokaz na żywo, trzeba podnieść plan albo wstrzymać pomiary syntezy.

## 🔴 NAJPIERW SPROSTOWANIE: turbo NIE jest tańsze w Agents

Założenie „turbo to połowa kredytów za znak" pochodzi z cennika **TTS API**.
**W Agents nie obowiązuje.** Rachunki za nasze rozmowy:

```
model                  rozmów   USD/min rozmowy   kredytów/min
v3_conversational          15        0,0702            557
flash_v2_5                 45        0,0795            440
turbo_v2_5                  9        0,0795            441
multilingual_v2             9        0,0796            440
```

**Turbo i multilingual kosztują tyle samo co do trzeciego miejsca po przecinku.**
Agents nalicza za **minutę rozmowy**, nie za znaki syntezy — a minuta rozmowy
kosztuje tyle samo niezależnie od modelu.

**Wniosek dla zgłoszenia: argumentu kosztowego NIE MA i nie wpisuję go.**
Niedziałające `model_family` kosztuje nas **wyłącznie jakością rosyjskiego**
(19/20 wobec 7/20 zrozumiałych syntez). To jedyna szkoda i tak trzeba to
przedstawić — dopisanie nieprawdziwego argumentu o pieniądzach osłabiłoby
resztę zgłoszenia, w której każda liczba jest sprawdzalna.

Ciekawostka na marginesie: `v3_conversational` wychodzi **o 12% taniej**
za minutę rozmowy. Nie wiemy dlaczego — i tak jest zablokowany („Expressive
TTS is not allowed").

## Ile realnie kosztuje rozmowa

```
średnia rozmowa       98 s      758 kredytów      0,1265 USD  ≈ 0,51 PLN
```

Rozmowa z prawdziwą rezerwacją (1,5–3 min) to **0,15–0,25 USD**, czyli
**0,60–1,00 PLN**.

## Limit planu i zużycie

```
plan                    Creator
limit                   121 098 kredytów / miesiąc
zużyte                   92 891  (76,7%)
odnowienie              03.09.2026
```

**Trzy czwarte miesięcznego limitu poszło na testy jednego warsztatu.**
78 rozmów, z czego większość to nasze próby.

## 🔴 SKALOWANIE: obecny plan nie wystarczy na jednego klienta, nie na pięćdziesięciu

```
50 warsztatów × 5 rozmów dziennie × 22 dni =  5 500 rozmów   4,2 mln kredytów    696 USD/mies
50 warsztatów × 10 rozmów × 22 dni         = 11 000 rozmów   8,3 mln kredytów   1391 USD/mies
50 warsztatów × 20 rozmów × 22 dni         = 22 000 rozmów  16,7 mln kredytów   2783 USD/mies
```

**Limit Creator to 121 tysięcy kredytów. Potrzeba 4,2 miliona — trzydzieści pięć
razy więcej** przy najostrożniejszym założeniu pięciu rozmów dziennie.

### Co to znaczy dla wyceny planów Agent 249/399 zł

```
koszt jednej rozmowy                      ≈ 0,51 PLN
100 rozmów miesięcznie na warsztat        ≈  51 PLN
200 rozmów miesięcznie                    ≈ 102 PLN
```

Przy planie **249 zł** i stu rozmowach koszt samego głosu to **20% ceny**.
Przy dwustu — **41%**. Do tego dochodzi model językowy, SMS-y i telefonia.

**Warsztat, który odbiera 20 rozmów dziennie (440 miesięcznie), kosztuje
224 PLN samego głosu — czyli plan 249 zł wychodzi na zero.**

Wniosek: **plan 249 zł potrzebuje limitu rozmów**, albo wyższy próg musi być
znacznie droższy. Bez limitu jeden aktywny warsztat zjada marżę z kilku
nieaktywnych.

⚠️ Czego te liczby NIE obejmują: cen hurtowych ElevenLabs przy wyższych planach.
Przy 4–17 mln kredytów miesięcznie stawka jednostkowa niemal na pewno spada —
**trzeba zapytać ich o cennik Enterprise, zanim ustalimy ceny planów.**
Dzisiejsze 0,51 PLN za rozmowę to koszt przy planie Creator, czyli najgorszy możliwy.
