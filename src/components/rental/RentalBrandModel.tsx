import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Marka → Model (model zależny od marki). Reużywa globalnych tabel
 * car_brands / car_models (tylko ODCZYT). Datalisty dają podpowiedzi,
 * ale pole pozwala wpisać WŁASNY tekst spoza listy (wymóg 3.2).
 */
interface Props {
  brand: string; model: string;
  onBrand: (v: string) => void; onModel: (v: string) => void;
}

export function RentalBrandModel({ brand, model, onBrand, onModel }: Props) {
  const sb = supabase as any;
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from('car_brands').select('id, name').order('name');
      setBrands(data || []);
    })();
  }, [sb]);

  useEffect(() => {
    const b = brands.find((x) => x.name.toLowerCase() === brand.trim().toLowerCase());
    if (!b) { setModels([]); return; }
    (async () => {
      const { data } = await sb.from('car_models').select('name').eq('brand_id', b.id).order('name');
      setModels((data || []).map((m: any) => m.name));
    })();
  }, [brand, brands, sb]);

  return (
    <>
      <div className="space-y-1.5">
        <Label>Marka *</Label>
        <Input list="rental-brands-dl" value={brand} onChange={(e) => onBrand(e.target.value)} placeholder="np. Toyota" />
        <datalist id="rental-brands-dl">
          {brands.map((b) => <option key={b.id} value={b.name} />)}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <Label>Model *</Label>
        <Input list="rental-models-dl" value={model} onChange={(e) => onModel(e.target.value)} placeholder="wybierz lub wpisz własny" />
        <datalist id="rental-models-dl">
          {models.map((m) => <option key={m} value={m} />)}
        </datalist>
      </div>
    </>
  );
}
