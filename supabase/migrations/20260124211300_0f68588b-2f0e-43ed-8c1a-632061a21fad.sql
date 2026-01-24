-- Add services for all providers

-- Warsztaty samochodowe
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Wymiana oleju i filtrów', 'Kompleksowa wymiana oleju silnikowego wraz z filtrami', 45, 180),
  ('Przegląd techniczny', 'Pełny przegląd przed badaniem technicznym', 60, 100),
  ('Wymiana klocków hamulcowych', 'Wymiana klocków przednich lub tylnych', 90, 250),
  ('Diagnostyka komputerowa', 'Odczyt błędów i diagnostyka elektroniki', 30, 80),
  ('Klimatyzacja - serwis', 'Odgrzybianie i uzupełnienie czynnika', 60, 200)
) AS s(name, description, duration, price)
WHERE sp.category_id = '290bfdce-dac0-48d4-a950-1998e43fea5b';

-- Auto detailing
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Mycie podstawowe', 'Zewnętrzne mycie ręczne z woskiem', 60, 80),
  ('Detailing wnętrza', 'Dokładne czyszczenie wnętrza, pranie tapicerki', 180, 350),
  ('Korekta lakieru', 'Polerowanie maszynowe usuwające rysy', 480, 800),
  ('Powłoka ceramiczna', 'Aplikacja powłoki ceramicznej z przygotowaniem', 600, 1500),
  ('Pranie tapicerki', 'Głębokie pranie siedzeń i wykładzin', 120, 250)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'a77413e6-020a-4857-b419-d858c4e0c97d';

-- Sprzątanie
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Sprzątanie standardowe', 'Podstawowe sprzątanie mieszkania do 50m2', 120, 150),
  ('Sprzątanie generalne', 'Dogłębne sprzątanie całego mieszkania', 240, 350),
  ('Mycie okien', 'Mycie okien z ramami (do 10 okien)', 90, 120),
  ('Sprzątanie po remoncie', 'Usunięcie kurzu i brudu po pracach budowlanych', 300, 500),
  ('Pranie dywanów', 'Profesjonalne pranie dywanów i wykładzin', 60, 80)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'f0c9cb8b-2417-428a-a8e4-155723dda76d';

-- Złota rączka
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Montaż mebli', 'Składanie i montaż mebli IKEA i innych', 60, 100),
  ('Wieszanie obrazów', 'Wieszanie obrazów, luster, półek', 30, 60),
  ('Drobne naprawy', 'Różne drobne naprawy domowe', 60, 80),
  ('Montaż karniszy', 'Montaż karnisza z wierceniem', 45, 80),
  ('Naprawa drzwi/okien', 'Regulacja i naprawy stolarki', 60, 100)
) AS s(name, description, duration, price)
WHERE sp.category_id = '5ee501b0-0c91-4d35-8a10-5e91bbabaaae';

-- Hydraulik
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Udrażnianie rur', 'Mechaniczne udrażnianie zatkanych rur', 60, 150),
  ('Montaż baterii', 'Montaż baterii umywalkowej lub zlewozmywakowej', 45, 120),
  ('Naprawa spłuczki', 'Naprawa lub wymiana mechanizmu spłuczki', 60, 100),
  ('Montaż WC', 'Demontaż starego i montaż nowego WC', 120, 250),
  ('Wymiana syfonu', 'Wymiana syfonu umywalki lub zlewu', 30, 80)
) AS s(name, description, duration, price)
WHERE sp.category_id = '2a8804aa-f8db-4210-a840-0ef9799c1aed';

-- Elektryk
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Montaż gniazdka', 'Montaż nowego gniazdka elektrycznego', 45, 100),
  ('Wymiana włącznika', 'Wymiana włącznika światła', 30, 60),
  ('Montaż lampy', 'Podłączenie i montaż lampy sufitowej', 45, 80),
  ('Naprawa instalacji', 'Lokalizacja i naprawa awarii elektrycznej', 60, 150),
  ('Montaż rozdzielni', 'Instalacja nowej rozdzielni elektrycznej', 240, 600)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'c31149db-3160-4680-9d15-0471065ff3c6';

-- Ogrodnik
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Koszenie trawnika', 'Koszenie trawnika do 500m2', 60, 100),
  ('Przycinanie żywopłotu', 'Cięcie i formowanie żywopłotu', 120, 200),
  ('Sadzenie roślin', 'Sadzenie krzewów i roślin ozdobnych', 60, 80),
  ('Grabienie liści', 'Grabienie i wywóz liści jesiennych', 120, 150),
  ('Wertykulacja trawnika', 'Aeracja i wertykulacja trawnika', 90, 180)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'f6a90d92-aff7-4b38-9159-8554f05d4e67';

-- Przeprowadzki
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Przeprowadzka kawalerki', 'Przeprowadzka mieszkania 1-pokojowego', 180, 400),
  ('Przeprowadzka 2-pokojowe', 'Przeprowadzka mieszkania 2-pokojowego', 240, 600),
  ('Przeprowadzka 3-pokojowe', 'Przeprowadzka mieszkania 3-pokojowego', 360, 900),
  ('Transport pianina', 'Profesjonalny transport instrumentu', 120, 500),
  ('Pakowanie rzeczy', 'Usługa pakowania przed przeprowadzką', 180, 300)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'd8aeaf01-993b-43e2-9caf-267b81298fbf';

-- Studio PPF
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('PPF przód pojazdu', 'Folia ochronna na maskę, zderzak, błotniki', 480, 3500),
  ('PPF full wrap', 'Pełne oklejenie pojazdu folią PPF', 1440, 12000),
  ('PPF reflektory', 'Ochrona reflektorów folią PPF', 60, 400),
  ('PPF progi i klamki', 'Ochrona stref narażonych na zarysowania', 120, 800),
  ('Zmiana koloru folią', 'Oklejenie pojazdu folią zmieniającą kolor', 960, 8000)
) AS s(name, description, duration, price)
WHERE sp.category_id = 'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da';

-- Projektanci wnętrz
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Konsultacja projektowa', 'Spotkanie i omówienie koncepcji', 90, 300),
  ('Projekt koncepcyjny', 'Wstępny projekt z moodboardem', 480, 1500),
  ('Projekt wykonawczy', 'Kompletna dokumentacja projektowa', 1440, 5000),
  ('Wizualizacje 3D', 'Fotorealistyczne wizualizacje wnętrza', 480, 2000),
  ('Nadzór autorski', 'Nadzór nad realizacją projektu', 240, 1000)
) AS s(name, description, duration, price)
WHERE sp.category_id = '166b19d9-0364-4807-8da3-1b95868f1cba';

-- Remonty i wykończenia
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Malowanie ścian', 'Malowanie pokoju do 20m2', 240, 400),
  ('Gładzie gipsowe', 'Nakładanie gładzi na ściany', 480, 800),
  ('Układanie paneli', 'Montaż paneli podłogowych', 480, 600),
  ('Płytki łazienkowe', 'Układanie płytek w łazience', 960, 2500),
  ('Remont pod klucz', 'Kompleksowy remont mieszkania', 4800, 15000)
) AS s(name, description, duration, price)
WHERE sp.category_id = '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67';

-- Budowlanka
INSERT INTO services (provider_id, name, description, duration_minutes, price, is_active) 
SELECT sp.id, s.name, s.description, s.duration, s.price, true
FROM service_providers sp
CROSS JOIN (VALUES 
  ('Murowanie ścian', 'Wznoszenie ścian z cegły lub bloczków', 480, 2000),
  ('Wylewka betonowa', 'Wykonanie wylewki podłogowej', 480, 1500),
  ('Ocieplenie budynku', 'Docieplenie ścian styropianem', 2400, 8000),
  ('Pokrycie dachu', 'Pokrycie dachu dachówką lub blachą', 1440, 12000),
  ('Fundamenty', 'Wykonanie fundamentów pod budynek', 2400, 20000)
) AS s(name, description, duration, price)
WHERE sp.category_id = '5991f591-30d0-44e1-84b2-c4a31cf55b8b';