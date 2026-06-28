import { supabase } from '@/integrations/supabase/client';

// Magazyn warsztatu jest partiowy (inventory_batches.qty_remaining) i FIFO, BEZ
// triggera movement→partia — całą matematykę robimy tutaj, w aplikacji.
// Źródło ruchu zlecenia: source_type='workshop_order_item', source_id = id pozycji.

const SRC = 'workshop_order_item';

// Zejście FIFO. Opcja (b): nie blokuje — schodzi ile jest, zwraca `shortfall` do
// ostrzeżenia. Każde częściowe zejście to ruch 'out' z batch_id (do precyzyjnego zwrotu).
export async function consumeStock(productId: string, qty: number, sourceItemId: string): Promise<{ consumed: number; shortfall: number }> {
  let remaining = Number(qty) || 0;
  if (!productId || remaining <= 0) return { consumed: 0, shortfall: 0 };
  const { data: batches } = await (supabase as any)
    .from('inventory_batches')
    .select('id, qty_remaining, received_at')
    .eq('product_id', productId)
    .gt('qty_remaining', 0)
    .order('received_at', { ascending: true });
  for (const b of (batches || [])) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(b.qty_remaining));
    if (take <= 0) continue;
    await (supabase as any).from('inventory_batches').update({ qty_remaining: Number(b.qty_remaining) - take }).eq('id', b.id);
    await (supabase as any).from('inventory_movements').insert({
      product_id: productId, batch_id: b.id, direction: 'out', qty: take,
      source_type: SRC, source_id: sourceItemId, note: 'Zejście na zlecenie',
    });
    remaining -= take;
  }
  return { consumed: (Number(qty) || 0) - remaining, shortfall: remaining };
}

// Zwrot na magazyn: oddaje ilość DO PARTII PIERWOTNEJ (batch_id z ruchu 'out'),
// po czym usuwa ruchy 'out' tej pozycji (idempotentne — drugi zwrot nic nie robi).
// Wołane TYLKO gdy zlecenie nie jest zakończone (po „Zakończone" zejście jest ostateczne).
export async function returnStock(sourceItemId: string): Promise<void> {
  if (!sourceItemId) return;
  const { data: outs } = await (supabase as any)
    .from('inventory_movements')
    .select('id, product_id, batch_id, qty')
    .eq('source_type', SRC).eq('source_id', sourceItemId).eq('direction', 'out');
  for (const m of (outs || [])) {
    if (m.batch_id) {
      const { data: b } = await (supabase as any).from('inventory_batches').select('qty_remaining').eq('id', m.batch_id).maybeSingle();
      if (b) await (supabase as any).from('inventory_batches').update({ qty_remaining: Number(b.qty_remaining) + Number(m.qty) }).eq('id', m.batch_id);
    }
    await (supabase as any).from('inventory_movements').delete().eq('id', m.id);
  }
}

// Zmiana ilości pozycji: różnica (dobiór lub częściowy zwrot wg FIFO).
export async function adjustStock(productId: string, sourceItemId: string, oldQty: number, newQty: number): Promise<{ shortfall: number }> {
  const delta = (Number(newQty) || 0) - (Number(oldQty) || 0);
  if (delta > 0) { const r = await consumeStock(productId, delta, sourceItemId); return { shortfall: r.shortfall }; }
  if (delta < 0) {
    // częściowy zwrot: oddaj |delta| do najnowszych ruchów 'out' tej pozycji
    let toReturn = -delta;
    const { data: outs } = await (supabase as any)
      .from('inventory_movements')
      .select('id, product_id, batch_id, qty')
      .eq('source_type', SRC).eq('source_id', sourceItemId).eq('direction', 'out')
      .order('created_at', { ascending: false });
    for (const m of (outs || [])) {
      if (toReturn <= 0) break;
      const give = Math.min(toReturn, Number(m.qty));
      if (m.batch_id) {
        const { data: b } = await (supabase as any).from('inventory_batches').select('qty_remaining').eq('id', m.batch_id).maybeSingle();
        if (b) await (supabase as any).from('inventory_batches').update({ qty_remaining: Number(b.qty_remaining) + give }).eq('id', m.batch_id);
      }
      if (give >= Number(m.qty)) await (supabase as any).from('inventory_movements').delete().eq('id', m.id);
      else await (supabase as any).from('inventory_movements').update({ qty: Number(m.qty) - give }).eq('id', m.id);
      toReturn -= give;
    }
  }
  return { shortfall: 0 };
}
