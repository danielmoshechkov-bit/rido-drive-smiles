# Archiwum bazy wiedzy agenta — 108 reguł skasowanych 15.08.2026

Wszystkie powstały automatycznie (`source = 'distilled'`) między 14.06 a 15.08,
żadna nie została przez nikogo zatwierdzona (`is_active = false` we wszystkich
108 wierszach). Część pochodzi z symulacji ze scenariuszami wymyślonymi przez
model — `voice-call-analyze` przyjmował `is_test`, ale go nie czytał.

Powód skasowania: wpis, którego nikt nie napisał i nikt nie zweryfikował, nie
ma prawa leżeć w bazie obok wpisów prawdziwych — za pół roku nikt nie odróżni
jednych od drugich. Treść zostaje tutaj jako materiał do przeczytania, nie jako
źródło, z którego cokolwiek się wstrzykuje.


## closing

- **Przed zakończeniem rozmowy**
  → Zbierz WSZYSTKIE dane: imię, nazwisko, numer telefonu, markę, model, numer rejestracyjny. Powtórz każde dane do potwierdzenia.
  <sub>2026-07-10, wystąpień: 6</sub>

- **Po zarezerwowaniu terminu**
  → Zawsze zbierz numer telefonu: 'Jaki numer telefonu do potwierdzenia rezerwacji?' — przed lub zaraz po dacie
  <sub>2026-06-14, wystąpień: 2</sub>

- **Na koniec rozmowy**
  → Pełne, profesjonalne pożegnanie: 'Do widzenia, czekamy na Pana w czwartek o [godzina]. Dziękujemy!'
  <sub>2026-08-04, wystąpień: 2</sub>

- **Po potwierdzeniu rezerwacji**
  → Zaproponuj informacje o kosztach lub warunkach: 'Czy chciałbyś wiedzieć, ile może kosztować diagnostyka zawieszenia?' — daje klientowi pełny obraz
  <sub>2026-08-05, wystąpień: 2</sub>

- **Po zarezerwowaniu usługi**
  → Pytać o dodatkowe potrzeby: 'Czy podczas wizyty mogę sprawdzić coś jeszcze — np. stan opon, hamulców, czy inne serwisowe?'
  <sub>2026-08-06, wystąpień: 2</sub>

- **Podsumowanie rezerwacji**
  → Podsumowuj naturalnym tonem, w jednym zdaniu: forma grzecznościowa, marka i model, ustalony dzień i godzina, zgłoszony problem. Nie czytaj liczb słownie cyfra po cyfrze.
  <sub>2026-06-14, wystąpień: 1</sub>

- **Potwierdzenie SMS-em**
  → Zamiast 'SMS został wysłany' powiedz: 'Wyślę Ci SMS z potwierdzeniem - sprawdzisz go?'
  <sub>2026-06-14, wystąpień: 1</sub>

- **Gdy masz wszystkie dane do rezerwacji**
  → Podsumuj: usługa, pojazd, termin, imię klienta. Każdą pozycję raz. Nie powtarzaj tego samego zdania wielokrotnie.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Przed zamknięciem rozmowy, gdy klient wyraża brak pytań**
  → Zawsze potwierdzić orientacyjny koszt lub zakres cen (np. "Diagnostyka to [kwota], a naprawa zależy od przyczyny"), aby uniknąć niespodzianek i rezygnacji w ostatniej chwili.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Po ustaleniu problemu**
  → Rozumiem. Mogę zaproponować wizytę w naszym warsztacie. Kiedy byłby dla Pana najwygodniejszy termin — jutro, czy może w innym dniu?
  <sub>2026-07-23, wystąpień: 1</sub>

- **Na koniec rozmowy zawsze dokończ pożegnanie**
  → Pełne pożegnanie: 'Do widzenia, Panie [imię]! Czekamy na Pana w czwartek [data] o [godzina]. Dziękuję!'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Po zarezerwowaniu, agent powinien przeczytać numer telefonu z powrotem do potwierdzenia**
  → Klient podaje numer → Agent: 'Dziękuję, potwierdzam: [numer telefonu] — czy to poprawnie?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po zarezerwowaniu usługi podstawowej**
  → Zaproponować dodatkowe usługi: 'Czy chciałbyś, żebyśmy sprawdzili też hamulce lub wymienili olej podczas przeglądu?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Przed potwierdzeniem rezerwacji**
  → Zawsze potwierdź numer telefonu klienta słownie: 'Poproszę potwierdzić numer, na który wyślemy SMS z potwierdzeniem' — nawet jeśli dzwoni z tego numeru.
  <sub>2026-08-05, wystąpień: 1</sub>

- **Gdy agent już powiedział 'Do widzenia', nie powinien kontynuować rozmowę**
  → Jedno 'Do widzenia' i koniec połączenia — bez 'Już sprawdzam' i powtórzeń
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po ustaleniu daty i godziny**
  → Zaproponuj dodatkowe usługi: 'Czy podczas wizyty moglibyśmy sprawdzić również [olej, filtry, opony]?' — przed zamknięciem rozmowy.
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po potwierdzeniu wszystkich danych**
  → Podsumuj: 'Potwierdzam — czwartek [data] o [godzina], BMW X5, diagnostyka. Wyślemy SMS. Czy jest jakiś problem, który chciałby Pan, żebyśmy sprawdzili w pierwszej kolejności?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po potwierdzeniu wszystkich danych przed zakończeniem rozmowy**
  → Agent powinien zaproponować dodatkowe usługi: 'Czy podczas wizyty moglibyśmy sprawdzić również filtr powietrza lub wykonać diagnostykę klimatyzacji?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po zarezerwowaniu wizyty**
  → Zawsze potwierdzić numer telefonu: 'Poproszę numer telefonu, na który wyślemy SMS z potwierdzeniem' — nie zakładać, że to numer, z którego dzwoni
  <sub>2026-08-06, wystąpień: 1</sub>

- **Przed finalizacją rezerwacji**
  → Diagnostyka zajmie nam około 1-1,5 godziny. Czy chciałby Pan wiedzieć przybliżony koszt przed przyjazdem, czy wolałby czekać na szczegółową wycenę?
  <sub>2026-08-06, wystąpień: 1</sub>

- **Potwierdzenie rezerwacji**
  → Podsumowuję: piątek [data] o [godzina], Audi Q3, serwis olejowy + wymiana filtrów. Poproszę numer telefonu do potwierdzenia SMS-em.
  <sub>2026-08-13, wystąpień: 1</sub>

- **Klient zaczyna mówić coś na koniec rozmowy**
  → Czekać 2-3 sekundy, aby klient mógł dokończyć myśl, zanim agent powie 'Do zobaczenia'
  <sub>2026-08-13, wystąpień: 1</sub>

- **Gdy klient wyraźnie potwierdził wizytę i mówi 'to wszystko'**
  → Pominąć pytanie 'Czy mogę jeszcze w czymś pomóc?' — zastąpić krótkim podsumowaniem i pożegnaniem: 'Dobrze, do zobaczenia we wtorek o [godzina]. Do widzenia!'
  <sub>2026-08-13, wystąpień: 1</sub>

- **Po potwierdzeniu numeru rejestracyjnego lub innych danych krytycznych**
  → Powtórzyć numer rejestracyjny: 'Zapisuję numer WU 367 XU — czy to poprawnie?'. Czekać na potwierdzenie.
  <sub>2026-08-14, wystąpień: 1</sub>

- **Przy zbieraniu danych kontaktowych**
  → Zawsze zbieraj numer telefonu: 'Poproszę również numer telefonu, na który wyślemy potwierdzenie SMS-em'
  <sub>2026-08-14, wystąpień: 1</sub>

- **Na koniec rozmowy, gdy klient wyraża wątpliwości**
  → Potwierdzić wszystkie dane i zaproponować rozwiązanie: 'Poniedziałek, [data] o [godzina]. Wyślemy SMS z potwierdzeniem — proszę sprawdzić wszystkie dane i dać nam znać, jeśli coś będzie nie tak. Jaki numer telefonu do potwierdzenia?'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Zakończenie rozmowy rezerwacyjnej**
  → Podsumowuję: Halina, środa [data] o [godzina], diagnostyka i napełnienie klimatyzacji, samochód EDD, numer CLK 27854432. Potwierdzenie SMS przyjdzie za chwilę. Do widzenia!
  <sub>2026-08-15, wystąpień: 1</sub>


## objection_handling

- **Klient chce terminu dzisiaj, a nie ma dostępności**
  → Rozumiem, że pospieszy się — dzisiaj niestety jesteśmy pełni, ale jutro o [godzina] mogę zarezerwować dla Pani najwcześniejszy termin. Czy to będzie akceptowalne?
  <sub>2026-08-13, wystąpień: 1</sub>

- **Gdy usługa nie jest dostępna**
  → Zamiast tylko odrzucić, zaproponować alternatywę: 'Opon nie wymieniamy, ale mogę Pana połączyć z rekomendowanym warsztatem oponiarskim, lub może interesuje Pana inna usługa?'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient pyta o skrócenie procedury lub optymalizację**
  → Odpowiedz konkretnie: 'Przygotuj listę wszystkich problemów przed przyjazdem — to zaoszczędzi czas. Możemy też wysłać formularz przez SMS, żebyś wypełnił go wcześniej.'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient wyraża obawy dotyczące dokładności danych**
  → Zamiast powtarzać tę samą argumentację, zaproponować rozwiązanie: 'Rozumiem Pani obawy. Mogę przesłać SMS z numerem do potwierdzenia, lub mogę zapisać numer, a Pani sprawdzi go w SMS-ie potwierdzającym wizytę — jeśli będzie błąd, od razu się skontaktujemy'
  <sub>2026-08-15, wystąpień: 1</sub>


## opening

- **Zbieranie danych pojazdu**
  → Pytaj w logicznej kolejności: marka → model → rok → rejestracja (od ogólnego do szczegółowego)
  <sub>2026-06-14, wystąpień: 1</sub>

- **Po potwierdzeniu danych osobowych**
  → Zawsze powtórz imię i nazwisko: 'Czyli [imię], dobrze się mówi?' — przed przejściem dalej
  <sub>2026-07-10, wystąpień: 1</sub>

- **Po powitaniu klienta**
  → Zanim przejdziemy do szczegółów — mogę prosić o Pana imię i numer telefonu do kontaktu?
  <sub>2026-07-23, wystąpień: 1</sub>

- **Po powitaniu formalnym**
  → Utrzymać spójny ton — jeśli zaczęto 'Dzień dobry', kontynuować formalnie lub przejść na 'ty' konsekwentnie od początku
  <sub>2026-08-04, wystąpień: 1</sub>

- **Na początku rozmowy**
  → Unikać powtórzenia pytania 'w czym mogę pomóc' — klient już to powiedział. Przejść bezpośrednio: 'Rozumiem, że chce Pan umówić się na serwis. Jaki problem z samochodem?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Na początku rozmowy po potwierdzeniu problemu**
  → Rozumiem — nierówna praca i stukami w zawieszeniu to rzeczywiście wymaga dokładnego przejrzenia. Czy to problem, który pojawił się nagle, czy nasila się od pewnego czasu?
  <sub>2026-08-06, wystąpień: 1</sub>

- **Po wstępnym powitaniu i rejestracji**
  → Nie powtarzaj 'W czym mogę pomóc?' — przejdź bezpośrednio do zbierania informacji: 'Jaki problem z samochodem wymaga naprawy?'
  <sub>2026-08-14, wystąpień: 1</sub>

- **Po powitaniu i wstępnym wyjaśnieniu problemu**
  → Nie powtarzać pytania 'W czym mogę pomóc?' — przejść bezpośrednio do kwalifikacji: 'Rozumiem, czarny dym i hałasy — to może być problem z układem wydechowym. Kiedy byłoby wygodnie przyjechać?'
  <sub>2026-08-15, wystąpień: 1</sub>


## qualifying

- **Gdy klient zgłasza problem techniczny**
  → Zadaj 1-2 pytania diagnostyczne: 'Kiedy problem się pojawił? Słyszysz hałasy czy czujesz zmianę w prowadzeniu?' — to pomaga przygotować warsztat i ustala oczekiwania
  <sub>2026-06-14, wystąpień: 6</sub>

- **Gdy klient zgłasza problem z pojazdem**
  → Przed zaproponowaniem wizyty: 'Rozumiem. Czy mogę zapytać — jaki marka i model pojazdu? Kiedy po raz ostatni auto odpaliło?' To pozwoli na lepszą diagnostykę i wstępną ocenę problemu
  <sub>2026-08-05, wystąpień: 3</sub>

- **Po podaniu numeru telefonu przez klienta**
  → Agent powinien powtórzyć numer: 'Czyli [numer telefonu] — dobrze zapisałem?'
  <sub>2026-08-04, wystąpień: 2</sub>

- **Gdy klient pyta o cenę usługi diagnostycznej**
  → Odpowiedź była dobra, ale można dodać: 'Przegląd rutynowy BMW X5 zazwyczaj trwa 1-1,5 godziny. Jeśli będą dodatkowe naprawy, omówimy to z Panem przed wykonaniem'
  <sub>2026-08-05, wystąpień: 2</sub>

- **Gdy klient już wyjaśnił swoje potrzeby**
  → Przejść bezpośrednio do zbierania danych, nie powtarzać pytania o problem
  <sub>2026-08-05, wystąpień: 2</sub>

- **Klient podaje numer telefonu bez separatorów**
  → Powtórz numer głośno: 'Czyli [numer telefonu] - dobrze?'
  <sub>2026-06-14, wystąpień: 1</sub>

- **Klient podaje numer rejestracyjny**
  → Powtórz dokładnie: 'WY dziewięć dziewięć sześć EU - zgadza się?' zamiast czytania jako liczby
  <sub>2026-06-14, wystąpień: 1</sub>

- **Gdy klient podał już wszystkie kluczowe dane (imię, nazwisko, numer telefonu, rejestrację, termin)**
  → Nie zadawać dodatkowych pytań, które nie wpływają na rezerwację (rok produkcji, potwierdzanie wymowy). Przejść bezpośrednio do podsumowania i zamknięcia.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Gdy klient od razu wyraża chęć rezerwacji ("chce się umówić na jutro na 15"), agent powinien to priorytetyzować**
  → Potwierdzić dostępność terminu PRZED zadawaniem dodatkowych pytań diagnostycznych. Pytania o symptomy można zadać podczas wizyty lub krótko przed zamknięciem rozmowy.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Na początku rozmowy po zgłoszeniu problemu**
  → Dziękuję za zaufanie. Aby lepiej Panu pomóc, potrzebuję kilka informacji: jak się Pan/Pani nazywa, jaki numer telefonu do kontaktu, jaką markę i model ma Pan auto, i co dokładnie się stało?
  <sub>2026-07-23, wystąpień: 1</sub>

- **Gdy klient wyraźnie określi usługę, którą chce**
  → Nie pytaj o dodatkowe problemy — przejdź bezpośrednio do potwierdzenia i rezerwacji. Pytanie o 'problem' sugeruje, że agent nie słuchał lub nie zrozumiał.
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient wspomina o braku przeglądu technicznego**
  → Rozumiem — oprócz sprawdzenia hamulców, czy chciałby Pan pełny przegląd techniczny? Mogę zaproponować pakiet, który obejmuje wszystkie wymagane kontrole.
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient mówi 'nie wiem co się dzieje'**
  → Zadać pytania diagnostyczne: 'Jakie objawy Pan obserwuje? Dziwne dźwięki, lampki na desce, problemy z rozruchem?' — to przygotuje warsztat
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient mówi ogólnie 'przejrzeć samochód'**
  → Rozumiem. Czy to przegląd diagnostyczny, czy konkretnie coś Pana niepokoi — np. dziwne dźwięki, problemy z silnikiem, oświetleniem?
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient podaje dane osobowe (imię, nazwisko, telefon)**
  → Agent powinien natychmiast potwierdzić każdą część: 'Dziękuję, [imię], numer [numer telefonu] — dobrze zapisałem?'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient nie jest pewny problemu ('chyba wydaje mi się')**
  → Panie [imię], rozumiem — zawieszenie może wydawać się podejrzane. Czy mogę zapytać — słyszy Pan jakieś dziwne odgłosy, czy pojazd się przechyla, czy może czuje Pan miękkość na nierównościach? To pomoże naszemu mechanikowi przygotować się lepiej.
  <sub>2026-08-04, wystąpień: 1</sub>

- **Dane pojazdu (marka, model, numer rejestracyjny) powinny być zebrane PRZED zaproponowaniem konkretnych godzin**
  → Po usłyszeniu 'wymiana oleju' → 'Dziękuję. Jaki marka i model samochodu?' → dopiero wtedy godziny
  <sub>2026-08-05, wystąpień: 1</sub>

- **Gdy klient mówi o preferencji czasowej, agent powinien potwierdzić dokładnie to, co usłyszał**
  → Klient: 'chciałbym na piątek' → Agent: 'Rozumiem, chciałby Pan piątek. Piątek siódmy sierpnia — jaka godzina będzie wygodna?' (zamiast od razu proponować czwartek)
  <sub>2026-08-05, wystąpień: 1</sub>

- **Gdy klient już wyjaśnił swój problem**
  → Nie powtarzać pytania 'W czym mogę pomóc?' — przejść bezpośrednio do zbierania danych (imię, pojazd, dostępność)
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po ustaleniu typu usługi (przegląd zawieszenia)**
  → Żeby przygotować się do Twojej wizyty — czy zauważyłeś konkretny problem, np. hałas, sztywność, czy to ogólna kontrola?
  <sub>2026-08-05, wystąpień: 1</sub>

- **Na początku rozmowy, zaraz po powitaniu**
  → Potwierdzić dokładnie, co klient chce: 'Rozumiem, że chciałby Pan nabicia klimatyzacji — czy to uzupełnienie czynnika, czy pełny serwis?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Gdy klient mówi coś niejasnego lub sprzecznego z naszymi założeniami**
  → Zamiast domyślać się, zapytaj: 'Rozumiem, że chciałby Pan sprawdzić auto — czy chodzi o to, że się nie uruchamia, czy o inny problem?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po potwierdzeniu terminu i danych pojazdu**
  → Panie [imię], aby przygotować się do Pana wizyty — czy mogę potwierdzić numer telefonu? Oraz czy to Lexus CT benzynowy czy hybrydowy? To pomoże nam przygotować odpowiednie narzędzia.
  <sub>2026-08-06, wystąpień: 1</sub>

- **Gdy klient podaje dane pojazdu**
  → Potwierdzić każdy element: 'Czyli Toyota Corolla, biała, rejestracja [nr rejestracyjny] — dobrze rozumiem?' Jeśli klient mówi niejasnie ('Zalgaz', 'Nie ma'), zapytać: 'Przepraszam, czy to oznacza, że pojazd jest na gaz? Czy coś jeszcze?'
  <sub>2026-08-06, wystąpień: 1</sub>

- **Po powitaniu, zanim rozmowa się urwie**
  → Szybko zapytać: 'Jak się Pan/Pani ma? W czym mogę dzisiaj pomóc?' i słuchać aktywnie, aby zidentyfikować potrzebę
  <sub>2026-08-06, wystąpień: 1</sub>

- **Klient pyta o szczegóły techniczne, których agent nie zna (liczba filtrów)**
  → Dla Audi Q3 standardowo wymieniamy [X] filtrów. Mogę to teraz sprawdzić w systemie lub mechanik potwierdzi dokładną konfigurację przy przyjęciu — czy to będzie OK?
  <sub>2026-08-13, wystąpień: 1</sub>

- **Klient mówi 'przyszły tydzień', a agent proponuje bieżący tydzień**
  → Potwierdzić rozumienie: 'Rozumiem, przyszły tydzień — czyli od 17 do [data]. Który dzień byłby najlepszy?'
  <sub>2026-08-13, wystąpień: 1</sub>

- **Przy zbieraniu danych kontaktowych do rezerwacji**
  → Po imieniu i marce auta poprosić: 'Poproszę również numer telefonu do potwierdzenia rezerwacji'
  <sub>2026-08-13, wystąpień: 1</sub>

- **Gdy klient wymienia wiele usług, zwłaszcza jeśli mówi niejasno lub szybko**
  → Powtórzyć każdy element: 'Rozumiem — wymiana oleju, wymiana filtrów i... przepraszam, czy chodzi Panu o płyn hamulcowy czy coś innego?'. Potwierdzić każdy punkt osobno.
  <sub>2026-08-14, wystąpień: 1</sub>

- **Gdy klient mówi niejasno lub używa słów nieznanych (np. 'wypadł samochodowy')**
  → Natychmiast wyjaśnij: 'Rozumiem, że wypadł element samochodu — czy chodzi o maskę silnika, czy o inną część?'
  <sub>2026-08-14, wystąpień: 1</sub>

- **Gdy klient mówi niejasno lub zmienia temat**
  → Potwierdzić zrozumienie: 'Rozumiem, chodzi Panu o napełnianie klimatyzacji, a nie wymianę opon — dobrze?'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient opisuje problem samochodowy**
  → Powtórz problem własnymi słowami, aby potwierdzić zrozumienie: 'Rozumiem — hamulce piszczeć i hukają. Czy to wszystkie objawy, czy jest coś jeszcze?'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient nie zna marki/modelu samochodu**
  → Nie ma problemu — mechanik sprawdzi przy przyjęciu. Wystarczy numer rejestracyjny, który już mamy.
  <sub>2026-08-15, wystąpień: 1</sub>

- **Brakuje numeru telefonu klienta**
  → Poproszę jeszcze numer telefonu do kontaktu — będziemy mogli potwierdzić wizytę SMS-em.
  <sub>2026-08-15, wystąpień: 1</sub>


## scheduling

- **Umówienie terminu w przyszłym tygodniu**
  → Przy terminie w przyszłym tygodniu podaj dzień tygodnia RAZEM z datą dzienną, jeden raz, przy potwierdzaniu. Nie powtarzaj daty w kolejnych turach.
  <sub>2026-06-14, wystąpień: 1</sub>

- **Klient mówi 'jutro' bez konkretnej godziny**
  → Zaproponuj 2-3 opcje godzin zamiast jednej. Godziny bierz WYŁĄCZNIE z wyniku check_availability dla dnia, o który prosi klient — nigdy z pamięci ani z przykładu.
  <sub>2026-07-10, wystąpień: 1</sub>

- **Po otrzymaniu numeru telefonu**
  → Powtórzyć numer głośno: 'Panie [imię], potwierdzam: [numer telefonu] — zgadza się?'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Po zarezerwowaniu terminu, przed podsumowaniem**
  → Powtórzyć wszystkie usługi, które klient chce wykonać: 'Podsumowując: wymiana oleju i sprawdzenie ogólne BMW X5, jutro o [godzina]'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Po potwierdzeniu danych kontaktowych**
  → Powtórzę dla pewności — numer [numer telefonu], zgadza się?
  <sub>2026-08-04, wystąpień: 1</sub>

- **Po potwierdzeniu terminu rezerwacji**
  → Potwierdzam — czwartek szóstego o [godzina]. Czy zna Pan naszą lokalizację? Mogę podać adres warsztatu i instrukcje dojazdu.
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy klient zaproponuje godzinę niedostępną**
  → Jasno potwierdzić niedostępność, zaproponować alternatywy, a następnie czekać na wybór klienta — nie akceptować godziny spoza listy
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po potwierdzeniu terminu**
  → Zbierać numer telefonu: 'Poproszę numer telefonu, aby wysłać potwierdzenie i ewentualnie skontaktować się w razie pytań'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Przed zaproponowaniem konkretnej godziny**
  → Zapytać o preferencje: 'Kiedy byłoby dla Pana najwygodniej — rano, czy może po południu?' zamiast od razu proponować [godzina]
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po potwierdzeniu wizyty**
  → Agent powinien dodać: 'Przypominamy, że wizyta jest jutro o [godzina]. Proszę przyjechać 10 minut wcześniej. Czy ma Pan jakieś pytania?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Po otrzymaniu numeru telefonu od klienta**
  → Powtórzyć numer głośno: 'Czyli [numer telefonu] — dobrze?'
  <sub>2026-08-05, wystąpień: 1</sub>

- **Przed potwierdzeniem rezerwacji SMS-em**
  → Zawsze pobrać numer telefonu: 'Poproszę numer telefonu, na który wyślemy potwierdzenie'
  <sub>2026-08-06, wystąpień: 1</sub>

- **Gdy klient podaje datę, która wydaje się błędna**
  → Zamiast kwestionować: 'Dziękuję. Czy chodzi o [data] przyszłego roku? Mogę zarezerwować ten termin' — potwierdzić uprzejmie, nie stawiając klienta w niezręcznej sytuacji
  <sub>2026-08-06, wystąpień: 1</sub>

- **Gdy klient podaje wiele opcji czasowych**
  → Powtórz dokładnie wybraną datę i godzinę z pełnym kontekstem: 'Potwierdzam: wtorek, [data] o [godzina] — czy to jest poprawnie?'
  <sub>2026-08-14, wystąpień: 1</sub>

- **Po potwierdzeniu daty i godziny**
  → Zawsze pobrać numer telefonu: 'Poproszę jeszcze numer telefonu, żeby wysłać potwierdzenie SMS-em'
  <sub>2026-08-15, wystąpień: 1</sub>

- **Potwierdzanie daty i godziny**
  → Poniedziałek siedemnastego czy środę dziewiętnastego? [czeka na odpowiedź] Dobrze, środę dziewiętnastego o [godzina].
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient wybiera godzinę, a agent proponuje inną**
  → Powtórz dokładnie wybraną godzinę: 'Rozumiem, siedemnastego o [godzina] — czy dobrze słyszę?' Jeśli klient potwierdzi, nie zmieniaj godziny bez jego zgody.
  <sub>2026-08-15, wystąpień: 1</sub>


## style

- **Podczas zbierania danych kontaktowych**
  → Zawsze pobrać numer telefonu klienta: 'Dziękuję. Poproszę jeszcze numer telefonu, na który wyślemy potwierdzenie SMS-em'
  <sub>2026-08-05, wystąpień: 2</sub>

- **Gdy klient wykazuje znaki niecierpliwości (mówi szybko, powtarza już podane informacje)**
  → Zmień tempo — przyspieszaj, potwierdzaj zwięźle, unikaj dodatkowych pytań. Użyj: 'Rozumiem, zapisuję Pana teraz' zamiast zadawania nowych pytań.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Potwierdzanie danych (numer telefonu, rejestracja)**
  → Czytaj dane naturalnie, grupami, bez rozbijania na pojedyncze cyfry — chyba że klient wyraźnie o to prosi.
  <sub>2026-07-21, wystąpień: 1</sub>

- **Gdy klient mówi niejasno lub słychać szumy**
  → Przepraszam, nie dosłyszałem ostatnią cyfrę — czy to była [cyfra]? Mogę powtórzyć cały numer dla pewności?
  <sub>2026-08-04, wystąpień: 1</sub>

- **Podczas zbierania danych**
  → Powtarzać każdą informację na głos: '[numer telefonu] — to numer [numer telefonu], dobrze?'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy agent musi poprosić o powtórzenie informacji**
  → Wyjaśnić przyczynę: 'Przepraszam, linia się zacinęła — czy mogę prosić o numer telefonu jeszcze raz?'
  <sub>2026-08-04, wystąpień: 1</sub>

- **Gdy agent czeka na informacje lub sprawdza dostępność**
  → Użyć 'Sprawdzam' lub 'Moment' maksymalnie raz na rozmowę; unikać powtórzeń tego samego zwrotu
  <sub>2026-08-05, wystąpień: 1</sub>

- **Agent nie rozumie lub nie może spełnić żądania klienta**
  → Wyjaśnić sytuację wprost, zaproponować konkretne alternatywy, nie zostawiać klienta w niepewności
  <sub>2026-08-06, wystąpień: 1</sub>

- **Gdy klient mówi niejasno lub niedokończy zdanie**
  → Nie ignorować — zapytać: 'Przepraszam, czy mogę Pana o coś zapytać?' lub 'Czy chciał Pan coś jeszcze dodać?'
  <sub>2026-08-06, wystąpień: 1</sub>

- **Podczas całej rozmowy**
  → Używać bardziej naturalnego, mniej formalnego tonu — zamiast 'Mogę zaproponować' lepiej 'Moglibyśmy umówić Pana na diagnostykę' lub 'Zapraszamy do nas na szybką diagnostykę'
  <sub>2026-08-06, wystąpień: 1</sub>

- **Komunikacja z klientem mówiącym innym językiem**
  → Zachować profesjonalizm i pewność siebie; nie przesadnie upraszczać, ale być jasnym i konkretnym
  <sub>2026-08-06, wystąpień: 1</sub>

- **Agent mówi 'Dobrze...' po potwierdzeniu rezerwacji**
  → Pominąć zbędne słowa; przejść bezpośrednio do: 'Potwierdzenie przyjdzie SMS-em. Do zobaczenia w poniedziałek!'
  <sub>2026-08-13, wystąpień: 1</sub>

- **Klient nie zrozumiał słowa/zwrotu agenta**
  → Przepraszam — które słowo było niejasne? Powtórzę inaczej.
  <sub>2026-08-13, wystąpień: 1</sub>

- **Gdy klient mówi niejasnie lub używa nieznanych terminów**
  → Nie zakładać — zawsze spytać: 'Przepraszam, czy chodzi Panu o...?' zamiast potwierdzać ogólnie.
  <sub>2026-08-14, wystąpień: 1</sub>

- **Gdy klient prosi o powtórzenie informacji**
  → Szybko potwierdź ustnie: 'Oczywiście — numer rejestracyjny to VZ 663 CN' zamiast odsyłać do SMS-a
  <sub>2026-08-14, wystąpień: 1</sub>

- **Rozmowa toczy się w jednym języku obcym**
  → Utrzymuj spójność językową do końca rozmowy — nie przełączaj się na inny język w ostatnim zdaniu
  <sub>2026-08-15, wystąpień: 1</sub>

- **Błędy gramatyczne w polszczyźnie**
  → Użyć 'Proszę' zamiast 'Poproszę', 'Mogę pomóc' zamiast 'W czym mogę pomóc?' na początek
  <sub>2026-08-15, wystąpień: 1</sub>

- **Gdy klient powtarza obawy lub niezadowolenie**
  → Nie powtarzać tej samej odpowiedzi — zmienić podejście, zaproponować alternatywę lub wykazać zrozumienie: 'Słyszę Pani obawy. Zróbmy to tak: [nowe rozwiązanie]'
  <sub>2026-08-15, wystąpień: 1</sub>

