import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Boxes } from 'lucide-react';

export interface InventoryProduct {
  id: string;
  name_sales: string;
  sku: string | null;
  default_sale_price_net: number | null;
  default_sale_price_gross: number | null;
  default_purchase_price_net: number | null;
  default_purchase_price_gross: number | null;
}

interface Props {
  value: string;
  onChange: (name: string) => void;              // wolne pisanie (część bez magazynu)
  onSelectProduct: (p: InventoryProduct) => void; // wybór z magazynu (link + ceny)
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

// Opcjonalny picker: podpowiada produkty z magazynu (RLS = produkty tego usera).
// Pisanie ręczne działa jak zawsze; wybór z listy linkuje pozycję ze stanem.
export function InventoryProductAutocomplete({ value, onChange, onSelectProduct, placeholder, className, onKeyDown }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-autocomplete', value],
    enabled: open && value.trim().length >= 2,
    queryFn: async () => {
      const q = value.trim();
      const { data, error } = await (supabase as any)
        .from('inventory_products')
        .select('id, name_sales, sku, default_sale_price_net, default_sale_price_gross, default_purchase_price_net, default_purchase_price_gross')
        .or(`name_sales.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq('is_active', true)
        .limit(8);
      if (error) return [];
      return (data || []) as InventoryProduct[];
    },
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && products.length > 0 && (
        <div data-autocomplete-dropdown="true" className="absolute z-50 mt-1 w-72 max-w-[80vw] rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
          <div className="px-2 py-1 text-[10px] text-muted-foreground flex items-center gap-1 border-b"><Boxes className="h-3 w-3" /> Z magazynu (opcjonalnie)</div>
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { onSelectProduct(p); setOpen(false); }}
            >
              <span className="truncate">{p.name_sales}{p.sku ? ` · ${p.sku}` : ''}</span>
              <span className="tabular-nums text-xs text-muted-foreground shrink-0">{Number(p.default_sale_price_gross || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
