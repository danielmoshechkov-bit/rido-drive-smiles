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
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    // Powitanie NIE ZNIKA samo — zaden zegar tego nie uratowal, bo ekran
    // zmienia sie szybciej, niz da sie przeczytac. Stoi, dopoki czlowiek nie
    // kliknie „Dalej"; to jedyny pewny sygnal, ze przeczytal.
    czekajNaDalej: true,
    tytul: 'Zacznijmy od pierwszego zlecenia',
    tresc: 'Przejdziemy razem całą drogę: przyjęcie auta, wycena, kosztorys do akceptacji, odbiór, faktura i zamknięcie.\n\nWAŻNE: wpisuj po drodze SWOJE dane — swoje imię i swój numer telefonu. SMS-y z tego zlecenia pójdą wtedy do Ciebie i zobaczysz dokładnie to, co zobaczy klient. To zlecenie próbne, na końcu je skasujemy.',
    akcja: 'Przeczytaj i NACIŚNIJ „Dalej" (mruga) — otworzę okno nowego zlecenia za Ciebie. Ta podpowiedź nie zniknie sama.',
    // Bez `czekaNaKlikniecie`: pierwsza podpowiedź ma być PRZECZYTANA. Kliknięcie
    // w przycisk i tak przenosi dalej, ale kto czyta wolniej, ma przycisk „Dalej"
    // i nie zostaje z wrażeniem, że coś mignęło.
  },
  {
    cel: 'pole-rejestracji',
    // „Dalej" wpisuje numer auta pokazowego — jego dane mamy zapisane na stałe,
    // więc nie trzeba czekać na rejestr ani zużywać sprawdzenia.
    przykladoweWpisy: ['WW140TV'],
    // ...i od razu otwiera okno zakładania auta, bo to jest czynność tego kroku.
    dalejKlikaCel: 'utworz-pojazd',
    tytul: 'Krok 1 — jakie to auto',
    tresc: 'Kliknij „Dalej", a wpiszę numer auta pokazowego (WW140TV) — jego dane mam zapisane, więc pojawią się od razu.\n\nMożesz też wpisać PRAWDZIWY numer własnego auta: wtedy markę, model, rocznik, pojemność i VIN pobierzemy z rejestru. Zmyślony numer nic nie zwróci — po prostu uzupełnisz dane ręcznie.\n\nJeśli auta nie ma w kartotece, naciśnij Enter albo „Utwórz nowy pojazd".',
    akcja: 'Kliknij „Dalej" — wpiszę numer i otworzę okno zakładania auta',
  },
  {
    cel: 'pojazd-wlasciciel',
    celeDodatkowe: ['dodaj-wlasciciela'],
    dalejKlikaCel: 'dodaj-wlasciciela',
    tytul: 'Najpierw właściciel auta',
    tresc: 'Auto zawsze ma właściciela — bez niego nie ma komu wysłać SMS-a ani wystawić faktury.\n\nWyszukaj go na liście, a jeśli go tam nie ma, kliknij „Dodaj właściciela" po prawej stronie tej sekcji.',
    akcja: 'Kliknij „Dalej" — otworzę okno dodawania właściciela',
  },
  {
    cel: 'klient-imie-nazwisko',
    przykladoweWpisy: ['Jan', 'Nowak'],
    tytul: 'Dane właściciela',
    tresc: 'Na czas nauki wpisz TU SIEBIE: swoje imię i nazwisko. Dzięki temu wszystkie wiadomości z tego zlecenia przyjdą do Ciebie i zobaczysz je oczami klienta.\n\n„Osoba prywatna" albo „Firma" — przy firmie dojdzie NIP i pobierzemy dane z GUS.',
    // Po wpisaniu imienia ramka schodzi sama na pole telefonu — w środku jednego
    // formularza nie ma po co klikać „Dalej".
    przejdzGdyWypelnione: true,
  },
  {
    cel: 'klient-telefon',
    // Tego jednego pola NIE wypełniamy za człowieka: SMS-y z przejścia pójdą
    // NAPRAWDĘ, więc numer musi być świadomie wpisany przez warsztat.
    wymagane: 'Wpisz swój numer telefonu — to na niego przyjdą SMS-y z tego zlecenia. Bez niego nie ruszymy dalej.',
    // Po wpisaniu numeru ramka pokazuje przycisk zapisu — inaczej instrukcja
    // mowi „potem Zapisz", a nie widac ktory to przycisk.
    przejdzGdyWypelnione: true,
    tytul: 'Telefon — najważniejsze pole',
    tresc: 'Wpisz TU SWÓJ numer telefonu — ten, który masz przy sobie. To jedyne pole, którego nie wypełnię za Ciebie.\n\nNa ten numer pójdzie potwierdzenie przyjęcia, kosztorys do akceptacji i wiadomość, że auto jest gotowe. Przejdziesz całą drogę i zobaczysz każdą wiadomość tak, jak zobaczy ją klient.',
  },
  {
    cel: 'klient-zapisz',
    dalejKlika: true,
    tytul: 'Zapisz właściciela',
    tresc: 'Kliknij „Zapisz" — właściciel trafi do kartoteki i od razu podepnie się do auta.',
    akcja: 'Kliknij „Zapisz"',
  },
  {
    cel: 'pojazd-rejestracja',
    przykladoweWpisy: ['WW140TV'],
    // Pole ma lupkę w środku — „Dalej" ją naciska i dane wczytują się od razu.
    dalejKlika: true,
    tytul: 'Numer i lupka',
    tresc: 'Właściciel jest już wybrany, więc teraz auto: wpisz numer rejestracyjny i kliknij lupkę obok pola.\n\nDla auta pokazowego (WW140TV) dane wczytają się natychmiast — mamy je zapisane. Dla prawdziwego numeru pobierzemy markę, model, rocznik, pojemność, moc i VIN z rejestru.',
    akcja: 'Kliknij lupkę przy numerze',
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
    dalejKlika: true,
    tytul: 'Zapisz pojazd',
    tresc: 'Auto trafi do Twojej kartoteki — przy następnej wizycie wystarczy wpisać numer, żeby je znaleźć.',
    akcja: 'Kliknij „Zapisz"',
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
    // Kto chce najpierw obejrzec cala droge, klika „Dalej" i dostaje przyklad.
    przykladoweWpisy: ['Wymiana wahaczy przednich', 'Wymiana sprężyn przednich'],
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
    dalejKlika: true,
    tytul: 'Zapisz zlecenie',
    tresc: 'Przycisk jest na samym dole okna — przewiń, jeśli go nie widzisz.\n\nZlecenie trafi na listę aktywnych i do Terminarza, a zaraz po zapisie wyskoczy okno z pytaniem, czy wysłać klientowi potwierdzenie przyjęcia.',
    akcja: 'Kliknij, żeby zapisać',
  },
  {
    cel: 'sms-po-utworzeniu',
    dalejKlika: true,
    tytul: 'Krok 3 — daj znać klientowi',
    tresc: 'Zlecenie jest założone. Od razu możesz wysłać potwierdzenie przyjęcia — SMS-em albo mailem. Klient dostaje link do swojej strony, na której widzi, co się dzieje z autem.\n\nUWAGA: numer podpowiada się z kartoteki klienta i SMS NAPRAWDĘ tam pójdzie. Przy tym zleceniu próbnym upewnij się, że stoi tam TWÓJ numer — inaczej wiadomość dostanie ktoś obcy.',
    akcja: 'Sprawdź numer i wyślij — zobaczysz to, co zobaczy klient',
  },
  {
    cel: 'wiersz-zlecenia',
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    tytul: 'Zlecenie jest na liście',
    tresc: 'Tak wygląda zlecenie na liście: numer, status, kwota, auto, klient i terminy.\n\nNaciśnij na zlecenie, żeby je otworzyć — w karcie zlecenia wyceniasz pracę i rozmawiasz z klientem.',
    akcja: 'Naciśnij na zlecenie albo „Dalej" — otworzę je za Ciebie',
  },
  {
    cel: 'ikony-wiadomosci',
    tytul: 'Pasek rozmowy z klientem',
    tresc: 'Te ikony to cała korespondencja ze zleceniem: protokół przyjęcia, kosztorys, powiadomienie o gotowym aucie, wiadomości i link dla klienta.\n\nKolor mówi, co się dzieje — jednym rzutem oka, bez otwierania:\n\n• SZARY — jeszcze nie ma czego wysłać,\n• CZERWONY MIGAJĄCY — jest co wysłać i nikt tego nie wysłał,\n• ŻÓŁTY — wysłane, czekamy na klienta,\n• ZIELONY — klient podpisał albo zaakceptował.\n\nNajedź na ikonę, a podpowie, co dokładnie zrobić.',
  },
  {
    cel: 'tabela-robocizny',
    tytul: 'Krok 4 — wpisz pozycje po kolei',
    tresc: 'To jest wycena zlecenia. Dwie pozycje robocizny są już wpisane, żeby było na czym poćwiczyć — nazwy widzisz w tabeli, ceny na razie puste („podaj cenę" na czerwono).\n\nDopisujesz tu dowolną robotę, na przykład: „Wymiana klocków hamulcowych przód", „Wymiana wahacza przedniego prawego", „Wymiana sprężyn przód". Kolejny pusty wiersz dokłada się sam, a Enter przenosi niżej.\n\nPozycja bez ceny czeka w kolejce — klient jej NIE WIDZI, dopóki jej nie wycenisz. Jeśli coś robisz w cenie, wpisz 0: wtedy klient zobaczy „0 zł" zamiast pustego miejsca.\n\nCeny nie musisz wymyślać — za chwilę zrobi to Rido Wycena.',
  },
  {
    cel: 'rido-wycena',
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    tytul: 'Nie wiesz, ile wziąć? Rido Wycena',
    tresc: 'Masz już wpisane pozycje, więc zobaczmy, jak działa wycena.\n\nKliknij „Rido Wycena" — policzymy widełki na podstawie Twoich wcześniejszych zleceń i wycen z portalu dla tego modelu auta, a na końcu sprawdzimy je jeszcze AI dla Twojej okolicy.',
    akcja: 'Kliknij „Rido Wycena" albo po prostu „Dalej" — otworzę je za Ciebie',
  },
  {
    cel: 'rido-okno',
    zamknijOkno: false,
    tytul: 'Skąd biorą się te kwoty',
    tresc: 'To jest podpowiedź do wyceny — nie cennik narzucony z góry. Liczby biorą się z trzech źródeł naraz:\n\n• z Twoich wcześniejszych zleceń na tę samą robotę,\n• z wycen innych warsztatów w portalu dla tego modelu auta,\n• z tego, co dopowie RidoAI dla Twojej okolicy (kolumna „Uwagi RidoAI").\n\nPrzy każdej pozycji masz zakres OD–DO i pole „Twoja cena" — możesz wpisać własną kwotę albo zostawić proponowaną.',
  },
  {
    cel: 'zastosuj-ceny',
    // Osobny krok: „Dalej" naprawde wciska „Zastosuj ceny do kosztorysu",
    // wiec cala droge da sie przejsc samym „Dalej".
    dalejKlika: true,
    tytul: 'Przenieś ceny do kosztorysu',
    tresc: 'Ceny z tego okna nie wchodzą do wyceny same — trzeba je zatwierdzić.\n\nTen przycisk przepisuje kwoty z kolumny „Twoja cena" prosto do pozycji zlecenia. Od tej chwili kosztorys ma kwoty i można go wysłać klientowi.\n\nJeśli wolisz policzyć sam, po prostu zamknij okno i wpisz ceny ręcznie.',
    akcja: 'Kliknij „Dalej" — przeniosę te ceny do kosztorysu',
  },
  {
    cel: 'tabela-czesci',
    tytul: 'Części i materiały',
    tresc: 'Jedna część jest już wpisana z przykładowymi kwotami: kupiona za 120 zł, sprzedana za 220 zł. Dzięki temu od razu widzisz na liczbach, jak liczy się zysk.\n\nCzęści dopisujesz ręcznie, bierzesz z magazynu albo szukasz u hurtowni przyciskiem „Znajdź części z Rido".\n\nDwie kolumny obok siebie to nie pomyłka — jedna jest Twoja, druga klienta. Za chwilę pokażę, która jest która.',
  },
  {
    cel: 'kolumna-koszt',
    tytul: 'Koszt — ile Ty płacisz',
    tresc: 'W tej kolumnie wpisujesz cenę ZAKUPU części: tyle, ile płacisz w hurtowni. W naszym przykładzie 120 zł.\n\nKlient tej kwoty NIE WIDZI — nie ma jej ani na kosztorysie, ani na fakturze. Jest wyłącznie dla Ciebie, żeby policzyć, ile na zleceniu zarabiasz.\n\nTa sama podpowiedź siedzi pod kursorem na nagłówku kolumny, więc znajdziesz ją także po wprowadzeniu.',
  },
  {
    cel: 'kolumna-cena',
    tytul: 'Cena — ile płaci klient',
    tresc: 'A tu cena SPRZEDAŻY — ta trafia na kosztorys i fakturę i tylko ją widzi klient. W przykładzie 220 zł.\n\n220 minus 120 to 100 zł Twojej marży na tej jednej części. Dokładnie tę różnicę zobaczysz za chwilę w podsumowaniu jako zysk.',
  },
  {
    cel: 'podsumowanie-zlecenia',
    tytul: 'Ile na tym zarabiasz',
    tresc: 'Podsumowanie liczy się samo: przychód z robocizny i części, koszt części, a na końcu zysk.\n\nDlatego warto wpisywać koszt zakupu — bez niego zysk będzie zawyżony.',
  },
  {
    cel: 'przycisk-przyjecie',
    celeDodatkowe: ['menu-przyjecie'],
    tytul: 'Protokół przyjęcia do podpisu',
    tresc: 'Pierwsza z trzech ikon rozmowy z klientem. Klient podpisuje, w jakim stanie zostawił auto — to Twoje zabezpieczenie przy sporze o rysę czy brakujący kołpak.\n\nZ rozwijanej listy wybierasz „Wyślij do podpisu": SMS idzie na numer wpisany w zleceniu (przy zleceniu próbnym — na Twój własny). Klient otwiera link i podpisuje palcem na telefonie.\n\nŻÓŁTA ikona znaczy: wysłane, czekamy na podpis. Gdy klient podpisze, zrobi się zielona. Nie musisz na to czekać, żeby iść dalej — kliknij „Dalej".',
  },
  {
    cel: 'przycisk-kosztorys',
    celeDodatkowe: ['menu-kosztorys'],
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    tytul: 'Krok 5 — wyślij kosztorys',
    tresc: 'Kolejność ma tu znaczenie: NAJPIERW protokół przyjęcia (poprzednia ikona) powinien świecić na ZIELONO, czyli klient go podpisał. Dopiero wtedy wysyłasz kosztorys — inaczej klient akceptuje kwotę, zanim potwierdził, w jakim stanie zostawił auto.\n\nZ rozwiniętej listy wybierz „Wyślij kosztorys". Klient dostanie SMS z linkiem, otworzy go na telefonie i kliknie „Akceptuję" — to zapala ikonę na zielono i znaczy: można brać auto na podnośnik.',
    akcja: 'Wybierz z listy „Wyślij kosztorys"',
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
    cel: 'status-na-liscie',
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    wracajNaListe: true,
    tytul: 'Krok 6 — naprawa skończona',
    tresc: 'Auto jest zrobione, więc zmieniamy jego stan. Wracamy na listę zleceń — wprowadzenie zrobi to za Ciebie.\n\nKliknij status przy zleceniu (ten kolorowy napis w kolumnie „Status") — rozwinie się lista wszystkich stanów, w jakich może być naprawa.',
    akcja: 'Kliknij status przy zleceniu albo „Dalej" — rozwinę listę',
  },
  {
    cel: 'status-gotowe',
    mrugajCel: true,
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    // Pozycja istnieje tylko wtedy, gdy lista statusow jest rozwinieta.
    pokazGdySieZjawi: true,
    tytul: 'Wybierz „Gotowe do odbioru"',
    tresc: 'Ten stan znaczy: zrobione, klient może przyjeżdżać.\n\nZaraz po jego wybraniu wyskoczy okno z gotowym SMS-em do klienta — wystarczy go wysłać.',
    akcja: 'Kliknij „Gotowe do odbioru" albo „Dalej" — ustawię ten status',
  },
  {
    cel: 'przycisk-odbior',
    dalejKlika: true,
    celeDodatkowe: ['menu-odbior'],
    tytul: 'Powiadomienie o gotowym aucie',
    tresc: 'Ta ikona w karcie zlecenia robi to samo: wysyła klientowi wiadomość, że auto czeka.\n\nJeśli SMS poszedł już przy zmianie statusu, ikona świeci na zielono i nie musisz nic robić.',
  },
  {
    cel: 'sms-ready',
    tytul: 'SMS o gotowym aucie',
    tresc: 'Wiadomość mówi, że pojazd jest gotowy do odbioru, i daje link ze szczegółami.\n\nTo ostatni SMS w tym zleceniu — dalej zostaje już tylko rozliczenie.',
  },
  {
    cel: 'zaznacz-zlecenie',
    celeDodatkowe: ['dokumenty-zlecenia'],
    wracajNaListe: true,
    tytul: 'Krok 7 — klient odbiera auto',
    tresc: 'Najpierw ZAZNACZ zlecenie na liście — to kółko po lewej stronie wiersza. Dopiero potem kliknij „Wystaw".\n\nBez zaznaczenia system nie wie, do czego wystawić dokument — dlatego podświetlamy oba miejsca naraz.',
  },
  {
    cel: 'wystaw-dokumenty',
    // Menu istnieje tylko wtedy, gdy jest otwarte.
    pokazGdySieZjawi: true,
    tytul: 'Potwierdzenie, paragon albo faktura',
    tresc: 'Do wyboru: potwierdzenie wykonania usługi (podsumowanie zlecenia dla klienta), paragon fiskalny — jeśli masz podpiętą drukarkę — albo faktura.\n\nPozycje i kwoty przepisują się z kosztorysu, nie wpisujesz ich drugi raz.',
  },
  {
    cel: 'podglad-dokumentu',
    pokazGdySieZjawi: true,
    // „Dalej" zamyka podglad — inaczej trzeba go zamknac recznie i cofnac krok.
    zamknijOkno: true,
    tytul: 'Dokument gotowy — sprawdź, pobierz, wydrukuj',
    tresc: 'Tak wygląda gotowy dokument: Twoje dane jako sprzedawcy, dane klienta, pozycje z kosztorysu, stawki VAT i kwota do zapłaty. Wszystko przepisało się z wyceny — nie wpisujesz tego drugi raz.\n\nU góry masz trzy przyciski: „Pobierz PDF" (plik do wysłania mailem albo do księgowej), „Drukuj" (wydruk dla klienta) i „Zamknij".\n\nTak samo wygląda faktura i paragon — różni się tylko nagłówek i to, co idzie do księgowości.',
    akcja: 'Obejrzyj, ewentualnie pobierz, i zamknij podgląd',
  },
  {
    cel: 'status-zakonczone',
    mrugajCel: true,
    // „Dalej” naciska to za Ciebie — patrz dalejKlika w GuidedTour.
    dalejKlika: true,
    // Pozycja istnieje tylko wtedy, gdy lista statusow jest rozwinieta.
    pokazGdySieZjawi: true,
    wracajNaListe: true,
    tytul: 'Krok 8 — zamknij zlecenie',
    tresc: 'Klient odebrał auto i zapłacił, więc ostatni krok: znów kliknij status przy zleceniu i wybierz „Zakończone".\n\nOd tej chwili zlecenie liczy się do przychodu i znika z listy aktywnych — przechodzi do zakładki „Zakończone zlecenia".',
    akcja: 'Kliknij „Zakończone" albo „Dalej" — ustawię ten status',
  },
  {
    cel: 'filtr-zakonczone',
    wracajNaListe: true,
    tytul: 'Tu trafiają zamknięte naprawy',
    tresc: 'Zakładka „Zakończone zlecenia" to Twoje archiwum: co zrobione, za ile i czy zapłacone.\n\nKolumna „Płatność" pokazuje, czy pieniądze wpłynęły — „Nieopłacone" na czerwono to zlecenie do przypilnowania.',
  },
  {
    cel: 'usun-zlecenie',
    wracajNaListe: true,
    tytul: 'To był tylko trening — skasuj go',
    tresc: 'Zaznacz zlecenie próbne i kliknij „Usuń". Razem z nim znika wszystko, co do niego należało: pozycje, podpisy, wystawiony dokument i historia SMS-ów.\n\nTo cała droga: auto, klient, opis, wycena, kosztorys, odbiór, dokument, zamknięcie. Przy prawdziwym kliencie wygląda dokładnie tak samo.',
  },
];
