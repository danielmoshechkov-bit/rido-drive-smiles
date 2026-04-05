
DO $$
DECLARE
  uid uuid := '3696bdb6-e010-4f18-bc5d-74fd8dc988b7';
  cat_elektronika uuid := 'd2c2528f-85c2-4d89-ad61-8b33c8df4de1';
  cat_moda uuid := '8f669dce-fa13-49f1-8dd3-8d5e6f299aee';
  cat_dom uuid := '0224ea23-bf64-4c22-85b3-333b16e82d51';
  cat_sport uuid := '8b393064-3044-467f-a6c8-87117ba8e0f9';
  cat_dziecko uuid := 'f2c936d6-d875-4726-bf21-bf6909a8ac8a';
  cat_moto uuid := '784596eb-04a5-4f17-af21-6c62f1924e5e';
  cat_ksiazki uuid := '84ab5369-7b70-4b10-b434-8b83b8ce45af';
  cat_zwierzeta uuid := 'a2e3c13c-3129-48dc-b925-87f227aef68c';
  cat_inne uuid := '922f5e6a-3592-4571-9dbd-0faa9d393de6';
  lid uuid;
BEGIN

-- 1. iPhone 15 Pro
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'iPhone 15 Pro 256GB – Tytan naturalny', 'Sprzedaję iPhone 15 Pro 256GB w kolorze tytan naturalny. Telefon kupiony w oficjalnym Apple Store, na gwarancji do marca 2026. Stan idealny, bez żadnych rys i uszkodzeń. W zestawie oryginalne pudełko, kabel USB-C oraz etui Apple skórzane. Bateria 97% kondycji.', 4200, true, cat_elektronika, 'jak_nowy', 'Warszawa', 92, 'active', 156, now() - interval '2 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800', 0),
(lid, 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800', 1);

-- 2. Rower górski
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Rower górski Trek Marlin 7 2024 – rozmiar L', 'Trek Marlin 7 rocznik 2024, rama aluminiowa rozmiar L, koła 29 cali. Widelec RockShox Judy z blokowaniem, napęd Shimano Deore 1x10. Przejechane ok. 500 km, rower garażowany.', 3200, true, cat_sport, 'jak_nowy', 'Kraków', 88, 'active', 89, now() - interval '3 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?w=800', 0);

-- 3. Sofa narożna
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Sofa narożna IKEA Kivik – szary melanż', 'Sprzedaję sofę narożną IKEA Kivik w kolorze szarym. Wymiary: 280x210 cm. Pokrowce zdejmowane do prania. Używana 2 lata w salonie niepalących. Rozkładana funkcja spania.', 2100, true, cat_dom, 'dobry', 'Poznań', 85, 'active', 234, now() - interval '1 day')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', 0),
(lid, 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800', 1);

-- 4. Kurtka The North Face
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Kurtka puchowa The North Face 1996 Retro Nuptse – M', 'Oryginalna kurtka puchowa The North Face 1996 Retro Nuptse w rozmiarze M, kolor czarny. Noszona jeden sezon. Wypełnienie 700-fill puch gęsi, wodoodporna powłoka DWR.', 890, false, cat_moda, 'jak_nowy', 'Gdańsk', 90, 'active', 312, now() - interval '5 hours')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1544923246-77307dd270b4?w=800', 0);

-- 5. PlayStation 5
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'PlayStation 5 Slim + 2 pady + 5 gier', 'PS5 Slim z napędem Blu-ray. 2 kontrolery DualSense, 5 gier: Spider-Man 2, God of War Ragnarök, Horizon Forbidden West, Gran Turismo 7, Astro Bot. Stan idealny.', 2500, true, cat_elektronika, 'jak_nowy', 'Wrocław', 94, 'active', 445, now() - interval '6 hours')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800', 0);

-- 6. Wózek dziecięcy
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Wózek dziecięcy Cybex Priam 3w1 – Rose Gold', 'Wózek Cybex Priam w wersji 3w1: gondola, spacerówka i fotelik samochodowy. Rama Rose Gold edition. Używany przez jedno dziecko, stan bardzo dobry.', 3500, true, cat_dziecko, 'dobry', 'Katowice', 87, 'active', 178, now() - interval '1 day')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1586105449897-20b5efeb3233?w=800', 0);

-- 7. Opony zimowe
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Opony zimowe Michelin Alpin 6 – 225/45 R17, komplet', 'Komplet 4 opon zimowych Michelin Alpin 6. Bieżnik 6mm. Używane jeden sezon, produkcja 2024. Idealne do BMW 3, Audi A4, VW Passat.', 1200, false, cat_moto, 'dobry', 'Łódź', 82, 'active', 67, now() - interval '4 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800', 0);

-- 8. MacBook Air M2
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'MacBook Air M2 2023 – 16GB/512GB, Midnight', 'Apple MacBook Air z chipem M2, 16GB RAM, 512GB SSD. Na gwarancji Apple Care+ do 2027. Bateria: 42 cykle. Używany wyłącznie do pracy biurowej.', 5200, true, cat_elektronika, 'jak_nowy', 'Warszawa', 95, 'active', 523, now() - interval '12 hours')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800', 0);

-- 9. Nike Air Max
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Nike Air Max 90 OG – Infrared, rozmiar 43', 'Kultowe Nike Air Max 90 w kolorystyce Infrared. Nowe, nienoszone, w oryginalnym pudełku. Kupione na nike.com, paragon w zestawie.', 550, false, cat_moda, 'nowy', 'Warszawa', 91, 'active', 198, now() - interval '2 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800', 0);

-- 10. Robot kuchenny
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Robot kuchenny Thermomix TM6 – komplet z Cookidoo', 'Thermomix TM6 w pełnym zestawie. Subskrypcja Cookidoo aktywna do końca 2026. Robot z 2023 roku, perfekcyjnie sprawny.', 4800, true, cat_dom, 'dobry', 'Lublin', 89, 'active', 267, now() - interval '3 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800', 0);

-- 11. LEGO Technic
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'LEGO Technic Porsche 911 GT3 RS – 42056, kompletny', 'Set kolekcjonerski, wycofany z produkcji. 2704 elementy, instrukcje i pudełko oryginalne. Idealny prezent dla kolekcjonera.', 1800, true, cat_inne, 'dobry', 'Szczecin', 86, 'active', 145, now() - interval '5 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1587654780291-39c9404d7dd0?w=800', 0);

-- 12. Gitara akustyczna
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Gitara akustyczna Yamaha FG830 – naturalna', 'Yamaha FG830 z litym topem świerkowym i korpusem z palisandru. Piękne ciepłe brzmienie. W zestawie twarde etui Gator.', 980, true, cat_sport, 'dobry', 'Kraków', 84, 'active', 89, now() - interval '6 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800', 0);

-- 13. Książki IT
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Zestaw książek IT: Clean Code, DDIA, Pragmatic Programmer', 'Zestaw 3 kultowych książek programistycznych w wersji angielskiej. Stan bardzo dobry, bez notatek i podkreśleń.', 180, false, cat_ksiazki, 'dobry', 'Warszawa', 80, 'active', 56, now() - interval '7 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800', 0);

-- 14. Akwarium
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Akwarium 200L Juwel Rio z szafką i pełnym wyposażeniem', 'Juwel Rio 200L z oryginalną szafką. Filtr wewnętrzny, grzałka, oświetlenie LED, podłoże Dennerle, kamienie wulkaniczne.', 900, true, cat_zwierzeta, 'dobry', 'Gdynia', 83, 'active', 45, now() - interval '8 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1520301255226-bf5f144451c1?w=800', 0);

-- 15. Ekspres DeLonghi
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Ekspres ciśnieniowy DeLonghi Magnifica S – automatyczny', 'DeLonghi Magnifica S ECAM 22.110.B. Młynek ceramiczny 13 stopni, ciśnienie 15 bar. Robi espresso, lungo i cappuccino. Idealny stan.', 1100, true, cat_dom, 'dobry', 'Bydgoszcz', 87, 'active', 134, now() - interval '2 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800', 0);

-- 16. Dron DJI
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Dron DJI Mini 3 Pro + Fly More Combo', 'DJI Mini 3 Pro z kontrolerem RC, 3 baterie, ładowarka hub, torba. Waga <249g. Kamera 4K/60fps, czas lotu do 34 min.', 3400, true, cat_elektronika, 'jak_nowy', 'Toruń', 93, 'active', 289, now() - interval '1 day')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800', 0);

-- 17. Fotel gamingowy
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Fotel gamingowy Secretlab Titan Evo 2024 – rozmiar R', 'Secretlab Titan Evo 2024, tapicerka SoftWeave Plus. Podłokietniki 4D, poduszka lędźwiowa magnetyczna. Kupiony 3 miesiące temu, jak nowy.', 1700, false, cat_dom, 'jak_nowy', 'Poznań', 88, 'active', 167, now() - interval '4 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=800', 0);

-- 18. Zegarek Casio
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Zegarek Casio G-Shock GA-2100-1A1ER – CasiOak', 'Casio G-Shock CasiOak full black. Odporność 200m WR, podświetlenie LED. Stan idealny, noszony okazjonalnie. Pudełko i dokumenty.', 350, false, cat_moda, 'jak_nowy', 'Rzeszów', 85, 'active', 98, now() - interval '3 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800', 0);

-- 19. Odkurzacz robot
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Odkurzacz robot Roborock S8 Pro Ultra – stacja dokująca', 'Roborock S8 Pro Ultra z pełną stacją dokującą. Podwójna gumowa szczotka, mop wibracyjny, siła ssania 6000Pa. Mapowanie LiDAR. 4 miesiące użytkowania.', 3900, true, cat_dom, 'jak_nowy', 'Wrocław', 96, 'active', 378, now() - interval '10 hours')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800', 0);

-- 20. Namiot MSR
INSERT INTO general_listings (user_id, title, description, price, price_negotiable, category_id, condition, location, ai_score, status, views_count, created_at)
VALUES (uid, 'Namiot trekkingowy MSR Hubba Hubba NX 2 – ultralight', 'MSR Hubba Hubba NX 2-osobowy. Waga 1.72 kg. Podwójna ściana, 2 apsydy, 2 wejścia. Używany na 5 wyprawach, idealny stan.', 1600, true, cat_sport, 'dobry', 'Zakopane', 86, 'active', 112, now() - interval '5 days')
RETURNING id INTO lid;
INSERT INTO general_listing_photos (listing_id, url, display_order) VALUES
(lid, 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800', 0);

END $$;
