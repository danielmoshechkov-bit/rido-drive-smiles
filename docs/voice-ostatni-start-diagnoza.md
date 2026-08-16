# Dlaczego agent proponuje godziny, o których usługa się nie skończy

**`ostatniStart()` jest poprawne. Wina jest gdzie indziej — w trzech miejscach.**

## Dowód z prawdziwej rozmowy (15.08, 10:49)

```
[ 83s] AGENT  Najpóźniej przyjmujemy do siedemnastej.          <- NIEPRAWDA
[ 86s] KLIENT To można zapisać się na siedemnastą?
[ 91s] AGENT  Niestety siedemnasta to już koniec dnia.
              Ostatnia godzina to szesnasta trzydzieści.        <- poprawił się
```

Agent **sam sobie zaprzeczył w ciągu ośmiu sekund**, bo dostał dwie sprzeczne
informacje. Klient usłyszał najpierw jedno, potem drugie.

## Trzy przyczyny, żadna w `ostatniStart()`

`ostatniStart(zamknięcie, czas, najpóźniejsze) = min(zamknięcie − czas, najpóźniejsze)`.
Dla 17:00, 60 min i 17:00 daje **16:00** — poprawnie. Funkcja działa.

**1. `najpozniejsze_przyjecie` jest ustawione na godzinę ZAMKNIĘCIA.**

`voice-agent-init`, linia 254:

```ts
const zamkniecieTypowe = (godzinyTygodnia["mon"] || GODZINY_ZAPASOWE).close;  // "17:00"
const ustawienia = {
  najpozniejsze_przyjecie: zamkniecieTypowe,     // <- 17:00
  domyslny_czas_wizyty_min: 60,
```

To pole **nigdy niczego nie ogranicza** (bo `min(16:00, 17:00) = 16:00` i tak
wychodzi z pierwszego członu), ale **trafia do snapshotu jako tekst** i agent
czyta je dosłownie: „najpóźniejsze przyjęcie: 17:00". Tak powstało zdanie z 83 s.

**2. Snapshot podaje godziny pracy bez zastrzeżenia o czasie usługi.**

```json
"godziny":"09:00-17:00"
```

Dla agenta to znaczy „można umówić na 17:00". Nigdzie obok nie ma informacji,
że ostatni start jest wcześniejszy.

**3. Lista wolnych godzin pokazuje TYLKO TRZY PIERWSZE, zawsze poranne.**

```json
"wolne":["09:00","09:30","10:00"]     // identycznie w KAŻDYM z 14 dni
```

`wolneGodziny(..., maks = 3)` liczy od otwarcia. Agent **nigdy nie widzi
popołudnia** — więc gdy klient prosi o późną godzinę, nie ma danych, tylko
mylące `najpozniejsze_przyjecie`.

## Czego NIE ma w przyczynach

**Brak `duration_minutes` nie jest tu winny**, choć sześć z ośmiu usług ma NULL:

```
Diagnoza usterki                     60
Napełnienie czynnikiem R134YF        30
Ceramika 4 letnia + korekta lakieru  NULL   -> domyślne 60
Ceramika z korektą lakieru OneStep   NULL   -> domyślne 60
Folie ochronne BBF                   NULL   -> domyślne 60
Mycie kompleksowe auta               NULL   -> domyślne 60
Wymiana klocków hamulcowcyh          NULL   -> domyślne 60
Wymiana tarcz przednich              NULL   -> domyślne 60
```

Wartość domyślna 60 jest stosowana konsekwentnie i daje poprawne 16:00.
**Ale to i tak jest błąd danych**: „Ceramika 4 letnia + korekta lakieru"
z pewnością nie trwa godziny, a folie ochronne to zwykle dwa dni.
Przy tych usługach agent zaproponuje termin, którego warsztat nie dotrzyma —
tylko z innego powodu niż ten zgłoszony.

## Co trzeba zmienić (NIEWDROŻONE)

1. `najpozniejsze_przyjecie` **nie może domyślnie równać się zamknięciu**.
   Do czasu powstania zakładki ustawień: liczyć je jako
   `zamknięcie − domyślny czas wizyty`, czyli 16:00.
2. Do każdego dnia dopisać `ostatni_start` obok `godziny`, żeby agent nie musiał
   liczyć.
3. `maks = 3` liczone od otwarcia → dodać kilka slotów popołudniowych albo
   podać zakres zamiast listy.
4. Uzupełnić `duration_minutes` przy usługach — to dane warsztatu, nie kod.

## Ustawienie do zakładki agenta (razem z powyższym)

```
„Przyjmujemy auta na noc":  tak / nie / do uzgodnienia      domyślnie: do uzgodnienia
```

```
tak            → „Możemy przyjąć o siedemnastej, ale auto zostanie do jutra. Pasuje?"
nie            → „Najpóźniej szesnasta, bo o siedemnastej zamykamy."
do uzgodnienia → „Najpóźniej szesnasta. Jeśli potrzebuje Pan później,
                  mechanik ustali to przy przyjęciu."
```

Wariant trzeci jest domyślny, bo **nie obiecuje niczego, czego warsztat może nie
chcieć**. „Auto może zostać do jutra" to zobowiązanie — nie każdy ma gdzie
trzymać auta na noc i nie każdy chce brać za to odpowiedzialność.
