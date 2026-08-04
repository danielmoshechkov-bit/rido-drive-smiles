// Process Purchase Invoice -> Inventory
// After user accepts a parsed invoice, this function:
// 1. Maps each item to inventory_products (find by SKU/name, or create new)
// 2. Creates inventory_batches (FIFO) with unit_cost_net from the invoice
// 3. Marks purchase_invoice as inventory_processed=true
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalize(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

serve(async (req) => {
  return phaseABlockedResponse(req, "process-purchase-inventory");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ success: false, error: 'invoiceId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    // Service role for atomic inventory ops
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Pobierz fakturę + pozycje, sprawdź ownership
    const { data: invoice, error: invErr } = await admin
      .from('purchase_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ success: false, error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (invoice.inventory_processed) {
      return new Response(JSON.stringify({ success: false, error: 'Already processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: items, error: itemsErr } = await admin
      .from('purchase_invoice_items')
      .select('*')
      .eq('purchase_invoice_id', invoiceId);

    if (itemsErr) throw itemsErr;
    if (!items?.length) {
      return new Response(JSON.stringify({ success: false, error: 'No items to process' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Pobierz wszystkie produkty usera dla mapowania
    const { data: existingProducts } = await admin
      .from('inventory_products')
      .select('id, name_sales, sku')
      .eq('user_id', userId);

    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    (existingProducts || []).forEach(p => {
      if (p.sku) bySku.set(normalize(p.sku), p.id);
      if (p.name_sales) byName.set(normalize(p.name_sales), p.id);
    });

    let createdProducts = 0;
    let createdBatches = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        let productId: string | null = null;

        // Próba mapowania po SKU, potem po nazwie
        const sku = item.supplier_symbol ? normalize(item.supplier_symbol) : '';
        const name = normalize(item.name);
        if (sku && bySku.has(sku)) productId = bySku.get(sku)!;
        else if (name && byName.has(name)) productId = byName.get(name)!;

        // Brak - utwórz nowy produkt
        if (!productId) {
          const { data: newProd, error: prodErr } = await admin
            .from('inventory_products')
            .insert({
              user_id: userId,
              entity_id: invoice.entity_id,
              name_sales: item.name,
              sku: item.supplier_symbol || null,
              unit: item.unit || 'szt.',
              vat_rate: item.vat_rate ? String(item.vat_rate) : '23',
              default_purchase_price_net: item.unit_price_net,
              currency: 'PLN',
              is_active: true,
            })
            .select('id')
            .single();
          if (prodErr) throw prodErr;
          productId = newProd.id;
          createdProducts++;
          if (sku) bySku.set(sku, productId);
          byName.set(name, productId);
        }

        // 3. Utwórz batch (FIFO)
        const { error: batchErr } = await admin
          .from('inventory_batches')
          .insert({
            product_id: productId,
            purchase_item_id: item.id,
            qty_in: item.quantity,
            qty_remaining: item.quantity,
            unit_cost_net: item.unit_price_net,
            vat_rate: item.vat_rate ? String(item.vat_rate) : '23',
            received_at: invoice.issue_date || invoice.purchase_date || new Date().toISOString(),
          });
        if (batchErr) throw batchErr;
        createdBatches++;

        // Powiązanie pozycji faktury z produktem
        await admin
          .from('purchase_invoice_items')
          .update({ product_id: productId })
          .eq('id', item.id);

      } catch (e: any) {
        errors.push(`${item.name}: ${e.message}`);
      }
    }

    // 4. Mark processed
    await admin
      .from('purchase_invoices')
      .update({ inventory_processed: true, needs_review: false })
      .eq('id', invoiceId);

    return new Response(
      JSON.stringify({
        success: true,
        createdProducts,
        createdBatches,
        totalItems: items.length,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-purchase-inventory]', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
