-- Wiedza asystenta: JAK KORZYSTAĆ z portalu.
--
-- Asystent odpowiadał „nie wiem" na pytanie „jak dodać zlecenie", bo w bazie
-- były wyłącznie tematy cennikowe i ogólne. To są instrukcje obsługi — co
-- kliknąć i w jakiej kolejności — czyli dokładnie to, po co klient pisze.
--
-- ŚWIADOMIE nie ma tu nic o budowie systemu: żadnych nazw tabel, technologii,
-- integracji od kuchni, limitów wewnętrznych ani danych innych warsztatów.
-- Asystent i tak odpowiada wyłącznie z tej listy, więc czego tu nie ma, tego
-- nie powie.

INSERT INTO public.support_knowledge (category, question, answer, keywords) VALUES
('zlecenia', 'Jak dodac nowe zlecenie?',
 'W panelu wejdz w kafelek Zlecenia i kliknij „Nowe zlecenie". Wybierz klienta (albo dodaj nowego przyciskiem obok) i pojazd — mozesz go znalezc po numerze rejestracyjnym lub VIN. Opisz, co jest do zrobienia; kazda linia opisu stanie sie osobna pozycja do odhaczenia przez mechanika. Zapisz — zlecenie pojawi sie na liscie aktywnych i w Terminarzu.',
 'dodac zlecenie, nowe zlecenie, zalozyc zlecenie, nie dodaje sie zlecenie, jak utworzyc zlecenie'),

('zlecenia', 'Nie moge dodac zlecenia — co sprawdzic?',
 'Najczesciej brakuje wymaganych danych: klienta albo pojazdu. Sprawdz, czy pole klienta i pojazdu jest uzupelnione, a przy pojezdzie jest marka i numer rejestracyjny. Jesli formularz nie reaguje, odswiez strone (Cmd+R lub Ctrl+R) i sprobuj ponownie. Gdy nadal nie dziala, napisz tutaj — przekazemy sprawe zespolowi.',
 'nie dodaje zlecenia, blad przy zleceniu, nie zapisuje zlecenia, nie moge dodac'),

('zlecenia', 'Jak dodac pozycje do wyceny zlecenia?',
 'Otworz zlecenie i zostan na zakladce „Wycena zlecenia". W tabeli Robocizna/Uslugi zacznij pisac nazwe w ostatnim wierszu — kolejny pusty wiersz dolozy sie sam. Wpisz cene, a Enter przeniesie Cie do nastepnego wiersza. Czesci dodajesz tak samo w tabeli „Czesci i materialy", przyciskiem „Dodaj z magazynu" albo „Znajdz czesci z Rido".',
 'dodac pozycje, dodac usluge, dodac czesc, wycena pozycje, jak wpisac usluge'),

('zlecenia', 'Jak wyslac wycene do klienta i uzyskac akceptacje?',
 'W karcie zlecenia uzupelnij pozycje i ceny, potem uzyj przycisku wysylki wyceny w gornym pasku zlecenia. Klient dostaje link, na ktorym widzi kosztorys i moze go zaakceptowac. Status zlecenia zmieni sie automatycznie po akceptacji, a Ty zobaczysz to na liscie zlecen.',
 'wyslac wycene, kosztorys do klienta, akceptacja klienta, zatwierdzenie wyceny'),

('zlecenia', 'Jak przypisac zlecenie do pracownika?',
 'Sa dwa sposoby: w karcie zlecenia przyciskiem „Przydziel pracownika" w gornym pasku, albo w Terminarzu — klikasz blok zlecenia i wybierasz osobe z listy Pracownik. Przypisanie liczy sie potem w raporcie pracownikow.',
 'przydzielic pracownika, przypisac mechanika, kto robi zlecenie'),

('wycena', 'Co robi przycisk Rido Wycena?',
 'Rido Wycena podpowiada widelki cenowe dla wpisanych uslug. Bierze pod uwage marke i model auta, Twoje wczesniejsze zlecenia (ile sam bralem za to samo) oraz wyceny z portalu, a na koncu dopowiada opinie AI. Widzisz zakres OD-DO i mozesz wpisac wlasna cene — dopiero przycisk „Zastosuj ceny do kosztorysu" przenosi je do zlecenia.',
 'rido wycena, widelki, ile kosztuje usluga, sugestia ceny, wycena AI'),

('klienci', 'Jak dodac klienta i pojazd?',
 'Kafelek Klienci → „Dodaj klienta". Dla firmy mozesz pobrac dane po numerze NIP. Pojazd dodajesz w kafelku Pojazdy albo od razu przy zleceniu — po numerze rejestracyjnym lub VIN dane auta uzupelniaja sie automatycznie.',
 'dodac klienta, nowy klient, dodac pojazd, dodac auto, po nipie, po vin'),

('magazyn', 'Jak dodac czesc z magazynu do zlecenia?',
 'W zleceniu, w tabeli „Czesci i materialy", kliknij „Dodaj z magazynu" i wybierz produkt — ilosc zejdzie ze stanu po zapisaniu pozycji. Jesli czesci nie ma na stanie, mozesz ja wpisac recznie albo poszukac u hurtowni przyciskiem „Znajdz czesci z Rido".',
 'magazyn, stan magazynowy, dodac czesc z magazynu, zejscie ze stanu'),

('faktury', 'Jak wystawic fakture do zlecenia?',
 'Zakoncz zlecenie, a nastepnie uzyj przycisku wystawienia dokumentu na liscie zlecen lub w karcie zlecenia — pozycje i kwoty przepisza sie z kosztorysu. Fakture mozesz wyslac mailem, a od pakietu Standard rowniez do KSeF.',
 'faktura, wystawic fakture, paragon, dokument sprzedazy'),

('terminarz', 'Jak umowic wizyte w Terminarzu?',
 'Kafelek Terminarz → kliknij wolne miejsce w siatce i wybierz zlecenie lub utworz nowy wpis. Blok mozna przeciagac i rozciagac, zeby zmienic godzine i czas trwania. Rezerwacje od klientow z portalu pojawiaja sie tam automatycznie.',
 'terminarz, kalendarz, umowic wizyte, rezerwacja, zaplanowac'),

('pracownicy', 'Co widzi pracownik w swoim panelu?',
 'Pracownik widzi przypisane zlecenia i przechodzi po kolei przez pozycje z przyjecia. Przy kazdej wpisuje, co zrobil i jakich czesci uzyl, podaje czas i zatwierdza punkt. Moze tez dodac wlasna pozycje — musi ja nazwac. Robocizna i czesci trafiaja do wyceny zlecenia; ceny uzupelnia biuro.',
 'panel pracownika, mechanik, co widzi pracownik, karta mechanika');
