import type { KrokTrasy } from '@/components/onboarding/GuidedTour';

/**
 * Wprowadzenie: pierwsze zlecenie od zera do usunięcia.
 *
 * Kolejność nie jest wymyślona — to jest droga, którą warsztat opisał własnymi
 * słowami i którą przechodzi przy każdym prawdziwym kliencie:
 *
 *   nowe zlecenie → dane auta (jeśli auta nie ma, dodajemy je po numerze i
 *   dopisujemy właściciela) → opis, czyli lista zadań → SMS „zlecenie przyjęte"
 *   → zlecenie pojawia się na liście → wchodzimy w nie i otwiera się karta usług
 *   → pozycje po kolei → Rido Wycena → wysyłamy kosztorys → klient akceptuje,
 *   zapala się na zielono, czyli można naprawiać → po naprawie „Gotowe do
 *   odbioru" i SMS do klienta → klient odbiera auto → zaznaczamy zlecenie i
 *   wystawiamy potwierdzenie wykonania albo fakturę → status „Zakończone" →
 *   zlecenie trafia do zakładki „Zakończone". Koniec.
 *
 * Zasada, na której to stoi: warsztat przechodzi CAŁĄ drogę na własnym aucie
 * i własnym numerze telefonu, żeby zobaczyć to, co zobaczy jego klient. SMS-y
 * wychodzą naprawdę — tyle że na numer właściciela — a zlecenie z tego przejścia
 * kasuje się na końcu i to też pokazujemy.
 *
 * Kroków jest sporo, ale człowiek nie klika ich po kolei: to EKRAN decyduje,
 * który krok pokazać (patrz wyborKroku.ts). Ta lista jest słownikiem miejsc,
 * nie pokazem slajdów.
 */
export const TRASA_PIERWSZE_ZLECENIE: KrokTrasy[] = [
  {
    cel: 'nowe-zlecenie',
    // Powitanie znikalo, zanim dalo sie je przeczytac — ekran zmienia sie w
    // ulamku sekundy po kliknieciu. Ten krok ma stac, dopoki nie zostanie
    // przeczytany, bo to on tlumaczy, po co wpisywac SWOJE dane.
    czasNaPrzeczytanie: 20000,
    tytul: 'Zacznijmy od pierwszego zlecenia',
    tresc: 'Przejdziemy razem całą drogę: przyjęcie auta, wycena, kosztorys do akceptacji, odbiór, faktura i zamknięcie.\n\nWAŻNE: wpisuj po drodze SWOJE dane — swoje imię i swój numer telefonu. SMS-y z tego zlecenia pójdą wtedy do Ciebie i zobaczysz dokładnie to, co zobaczy klient. To zlecenie próbne, na końcu je skasujemy.',
    akcja: 'Przeczytaj i kliknij „Dalej", a potem „Nowe zlecenie"',
    // Bez `czekaNaKlikniecie`: pierwsza podpowiedź ma być PRZECZYTANA. Kliknięcie
    // w przycisk i tak przenosi dalej, ale kto czyta wolniej, ma przycisk „Dalej"
    // i nie zostaje z wrażeniem, że coś mignęło.
  },
  {
    cel: 'pole-rejestracji',
    tytul: 'Krok 1 — jakie to auto',
    tresc: 'Wpisz PRAWDZIWY numer rejestracyjny auta — najlepiej własnego.\n\nTo nie jest formalność: po numerze pobieramy markę, model, rocznik, pojemność i VIN, a bez tych danych Rido Wycena nie ma czego wyceniać. Zmyślony numer zablokuje Ci pół drogi.\n\nJeśli auto jest już w kartotece, wybierz je z listy. Jeśli go tam nie ma, naciśnij Enter albo „Utwórz nowy pojazd".',
    akcja: 'Sprawdzenie numeru w tym wprowadzeniu nie schodzi z Twojego limitu',
  },
  {
    cel: 'pojazd-wlasciciel',
    tytul: 'Najpierw właściciel auta',
    tresc: 'Auto zawsze ma właściciela — bez niego nie ma komu wysłać SMS-a ani wystawić faktury.\n\nWyszukaj go na liście, a jeśli go tam nie ma, kliknij „Dodaj właściciela" po prawej stronie tej sekcji.',
    akcja: 'Na czas nauki wpisz siebie i swój numer',
  },
  {
    cel: 'klient-imie-nazwisko',
    tytul: 'Dane właściciela',
    tresc: 'Na czas nauki wpisz TU SIEBIE: swoje imię i nazwisko. Dzięki temu wszystkie wiadomości z tego zlecenia przyjdą do Ciebie i zobaczysz je oczami klienta.\n\n„Osoba prywatna" albo „Firma" — przy firmie dojdzie NIP i pobierzemy dane z GUS.',
    // Po wpisaniu imienia ramka schodzi sama na pole telefonu — w środku jednego
    // formularza nie ma po co klikać „Dalej".
    przejdzGdyWypelnione: true,
  },
  {
    cel: 'klient-telefon',
    // Po wpisaniu numeru ramka pokazuje przycisk zapisu — inaczej instrukcja
    // mowi „potem Zapisz", a nie widac ktory to przycisk.
    przejdzGdyWypelnione: true,
    tytul: 'Telefon — najważniejsze pole',
    tresc: 'Wpisz TU SWÓJ numer telefonu — ten, który masz przy sobie.\n\nNa niego pójdzie potwierdzenie przyjęcia, kosztorys do akceptacji i wiadomość, że auto jest gotowe. Przejdziesz całą drogę i zobaczysz każdą wiadomość tak, jak zobaczy ją klient. Potem „Zapisz".',
  },
  {
    cel: 'klient-zapisz',
    tytul: 'Zapisz właściciela',
    tresc: 'Kliknij „Zapisz" — właściciel trafi do kartoteki i od razu podepnie się do auta.',
    akcja: 'Kliknij „Zapisz"',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'pojazd-rejestracja',
    tytul: 'Numer i lupka',
    tresc: 'Właściciel jest już wybrany, więc teraz auto: wpisz numer rejestracyjny i kliknij lupkę obok pola.\n\nMarka, model, rocznik, pojemność, moc i VIN pobiorą się same — nie trzeba wpisywać ich ręcznie.',
    akcja: 'Kliknij lupkę przy numerze — to sprawdzenie nie schodzi z Twojego limitu',
  },
  {
    cel: 'pobrane-dane',
    // Pola stoja puste od otwarcia okna — mowimy o nich dopiero wtedy, gdy
    // wypelni je odpowiedz z rejestru.
    pokazGdyWypelniony: true,
    // Razem z polami swieci przycisk zapisu — zeby nie trzeba bylo szukac, czym
    // to zatwierdzic.
    celeDodatkowe: ['pojazd-zapisz'],
    tytul: 'To przyszło z rejestru',
    tresc: 'Podświetlone pola wypełniły się same — tyle, ile rejestr wie o tym aucie: marka, model, rocznik, pojemność, VIN.\n\nCzego nie podał (kolor, nadwozie, czasem paliwo albo moc), dopisujesz ręcznie — zapisujemy dokładnie to, co tu widzisz. Na dole tego okna czeka „Zapisz".',
    akcja: 'Uzupełnij, czego brakuje, i kliknij „Zapisz"',
  },
  {
    cel: 'pojazd-zapisz',
    tytul: 'Zapisz pojazd',
    tresc: 'Auto trafi do Twojej kartoteki — przy następnej wizycie wystarczy wpisać numer, żeby je znaleźć.',
    akcja: 'Kliknij „Zapisz"',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'pole-klienta',
    tytul: 'Klient zlecenia',
    tresc: 'Właściciel auta wpisuje się tu sam. Możesz go zmienić, jeśli autem przyjechał kto inny — na przykład firma leasingowa albo pracownik.',
    // Gdy klient jest już wybrany, nie ma tu nic do wpisania — ramka schodzi
    // od razu na listę zadań, bo to ona blokuje zapis zlecenia.
    przejdzGdyWypelnione: true,
  },
  {
    cel: 'pole-opisu',
    celeDodatkowe: ['dodaj-pozycje'],
    tytul: 'Krok 2 — opisz zlecenie',
    tresc: 'BEZ TEGO ZLECENIE SIĘ NIE ZAPISZE — pole jest obowiązkowe (gwiazdka przy nazwie).\n\nWpisz w punktach, z czym przyjechał klient i co trzeba przy okazji sprawdzić. Każdy punkt to osobna pozycja: mechanik odhacza ją w swojej karcie, a Ty wyceniasz ją w kosztorysie. „Dodaj pozycję" albo Enter dokłada kolejną.\n\nNa próbę wpisz dwie, na przykład:\n1. Wymiana klocków hamulcowych przód\n2. Wymiana wahacza przedniego prawego\n\nGdy skończysz, przycisk „Dalej" zacznie migać.',
  },
  {
    cel: 'uszkodzenia-i-zdjecia',
    celeDodatkowe: ['protokol-przyjecia'],
    tytul: 'Stan auta przy przyjęciu',
    tresc: 'Tu opisujesz rysy, wgniecenia i braki, a niżej dodajesz zdjęcia auta, które właśnie przyjmujesz — sześć stron, także wnętrze.\n\nNiżej, w „Protokole przyjęcia", zaznaczasz ustalenia z klientem: czy oddajecie stare części, czy zostawił dowód rejestracyjny, czy zgadza się na jazdę próbną, czy uzupełniać płyny i oświetlenie.\n\nTo nie jest formalność: zdjęcie z przyjęcia kończy większość sporów o to, „czy ta rysa była wcześniej". Wszystko wchodzi do protokołu, który podpisuje klient.',
    akcja: 'Na próbę możesz pominąć — przy prawdziwym aucie warto zrobić',
  },
  {
    cel: 'zapisz-zlecenie',
    tytul: 'Zapisz zlecenie',
    tresc: 'Przycisk jest na samym dole okna — przewiń, jeśli go nie widzisz.\n\nZlecenie trafi na listę aktywnych i do Terminarza, a zaraz po zapisie wyskoczy okno z pytaniem, czy wysłać klientowi potwierdzenie przyjęcia.',
    akcja: 'Kliknij, żeby zapisać',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'sms-po-utworzeniu',
    tytul: 'Krok 3 — daj znać klientowi',
    tresc: 'Zlecenie jest założone. Od razu możesz wysłać potwierdzenie przyjęcia — SMS-em albo mailem. Klient dostaje link do swojej strony, na której widzi, co się dzieje z autem.\n\nUWAGA: numer podpowiada się z kartoteki klienta i SMS NAPRAWDĘ tam pójdzie. Przy tym zleceniu próbnym upewnij się, że stoi tam TWÓJ numer — inaczej wiadomość dostanie ktoś obcy.',
    akcja: 'Sprawdź numer i wyślij — zobaczysz to, co zobaczy klient',
  },
  {
    cel: 'wiersz-zlecenia',
    tytul: 'Zlecenie jest na liście',
    tresc: 'Tak wygląda zlecenie na liście: numer, status, kwota, auto, klient i terminy.\n\nNaciśnij na zlecenie, żeby je otworzyć — w karcie zlecenia wyceniasz pracę i rozmawiasz z klientem.',
    akcja: 'Naciśnij na zlecenie, by je otworzyć',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'ikony-wiadomosci',
    tytul: 'Pasek rozmowy z klientem',
    tresc: 'Te ikony to cała korespondencja ze zleceniem: protokół przyjęcia, kosztorys, powiadomienie o gotowym aucie, wiadomości i link dla klienta.\n\nKolor mówi, co się dzieje — jednym rzutem oka, bez otwierania:\n\n• SZARY — jeszcze nie ma czego wysłać,\n• CZERWONY MIGAJĄCY — jest co wysłać i nikt tego nie wysłał,\n• ŻÓŁTY — wysłane, czekamy na klienta,\n• ZIELONY — klient podpisał albo zaakceptował.\n\nNajedź na ikonę, a podpowie, co dokładnie zrobić.',
  },
  {
    cel: 'tabela-robocizny',
    tytul: 'Krok 4 — wpisz pozycje po kolei',
    tresc: 'Tu wpisujesz robociznę — dowolną pozycję, którą wykonujesz przy tym aucie. Na przykład:\n\n• Wymiana klocków hamulcowych przód\n• Wymiana wahacza przedniego prawego\n• Wymiana sprężyn przód\n\nPrzy każdej podajesz cenę. Kolejny pusty wiersz dokłada się sam, a Enter przenosi niżej. Jeśli coś robisz w cenie, wpisz 0 — klient zobaczy wtedy „0 zł" zamiast pustego miejsca.\n\nPozycja bez ceny czeka w kolejce: klient jej nie widzi, dopóki jej nie wycenisz.',
  },
  {
    cel: 'rido-wycena',
    tytul: 'Nie wiesz, ile wziąć? Rido Wycena',
    tresc: 'Masz już wpisane pozycje, więc zobaczmy, jak działa wycena.\n\nKliknij „Rido Wycena" — policzymy widełki na podstawie Twoich wcześniejszych zleceń i wycen z portalu dla tego modelu auta, a na końcu sprawdzimy je jeszcze AI dla Twojej okolicy.',
    akcja: 'Kliknij „Rido Wycena" — zobaczysz, skąd biorą się kwoty',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'rido-okno',
    tytul: 'Widełki OD–DO',
    tresc: 'Dla każdej pozycji dostajesz zakres: od ilu do ilu biorą za to warsztaty przy tym modelu auta. Widać też, na ilu wycenach to policzono — jedna cena to jeszcze nie rynek.\n\nMożesz przyjąć propozycję jednym kliknięciem albo wpisać swoją stawkę. Nic nie dzieje się bez Twojej zgody: to podpowiedź, nie cennik narzucony z góry.',
    akcja: 'Przyjmij wycenę albo zamknij okno i wpisz swoje ceny',
  },
  {
    cel: 'tabela-czesci',
    tytul: 'Części i materiały',
    tresc: 'Części wpisujesz ręcznie, bierzesz z magazynu albo szukasz u hurtowni przyciskiem „Znajdź części z Rido".',
  },
  {
    cel: 'kolumna-koszt',
    tytul: 'Koszt — ile Ty płacisz',
    tresc: 'W tej kolumnie wpisujesz cenę ZAKUPU części: tyle, ile płacisz w hurtowni.\n\nKlient tej kwoty nie widzi. Służy do policzenia, ile na zleceniu zarabiasz.',
  },
  {
    cel: 'kolumna-cena',
    tytul: 'Cena — ile płaci klient',
    tresc: 'A tu cena SPRZEDAŻY — ta trafia na kosztorys i fakturę.\n\nRóżnica między ceną a kosztem to Twoja marża na częściach.',
  },
  {
    cel: 'podsumowanie-zlecenia',
    tytul: 'Ile na tym zarabiasz',
    tresc: 'Podsumowanie liczy się samo: przychód z robocizny i części, koszt części, a na końcu zysk.\n\nDlatego warto wpisywać koszt zakupu — bez niego zysk będzie zawyżony.',
  },
  {
    cel: 'przycisk-przyjecie',
    tytul: 'Protokół przyjęcia do podpisu',
    tresc: 'Pierwsza z trzech ikon rozmowy z klientem. Klient podpisuje, w jakim stanie zostawił auto — to Twoje zabezpieczenie przy sporze o rysę czy brakującą kołpak.\n\nIkona miga na czerwono, kiedy jest co wysłać, świeci żółto po wysłaniu i zielono, gdy klient podpisze.',
  },
  {
    cel: 'przycisk-kosztorys',
    tytul: 'Krok 5 — wyślij kosztorys',
    tresc: 'Wyceniłeś pozycje, więc czas na akceptację. Kliknij tę ikonę — klient dostanie SMS z linkiem do kosztorysu.',
    akcja: 'Kliknij ikonę kosztorysu',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'sms-quote',
    tytul: 'Treść jest już gotowa',
    tresc: 'Wiadomość układa się sama: numer zlecenia i link do kosztorysu. Możesz ją zmienić — licznik pod spodem pokazuje, ile SMS-ów pójdzie.\n\nSprawdź numer i wyślij. Otwórz link na swoim telefonie i kliknij „Akceptuję" — zobaczysz obie strony naraz.',
    akcja: 'Wyślij do siebie i zaakceptuj na telefonie',
  },
  {
    cel: 'status-zlecenia',
    tytul: 'Zielone znaczy: można naprawiać',
    tresc: 'Po akceptacji status zmienia się sam na „Zaakceptowane", a ikona kosztorysu świeci na zielono. Masz zgodę klienta na kwotę i zakres — możesz brać auto na podnośnik.\n\nGdy zmienisz wycenę po akceptacji, ikona znów zamiga na czerwono: klient zgodził się na inną kwotę niż ta, którą masz teraz.\n\nPo skończonej naprawie ustaw tu status „Gotowe do odbioru".',
  },
  {
    cel: 'przycisk-odbior',
    tytul: 'Krok 6 — auto gotowe',
    tresc: 'Naprawa skończona, więc powiadom klienta, że może przyjechać po auto.',
    akcja: 'Kliknij ikonę odbioru',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'sms-ready',
    tytul: 'SMS o gotowym aucie',
    tresc: 'Wiadomość mówi, że pojazd jest gotowy do odbioru, i daje link ze szczegółami.\n\nTo ostatni SMS w tym zleceniu — dalej zostaje już tylko rozliczenie.',
  },
  {
    cel: 'zaznacz-zlecenie',
    celeDodatkowe: ['dokumenty-zlecenia'],
    tytul: 'Krok 7 — klient odbiera auto',
    tresc: 'Wróć na listę zleceń — strzałka „← Zlecenia" u góry karty.\n\nNajpierw ZAZNACZ zlecenie na liście (kółko po lewej), dopiero potem kliknij „Wystaw".\n\nBez zaznaczenia system nie wie, do czego wystawić dokument — dlatego podświetlamy oba miejsca naraz.',
  },
  {
    cel: 'wystaw-dokumenty',
    // Menu istnieje tylko wtedy, gdy jest otwarte.
    pokazGdySieZjawi: true,
    tytul: 'Potwierdzenie, paragon albo faktura',
    tresc: 'Do wyboru: potwierdzenie wykonania usługi (podsumowanie zlecenia dla klienta), paragon fiskalny — jeśli masz podpiętą drukarkę — albo faktura.\n\nPozycje i kwoty przepisują się z kosztorysu, nie wpisujesz ich drugi raz.',
  },
  {
    cel: 'status-na-liscie',
    tytul: 'Krok 8 — zamknij zlecenie',
    tresc: 'Rozliczone, więc ustaw status „Zakończone". Kliknij status przy zleceniu i wybierz go z listy.\n\nOd tej chwili zlecenie liczy się do przychodu i znika z listy aktywnych.',
  },
  {
    cel: 'filtr-zakonczone',
    tytul: 'Tu trafiają zamknięte naprawy',
    tresc: 'Zakładka „Zakończone zlecenia" to Twoje archiwum: co zrobione, za ile i czy zapłacone.\n\nKolumna „Płatność" pokazuje, czy pieniądze wpłynęły — „Nieopłacone" na czerwono to zlecenie do przypilnowania.',
  },
  {
    cel: 'usun-zlecenie',
    tytul: 'To był tylko trening — skasuj go',
    tresc: 'Zaznacz zlecenie próbne i kliknij „Usuń". Razem z nim znika wszystko, co do niego należało: pozycje, podpisy, wystawiony dokument i historia SMS-ów.\n\nTo cała droga: auto, klient, opis, wycena, kosztorys, odbiór, dokument, zamknięcie. Przy prawdziwym kliencie wygląda dokładnie tak samo.',
  },
];
