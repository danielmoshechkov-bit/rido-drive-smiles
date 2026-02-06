// ASARI CRM Dictionary Mappings based on definictions.xml
// Format EbiuroV2

// Typ oferty (słownik 1) → transaction_type
export const TRANSACTION_TYPE_MAP: Record<string, string> = {
  'SPRZEDAŻ': 'sale',
  'SPRZEDAZ': 'sale',
  'WYNAJEM': 'rent',
  'NAJEM': 'rent',
  'ZAMIANA': 'exchange',
};

// Typ nieruchomości (słownik 68) → property_type
export const PROPERTY_TYPE_MAP: Record<string, string> = {
  'DOM': 'house',
  'MIESZKANIE': 'apartment',
  'DZIAŁKA': 'land',
  'DZIALKA': 'land',
  'LOKAL': 'commercial',
  'OBIEKT': 'commercial',
  'POKÓJ': 'room',
  'POKOJ': 'room',
  'GARAŻ': 'garage',
  'GARAZ': 'garage',
  'BIURO': 'commercial',
  'MAGAZYN': 'commercial',
  'HALA': 'commercial',
};

// Rodzaj mieszkania (słownik 74)
export const APARTMENT_TYPE_MAP: Record<string, string> = {
  'BLOK': 'apartment',
  'KAMIENICA': 'apartment',
  'APARTAMENTOWIEC': 'apartment',
  'LOFT': 'apartment',
  'PLOMBA': 'apartment',
  'WIEŻOWIEC': 'apartment',
  'WIEZOWIEC': 'apartment',
  'SZEREGOWIEC': 'apartment',
  'SEGMENT': 'apartment',
};

// Typ domu (słownik 75)
export const HOUSE_TYPE_MAP: Record<string, string> = {
  'WOLNOSTOJĄCY': 'house',
  'WOLNOSTOJACY': 'house',
  'BLIŹNIAK': 'house',
  'BLIZNIAK': 'house',
  'SZEREGOWIEC': 'house',
  'SZEREGOWY': 'house',
  'SEGMENT': 'house',
  'ŚRODKOWY': 'house',
  'SRODKOWY': 'house',
  'SKRAJNY': 'house',
  'ATRIALNY': 'house',
  'DWOREK': 'house',
  'PAŁAC': 'house',
  'PALAC': 'house',
  'REZYDENCJA': 'house',
};

// Mapowanie ID parametrów ASARI → nazwy pól w bazie
export const ASARI_FIELD_MAP: Record<string, string> = {
  '1': 'external_id',      // numer oferty (signature)
  '491': 'title',          // tytuł ogłoszenia
  '10': 'price',           // cena ofertowa PLN
  '58': 'area',            // pow. użytkowa [m2]
  '79': 'rooms',           // liczba pokoi
  '62': 'floor',           // piętro
  '63': 'total_floors',    // ilość pięter w budynku
  '71': 'build_year',      // rok budowy
  '48': 'city',            // miejscowość
  '49': 'district',        // dzielnica
  '300': 'address',        // ulica
  '201': 'latitude',       // szerokość geograficzna
  '202': 'longitude',      // długość geograficzna
  '64': 'description',     // uwagi dodatkowe (opis)
  '170': 'contact_phone',  // agent - telefon
  '171': 'contact_email',  // agent - e-mail
  '305': 'contact_person', // agent - nazwa
  '36': 'property_type',   // typ nieruchomości (słownik)
  '43': 'transaction_type',// operacja (słownik)
  '82': 'amenities',       // przynależne (do parsowania)
  '496': 'video_url',      // link do wideo
  '497': 'virtual_tour_url', // link do spaceru wirtualnego
};

// Parsowanie pola "przynależne" (ID:82) na cechy booleowskie
export function parseAmenities(amenitiesText: string): {
  has_balcony: boolean;
  has_garden: boolean;
  has_parking: boolean;
  has_elevator: boolean;
} {
  const text = (amenitiesText || '').toUpperCase();
  return {
    has_balcony: text.includes('BALKON') || text.includes('TARAS') || text.includes('LOGGIA'),
    has_garden: text.includes('OGRÓD') || text.includes('OGROD') || text.includes('DZIAŁKA') || text.includes('DZIALKA'),
    has_parking: text.includes('GARAŻ') || text.includes('GARAZ') || text.includes('PARKING') || text.includes('MIEJSCE POST'),
    has_elevator: text.includes('WINDA') || text.includes('DŹWIG') || text.includes('DZWIG'),
  };
}

// Normalizacja ceny (usuwanie separatorów tysięcy, konwersja na liczbę)
export function normalizePrice(priceStr: string | number | null): number | null {
  if (priceStr === null || priceStr === undefined || priceStr === '') return null;
  
  const numStr = String(priceStr)
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '');
  
  const num = parseFloat(numStr);
  return isNaN(num) ? null : num;
}

// Normalizacja liczb całkowitych
export function normalizeInt(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  const num = parseInt(String(value).replace(/\D/g, ''), 10);
  return isNaN(num) ? null : num;
}

// Normalizacja współrzędnych GPS
export function normalizeCoordinate(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  const num = parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? null : num;
}

// Mapowanie typu transakcji
export function mapTransactionType(value: string | null): string {
  if (!value) return 'sale';
  const normalized = value.toUpperCase().trim();
  return TRANSACTION_TYPE_MAP[normalized] || 'sale';
}

// Mapowanie typu nieruchomości
export function mapPropertyType(value: string | null): string {
  if (!value) return 'apartment';
  const normalized = value.toUpperCase().trim();
  return PROPERTY_TYPE_MAP[normalized] || APARTMENT_TYPE_MAP[normalized] || HOUSE_TYPE_MAP[normalized] || 'apartment';
}
