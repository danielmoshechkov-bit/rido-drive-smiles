-- Create car_brands table
CREATE TABLE public.car_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create car_models table
CREATE TABLE public.car_models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.car_brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(brand_id, name)
);

-- Enable RLS
ALTER TABLE public.car_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_models ENABLE ROW LEVEL SECURITY;

-- RLS policies for car_brands (public read, admin write)
CREATE POLICY "Anyone can view car brands" ON public.car_brands FOR SELECT USING (true);
CREATE POLICY "Admins can manage car brands" ON public.car_brands FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for car_models (public read, admin write)
CREATE POLICY "Anyone can view car models" ON public.car_models FOR SELECT USING (true);
CREATE POLICY "Admins can manage car models" ON public.car_models FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for better performance
CREATE INDEX idx_car_models_brand_id ON public.car_models(brand_id);
CREATE INDEX idx_car_brands_name ON public.car_brands(name);
CREATE INDEX idx_car_models_name ON public.car_models(name);

-- Insert popular car brands
INSERT INTO public.car_brands (name) VALUES
('Abarth'), ('Alfa Romeo'), ('Aston Martin'), ('Audi'), ('Bentley'), ('BMW'), ('Bugatti'),
('Cadillac'), ('Chevrolet'), ('Chrysler'), ('Citroën'), ('Cupra'), ('Dacia'), ('Daewoo'),
('Daihatsu'), ('Dodge'), ('DS'), ('Ferrari'), ('Fiat'), ('Ford'), ('Genesis'), ('Honda'),
('Hummer'), ('Hyundai'), ('Infiniti'), ('Isuzu'), ('Jaguar'), ('Jeep'), ('Kia'),
('Lamborghini'), ('Lancia'), ('Land Rover'), ('Lexus'), ('Lincoln'), ('Lotus'), ('Maserati'),
('Mazda'), ('McLaren'), ('Mercedes-Benz'), ('MG'), ('Mini'), ('Mitsubishi'), ('Nissan'),
('Opel'), ('Peugeot'), ('Polestar'), ('Porsche'), ('Renault'), ('Rolls-Royce'), ('Rover'),
('Saab'), ('Seat'), ('Skoda'), ('Smart'), ('SsangYong'), ('Subaru'), ('Suzuki'), ('Tesla'),
('Toyota'), ('Volkswagen'), ('Volvo');

-- Insert models for each brand
-- Abarth
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['124 Spider', '500', '595', '695', 'Punto']) FROM public.car_brands WHERE name = 'Abarth';

-- Alfa Romeo
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['147', '156', '159', '166', '4C', 'Brera', 'Giulia', 'Giulietta', 'GT', 'GTV', 'MiTo', 'Spider', 'Stelvio', 'Tonale']) FROM public.car_brands WHERE name = 'Alfa Romeo';

-- Audi
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'e-tron', 'e-tron GT', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'R8', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7', 'RSQ8', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SQ5', 'SQ7', 'SQ8', 'TT', 'TTS', 'TTRS']) FROM public.car_brands WHERE name = 'Audi';

-- BMW
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'i3', 'i4', 'i5', 'i7', 'i8', 'iX', 'iX1', 'iX3', 'M2', 'M3', 'M4', 'M5', 'M8', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM', 'Z4']) FROM public.car_brands WHERE name = 'BMW';

-- Citroën
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Berlingo', 'C1', 'C2', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 Picasso', 'C5', 'C5 Aircross', 'C5 X', 'C6', 'C8', 'DS3', 'DS4', 'DS5', 'Jumper', 'Jumpy', 'Nemo', 'Saxo', 'SpaceTourer', 'Xsara', 'Xsara Picasso']) FROM public.car_brands WHERE name = 'Citroën';

-- Cupra
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Ateca', 'Born', 'Formentor', 'Leon', 'Tavascan']) FROM public.car_brands WHERE name = 'Cupra';

-- Dacia
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Dokker', 'Duster', 'Jogger', 'Lodgy', 'Logan', 'Sandero', 'Spring']) FROM public.car_brands WHERE name = 'Dacia';

-- DS
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['DS 3', 'DS 3 Crossback', 'DS 4', 'DS 5', 'DS 7', 'DS 9']) FROM public.car_brands WHERE name = 'DS';

-- Fiat
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['124 Spider', '500', '500L', '500X', '500e', 'Bravo', 'Doblo', 'Ducato', 'Fiorino', 'Freemont', 'Grande Punto', 'Linea', 'Panda', 'Punto', 'Punto Evo', 'Qubo', 'Scudo', 'Sedici', 'Stilo', 'Tipo', 'Ulysse']) FROM public.car_brands WHERE name = 'Fiat';

-- Ford
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['B-Max', 'C-Max', 'EcoSport', 'Edge', 'Explorer', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Grand C-Max', 'Ka', 'Kuga', 'Mondeo', 'Mustang', 'Mustang Mach-E', 'Puma', 'Ranger', 'S-Max', 'Tourneo Connect', 'Tourneo Courier', 'Tourneo Custom', 'Transit', 'Transit Connect', 'Transit Courier', 'Transit Custom']) FROM public.car_brands WHERE name = 'Ford';

-- Honda
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Accord', 'City', 'Civic', 'CR-V', 'CR-Z', 'e', 'FR-V', 'HR-V', 'Insight', 'Jazz', 'Legend', 'NSX', 'S2000', 'ZR-V']) FROM public.car_brands WHERE name = 'Honda';

-- Hyundai
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Accent', 'Atos', 'Bayon', 'Coupe', 'Elantra', 'Galloper', 'Genesis', 'Getz', 'Grand Santa Fe', 'Grandeur', 'i10', 'i20', 'i30', 'i40', 'i50', 'IONIQ', 'IONIQ 5', 'IONIQ 6', 'ix20', 'ix35', 'ix55', 'Kona', 'Matrix', 'Palisade', 'Santa Fe', 'Sonata', 'Staria', 'Terracan', 'Trajet', 'Tucson', 'Veloster']) FROM public.car_brands WHERE name = 'Hyundai';

-- Jaguar
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['E-Pace', 'F-Pace', 'F-Type', 'I-Pace', 'S-Type', 'X-Type', 'XE', 'XF', 'XJ', 'XK']) FROM public.car_brands WHERE name = 'Jaguar';

-- Jeep
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Cherokee', 'Commander', 'Compass', 'Gladiator', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler']) FROM public.car_brands WHERE name = 'Jeep';

-- Kia
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Carens', 'Carnival', 'Ceed', 'Cerato', 'EV6', 'EV9', 'Magentis', 'Niro', 'Opirus', 'Optima', 'Picanto', 'ProCeed', 'Rio', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Stonic', 'Venga', 'XCeed']) FROM public.car_brands WHERE name = 'Kia';

-- Land Rover
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar']) FROM public.car_brands WHERE name = 'Land Rover';

-- Lexus
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['CT', 'ES', 'GS', 'GX', 'IS', 'LC', 'LFA', 'LS', 'LX', 'NX', 'RC', 'RX', 'RZ', 'SC', 'UX']) FROM public.car_brands WHERE name = 'Lexus';

-- Mazda
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['2', '3', '5', '6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-7', 'CX-9', 'MX-30', 'MX-5', 'RX-7', 'RX-8']) FROM public.car_brands WHERE name = 'Mazda';

-- Mercedes-Benz
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['A-Class', 'AMG GT', 'B-Class', 'C-Class', 'CL', 'CLA', 'CLC', 'CLK', 'CLS', 'E-Class', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'R-Class', 'S-Class', 'SL', 'SLC', 'SLK', 'SLR', 'SLS', 'Sprinter', 'V-Class', 'Viano', 'Vito']) FROM public.car_brands WHERE name = 'Mercedes-Benz';

-- Mini
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Cabrio', 'Clubman', 'Countryman', 'Coupe', 'Hatch', 'One', 'Paceman', 'Roadster']) FROM public.car_brands WHERE name = 'Mini';

-- Mitsubishi
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['ASX', 'Colt', 'Eclipse Cross', 'Galant', 'Grandis', 'i-MiEV', 'L200', 'Lancer', 'Outlander', 'Pajero', 'Space Star']) FROM public.car_brands WHERE name = 'Mitsubishi';

-- Nissan
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['350Z', '370Z', 'Almera', 'Ariya', 'GT-R', 'Juke', 'Leaf', 'Micra', 'Murano', 'Navara', 'Note', 'NV200', 'NV300', 'Pathfinder', 'Pixo', 'Primera', 'Primastar', 'Pulsar', 'Qashqai', 'Terrano', 'Tiida', 'X-Trail']) FROM public.car_brands WHERE name = 'Nissan';

-- Opel
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Adam', 'Agila', 'Ampera', 'Antara', 'Astra', 'Cascada', 'Combo', 'Corsa', 'Crossland', 'Frontera', 'Grandland', 'GT', 'Insignia', 'Karl', 'Meriva', 'Mokka', 'Movano', 'Omega', 'Signum', 'Tigra', 'Vectra', 'Vivaro', 'Zafira']) FROM public.car_brands WHERE name = 'Opel';

-- Peugeot
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['1007', '107', '108', '2008', '206', '207', '208', '3008', '301', '306', '307', '308', '4007', '4008', '405', '406', '407', '5008', '508', '607', '806', '807', 'Bipper', 'Boxer', 'Expert', 'iOn', 'Partner', 'RCZ', 'Rifter', 'Traveller']) FROM public.car_brands WHERE name = 'Peugeot';

-- Porsche
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['718 Boxster', '718 Cayman', '911', '918 Spyder', '924', '944', '968', 'Boxster', 'Cayenne', 'Cayman', 'Macan', 'Panamera', 'Taycan']) FROM public.car_brands WHERE name = 'Porsche';

-- Renault
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Arkana', 'Austral', 'Captur', 'Clio', 'Espace', 'Express', 'Fluence', 'Grand Scenic', 'Kadjar', 'Kangoo', 'Koleos', 'Laguna', 'Latitude', 'Master', 'Megane', 'Modus', 'Scenic', 'Symbol', 'Talisman', 'Trafic', 'Twingo', 'Vel Satis', 'Wind', 'ZOE']) FROM public.car_brands WHERE name = 'Renault';

-- Seat
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Alhambra', 'Altea', 'Arona', 'Ateca', 'Cordoba', 'Exeo', 'Ibiza', 'Leon', 'Mii', 'Tarraco', 'Toledo']) FROM public.car_brands WHERE name = 'Seat';

-- Skoda
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Citigo', 'Enyaq', 'Fabia', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Rapid', 'Roomster', 'Scala', 'Superb', 'Yeti']) FROM public.car_brands WHERE name = 'Skoda';

-- Subaru
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['BRZ', 'Forester', 'Impreza', 'Legacy', 'Levorg', 'Outback', 'Solterra', 'Trezia', 'WRX', 'XV']) FROM public.car_brands WHERE name = 'Subaru';

-- Suzuki
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Across', 'Alto', 'Baleno', 'Celerio', 'Grand Vitara', 'Ignis', 'Jimny', 'Kizashi', 'Liana', 'S-Cross', 'Splash', 'Swift', 'SX4', 'Vitara', 'Wagon R']) FROM public.car_brands WHERE name = 'Suzuki';

-- Tesla
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Cybertruck', 'Model 3', 'Model S', 'Model X', 'Model Y', 'Roadster']) FROM public.car_brands WHERE name = 'Tesla';

-- Toyota
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['4Runner', 'Auris', 'Avensis', 'Aygo', 'Aygo X', 'bZ4X', 'C-HR', 'Camry', 'Celica', 'Corolla', 'Corolla Cross', 'Crown', 'GR86', 'GR Supra', 'GR Yaris', 'Highlander', 'Hilux', 'IQ', 'Land Cruiser', 'Mirai', 'MR2', 'Prius', 'Prius+', 'ProAce', 'ProAce City', 'RAV4', 'Sequoia', 'Sienna', 'Supra', 'Tundra', 'Urban Cruiser', 'Verso', 'Yaris', 'Yaris Cross']) FROM public.car_brands WHERE name = 'Toyota';

-- Volkswagen
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Amarok', 'Arteon', 'Atlas', 'Beetle', 'Bora', 'Caddy', 'California', 'Caravelle', 'CC', 'Crafter', 'Cross Polo', 'Cross Touran', 'CrossGolf', 'Eos', 'Fox', 'Golf', 'Golf Plus', 'Golf Sportsvan', 'ID.3', 'ID.4', 'ID.5', 'ID.6', 'ID.7', 'ID. Buzz', 'Jetta', 'Lupo', 'Multivan', 'New Beetle', 'Passat', 'Phaeton', 'Polo', 'Scirocco', 'Sharan', 'T-Cross', 'T-Roc', 'Taigo', 'Tiguan', 'Tiguan Allspace', 'Touareg', 'Touran', 'Transporter', 'Up']) FROM public.car_brands WHERE name = 'Volkswagen';

-- Volvo
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['C30', 'C40', 'C70', 'EX30', 'EX90', 'S40', 'S60', 'S70', 'S80', 'S90', 'V40', 'V50', 'V60', 'V70', 'V90', 'XC40', 'XC60', 'XC70', 'XC90']) FROM public.car_brands WHERE name = 'Volvo';

-- Smart
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['#1', '#3', 'Forfour', 'Fortwo', 'Roadster']) FROM public.car_brands WHERE name = 'Smart';

-- SsangYong
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['Actyon', 'Korando', 'Kyron', 'Musso', 'Rexton', 'Rodius', 'Tivoli', 'Torres', 'XLV']) FROM public.car_brands WHERE name = 'SsangYong';

-- MG
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['3', '4', '5', 'Cyberster', 'EHS', 'HS', 'Marvel R', 'MG4', 'MG5', 'ZS']) FROM public.car_brands WHERE name = 'MG';

-- Polestar
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['1', '2', '3', '4']) FROM public.car_brands WHERE name = 'Polestar';

-- Genesis
INSERT INTO public.car_models (brand_id, name) SELECT id, unnest(ARRAY['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80']) FROM public.car_brands WHERE name = 'Genesis';