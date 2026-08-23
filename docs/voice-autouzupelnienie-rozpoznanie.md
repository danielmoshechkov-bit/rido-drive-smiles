# Autouzupełnienie z linku — rozpoznanie i wycena

**Nic nie zbudowane.** Odpowiedzi na pięć pytań, oparte na próbach na żywo,
nie na przypuszczeniach. Decyzja po teście agenta.

---

## ZAKRES — dwa doprecyzowania z 23.08, ważniejsze niż reszta dokumentu

### 1. To funkcja dla KAŻDEGO usługodawcy, nie dla warsztatów

Portal obsługuje wszystkie branże: warsztaty, myjnie, detailing, fryzjerów,
kosmetyczki, hydraulików, serwisy sprzętu.

**To unieważnia moje badanie jako podstawę do wyceny skuteczności.** Sprawdziłem
dwadzieścia adresów warsztatowych — one mówią o warsztatach, nie o portalu.

I jest powód, żeby spodziewać się lepszego wyniku gdzie indziej: **fryzjer
i kosmetyczka publikują cenniki znacznie częściej niż warsztat**, bo bez ceny
klient nie umówi wizyty online. U warsztatu cena zależy od modelu auta, u
fryzjera strzyżenie kosztuje tyle, ile kosztuje.

**Do zrobienia przed budową:** powtórzyć badanie na branżach usługowych
(fryzjer, kosmetyka, hydraulik, serwis sprzętu), nie tylko motoryzacyjnych.
Wynik dla warsztatów — ceny na 1 z 9 — jest prawdopodobnie **dolną granicą**,
nie średnią.

### 2. Miejsce: zakładka „Moje usługi", nie panel agenta

Tam usługodawca konfiguruje ofertę niezależnie od tego, czy ma agenta
głosowego. Autouzupełnienie ma sens dla każdego, kto zakłada konto.

Agent czyta cennik ze snapshotu (`provider_services`), więc i tak dostanie to,
co usługodawca zatwierdzi w „Moich usługach" — nie trzeba niczego dublować
w panelu agenta.

**Konsekwencja dla wyceny:** okno z dwiema zakładkami trafia do istniejącego
ekranu „Moje usługi", a nie do zakładki „Asystent głosowy". Etapy A–D bez
zmian, ale miejsce wpięcia inne.

---

## 0. SPROSTOWANIE DO PIERWSZEJ WERSJI TEGO DOKUMENTU

Napisałem „warsztaty w Polsce rzadko publikują ceny" **na podstawie trzech
stron**. To jest dokładnie ten przeskok, przed którym sam ostrzegam: wniosek
szerszy niż pomiar. Zdanie usunięte.

Sprawdzenie na dwudziestu adresach — warsztaty, myjnie i detailing, sieci
serwisowe, portale, wulkanizacje:

```
typ       | odpowiedziało | ceny w treści | godziny | JSON-LD
warsztat  |   4 z 7       |      0        |    0    |   1
myjnia    |   1 z 3       |      0        |    1    |   0
sieć      |   2 z 4       |      1        |    0    |   5
portal    |   2 z 4       |      0        |    0    |   1
opony     |   0 z 2       |      —        |    —    |   —
─────────────────────────────────────────────────────────────
razem     |   9 z 20      |      1        |    1    |   7
```

**Dwie rzeczy widać wyraźniej niż kwestię cen:**

1. **Ponad połowa adresów w ogóle nie odpowiedziała** — 7 błędów połączenia,
   3 odpowiedzi 403/404. To znaczy, że mechanizm musi być odporny na to,
   że strona nie odpowie, i **musi to jasno powiedzieć warsztatowi**.

2. **Ceny znalazłem na jednym z dziewięciu, które odpowiedziały.** Sprawdziłem
   też podstrony `/cennik`, `/uslugi`, `/oferta`, `/pricing` na pięciu
   działających witrynach — **na żadnej nie było ani jednej ceny**.

⚠️ **Czego to nadal nie dowodzi.** Dwadzieścia adresów, dobranych ręcznie,
to wciąż mała i nielosowa próba. Wynik jest wskazówką co do rzędu wielkości,
nie miarą rynku. **Rozstrzygnie go dopiero pomiar na prawdziwych linkach
wklejonych przez prawdziwych warsztatów** — i dlatego mechanizm ma od
pierwszego dnia liczyć, ile razy udało się cokolwiek wyciągnąć.

### Portale rezerwacyjne — sprawdzone osobno, bo o nie pytasz

```
booksy.com/robots.txt   →  391 reguł Disallow, ale /pl-pl/ DOZWOLONE
booksy.com/pl-pl/       →  HTTP 200, 352 542 B HTML → 8 714 znaków (2,5 %)
                           3 bloki JSON-LD
                           __NEXT_DATA__: BRAK — treść nie jest w HTML
```

**Odczyt jest dozwolony i technicznie możliwy, ale treść doładowuje się
JavaScriptem.** Booksy nie umieszcza danych profilu w HTML — zwykłe pobranie
daje szkielet strony, nie cennik. Wyciągnięcie tego wymagałoby przeglądarki
w kontenerze, której nie mamy.

**Wniosek odwrotny do Twojego przypuszczenia:** portale rezerwacyjne mają
najlepsze dane, ale są **najtrudniejsze technicznie**, nie najłatwiejsze.
Własne strony warsztatów są ubogie, ale czytelne.

**Jasny sygnał na przyszłość:** gdyby Booksy udostępniało publiczne API profilu
albo dane w JSON-LD na stronie profilu (nie na stronie głównej — tej nie
sprawdziłem, bo nie mam adresu żadnego konkretnego warsztatu), byłoby to
najlepsze źródło. **Do sprawdzenia na prawdziwym profilu**, gdy pierwszy
warsztat wklei taki link.

---

## 1. ŹRÓDŁA — co realnie da się przeczytać

Sprawdzone przez pobranie, nie przez domysł:

```
www.autoserwis-warszawa.pl   HTTP 200   45 654 B HTML  →  2 019 znaków tekstu
motointegrator.pl            HTTP 403   ← portal branżowy BLOKUJE
arkadiaserwis.pl             HTTP 000   ← nie odpowiada
cart78garage.pl              ENOTFOUND  ← Twój warsztat NIE MA STRONY
```

| źródło | odczyt | uwaga |
|---|---|---|
| własna strona warsztatu | ✅ zwykle działa | pod warunkiem, że w ogóle istnieje |
| Google Maps / wizytówka | ⚠️ **tylko przez płatne API** | scraping wyników łamie ich regulamin; Places API to koszt za zapytanie |
| Facebook / Instagram | ❌ | logowanie i blokada botów; Graph API wymaga zgody właściciela strony |
| portale branżowe | ❌ | motointegrator zwrócił 403 od razu |

**Wniosek: realne jest jedno źródło — własna strona warsztatu.** Reszta albo
kosztuje, albo jest zablokowana. To osłabia sens „kilku linków naraz", o którym
piszesz — zostaje głównie scalanie kilku PODSTRON jednej witryny.

⚠️ **Pierwszy warsztat, na którym byśmy to testowali, nie ma strony w ogóle.**
Domena `cart78garage.pl` nie rozwiązuje się w DNS.

---

## 2. JAK CZYTAMY

**Zwykłe pobranie HTML wystarczy w części przypadków, ale nie w większości.**

Ze strony, która się pobrała: **45 654 B HTML → 2 019 znaków tekstu, czyli 4,4 %**.
Reszta to znaczniki, skrypty i style. To dobra wiadomość dla kosztu modelu.

Zła: **na tej stronie nie było ani cen, ani godzin, ani telefonu w treści** —
wszystko siedzi w obrazkach albo doładowywane jest JavaScriptem.

```
strona główna   2 019 znaków   ceny: NIE   godziny: NIE   telefon: NIE
/oferta           949 znaków   ceny: NIE
/cennik           404
```

**Danych strukturalnych (JSON-LD schema.org) — zero bloków.** Gdyby były,
dostawalibyśmy nazwę, adres, godziny i telefon gotowe, bez modelu. Warto
sprawdzać ich obecność jako pierwszą rzecz, bo kiedy są, są wiarygodne.

**Strony renderowane JavaScriptem wymagałyby przeglądarki** (Playwright
w kontenerze). To osobna infrastruktura, której nie mamy — Edge Functions jej
nie uruchomią.

### Koszt modelu — policzony, nie oszacowany

```
2 019 znaków ≈ 577 tokenów wejścia + ~800 wyjścia (JSON z usługami)
Haiku:  $0,0046  =  0,018 zł za jedną podstronę
5 podstron:      ~0,09 zł na jeden warsztat
```

**Koszt modelu jest nieistotny.** Wąskim gardłem jest to, czy dane w ogóle są
na stronie — nie cena ich przetworzenia.

---

## 3. CO JEST REALNE, A CO NIE

Na podstawie jednej pełnej próby i tego, jak zbudowane są strony warsztatów:

| dane | szansa | skąd |
|---|---|---|
| nazwa firmy | **bardzo wysoka** | `<title>`, nagłówek |
| czym się zajmują | **wysoka** | tekst „O firmie", menu |
| adres | średnia | stopka, ale często w obrazku |
| telefon | średnia | często jako obrazek lub `tel:` w linku |
| godziny pracy | **niska** | zwykle grafika albo widżet |
| **cennik z cenami** | **bardzo niska** | patrz niżej |

### Cennik — najsłabsze ogniwo, ale to nie powód, żeby go nie czytać

W próbie dwudziestu adresów ceny znalazłem na jednym z dziewięciu, które
odpowiedziały (patrz sekcja 0). Próba jest mała i nielosowa, więc **nie
formułuję z niej reguły o branży** — podaję ją jako rząd wielkości.

Cennik czytamy ZAWSZE, gdy się da. Gdy go nie ma, mówimy to wprost i bez
oceniania, czy to typowe.

**Konsekwencja dla przepływu:** zakładka 2 („Cennik i usługi") u większości
warsztatów pokaże **listę usług bez cen**. To nadal ma wartość — agent musi
wiedzieć, co warsztat robi, żeby rozpoznać zgłoszenie — ale nie zdejmuje pracy,
o której piszesz („dwadzieścia usług z cenami").

**Uczciwe postawienie sprawy:** funkcja zdejmie wpisywanie NAZW usług
i opisu firmy. Ceny warsztat i tak wpisze ręcznie, bo ich nigdzie nie ma.

---

## 4. RYZYKA

**Prawne — czytanie cudzej strony.** Warsztat wkleja własny link, więc mamy
jego zgodę na przetworzenie. Ale:
- **`robots.txt` trzeba respektować** — sprawdzenie przed pobraniem, jedna
  dodatkowa prośba,
- **nagłówek `User-Agent` musi być uczciwy** (`RidoBot/1.0` z adresem
  kontaktowym), nie podszywanie się pod przeglądarkę,
- **treść jest chroniona prawem autorskim** — kopiowanie opisów usług słowo
  w słowo do naszej bazy to reprodukcja. Bezpieczniej, żeby model **streszczał**,
  a nie przepisywał,
- **limit żądań** — jedna strona na warsztat, kilka podstron, nie crawl.

**Dane nieaktualne.** To jest realne i Twoja zasada „system proponuje, warsztat
zatwierdza" jest jedyną odpowiedzią. Dodałbym: **przy każdej pozycji data
pobrania i adres źródła**, żeby warsztat widział, skąd to jest.

**Błędne dopasowanie.** Model wyciągnie „diagnostyka komputerowa 100 zł"
z tekstu o promocji sprzed dwóch lat, agent poda tę cenę przez telefon.
Zabezpieczenie: **nic nie trafia do cennika bez kliknięcia**, plus ostrzeżenie
przy pozycjach z ceną („sprawdź, czy cena jest aktualna").

---

## 5. ILE PRACY

Podział na etapy, z których każdy ma sens osobno:

| etap | co | dni |
|---|---|---|
| A | pobieranie strony + `robots.txt` + wycięcie tekstu + JSON-LD | 1 |
| B | wyciąganie struktury modelem (nazwa, opis, usługi) + schemat wyniku | 1 |
| C | okno z dwiema zakładkami, edycja, zaznaczanie pozycji | 2 |
| D | zapis do `provider_services` i `business_context` po zatwierdzeniu | 0,5 |
| E | kilka linków: scalanie, deduplikacja po nazwie, rozbieżne ceny | 1,5 |
| F | dopisywanie później: tylko nowe pozycje, propozycja zmiany ceny | 1 |
| **razem** | | **7 dni** |

**Etapy A–D to działająca funkcja dla jednego linku (4,5 dnia).**
E i F to Twoje rozszerzenie o wiele źródeł — sensowne, ale warte zrobienia
dopiero wtedy, gdy zobaczymy, ile realnie da się wyciągnąć z jednego.

---

## Rekomendacja

**Zbudować A–D, ale nie teraz i nie jako „autouzupełnienie cennika".**

Uzasadnienie: funkcja rozwiązuje problem, który postawiłeś („dwadzieścia usług
z cenami zniechęci połowę klientów"), **tylko w połowie** — nazwy usług tak,
ceny nie, bo ich na stronach nie ma. A połowa warsztatów w ogóle nie ma strony
(w tym Twój testowy).

**Tańsza alternatywa do rozważenia:** gotowy słownik 30–40 typowych usług
warsztatowych z pustymi cenami, do zaznaczenia jednym kliknięciem. Zdejmuje
tę samą pracę, działa u każdego warsztatu, nie wymaga strony i kosztuje ~1 dzień
zamiast siedmiu.

Autouzupełnienie z linku ma wtedy sens jako **dodatek dla warsztatów, które
mają dobrą stronę** — a nie jako główna droga wypełnienia cennika.
