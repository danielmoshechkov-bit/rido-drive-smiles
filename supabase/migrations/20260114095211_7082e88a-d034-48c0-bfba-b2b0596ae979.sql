-- Wstawienie 15 ogłoszeń testowych (5 dla każdej z 3 agencji)
-- Testowa Agencja Nieruchomości - ID: 132310ce-25a7-4949-ab66-297b1949e47a
-- Nieruchomości Premium - ID: 5e2ce295-49c3-49c1-9004-f826ec98c683
-- Best Future - ID: e8b6592e-91b1-4cc4-ab0e-02025b503eb5

INSERT INTO real_estate_listings (
  agent_id, agency_id, title, description, property_type, transaction_type, price_type,
  location, city, district, address, latitude, longitude, price, area, rooms,
  floor, total_floors, build_year, has_balcony, has_elevator, has_parking, has_garden,
  photos, listing_number, contact_person, contact_phone, contact_email, status
) VALUES
-- Testowa Agencja - 5 ogłoszeń
(
  '132310ce-25a7-4949-ab66-297b1949e47a', '132310ce-25a7-4949-ab66-297b1949e47a',
  'Przestronne mieszkanie 3-pokojowe na Kazimierzu',
  'Wyjątkowe mieszkanie w sercu Kazimierza. Wysoki standard wykończenia, drewniane podłogi, duże okna zapewniające mnóstwo naturalnego światła. W okolicy liczne restauracje, kawiarnie i galerie. Doskonała komunikacja miejska - tramwaj w 2 minuty.',
  'mieszkanie', 'sprzedaz', 'sale', 'Kraków', 'Kraków', 'Kazimierz', 'ul. Szeroka 15',
  50.0520, 19.9470, 650000, 72, 3, 3, 5, 2019, true, true, false, false,
  ARRAY['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800'],
  'TA-001', 'Marek Kowalski', '+48 501 234 567', 'marek@testowaagencja.pl', 'active'
),
(
  '132310ce-25a7-4949-ab66-297b1949e47a', '132310ce-25a7-4949-ab66-297b1949e47a',
  'Nowoczesne studio w centrum Krakowa',
  'Funkcjonalne studio idealne dla singla lub pary. Aneks kuchenny, łazienka z prysznicem, duże okno. Budynek z windą i ochroną 24h. Garaż podziemny w cenie.',
  'kawalerka', 'wynajem', 'rent_monthly', 'Kraków', 'Kraków', 'Stare Miasto', 'ul. Floriańska 28',
  50.0647, 19.9376, 3200, 32, 1, 5, 7, 2021, false, true, true, false,
  ARRAY['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'],
  'TA-002', 'Anna Nowak', '+48 502 345 678', 'anna@testowaagencja.pl', 'active'
),
(
  '132310ce-25a7-4949-ab66-297b1949e47a', '132310ce-25a7-4949-ab66-297b1949e47a',
  'Dom jednorodzinny z ogrodem - Bronowice',
  'Przestronny dom wolnostojący na spokojnej ulicy. Działka 600m², garaż dwustanowiskowy, taras, ogród. Blisko szkoła i przedszkole.',
  'dom', 'sprzedaz', 'sale', 'Kraków', 'Kraków', 'Bronowice', 'ul. Zielona 45',
  50.0789, 19.8876, 1450000, 185, 5, NULL, 2, 2015, false, false, true, true,
  ARRAY['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800', 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800', 'https://images.unsplash.com/photo-1600573472556-e636c2acda88?w=800'],
  'TA-003', 'Marek Kowalski', '+48 501 234 567', 'marek@testowaagencja.pl', 'active'
),
(
  '132310ce-25a7-4949-ab66-297b1949e47a', '132310ce-25a7-4949-ab66-297b1949e47a',
  'Działka budowlana w Wieliczce',
  'Działka budowlana o regularnym kształcie. Media na granicy działki. Dojazd drogą asfaltową. Blisko centrum Wieliczki i kopalni soli.',
  'dzialka', 'sprzedaz', 'sale', 'Wieliczka', 'Wieliczka', NULL, 'ul. Słoneczna',
  49.9870, 20.0654, 320000, 1200, NULL, NULL, NULL, NULL, false, false, false, false,
  ARRAY['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800'],
  'TA-004', 'Anna Nowak', '+48 502 345 678', 'anna@testowaagencja.pl', 'active'
),
(
  '132310ce-25a7-4949-ab66-297b1949e47a', '132310ce-25a7-4949-ab66-297b1949e47a',
  'Lokal usługowy w centrum handlowym',
  'Lokal na parterze galerii handlowej. Duża witryna, zaplecze, toaleta. Idealne na sklep lub punkt usługowy.',
  'lokal', 'wynajem', 'rent_monthly', 'Kraków', 'Kraków', 'Podgórze', 'ul. Wadowicka 3',
  50.0456, 19.9612, 8500, 85, NULL, 0, 3, 2018, false, true, true, false,
  ARRAY['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800', 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800'],
  'TA-005', 'Marek Kowalski', '+48 501 234 567', 'marek@testowaagencja.pl', 'active'
),

-- Nieruchomości Premium - 5 ogłoszeń
(
  '5e2ce295-49c3-49c1-9004-f826ec98c683', '5e2ce295-49c3-49c1-9004-f826ec98c683',
  'Luksusowy apartament z widokiem na Wisłę',
  'Ekskluzywny apartament na 15. piętrze z panoramicznym widokiem na Wisłę i Wawel. Wykończony przez architekta wnętrz. Klimatyzacja, smart home, dwa miejsca parkingowe.',
  'mieszkanie', 'sprzedaz', 'sale', 'Kraków', 'Kraków', 'Dębniki', 'ul. Nadwiślańska 1',
  50.0485, 19.9289, 1890000, 120, 4, 15, 20, 2023, true, true, true, false,
  ARRAY['https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800', 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800'],
  'NP-001', 'Katarzyna Wiśniewska', '+48 600 111 222', 'k.wisniewska@premium.pl', 'active'
),
(
  '5e2ce295-49c3-49c1-9004-f826ec98c683', '5e2ce295-49c3-49c1-9004-f826ec98c683',
  'Penthouse z tarasem na dachu',
  'Wyjątkowy penthouse z 80m² tarasu na dachu. Widok na całe miasto. Sauna, jacuzzi, prywatna winda.',
  'mieszkanie', 'wynajem', 'rent_monthly', 'Warszawa', 'Warszawa', 'Mokotów', 'ul. Puławska 233',
  52.1876, 21.0287, 18000, 180, 5, 25, 25, 2022, true, true, true, false,
  ARRAY['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=800'],
  'NP-002', 'Tomasz Zieliński', '+48 600 333 444', 't.zielinski@premium.pl', 'active'
),
(
  '5e2ce295-49c3-49c1-9004-f826ec98c683', '5e2ce295-49c3-49c1-9004-f826ec98c683',
  'Willa z basenem w Konstancinie',
  'Reprezentacyjna willa na 2000m² działki. Basen kryty, spa, siłownia. 6 sypialni, 5 łazienek. Ogrzewanie podłogowe.',
  'dom', 'sprzedaz', 'sale', 'Konstancin-Jeziorna', 'Konstancin-Jeziorna', 'Skolimów', 'ul. Parkowa 12',
  52.0912, 21.1045, 8500000, 450, 8, NULL, 3, 2020, false, false, true, true,
  ARRAY['https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'],
  'NP-003', 'Katarzyna Wiśniewska', '+48 600 111 222', 'k.wisniewska@premium.pl', 'active'
),
(
  '5e2ce295-49c3-49c1-9004-f826ec98c683', '5e2ce295-49c3-49c1-9004-f826ec98c683',
  'Apartament inwestycyjny Złota 44',
  'Apartament w prestiżowym wieżowcu Złota 44. Wynajem krótkoterminowy dozwolony. Wysoki ROI.',
  'mieszkanie', 'sprzedaz', 'sale', 'Warszawa', 'Warszawa', 'Śródmieście', 'ul. Złota 44',
  52.2319, 21.0045, 2450000, 65, 2, 35, 52, 2018, true, true, true, false,
  ARRAY['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800'],
  'NP-004', 'Tomasz Zieliński', '+48 600 333 444', 't.zielinski@premium.pl', 'active'
),
(
  '5e2ce295-49c3-49c1-9004-f826ec98c683', '5e2ce295-49c3-49c1-9004-f826ec98c683',
  'Apartament z ogrodem zimowym',
  'Elegancki apartament z prywatnym ogrodem zimowym. Doskonała lokalizacja przy Łazienkach Królewskich.',
  'mieszkanie', 'wynajem', 'rent_monthly', 'Warszawa', 'Warszawa', 'Mokotów', 'ul. Łowicka 8',
  52.2156, 21.0312, 9500, 95, 3, 1, 5, 2019, true, true, true, true,
  ARRAY['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800'],
  'NP-005', 'Katarzyna Wiśniewska', '+48 600 111 222', 'k.wisniewska@premium.pl', 'active'
),

-- Best Future - 5 ogłoszeń
(
  'e8b6592e-91b1-4cc4-ab0e-02025b503eb5', 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5',
  'Mieszkanie 2-pokojowe na Woli',
  'Świetna kawalerka z osobną sypialnią. Po generalnym remoncie. Nowa kuchnia i łazienka. Metro w 5 minut.',
  'mieszkanie', 'sprzedaz', 'sale', 'Warszawa', 'Warszawa', 'Wola', 'ul. Leszno 14',
  52.2356, 20.9812, 520000, 45, 2, 4, 8, 2010, true, true, false, false,
  ARRAY['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'],
  'BF-001', 'Piotr Adamski', '+48 700 555 666', 'piotr@bestfuture.pl', 'active'
),
(
  'e8b6592e-91b1-4cc4-ab0e-02025b503eb5', 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5',
  'Kawalerka na Mokotowie do wynajęcia',
  'Przytulna kawalerka dla studenta lub młodej osoby pracującej. Umeblowana, z AGD. W cenie internet.',
  'kawalerka', 'wynajem', 'rent_monthly', 'Warszawa', 'Warszawa', 'Mokotów', 'ul. Puławska 95',
  52.2067, 21.0234, 2400, 28, 1, 3, 6, 2005, false, true, false, false,
  ARRAY['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800'],
  'BF-002', 'Marta Lewandowska', '+48 700 777 888', 'marta@bestfuture.pl', 'active'
),
(
  'e8b6592e-91b1-4cc4-ab0e-02025b503eb5', 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5',
  'Segment w zabudowie szeregowej - Wilanów',
  'Nowoczesny segment z ogródkiem. 3 poziomy, garaż, taras. Zamknięte osiedle z ochroną.',
  'dom', 'sprzedaz', 'sale', 'Warszawa', 'Warszawa', 'Wilanów', 'ul. Kolegialna 12',
  52.1654, 21.0756, 1150000, 145, 4, NULL, 3, 2021, true, false, true, true,
  ARRAY['https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800', 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800'],
  'BF-003', 'Piotr Adamski', '+48 700 555 666', 'piotr@bestfuture.pl', 'active'
),
(
  'e8b6592e-91b1-4cc4-ab0e-02025b503eb5', 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5',
  'Działka rekreacyjna nad jeziorem',
  'Działka z dostępem do jeziora. Idealna na domek letniskowy. Cicha okolica, las w pobliżu.',
  'dzialka', 'sprzedaz', 'sale', 'Serock', 'Serock', NULL, 'ul. Jeziorna',
  52.5234, 21.0789, 180000, 800, NULL, NULL, NULL, NULL, false, false, false, false,
  ARRAY['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800'],
  'BF-004', 'Marta Lewandowska', '+48 700 777 888', 'marta@bestfuture.pl', 'active'
),
(
  'e8b6592e-91b1-4cc4-ab0e-02025b503eb5', 'e8b6592e-91b1-4cc4-ab0e-02025b503eb5',
  'Pokój w mieszkaniu studenckim',
  'Duży pokój (18m²) w 3-pokojowym mieszkaniu. Wspólna kuchnia i łazienka. Blisko UW.',
  'pokoj', 'wynajem', 'rent_monthly', 'Warszawa', 'Warszawa', 'Ochota', 'ul. Grójecka 45',
  52.2198, 20.9756, 1200, 18, 1, 2, 5, 1975, false, true, false, false,
  ARRAY['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800'],
  'BF-005', 'Piotr Adamski', '+48 700 555 666', 'piotr@bestfuture.pl', 'active'
);