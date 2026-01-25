import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Polish postal code to city mapping (sample data)
const POSTAL_CODE_MAP: Record<string, { city: string; streets?: string[] }> = {
  '00': { city: 'Warszawa' },
  '01': { city: 'Warszawa' },
  '02': { city: 'Warszawa' },
  '03': { city: 'Warszawa' },
  '04': { city: 'Warszawa' },
  '30': { city: 'Kraków' },
  '31': { city: 'Kraków' },
  '50': { city: 'Wrocław' },
  '51': { city: 'Wrocław' },
  '60': { city: 'Poznań' },
  '61': { city: 'Poznań' },
  '80': { city: 'Gdańsk' },
  '81': { city: 'Gdynia' },
  '90': { city: 'Łódź' },
  '91': { city: 'Łódź' },
  '92': { city: 'Łódź' },
  '40': { city: 'Katowice' },
  '41': { city: 'Chorzów' },
  '70': { city: 'Szczecin' },
  '71': { city: 'Szczecin' },
  '20': { city: 'Lublin' },
  '35': { city: 'Rzeszów' },
  '15': { city: 'Białystok' },
  '25': { city: 'Kielce' },
  '45': { city: 'Opole' },
  '10': { city: 'Olsztyn' },
  '85': { city: 'Bydgoszcz' },
  '87': { city: 'Toruń' },
  '65': { city: 'Zielona Góra' },
  '75': { city: 'Koszalin' },
};

interface AddressData {
  street: string;
  building_number: string;
  apartment_number?: string;
  postal_code: string;
  city: string;
}

interface AddressFieldsProps {
  data: AddressData;
  onChange: (data: AddressData) => void;
  showApartment?: boolean;
  required?: {
    street?: boolean;
    building_number?: boolean;
    postal_code?: boolean;
    city?: boolean;
  };
}

export function AddressFields({ data, onChange, showApartment = true, required = {} }: AddressFieldsProps) {
  const [suggestedCity, setSuggestedCity] = useState<string | null>(null);

  // Auto-suggest city based on postal code
  useEffect(() => {
    const postalPrefix = data.postal_code?.replace('-', '').substring(0, 2);
    if (postalPrefix && postalPrefix.length === 2 && POSTAL_CODE_MAP[postalPrefix]) {
      const suggestion = POSTAL_CODE_MAP[postalPrefix].city;
      setSuggestedCity(suggestion);
      // Auto-fill city if empty
      if (!data.city && suggestion) {
        onChange({ ...data, city: suggestion });
      }
    } else {
      setSuggestedCity(null);
    }
  }, [data.postal_code]);

  const formatPostalCode = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    // Format as XX-XXX
    if (digits.length <= 2) return digits;
    return `${digits.substring(0, 2)}-${digits.substring(2, 5)}`;
  };

  const handlePostalCodeChange = (value: string) => {
    const formatted = formatPostalCode(value);
    onChange({ ...data, postal_code: formatted });
  };

  return (
    <div className="space-y-4">
      {/* Street */}
      <div>
        <Label>
          Ulica {required.street && <span className="text-destructive">*</span>}
        </Label>
        <Input
          value={data.street || ''}
          onChange={(e) => onChange({ ...data, street: e.target.value })}
          placeholder="ul. Przykładowa"
        />
      </div>

      {/* Building and Apartment numbers */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>
            Nr budynku {required.building_number && <span className="text-destructive">*</span>}
          </Label>
          <Input
            value={data.building_number || ''}
            onChange={(e) => onChange({ ...data, building_number: e.target.value })}
            placeholder="1A"
          />
        </div>
        {showApartment && (
          <div>
            <Label>Nr lokalu</Label>
            <Input
              value={data.apartment_number || ''}
              onChange={(e) => onChange({ ...data, apartment_number: e.target.value })}
              placeholder="(opcjonalnie)"
            />
          </div>
        )}
      </div>

      {/* Postal code and City */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>
            Kod pocztowy {required.postal_code && <span className="text-destructive">*</span>}
          </Label>
          <Input
            value={data.postal_code || ''}
            onChange={(e) => handlePostalCodeChange(e.target.value)}
            placeholder="00-000"
            maxLength={6}
          />
        </div>
        <div>
          <Label>
            Miasto {required.city && <span className="text-destructive">*</span>}
          </Label>
          <Input
            value={data.city || ''}
            onChange={(e) => onChange({ ...data, city: e.target.value })}
            placeholder="Miasto"
            className={suggestedCity && !data.city ? 'border-primary/50' : ''}
          />
          {suggestedCity && !data.city && (
            <p className="text-xs text-primary mt-1">Sugestia: {suggestedCity}</p>
          )}
        </div>
      </div>
    </div>
  );
}
