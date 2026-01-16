-- Update vehicle listings with more photos (3-5 per listing)
UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800',
  'https://images.unsplash.com/photo-1520050206757-06e8e4cb5024?w=800',
  'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=800',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800'
] WHERE brand = 'BMW' AND model = '320d';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800',
  'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800',
  'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800',
  'https://images.unsplash.com/photo-1600712242805-5f78671b24da?w=800'
] WHERE brand = 'Audi' AND model = 'A4 Avant';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800',
  'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800',
  'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800',
  'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800',
  'https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800'
] WHERE brand = 'Mercedes-Benz' AND model = 'C200';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
  'https://images.unsplash.com/photo-1619405399517-d7fce0f13302?w=800',
  'https://images.unsplash.com/photo-1600712242805-5f78671b24da?w=800'
] WHERE brand = 'Volkswagen' AND model = 'Golf GTI';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800',
  'https://images.unsplash.com/photo-1626668893632-6f3a4466d22f?w=800',
  'https://images.unsplash.com/photo-1619767886558-efdc259b6e09?w=800',
  'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=800'
] WHERE brand = 'Toyota' AND model = 'Camry Hybrid';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=800',
  'https://images.unsplash.com/photo-1619405399517-d7fce0f13302?w=800',
  'https://images.unsplash.com/photo-1600712242805-5f78671b24da?w=800'
] WHERE brand = 'Skoda' AND model = 'Octavia Combi';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
  'https://images.unsplash.com/photo-1547744152-14d985cb937f?w=800',
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800'
] WHERE brand = 'Ford' AND model = 'Focus Active';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800',
  'https://images.unsplash.com/photo-1619767886558-efdc259b6e09?w=800',
  'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800'
] WHERE brand = 'Kia' AND model = 'Sportage';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
  'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800',
  'https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=800'
] WHERE brand = 'Renault' AND model = 'Megane E-Tech';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1619767886558-efdc259b6e09?w=800',
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800',
  'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800',
  'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800'
] WHERE brand = 'Hyundai' AND model = 'Tucson';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800',
  'https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?w=800',
  'https://images.unsplash.com/photo-1514867644123-6385d58d3cd4?w=800',
  'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800'
] WHERE brand = 'Porsche' AND model = '911 Carrera';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800',
  'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
  'https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=800',
  'https://images.unsplash.com/photo-1619767886558-efdc259b6e09?w=800'
] WHERE brand = 'Tesla' AND model = 'Model 3';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800',
  'https://images.unsplash.com/photo-1520050206757-06e8e4cb5024?w=800',
  'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=800'
] WHERE brand = 'BMW' AND model = 'X5';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800',
  'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800',
  'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800',
  'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800'
] WHERE brand = 'Mercedes-Benz' AND model = 'V-Class';

UPDATE vehicle_listings SET photos = ARRAY[
  'https://images.unsplash.com/photo-1570733577524-3a047079e80d?w=800',
  'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800',
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800'
] WHERE brand = 'Fiat' AND model = '500';