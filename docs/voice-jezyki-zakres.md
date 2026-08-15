# Ile pracy kosztuje kolejny język — odpowiedź na trzy pytania

## 1. Struktura: LOGIKA DA SIĘ PONOWNIE UŻYĆ, TABLICE NIE WYSTARCZĄ

Rozkład liczby w `liczbaSlownie` — tysiące, setki, dziesiątki, jedności,
z osobnym progiem przy 20 — jest **wspólny dla polskiego, rosyjskiego
i ukraińskiego**. Wszystkie trzy mają nieregularne formy 11–19 i złożone
od 20 wzwyż. **Ta część przenosi się bez zmian.**

Ale „podmień tablice" **nie wystarczy**, z trzech powodów:

**a) Wybór formy liczby mnogiej.** Polski, rosyjski i ukraiński mają trzy
formy zależne od ostatniej cyfry: `1`, `2–4`, `5+`.

```
polski      tysiąc  /  dwa tysiące   /  pięć tysięcy
rosyjski    тысяча  /  две тысячи    /  пять тысяч
ukraiński   тисяча  /  дві тисячі    /  п'ять тисяч
```

Nasz kod tego **nie implementuje** — o czym niżej, bo to jest błąd także
w polskim.

**b) Rodzaj gramatyczny liczebnika.** Rosyjski i ukraiński odmieniają
„jeden/dwa" przez rodzaj rzeczownika, z którym stoją:

```
rosyjski    один злотый / одна гривна        два злотых / две гривны
ukraiński   один злотий / одна гривня        два злотих / дві гривні
```

Po polsku problem nie wychodzi, bo mówimy tylko o złotówkach i tylko
w dopełniaczu. Przy rosyjskim trzeba to obsłużyć albo świadomie ograniczyć
do jednej waluty i jednego rodzaju.

**c) Data to osobny mechanizm niż cena.** `doWypowiedzenia` nie liczy nic —
czyta z gotowej tablicy `DZIEN_SLOWNIE[1..31]` form porządkowych w dopełniaczu.
Dla rosyjskiego i ukraińskiego to **kolejne dwie tablice po 31 pozycji**,
wypisane ręcznie.

## 2. Ile linii realnie

```
                                          polski (jest)   rosyjski   ukraiński
tablice liczebników głównych + dopełniacz       16            16          16
tablica dni miesiąca (31 form porządkowych)      ~8             8           8
nazwy miesięcy i dni tygodnia                    ~6             6           6
przyimki („we wtorek" / „в вторник")             ~3             3           3
siatka czasu trwania                             15            15          15
wybór formy mnogiej (1 / 2-4 / 5+)                0*            6           6
rodzaj przy „jeden/dwa"                           0*             4           4
logika rozkładu liczby                           23         wspólna     wspólna
```

`*` zero, bo w polskim tego brakuje — i to jest usterka, nie oszczędność.

**Rosyjski: około 58 nowych linii. Ukraiński: około 58, ale znacznie taniej
w pisaniu**, bo struktura jest identyczna do rosyjskiej i podmienia się same
formy. Realnie ukraiński to **kopia rosyjskiego z podmienionymi tablicami** —
tu „podmień tablice" JEST prawdziwe, tylko między ru a uk, nie między pl a ru.

**Wniosek dla kolejności: rosyjski i ukraiński robimy RAZEM.**
Drugi kosztuje ułamek pierwszego, a weryfikacja idzie tym samym trybem.

## 3. Biblioteki: są, MIT, i Deno je uniesie — ale nie polecam

```
number-to-words-ru   2.4.1   MIT   zależność: @ungap/structured-clone
numeralize-ru        2.0.0   MIT   bez zależności
```

Supabase Edge Functions obsługują `npm:` — w tym projekcie już tak robimy
(`npm:nodemailer`, `npm:resend`).

**Ale nie polecam ich tutaj, z trzech powodów:**

1. **Obie robią liczby, nie daty.** Tablica 31 form porządkowych i tak jest
   do napisania ręcznie — a to jest większa część roboty.
2. **Dla ukraińskiego nie ma odpowiednika** o porównywalnej jakości.
   Skończylibyśmy z biblioteką dla rosyjskiego i ręcznym kodem dla ukraińskiego,
   czyli dwoma różnymi mechanizmami w jednym module.
3. **`voice-agent-init` ma budżet 800 ms** i dziś mieści się w 151 ms.
   Import `npm:` w Edge Function to dodatkowy czas zimnego startu, którego
   nie zmierzyliśmy. Dokładanie zależności do funkcji na ścieżce rozmowy
   dla 16 linii tablic to zły interes.

**Rekomendacja: napisać ręcznie, wzorem modułu angielskiego — osobny plik
na język, zero zmian w istniejących.**

---

## 🐛 ZNALEZIONE PRZY OKAZJI: BŁĄD W POLSKIM MODULE

Sprawdzając, czy logika jest przenośna, uruchomiłem `cenaDoWypowiedzenia`
na większych kwotach:

```
   150  ->  sto pięćdziesiąt złotych                     OK
  1000  ->  tysiąc złotych                               OK
  2000  ->  dwa tysiące złotych                          OK
  5000  ->  pięć tysiące złotych        <-- ŹLE, ma być „pięć tysięcy"
  9000  ->  dziewięć tysiące złotych    <-- ŹLE
 12000  ->  12000 złotych               <-- ŹLE, wraca CYFRAMI
```

**Przyczyna:** kod ma dwie formy („tysiąc" / „tysiące"), a polski wymaga trzech
— `1` / `2–4` / `5+`. Brakuje selektora formy mnogiej. To ten sam mechanizm,
którego rosyjski i ukraiński potrzebują tym bardziej.

**Drugi błąd:** przy kwocie powyżej 9999 funkcja wraca **cyframi**, co łamie
naszą własną regułę „liczby zawsze słowami" — a właśnie zmierzyliśmy, że zapis
cyframi daje **4/20 wtrętów wobec 0/20 przy słowach**.

**Kiedy to boli:** ceramika i folie ochronne kosztują w warsztacie 5–15 tysięcy.
Dziś agent powie „pięć tysiące złotych" albo przeczyta „12000".

**NIE POPRAWIŁEM.** Twoja instrukcja mówi wprost: moduł polski nietknięty,
a przy zmianie czegoś, co dziś działa — zatrzymać się i zapytać. To akurat
nie działa, ale poprawka to zmiana w module z 24 asercjami, na której stoi
jedyny bezbłędny język, jaki mamy.

**Do decyzji.** Poprawka to ~6 linii (selektor formy mnogiej) plus podniesienie
progu z 9999. Trzy nowe asercje. Ryzyko małe, ale niezerowe — i wolę je zgłosić
niż wykonać po cichu.
