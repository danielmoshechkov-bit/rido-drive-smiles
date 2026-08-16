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
    czekaNaKlikniecie: true,
  },
  {
    cel: 'pole-rejestracji',
    tytul: 'Numer rejestracyjny',
    tresc: 'Wpisz numer auta, na którym chcesz poćwiczyć — może być Twoje własne.\n\nPo numerze pobierzemy markę, model, rocznik, pojemność, moc i VIN, więc nie trzeba wpisywać ich ręcznie.',
    akcja: 'To sprawdzenie jest częścią wprowadzenia — nie schodzi z Twojego limitu',
  },
  {
    cel: 'pole-klienta',
    tytul: 'Dane klienta',
    tresc: 'Tu wybierasz klienta z kartoteki albo dodajesz nowego.\n\nNa czas wprowadzenia wpisz SIEBIE i swój numer telefonu — wszystkie SMS-y z tego zlecenia przyjdą do Ciebie i zobaczysz dokładnie to, co zobaczy klient.',
  },
  {
    cel: 'pole-opisu',
    tytul: 'Co jest do zrobienia',
    tresc: 'Opis usterki albo lista czynności. Każda linia stanie się osobną pozycją do odhaczenia przez mechanika.\n\nNa próbę wpisz na przykład:\nWymiana klocków\nWymiana wahaczy',
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
    tresc: 'Tu wpisujesz, co robisz — „Wymiana klocków przód", „Wymiana wahaczy".\n\nKolejny pusty wiersz dokłada się sam, a Enter przenosi niżej. Pozycja bez ceny jest podświetlona i klient jej nie widzi, dopóki nie wpiszesz kwoty.',
  },
  {
    cel: 'rido-wycena',
    tytul: 'Nie wiesz, ile wziąć? Rido Wycena',
    tresc: 'Kliknij, a policzymy widełki na podstawie Twoich wcześniejszych zleceń i wycen z portalu dla tego modelu auta — i sprawdzimy je jeszcze AI dla Twojej okolicy.\n\nDostajesz zakres OD–DO. Możesz go przyjąć jednym kliknięciem albo wpisać swoją stawkę.',
  },
  {
    cel: 'tabela-czesci',
    tytul: 'Części i materiały',
    tresc: 'Tu wpisujesz nazwy części, których użyjesz — „Klocki przód", „Płyn hamulcowy". Możesz też wziąć część z magazynu albo poszukać u hurtowni.',
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
    tytul: 'Dokumenty po naprawie',
    tresc: 'Do zakończonego zlecenia wystawisz potwierdzenie wykonania usługi, paragon (jeśli masz podpiętą drukarkę fiskalną) albo fakturę.\n\nPozycje i kwoty przepisują się z kosztorysu — nie wpisujesz ich drugi raz.',
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
