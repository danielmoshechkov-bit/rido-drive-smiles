# Dziennik naturalności — materiał do FAZY C

Po każdej rozmowie: pełny transkrypt do wglądu plus lista miejsc, gdzie agent
brzmi nieludzko. Format stały: **cytat → co jest nie tak → jak powiedziałby człowiek**.

Zbierane na bieżąco, żeby przy przepisywaniu promptu mieć komplet, nie wspomnienia.

## Teza wiodąca (potwierdzona danymi 15.08)

**Osiem z dziesięciu pierwszych zastrzeżeń dotyczyło reguł, KTÓRE W PROMPCIE JUŻ SĄ.**
Zakaz „Ci", jedno pytanie domykające, potwierdzanie treści, użycie imienia —
wszystko napisane, nic niestosowane. Przy 12 tysiącach znaków instrukcji problemem
nie jest brak reguł, tylko ich liczba.

> **KAŻDA DODANA REGUŁA OSŁABIA POZOSTAŁE.**
> Cel: 20–30 reguł, nie 12 tysięcy znaków.
> Co da się wyrazić DANYMI w snapshocie zamiast instrukcją — przenieś do snapshotu.
> Model nie łamie reguły, której nie ma, bo nie widzi danych, które by ją łamały.

Pierwszy przykład zastosowania tej zasady, wdrożony 15.08: zamiast reguły
„nie proponuj godzin po zamknięciu" snapshot podaje `ostatni_mozliwy_start`
i sloty rozłożone na cały dzień. Agent nie musi liczyć, więc nie może policzyć źle.

---

## 15.08, 10:46 — `6zfbbd0k`, 73 s (Eric + multilingual_v2)

**1. Odmowa z katalogiem usług zamiast prostego „nie"**
> „Nie mamy wymiany opon w naszym zakresie usług. Zajmujemy się naprawą aut,
> detailingiem, folią ochronną i likwidacją szkód komunikacyjnych."

→ Recytuje cztery kategorie, o które nikt nie pytał.
→ **„Opon niestety nie wymieniamy. Ale jeśli coś innego przy aucie — chętnie pomogę."**

**2. Przejście na „Ci" w drugim zdaniu rozmowy**
> „W czym jeszcze mogę **Ci** pomóc?"

→ Reszta rozmowy jest per Pan. Prompt tego zakazuje wprost, a i tak padło.
→ **„W czym jeszcze mogę pomóc?"**

## 15.08, 10:49 — `bczxgvw1`, 185 s (Eric + multilingual_v2)

**3. „Czy mogę jeszcze w czymś pomóc?" trzy razy w jednej rozmowie** (132 s, 147 s, 167 s)
→ Za trzecim razem brzmi jak automat, który nie umie zamknąć.
→ Po odpowiedzi na pytanie **zamilknąć**. Formułka domykająca raz, nie po każdej odpowiedzi.

**4. Klient prosi o powtórzenie, agent powtarza słowo w słowo**
> `[40s] KLIENT: Jeszcze raz, kiedy?`
> `[43s] AGENT: Poniedziałek siedemnastego sierpnia — o dziewiątej rano czy o jedenastej?`

→ Skoro nie dosłyszał, identyczne powtórzenie nie pomoże.
→ **„Poniedziałek. Może być dziewiąta rano?"** — jedna data, jedna godzina.

**5. Sprzeczność w osiem sekund** — NAPRAWIONE 15.08
> `[83s] „Najpóźniej przyjmujemy do siedemnastej."`
> `[91s] „Niestety siedemnasta to już koniec dnia. Ostatnia godzina to szesnasta trzydzieści."`

→ Wada danych, nie stylu. Patrz `docs/voice-ostatni-start-diagnoza.md`.

**6. Klient prosi, żeby agent przestał — agent nie zauważa** — NAPRAWIONE 15.08
> `[50s] KLIENT: Yy, nie, nie działaj. Ja mogę tylko wieczorem, po siedemnastej.`

→ Trzeci raz te same dwie godziny.
→ **„Rozumiem, przedpołudnia nie pasują. Jaka pora dnia byłaby dobra?"**

**7. Zero potwierdzenia, że usłyszał problem**
> `[5s] KLIENT: coś u mnie stucze w samochodzie z lewej strony.`
> `[13s] AGENT: Dobrze, zajmiemy się tym. Kiedy byłoby wygodnie przyjechać?`

→ Nie powtarza ani słowa z tego, co klient powiedział. Klient dopytał 12 s później
  („jaki to będzie serwis?"), bo nie miał pewności, że agent zrozumiał.
→ **„Stuka z lewej strony — sprawdzimy. Kiedy byłoby wygodnie?"**

**8. Imię przyjęte, nigdy nieużyte**
> Klientka podała „Anastazja Szabowalowa" — agent do końca mówi bezosobowo.

→ Prompt POZWALA na „Pani Anastazjo" po poznaniu imienia. Nie padło ani razu.

**9. Pożegnanie ucięte narzędziem**
> `[181s] AGENT: Do zobaczenia w piątek o szesnastej trzydzieści.  [end_call]`
> `[182s] KLIENT: Tak.`

→ `end_call` poszedł w tej samej sekundzie co ostatnie słowo; klient jeszcze mówił.

**10. Cena podana dopiero po trzecim pytaniu**
> Klient pytał dwa razy, zanim usłyszał liczbę.

→ **Człowiek podałby cenę razem z terminem**, zanim klient zapyta.
