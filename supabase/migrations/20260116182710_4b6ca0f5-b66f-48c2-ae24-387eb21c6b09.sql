-- Usunięcie pustych wpisów pojazdów
DELETE FROM vehicle_listings WHERE id IN (
  '5ac728d2-4521-4675-ae56-7ca4cb361c1b',
  'b82a4cae-ce10-42b3-a386-364e01a1d811'
);

-- Działka budowlana w Wieliczce (1 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800',
  'https://images.unsplash.com/photo-1625602812206-5ec545ca1231?w=800',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800'
] WHERE id = '3add99a4-4185-43c3-b074-d4e74510a978';

-- Kawalerka na Mokotowie (1 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800'
] WHERE id = 'ffe05d70-4241-4807-8879-a811a5fa8634';

-- Pokój studencki (1 → 3 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800'
] WHERE id = '7645887a-dbf5-430b-8c1f-32b087048659';

-- Nowoczesne studio centrum (2 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800'
] WHERE id = '3602cfd5-da6f-4687-94a0-427fc1610874';

-- Lokal usługowy (2 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800',
  'https://images.unsplash.com/photo-1562664348-2ca0c81e4f7e?w=800'
] WHERE id = '707596bc-86a3-4a21-abb9-e9fa6a9244a9';

-- Penthouse z tarasem (2 → 5 zdjęć)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  'https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=800'
] WHERE id = 'f17c683d-43bd-4b6f-bc6a-6e3d79b4cfd6';

-- Apartament inwestycyjny Złota 44 (2 → 5 zdjęć)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800',
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800',
  'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
  'https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=800'
] WHERE id = '6de24d6e-a8b8-41be-bd0b-fcfd070c4eb3';

-- Apartament z ogrodem zimowym (2 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
  'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800',
  'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?w=800',
  'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'
] WHERE id = 'bdea2652-a960-4932-bbaa-e4a92599134e';

-- Mieszkanie 2-pokojowe na Woli (2 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800',
  'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800'
] WHERE id = 'a7fea637-2698-4235-9718-084cc31125a3';

-- Działka rekreacyjna nad jeziorem (2 → 4 zdjęcia)
UPDATE real_estate_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
  'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=800',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800'
] WHERE id = '10765929-6636-4a91-afc4-0798d0651037';