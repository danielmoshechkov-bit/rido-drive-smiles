import type { KrokTrasy } from '@/components/onboarding/GuidedTour';

/**
 * Wprowadzenie: pierwsze zlecenie od zera do usunięcia.
 *
 * Zasada, na której to stoi: warsztat ma przejść CAŁĄ drogę na własnym aucie
 * i własnym numerze telefonu, żeby zobaczyć to, co zobaczy jego klient. Dlatego
 * SMS-y wychodzą naprawdę — tyle że na numer właściciela — a zlecenie i faktura
 * z tego przejścia są do skasowania na końcu, i to też pokazujemy.
 *
 * Kolejność nie jest przypadkowa: to jest dokładnie ta sama droga, którą warsztat
 * przejdzie jutro przy prawdziwym kliencie — auto, klient, opis, robocizna,
 * części z marżą, kosztorys do akceptacji, odbiór, dokument, zamknięcie.
 */
export const TRASA_PIERWSZE_ZLECENIE: KrokTrasy[] = [
  {
    cel: 'nowe-zlecenie',
    tytul: 'Zacznijmy od pierwszego zlecenia',
    tresc: 'Tu zakłada się zlecenie: auto, klient, opis usterki. Wszystko inne — wycena, SMS-y, faktura — dzieje się już w środku.',
    akcja: 'Kliknij „Nowe zlecenie", żeby zacząć',
    // Bez `czekaNaKlikniecie`: pierwsza podpowiedź ma być PRZECZYTANA. Kliknięcie
    // w przycisk i tak przenosi dalej, ale kto czyta wolniej, ma przycisk „Dalej"
    // i nie zostaje z wrażeniem, że coś mignęło.
  },
  {
    cel: 'pole-rejestracji',
    tytul: 'Numer rejestracyjny',
    tresc: 'Wpisz numer auta, na którym chcesz poćwiczyć — może być Twoje własne.\n\nJeśli auta nie ma jeszcze w kartotece, kliknij „Utwórz nowy pojazd" albo naciśnij Enter. Po numerze pobierzemy markę, model, rocznik, pojemność, moc i VIN, więc nie trzeba wpisywać ich ręcznie.',
    akcja: 'To sprawdzenie jest częścią wprowadzenia — nie schodzi z Twojego limitu',
  },
  {
    cel: 'pojazd-wlasciciel',
    tytul: 'Najpierw właściciel auta',
    tresc: 'Zaczynasz od właściciela — auto bez klienta nie ma komu wysłać SMS-a.\n\nWyszukaj go na liście, a jeśli go tam nie ma, kliknij „Dodaj właściciela" (przycisk po prawej stronie tej sekcji) i wpisz imię, nazwisko i numer telefonu. Numer jest najważniejszy: to na niego pójdzie protokół przyjęcia i kosztorys.',
    akcja: 'Na czas nauki wpisz siebie i swój numer',
  },
  {
    cel: 'klient-imie-nazwisko',
    tytul: 'Dane właściciela',
    tresc: 'Wystarczy imię i nazwisko. „Osoba prywatna" albo „Firma" — przy firmie dojdzie NIP i pobierzemy dane z GUS.',
  },
  {
    cel: 'klient-telefon',
    tytul: 'Telefon — najważniejsze pole',
    tresc: 'Na ten numer pójdzie protokół przyjęcia, kosztorys do akceptacji i wiadomość, że auto jest gotowe.\n\nNa czas nauki wpisz swój własny numer — zobaczysz dokładnie to, co dostanie klient. Potem „Zapisz".',
  },
  {
    cel: 'pojazd-rejestracja',
    tytul: 'Numer i lupka',
    tresc: 'Gdy właściciel jest już wybrany, wpisz numer rejestracyjny i kliknij lupkę obok pola — marka, model, rocznik, pojemność, moc i VIN pobiorą się same.\n\nMożesz też wpisać wszystko ręcznie, jeśli auta nie ma w bazie CEPiK.',
    akcja: 'Kliknij lupkę przy numerze — to sprawdzenie nie schodzi z Twojego limitu',
  },
  {
    cel: 'pobrane-dane',
    tytul: 'To przyszło z rejestru',
    tresc: 'Zielona ramka pokazuje, co dokładnie pobraliśmy po numerze: markę, model, rocznik, pojemność, moc, paliwo i VIN.\n\nWszystko możesz poprawić — zapisujemy to, co jest w polach poniżej. Potem „Zapisz".',
  },
  {
    cel: 'pole-klienta',
    tytul: 'Dane klienta',
    tresc: 'Tu wybierasz klienta z kartoteki albo dodajesz nowego.\n\nNa czas wprowadzenia wpisz SIEBIE i swój numer telefonu — wszystkie SMS-y z tego zlecenia przyjdą do Ciebie i zobaczysz dokładnie to, co zobaczy klient.',
  },
  {
    cel: 'pole-opisu',
    tytul: 'Lista zadań do wykonania',
    tresc: 'Tu wpisujesz w punktach to, z czym przyjechał klient, oraz to, co trzeba przy okazji sprawdzić w aucie.\n\nKażdy punkt to osobna pozycja, którą mechanik odhacza w swojej karcie, a potem wyceniasz ją w kosztorysie. Przycisk „Dodaj pozycję" albo Enter dokłada kolejną.\n\nNa próbę wpisz na przykład:\nWymiana klocków przód\nWymiana wahaczy\nSprawdzić stan tarcz i płynu hamulcowego',
  },
  {
    cel: 'zapisz-zlecenie',
    tytul: 'Zapisz zlecenie',
    tresc: 'Zlecenie trafi na listę aktywnych i do Terminarza. Od tej chwili masz kartę, w której wyceniasz pracę i rozmawiasz z klientem.',
    akcja: 'Kliknij, żeby zapisać',
    czekaNaKlikniecie: true,
  },
  {
    cel: 'tabela-robocizny',
    tytul: 'Robocizna',
    tresc: 'Dwie pozycje już tu są — wpisaliśmy je za Ciebie, żeby było na czym poćwiczyć. Obie bez ceny, czyli w stanie, w którym klient ich jeszcze nie widzi.\n\nKolejny pusty wiersz dokłada się sam, a Enter przenosi niżej. Dopisz swoją pozycję albo od razu przejdź dalej — pokażę, jak wycenić je jednym kliknięciem.',
  },
  {
    cel: 'rido-wycena',
    tytul: 'Nie wiesz, ile wziąć? Rido Wycena',
    tresc: 'Kliknij, a policzymy widełki na podstawie Twoich wcześniejszych zleceń i wycen z portalu dla tego modelu auta — i sprawdzimy je jeszcze AI dla Twojej okolicy.\n\nDostajesz zakres OD–DO. Możesz go przyjąć jednym kliknięciem albo wpisać swoją stawkę.',
  },
  {
    cel: 'tabela-czesci',
    tytul: 'Części i materiały',
    tresc: 'Jedna część już tu jest, też bez ceny. Kolejne wpisujesz ręcznie, bierzesz z magazynu albo szukasz u hurtowni.',
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
    tytul: 'SMS o przyjęciu auta',
    tresc: 'Pierwszy z trzech kroków rozmowy z klientem: protokół przyjęcia do podpisu.\n\nPrzycisk miga na czerwono, kiedy trzeba coś wysłać, świeci żółto po wysłaniu i zielono, gdy klient podpisze.',
    akcja: 'Wyślij na swój numer i sprawdź, jak wygląda SMS i strona dla klienta',
  },
  {
    cel: 'przycisk-kosztorys',
    tytul: 'Kosztorys do akceptacji',
    tresc: 'Klient dostaje link z pozycjami i kwotą. Akceptuje go jednym kliknięciem — status zlecenia zmieni się sam.\n\nGdy zmienisz wycenę po wysłaniu, przycisk znów zamiga na czerwono: klient zaakceptował inną kwotę niż ta, którą masz teraz.',
    akcja: 'Wyślij do siebie i zaakceptuj na telefonie — zobaczysz obie strony',
  },
  {
    cel: 'przycisk-odbior',
    tytul: 'Auto gotowe do odbioru',
    tresc: 'Gdy praca jest skończona, zmieniasz status na „Gotowy do odbioru" i wysyłasz powiadomienie. Klient wie, że może przyjechać.',
  },
  {
    cel: 'dokumenty-zlecenia',
    celeDodatkowe: ['zaznacz-zlecenie'],
    tytul: 'Dokumenty po naprawie',
    tresc: 'Najpierw zaznacz zlecenie na liście (kółko po lewej), dopiero potem kliknij „Wystaw" — bez zaznaczenia system nie wie, do czego wystawić dokument.\n\nDo wyboru: potwierdzenie wykonania usługi, paragon (jeśli masz podpiętą drukarkę fiskalną) albo faktura. Pozycje i kwoty przepisują się z kosztorysu — nie wpisujesz ich drugi raz.',
    akcja: 'Fakturę z tego zlecenia próbnego skasujesz razem ze zleceniem',
  },
  {
    cel: 'status-zlecenia',
    tytul: 'Zamknięcie zlecenia',
    tresc: 'Ustaw status „Zakończone". Zlecenie zniknie z listy aktywnych i przejdzie do zakładki „Zakończone" — tam trafiają wszystkie rozliczone naprawy.',
  },
  {
    cel: 'filtr-zakonczone',
    tytul: 'Zakończone i usuwanie',
    tresc: 'Tu znajdziesz zamknięte zlecenia. Zaznacz to próbne i usuń przyciskiem „Usuń" — razem z nim znika wystawiony do niego dokument.\n\nTo wszystko: auto, klient, wycena, SMS-y, dokument, zamknięcie. Tak samo wygląda praca przy prawdziwym kliencie.',
  },
];
