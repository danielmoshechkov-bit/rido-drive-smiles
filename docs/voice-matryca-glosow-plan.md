# Matryca głosów: język × głos × model — zakres i wycena

**Nie do wykonania dziś.** Najpierw Eric + właściwy model na produkcji
i rozmowa kontrolna. To jest plan, nie zadanie w toku.

## Po co

Docelowo warsztat wybiera głos w naszym panelu — **z listy, którą my
przetestowaliśmy**, nie z całej Voice Library. Dzisiejsza awaria dała nam
miernik, którym da się taką listę zbudować obiektywnie.

Przy okazji odblokowuje to wielojęzyczność z backlogu: agent już przełącza się
na rosyjski i ukraiński, ale nikt nigdy nie sprawdził, jak w tych językach brzmi.

## Zakres

```
JĘZYKI   polski, rosyjski, ukraiński, angielski                        4
GŁOSY    3 męskie + 3 żeńskie na język, z Voice Library,
         filtr: język + kategoria conversational + zweryfikowany         6
MODELE   multilingual_v2 i v3 wszędzie                                   2
         + Flash i Turbo TYLKO dla ru/uk/en (przy polskim wykluczone)
SYNTEZY  15 na kombinację
```

Liczba kombinacji:

```
pl:              6 głosów × 2 modele            = 12
ru, uk, en:      6 głosów × 4 modele × 3 języki = 72
                                          RAZEM = 84 kombinacje
                                        × 15    = 1260 syntez
```

Do tego **drugi przebieg ze zdaniami zawierającymi liczby i daty** —
osobna hipoteza, opisana niżej — czyli **2520 syntez** łącznie.

## Ile to realnie kosztuje

```
czas maszynowy     ~2 s na syntezę + ~1,5 s na transkrypcję
                   2520 × 3,5 s ≈ 2,5 godziny, w tle, bez nadzoru
koszt syntezy      ~150 znaków × 2520 ≈ 380 tys. znaków
koszt transkrypcji ~2520 × 5 s ≈ 3,5 godziny audio
praca do napisania ~2 h: rozszerzyć istniejący skrypt o pętlę po głosach
                   i językach, dobrać zdania testowe w czterech językach,
                   zbudować tabelę i katalog próbek
```

**Największe ryzyko to nie koszt, tylko dobór zdań testowych w językach,
których nie znam na tyle, żeby ocenić naturalność.** Zdanie po ukraińsku musi
brzmieć jak realna wypowiedź recepcji warsztatu, nie jak tłumaczenie. Do tego
potrzebny jest ktoś, kto te języki zna — inaczej zmierzymy wtręty w zdaniu,
którego i tak nikt by nie powiedział.

## Czego ten miernik NIE zmierzy

Wtręty łapie obiektywnie. **Naturalności brzmienia nie.** Eric może mieć trzy
razy mniej wtrętów niż Kamil i brzmieć gorzej po polsku — to rozstrzyga ucho,
nie skrypt. Dlatego każda kombinacja musi mieć też **próbkę do odsłuchu**,
a lista do panelu powstaje z przecięcia: „mało wtrętów" ∩ „brzmi dobrze".

## Hipoteza o liczebnikach — osobno, po potwierdzeniu modelu

Mój miernik **trzy razy** pomylił odmianę liczebnika z wtrętem. To nie przypadek:
liczebniki, daty i rzadkie nazwy własne są dla syntezy najtrudniejsze.
A nasz agent mówi głównie datami, godzinami i cenami.

```
20 syntez zdania BEZ liczb    „Dzień dobry, w czym mogę pomóc?"
20 syntez zdania Z liczbami   „piątek piętnastego sierpnia o jedenastej"
ten sam głos, ten sam model
```

Jeśli wtręty korelują z liczebnikami, mamy **drugie darmowe obejście**: zapis
liczb w prompcie w innej formie. Dziś każemy agentowi wypowiadać je słowami
(reguła wymowy) — być może akurat to jest najgorszym możliwym wyborem.

## Kolejność

```
1. Eric na produkcji                                    ZROBIONE
2. wybór modelu po odsłuchu próbek                      czeka na decyzję
3. rozmowa kontrolna
4. hipoteza o liczebnikach (2 × 20 syntez, 15 minut)
5. matryca głosów (2,5 h w tle + 2 h pracy)
6. lista w panelu warsztatu
```
