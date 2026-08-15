# Sprzeczności w prompcie — materiał na FAZĘ C

**Zadanie z 15.08: „Ile jeszcze takich par tam siedzi?"**
Po znalezieniu pary `check_availability`, która kosztowała 2,1 s ciszy w rozmowie.

## Skala

```
82 reguły     20 975 znaków     jeden literał szablonowy
```

Reguł mówiących o tym samym temacie:

```
imię i płeć           20
godziny i terminy     19
zakończenie rozmowy    6
cena                   5
długość wypowiedzi     5
numer rejestracyjny    4
język rozmowy          3
„dziękuję" i preambuły 3
check_availability     3   <- ta para juz naprawiona
```

Sama liczba nie jest zarzutem — temat może wymagać kilku reguł. Zarzutem jest to,
że **niektóre z nich mówią rzeczy przeciwne**.

---

## PARA 1 — potwierdzenia: „mów je" wobec „nie mów ich"

```
- NATURALNE POTWIERDZENIA przy zbieraniu danych: krótkie „dobrze", „zapisuję",
  „notuję" ZAMIAST samego pytania. „Dobrze, zapisuję. Poproszę numer
  rejestracyjny." brzmi jak recepcjonistka, „Poproszę numer rejestracyjny."
  brzmi jak formularz.

- BEZ PREAMBUŁ. Recepcjonistka nie dziękuje po każdym zdaniu. Przy zbieraniu
  danych zadajesz samo pytanie, bez wstępu.
```

**Pierwsza każe poprzedzić pytanie potwierdzeniem. Druga każe zadać samo pytanie.**
Obie dotyczą DOKŁADNIE tej samej sytuacji — zbierania danych — i obie powołują się
na tę samą recepcjonistkę.

## PARA 2 — „dziękuję": trzy różne zasady

```
- TELEFON: […] Powiedz krótko „Dziękuję, numer zapisany." i przejdź dalej.
- Recepcjonistka nie dziękuje po każdym zdaniu.
- „Dziękuję" powiedz RAZ, na zakończenie rozmowy.
```

Pierwsza każe powiedzieć „dziękuję" w środku rozmowy. Trzecia rezerwuje je
wyłącznie na koniec. **Model dostaje wzorzec i zakaz tego wzorca.**

## PARA 3 — data i godzina: „zawsze" wobec „dokładnie raz"

```
- ZAWSZE podawaj dzień tygodnia I datę, nigdy samo „jutro".
- Datę i godzinę podajesz w podsumowaniu DOKŁADNIE RAZ. Nie powtarzaj ich
  na końcu zdania ani w pożegnaniu.
- ALE DOKŁADNIE RAZ NA TURĘ.
```

To nie jest sprzeczność wprost — pierwsza mówi o formie, druga o częstości —
ale **„ZAWSZE" i „DOKŁADNIE RAZ" w wielkich literach, o tym samym obiekcie,
w trzech miejscach** to instrukcja, przy której model musi zgadywać, która wygrywa.

## PARA 4 — cyfry: „każdą osobno" z wyjątkiem, który to unieważnia

```
- CYFRY — REGUŁA ŁAMANA JUŻ TRZY RAZY, TRAKTUJ JĄ JAKO NADRZĘDNĄ: każdą cyfrę
  czytasz OSOBNO. […] Godziny czytasz normalnie („dziewiąta"), bo to nie jest numer.
```

Reguła nazywa siebie NADRZĘDNĄ i w tym samym zdaniu robi wyjątek.
**Po dodaniu `wolne_do_wypowiedzenia` cały ten wyjątek jest zbędny** — godzin
model już nie zamienia, dostaje gotowe.

---

## Wniosek na FAZĘ C

Cztery pary na 82 reguły to nie jest katastrofa. **Ale każda z nich powstała
tak samo: ktoś dopisał regułę po prawdziwej rozmowie, nie sprawdzając, czy
nie przeczy istniejącej.** Ja też — parę `check_availability` sam pogłębiłem,
dokładając blok snapshotu obok starych reguł zamiast zamiast nich.

Dwie zasady do przepisywania:

1. **Nowa reguła zastępuje starą albo jej nie ma.** Dopisywanie obok tworzy pary.
2. **Reguła, której trzeba nadać rangę „NADRZĘDNA", jest sygnałem sprzeczności,**
   nie sposobem jej rozwiązania. Trzy takie w tym prompcie i wszystkie trzy
   siedzą przy tematach z największą liczbą reguł.
