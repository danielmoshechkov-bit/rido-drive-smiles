-- Insert demo service providers for all categories (3 per category = 36 total)

-- Warsztaty samochodowe (warsztat)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '290bfdce-dac0-48d4-a950-1998e43fea5b', 'Auto Serwis Kowalski', 'Warszawa', 'ul. Mechaników 15', '+48 500 100 001', 'kontakt@autokowalski.pl', 'Profesjonalny serwis samochodowy z 20-letnim doświadczeniem. Naprawy mechaniczne, elektryczne i diagnostyka komputerowa.', 4.8, 127, 'active', 'Jan', 'Kowalski'),
  (gen_random_uuid(), '290bfdce-dac0-48d4-a950-1998e43fea5b', 'Warsztat Blacharsko-Lakierniczy Speed', 'Kraków', 'ul. Przemysłowa 42', '+48 500 100 002', 'speed@serwis.pl', 'Specjalizujemy się w naprawach blacharsko-lakierniczych. Szybki termin, wysokiej jakości materiały.', 4.6, 89, 'active', 'Piotr', 'Nowak'),
  (gen_random_uuid(), '290bfdce-dac0-48d4-a950-1998e43fea5b', 'Master Mechanic', 'Poznań', 'ul. Fabryczna 8', '+48 500 100 003', 'info@mastermechanic.pl', 'Autoryzowany serwis wielomarkowy. Oryginalne części, gwarancja na usługi.', 4.9, 203, 'active', 'Adam', 'Wiśniewski');

-- Auto detailing (detailing)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'a77413e6-020a-4857-b419-d858c4e0c97d', 'Diamond Detailing', 'Warszawa', 'ul. Błyszcząca 7', '+48 500 200 001', 'kontakt@diamonddetailing.pl', 'Premium auto detailing - polerowanie, ceramika, PPF. Dbamy o każdy detal Twojego samochodu.', 4.9, 156, 'active', 'Michał', 'Zieliński'),
  (gen_random_uuid(), 'a77413e6-020a-4857-b419-d858c4e0c97d', 'Pro Shine Studio', 'Wrocław', 'ul. Lakiernicza 23', '+48 500 200 002', 'studio@proshine.pl', 'Studio detailingowe z pełnym zapleczem. Korekta lakieru, powłoki ceramiczne, pranie tapicerki.', 4.7, 98, 'active', 'Tomasz', 'Król'),
  (gen_random_uuid(), 'a77413e6-020a-4857-b419-d858c4e0c97d', 'Clean Car Expert', 'Gdańsk', 'ul. Morska 112', '+48 500 200 003', 'biuro@cleancarexpert.pl', 'Profesjonalne czyszczenie i renowacja pojazdów. Mobilny detailing w całym Trójmieście.', 4.5, 67, 'active', 'Kamil', 'Lewandowski');

-- Sprzątanie (sprzatanie)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'f0c9cb8b-2417-428a-a8e4-155723dda76d', 'Czysto i Świeżo', 'Warszawa', 'ul. Domowa 5', '+48 500 300 001', 'biuro@czysto.pl', 'Profesjonalne sprzątanie domów, mieszkań i biur. Ekologiczne środki, stały zespół sprzątający.', 4.8, 234, 'active', 'Anna', 'Kowalczyk'),
  (gen_random_uuid(), 'f0c9cb8b-2417-428a-a8e4-155723dda76d', 'Crystal Clean', 'Kraków', 'ul. Czysta 18', '+48 500 300 002', 'kontakt@crystalclean.pl', 'Usługi sprzątające dla firm i osób prywatnych. Mycie okien, pranie dywanów, sprzątanie po remontach.', 4.6, 145, 'active', 'Ewa', 'Dąbrowska'),
  (gen_random_uuid(), 'f0c9cb8b-2417-428a-a8e4-155723dda76d', 'Dom jak Nowy', 'Łódź', 'ul. Wiosenna 33', '+48 500 300 003', 'zamowienia@domjaknowy.pl', 'Kompleksowe sprzątanie - mieszkania, domy, biura. Regularne usługi i sprzątanie jednorazowe.', 4.7, 178, 'active', 'Katarzyna', 'Mazur');

-- Złota rączka (zlota-raczka)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '5ee501b0-0c91-4d35-8a10-5e91bbabaaae', 'Złota Rączka Marek', 'Warszawa', 'ul. Majsterkowicza 12', '+48 500 400 001', 'marek@zlotaraczka.pl', 'Drobne naprawy domowe, montaż mebli, wieszanie obrazów, naprawy hydrauliczne i elektryczne.', 4.9, 312, 'active', 'Marek', 'Jankowski'),
  (gen_random_uuid(), '5ee501b0-0c91-4d35-8a10-5e91bbabaaae', 'Pan od Wszystkiego', 'Poznań', 'ul. Pomocna 7', '+48 500 400 002', 'kontakt@panodwszystkiego.pl', 'Każda drobna naprawa to moja specjalność. Montaż, naprawy, konserwacja - wszystko sprawnie i szybko.', 4.7, 198, 'active', 'Robert', 'Szymański'),
  (gen_random_uuid(), '5ee501b0-0c91-4d35-8a10-5e91bbabaaae', 'Szybka Pomoc Domowa', 'Wrocław', 'ul. Remontowa 21', '+48 500 400 003', 'pomoc@szybkapomoc.pl', 'Usługi remontowo-naprawcze. Działamy szybko i profesjonalnie. Dojazd gratis w obrębie miasta.', 4.5, 87, 'active', 'Grzegorz', 'Wójcik');

-- Hydraulik (hydraulik)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '2a8804aa-f8db-4210-a840-0ef9799c1aed', 'Hydraulik 24h', 'Warszawa', 'ul. Wodna 8', '+48 500 500 001', 'awarie@hydraulik24.pl', 'Pogotowie hydrauliczne 24/7. Udrażnianie rur, naprawy instalacji, montaż armatury.', 4.8, 267, 'active', 'Stanisław', 'Kaczmarek'),
  (gen_random_uuid(), '2a8804aa-f8db-4210-a840-0ef9799c1aed', 'Instalacje Wodne Pro', 'Kraków', 'ul. Kanalizacyjna 15', '+48 500 500 002', 'biuro@instalacjewodne.pl', 'Kompleksowe usługi hydrauliczne - od drobnych napraw po instalacje w nowych budynkach.', 4.6, 143, 'active', 'Andrzej', 'Piotrowski'),
  (gen_random_uuid(), '2a8804aa-f8db-4210-a840-0ef9799c1aed', 'Wod-Kan Ekspert', 'Gdańsk', 'ul. Rzeczna 29', '+48 500 500 003', 'wodkan@ekspert.pl', 'Specjaliści od instalacji wodno-kanalizacyjnych. Szybkie terminy, konkurencyjne ceny.', 4.7, 112, 'active', 'Paweł', 'Grabowski');

-- Elektryk (elektryk)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'c31149db-3160-4680-9d15-0471065ff3c6', 'Elektryk Profesjonalny', 'Warszawa', 'ul. Prądowa 4', '+48 500 600 001', 'kontakt@elektryk-pro.pl', 'Instalacje elektryczne, naprawy, przeglądy. Uprawnienia SEP, gwarancja na wykonane prace.', 4.9, 189, 'active', 'Krzysztof', 'Jabłoński'),
  (gen_random_uuid(), 'c31149db-3160-4680-9d15-0471065ff3c6', 'Volt Service', 'Wrocław', 'ul. Energetyczna 11', '+48 500 600 002', 'serwis@voltservice.pl', 'Usługi elektryczne dla domu i firmy. Modernizacje instalacji, montaż oświetlenia.', 4.6, 98, 'active', 'Łukasz', 'Adamczyk'),
  (gen_random_uuid(), 'c31149db-3160-4680-9d15-0471065ff3c6', 'Elektro-Dom', 'Poznań', 'ul. Świetlna 7', '+48 500 600 003', 'info@elektrodom.pl', 'Kompleksowa obsługa elektryczna budynków mieszkalnych i biurowych. Szybka wycena.', 4.7, 134, 'active', 'Marcin', 'Rutkowski');

-- Ogrodnik (ogrodnik)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'f6a90d92-aff7-4b38-9159-8554f05d4e67', 'Zielony Ogród', 'Warszawa', 'ul. Ogrodowa 25', '+48 500 700 001', 'kontakt@zielonyogrod.pl', 'Projektowanie i pielęgnacja ogrodów. Koszenie trawników, przycinanie żywopłotów, sadzenie roślin.', 4.8, 167, 'active', 'Wojciech', 'Witkowski'),
  (gen_random_uuid(), 'f6a90d92-aff7-4b38-9159-8554f05d4e67', 'Garden Master', 'Kraków', 'ul. Parkowa 9', '+48 500 700 002', 'biuro@gardenmaster.pl', 'Profesjonalna pielęgnacja terenów zielonych. Ogrody prywatne, wspólnoty, firmy.', 4.5, 78, 'active', 'Rafał', 'Baran'),
  (gen_random_uuid(), 'f6a90d92-aff7-4b38-9159-8554f05d4e67', 'Ogrodnik na Medal', 'Łódź', 'ul. Kwiatowa 14', '+48 500 700 003', 'ogrodnik@namedal.pl', 'Kompleksowa obsługa ogrodów przez cały rok. Nawadnianie, nasadzenia, odśnieżanie.', 4.7, 112, 'active', 'Bartosz', 'Sawicki');

-- Przeprowadzki (przeprowadzki)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'd8aeaf01-993b-43e2-9caf-267b81298fbf', 'Szybkie Przeprowadzki', 'Warszawa', 'ul. Transportowa 3', '+48 500 800 001', 'zamow@szybkieprzeprowadzki.pl', 'Przeprowadzki lokalne i międzymiastowe. Pakowanie, transport, rozładunek. Ubezpieczenie mienia.', 4.8, 234, 'active', 'Dariusz', 'Michalski'),
  (gen_random_uuid(), 'd8aeaf01-993b-43e2-9caf-267b81298fbf', 'Move It Pro', 'Kraków', 'ul. Logistyczna 18', '+48 500 800 002', 'kontakt@moveitpro.pl', 'Profesjonalne usługi przeprowadzkowe. Doświadczona ekipa, nowoczesny sprzęt.', 4.6, 156, 'active', 'Tomasz', 'Krawczyk'),
  (gen_random_uuid(), 'd8aeaf01-993b-43e2-9caf-267b81298fbf', 'Bagaż Express', 'Wrocław', 'ul. Kurierska 7', '+48 500 800 003', 'biuro@bagazexpress.pl', 'Przeprowadzki mieszkań i biur. Usługi magazynowania, transport pianofortów.', 4.7, 98, 'active', 'Sławomir', 'Olejniczak');

-- Studio PPF (ppf)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), 'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da', 'PPF Master Studio', 'Warszawa', 'ul. Ochronna 12', '+48 500 900 001', 'studio@ppfmaster.pl', 'Profesjonalne aplikacje folii ochronnych PPF. Ochrona lakieru, reflektory, progi.', 4.9, 134, 'active', 'Artur', 'Sikora'),
  (gen_random_uuid(), 'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da', 'Shield Car Protection', 'Poznań', 'ul. Foliowa 5', '+48 500 900 002', 'kontakt@shieldcar.pl', 'Folia PPF najwyższej jakości. Pełne oklejenie lub strefy narażone. Gwarancja 10 lat.', 4.7, 89, 'active', 'Patryk', 'Walczak'),
  (gen_random_uuid(), 'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da', 'Invisible Shield Garage', 'Kraków', 'ul. Motoryzacyjna 28', '+48 500 900 003', 'info@invisibleshield.pl', 'Specjalizujemy się w foliach ochronnych i zmianach koloru. Doświadczenie premium.', 4.8, 67, 'active', 'Daniel', 'Górski');

-- Projektanci wnętrz (projektanci)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '166b19d9-0364-4807-8da3-1b95868f1cba', 'Interior Design Studio', 'Warszawa', 'ul. Designerska 10', '+48 501 000 001', 'studio@interiordesign.pl', 'Projektowanie wnętrz mieszkalnych i komercyjnych. Wizualizacje 3D, nadzór autorski.', 4.9, 78, 'active', 'Magdalena', 'Nowicka'),
  (gen_random_uuid(), '166b19d9-0364-4807-8da3-1b95868f1cba', 'Home Style Architects', 'Kraków', 'ul. Artystyczna 7', '+48 501 000 002', 'biuro@homestyle.pl', 'Kompleksowe projekty wnętrz. Od koncepcji po realizację. Styl nowoczesny i klasyczny.', 4.7, 56, 'active', 'Karolina', 'Kozłowska'),
  (gen_random_uuid(), '166b19d9-0364-4807-8da3-1b95868f1cba', 'Space Harmony Design', 'Gdańsk', 'ul. Kreatywna 15', '+48 501 000 003', 'kontakt@spaceharmony.pl', 'Harmonia przestrzeni to nasza pasja. Projekty mieszkań, domów i przestrzeni biurowych.', 4.6, 45, 'active', 'Joanna', 'Makowska');

-- Remonty i wykończenia (remonty)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67', 'Remonty Kompleksowe Pro', 'Warszawa', 'ul. Budowlana 22', '+48 501 100 001', 'biuro@remontypro.pl', 'Kompleksowe remonty mieszkań i domów. Wykończenia pod klucz, malowanie, glazura.', 4.8, 189, 'active', 'Zbigniew', 'Zając'),
  (gen_random_uuid(), '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67', 'Perfect Finish', 'Wrocław', 'ul. Wykończeniowa 8', '+48 501 100 002', 'kontakt@perfectfinish.pl', 'Wykończenia wnętrz najwyższej jakości. Gładzie, malowanie, podłogi, łazienki.', 4.6, 134, 'active', 'Mariusz', 'Kamiński'),
  (gen_random_uuid(), '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67', 'Renowacja Mistrzów', 'Poznań', 'ul. Remontowa 16', '+48 501 100 003', 'zamowienia@renowacjamistrzow.pl', 'Od planowania po gotowy projekt. Remonty generalne i częściowe z gwarancją.', 4.7, 156, 'active', 'Henryk', 'Czarnecki');

-- Budowlanka (budowlanka)
INSERT INTO service_providers (id, category_id, company_name, company_city, company_address, company_phone, company_email, description, rating_avg, rating_count, status, owner_first_name, owner_last_name)
VALUES 
  (gen_random_uuid(), '5991f591-30d0-44e1-84b2-c4a31cf55b8b', 'Budowa i Konstrukcje', 'Warszawa', 'ul. Inżynierska 30', '+48 501 200 001', 'biuro@budowaikonstrukcje.pl', 'Usługi budowlane - fundamenty, ściany, dachy. Doświadczona ekipa, terminowość.', 4.8, 123, 'active', 'Ryszard', 'Pawłowski'),
  (gen_random_uuid(), '5991f591-30d0-44e1-84b2-c4a31cf55b8b', 'Murarze z Klasą', 'Kraków', 'ul. Cegielna 12', '+48 501 200 002', 'kontakt@murazezklasa.pl', 'Profesjonalne prace murarskie i betoniarskie. Budowa domów jednorodzinnych.', 4.6, 87, 'active', 'Bogdan', 'Lis'),
  (gen_random_uuid(), '5991f591-30d0-44e1-84b2-c4a31cf55b8b', 'Solid Build', 'Łódź', 'ul. Budowlańców 5', '+48 501 200 003', 'info@solidbuild.pl', 'Kompleksowe usługi budowlane. Od projektu po odbiór. Domy, hale, obiekty przemysłowe.', 4.7, 98, 'active', 'Wiesław', 'Kopeć');