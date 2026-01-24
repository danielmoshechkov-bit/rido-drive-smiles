
-- Usługi dla Budowlanka
INSERT INTO services (provider_id, name, description, duration_minutes, price_from, price_type, is_active) VALUES
-- BudMax Konstrukcje
('c601d48f-d29b-4f6d-996f-46ea61bb9484', 'Fundamenty pod dom', 'Kompleksowe wykonanie fundamentów pod budynki mieszkalne', 480, 15000, 'from', true),
('c601d48f-d29b-4f6d-996f-46ea61bb9484', 'Murowanie ścian', 'Budowa ścian nośnych i działowych z różnych materiałów', 480, 8000, 'from', true),
('c601d48f-d29b-4f6d-996f-46ea61bb9484', 'Strop i dach', 'Wykonanie stropu i konstrukcji dachu', 480, 20000, 'from', true),
-- Murarz Pro Kraków
('8981d841-6925-4a09-b4ae-77be847e86ce', 'Mury oporowe', 'Budowa murów oporowych i ogrodzeń', 240, 5000, 'from', true),
('8981d841-6925-4a09-b4ae-77be847e86ce', 'Schody betonowe', 'Wykonanie schodów zewnętrznych i wewnętrznych', 180, 3500, 'from', true),
('8981d841-6925-4a09-b4ae-77be847e86ce', 'Kominy i wentylacje', 'Murowanie kominów i kanałów wentylacyjnych', 120, 2500, 'from', true),
-- Solidne Fundamenty
('d7051c91-8748-4ecf-848a-d50dd3b00ac2', 'Piwnice i garaże podziemne', 'Budowa piwnic i parkingów podziemnych', 480, 25000, 'from', true),
('d7051c91-8748-4ecf-848a-d50dd3b00ac2', 'Izolacja fundamentów', 'Hydroizolacja i termoizolacja fundamentów', 240, 6000, 'from', true),
('d7051c91-8748-4ecf-848a-d50dd3b00ac2', 'Ławy i stopy fundamentowe', 'Wykonanie ław i stóp fundamentowych', 240, 8000, 'from', true);

-- Usługi dla Projektanci wnętrz
INSERT INTO services (provider_id, name, description, duration_minutes, price_from, price_type, is_active) VALUES
-- Studio Wnętrz Anna Kowalska
('b373e0f6-ee4f-4922-95d7-851f06ebbe94', 'Projekt koncepcyjny', 'Wstępny projekt z wizualizacjami 3D', 120, 3000, 'from', true),
('b373e0f6-ee4f-4922-95d7-851f06ebbe94', 'Projekt wykonawczy', 'Kompletna dokumentacja techniczna do realizacji', 240, 8000, 'from', true),
('b373e0f6-ee4f-4922-95d7-851f06ebbe94', 'Nadzór autorski', 'Nadzór nad realizacją projektu', 60, 150, 'hourly', true),
-- Koncept Design Kraków
('5497f7a1-ed57-4d40-bc42-15e1e78aa711', 'Home staging', 'Przygotowanie nieruchomości do sprzedaży/wynajmu', 180, 2500, 'from', true),
('5497f7a1-ed57-4d40-bc42-15e1e78aa711', 'Projekt mieszkania', 'Kompleksowy projekt wnętrza mieszkania', 240, 5000, 'from', true),
('5497f7a1-ed57-4d40-bc42-15e1e78aa711', 'Wizualizacje 3D', 'Fotorealistyczne rendery wnętrz', 120, 500, 'per_room', true),
-- Eleganckie Przestrzenie
('a3defc90-f797-4f3b-8270-9827439fd212', 'Projekt luksusowej rezydencji', 'Ekskluzywne projekty dla wymagających klientów', 480, 25000, 'from', true),
('a3defc90-f797-4f3b-8270-9827439fd212', 'Projekt biura/lokalu', 'Aranżacja przestrzeni komercyjnych', 240, 12000, 'from', true),
('a3defc90-f797-4f3b-8270-9827439fd212', 'Dobór mebli i wyposażenia', 'Profesjonalny dobór mebli z zakupem', 180, 3000, 'from', true);

-- Usługi dla Remonty i wykończenia
INSERT INTO services (provider_id, name, description, duration_minutes, price_from, price_type, is_active) VALUES
-- Remonty Express Warszawa
('5c9b0276-0a33-46a1-9f1d-1180bb6f94f3', 'Malowanie mieszkania', 'Profesjonalne malowanie ścian i sufitów', 240, 1500, 'from', true),
('5c9b0276-0a33-46a1-9f1d-1180bb6f94f3', 'Gładzie i tynki', 'Wykonanie gładzi gipsowych i tynków', 240, 2500, 'from', true),
('5c9b0276-0a33-46a1-9f1d-1180bb6f94f3', 'Remont łazienki', 'Kompleksowy remont łazienki pod klucz', 480, 15000, 'from', true),
-- Wykończenia Premium
('4a580860-cec6-4726-980f-33ec4c21d997', 'Wykończenie pod klucz', 'Kompleksowe wykończenie mieszkania', 480, 45000, 'from', true),
('4a580860-cec6-4726-980f-33ec4c21d997', 'Podłogi - parkiet i panele', 'Montaż podłóg drewnianych i panelowych', 180, 3500, 'from', true),
('4a580860-cec6-4726-980f-33ec4c21d997', 'Sufity podwieszane', 'Montaż sufitów podwieszanych z oświetleniem', 240, 4000, 'from', true),
-- Remont-Bud Łódź
('1d0d57fc-3490-4099-bbac-7bdbc3915630', 'Wymiana instalacji', 'Wymiana instalacji elektrycznej i wod-kan', 480, 8000, 'from', true),
('1d0d57fc-3490-4099-bbac-7bdbc3915630', 'Wymiana okien i drzwi', 'Demontaż i montaż nowej stolarki', 180, 4500, 'from', true),
('1d0d57fc-3490-4099-bbac-7bdbc3915630', 'Ocieplenie budynku', 'Termomodernizacja elewacji', 480, 20000, 'from', true);

-- Usługi dla Studio PPF
INSERT INTO services (provider_id, name, description, duration_minutes, price_from, price_type, is_active) VALUES
-- PPF Master Warszawa
('ba7e4048-1b1b-42bb-b1aa-f5ce5933a607', 'PPF Full Front', 'Oklejenie całego przodu pojazdu folią ochronną', 480, 5500, 'from', true),
('ba7e4048-1b1b-42bb-b1aa-f5ce5933a607', 'PPF Full Body', 'Pełna ochrona całego pojazdu folią PPF', 960, 15000, 'from', true),
('ba7e4048-1b1b-42bb-b1aa-f5ce5933a607', 'Korekta lakieru', 'Profesjonalna korekta lakieru przed oklejeniem', 480, 2000, 'from', true),
-- AutoFolia Kraków
('a639cd47-77ec-4260-845c-35d2e01d3947', 'Zmiana koloru (wrap)', 'Oklejenie pojazdu folią zmieniającą kolor', 720, 8000, 'from', true),
('a639cd47-77ec-4260-845c-35d2e01d3947', 'Przyciemnianie szyb', 'Profesjonalne przyciemnianie szyb samochodowych', 180, 800, 'from', true),
('a639cd47-77ec-4260-845c-35d2e01d3947', 'Ceramic coating', 'Powłoka ceramiczna na lakier', 480, 2500, 'from', true),
-- Wrap Studio Wrocław
('12022ece-a30f-495c-b21f-1570674dc770', 'Ochrona progów i klamek', 'PPF na miejsca najbardziej narażone', 120, 800, 'from', true),
('12022ece-a30f-495c-b21f-1570674dc770', 'Usuwanie wgnieceń PDR', 'Bezlakierowe usuwanie wgnieceń', 60, 200, 'per_dent', true),
('12022ece-a30f-495c-b21f-1570674dc770', 'Detailing wnętrza', 'Kompleksowe czyszczenie i konserwacja wnętrza', 240, 500, 'from', true);
