# Koszt rozmowy — dane z NASZYCH rachunków, nie z cennika

Wszystkie liczby z pola `charging` w metadanych 78 rozmów.

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
