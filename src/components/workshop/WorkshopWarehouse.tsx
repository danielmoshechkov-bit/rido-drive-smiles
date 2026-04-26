import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Search, FileText, Package, ClipboardList,
  Link2, Loader2, Trash2, ExternalLink, History, Boxes, AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  providerId: string;
  onBack: () => void;
}

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WorkshopWarehouse({ providerId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('stany');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Magazyn</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stany" className="gap-1.5">
            <Boxes className="h-4 w-4" /> Stany magazynowe
          </TabsTrigger>
          <TabsTrigger value="dokumenty" className="gap-1.5">
            <FileText className="h-4 w-4" /> Dokumenty zakupu
          </TabsTrigger>
          <TabsTrigger value="rezerwacje" className="gap-1.5">
            <ClipboardList className="h-4 w-4" /> Rezerwacje
          </TabsTrigger>
          <TabsTrigger value="inwentaryzacja" className="gap-1.5">
            <Package className="h-4 w-4" /> Inwentaryzacja
          </TabsTrigger>
          <TabsTrigger value="integracje" className="gap-1.5">
            <Link2 className="h-4 w-4" /> Integracje
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stany">
          <WarehouseStock providerId={providerId} search={search} setSearch={setSearch} />
        </TabsContent>
        <TabsContent value="dokumenty">
          <WarehouseDocuments providerId={providerId} search={search} setSearch={setSearch} />
        </TabsContent>
        <TabsContent value="rezerwacje">
          <WarehouseReservations />
        </TabsContent>
        <TabsContent value="inwentaryzacja">
          <WarehouseInventoryCheck />
        </TabsContent>
        <TabsContent value="integracje">
          <WarehouseIntegrations providerId={providerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== STANY ============================== */

function WarehouseStock({ providerId, search, setSearch }: { providerId: string; search: string; setSearch: (v: string) => void }) {
  const [productId, setProductId] = useState<string | null>(null);

  const { data: provider } = useQuery({
    queryKey: ['warehouse-provider-user', providerId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('service_providers').select('user_id').eq('id', providerId).maybeSingle();
      return data;
    },
  });

  const userId = provider?.user_id;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['warehouse-products', userId, search],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_products')
        .select('id, name_sales, sku, unit, category, vat_rate, default_sale_price_net, default_purchase_price_net, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('name_sales', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []).filter((p: any) =>
        !search ||
        p.name_sales?.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase())
      );
    },
  });

  // batches grouped by product
  const productIds = useMemo(() => products.map((p: any) => p.id), [products]);
  const { data: batchesByProduct = {} } = useQuery({
    queryKey: ['warehouse-batches', productIds.join(',')],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('inventory_batches')
        .select('id, product_id, qty_in, qty_remaining, unit_cost_net, received_at, purchase_document_id')
        .in('product_id', productIds);
      if (error) throw error;
      const map: Record<string, any[]> = {};
      for (const b of data || []) {
        (map[b.product_id] ||= []).push(b);
      }
      return map;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj po nazwie, SKU…" className="pl-9" />
        </div>
        <Badge variant="outline">{products.length} pozycji</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !products.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Brak pozycji w magazynie. Dodaj produkty z dokumentu zakupu lub ręcznie.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa / SKU</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead className="text-right">Stan</TableHead>
                  <TableHead className="text-right">Średni koszt</TableHead>
                  <TableHead className="text-right">Cena sprzedaży</TableHead>
                  <TableHead className="text-right">Marża</TableHead>
                  <TableHead className="text-right">Wartość</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p: any) => {
                  const batches = batchesByProduct[p.id] || [];
                  const stock = batches.reduce((s: number, b: any) => s + Number(b.qty_remaining || 0), 0);
                  const totalCost = batches.reduce((s: number, b: any) => s + Number(b.qty_remaining || 0) * Number(b.unit_cost_net || 0), 0);
                  const avgCost = stock > 0 ? totalCost / stock : Number(p.default_purchase_price_net || 0);
                  const sale = Number(p.default_sale_price_net || 0);
                  const margin = avgCost > 0 ? ((sale - avgCost) / avgCost) * 100 : 0;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setProductId(p.id)}
                    >
                      <TableCell>
                        <div className="font-medium">{p.name_sales}</div>
                        <div className="text-xs text-muted-foreground">{p.sku || '—'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.category || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={stock > 0 ? 'secondary' : 'outline'}>
                          {fmt(stock)} {p.unit || 'szt'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">{fmt(avgCost)}&nbsp;zł</TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">{fmt(sale)}&nbsp;zł</TableCell>
                      <TableCell className="text-right text-sm">
                        {margin > 0 ? <span className="text-emerald-600">+{margin.toFixed(1)}%</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">{fmt(totalCost)}&nbsp;zł</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {productId && (
        <ProductDetailsModal
          productId={productId}
          userId={userId}
          onClose={() => setProductId(null)}
        />
      )}
    </div>
  );
}

/* ============================== PRODUCT MODAL ============================== */

function ProductDetailsModal({ productId, userId, onClose }: { productId: string; userId?: string; onClose: () => void }) {
  const { data: product } = useQuery({
    queryKey: ['warehouse-product', productId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('inventory_products').select('*').eq('id', productId).maybeSingle();
      return data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['warehouse-product-batches', productId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('inventory_batches')
        .select('id, qty_in, qty_remaining, unit_cost_net, received_at, vat_rate, purchase_document_id')
        .eq('product_id', productId)
        .order('received_at', { ascending: false });
      return data || [];
    },
  });

  const docIds = useMemo(() => Array.from(new Set(batches.map((b: any) => b.purchase_document_id).filter(Boolean))), [batches]);
  const { data: docs = [] } = useQuery({
    queryKey: ['warehouse-product-docs', docIds.join(',')],
    enabled: docIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('purchase_documents')
        .select('id, document_number, document_date, supplier_name, supplier_nip, file_url, gross_total')
        .in('id', docIds);
      return data || [];
    },
  });
  const docMap = useMemo(() => Object.fromEntries((docs as any[]).map((d) => [d.id, d])), [docs]);

  const { data: movements = [] } = useQuery({
    queryKey: ['warehouse-product-movements', productId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('inventory_movements')
        .select('id, direction, qty, source_type, source_id, unit_cost_net, note, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const stock = batches.reduce((s: number, b: any) => s + Number(b.qty_remaining || 0), 0);
  const totalValue = batches.reduce((s: number, b: any) => s + Number(b.qty_remaining || 0) * Number(b.unit_cost_net || 0), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {product?.name_sales || 'Pozycja magazynowa'}
          </DialogTitle>
          <DialogDescription>
            SKU: {product?.sku || '—'} · Kategoria: {product?.category || '—'} · VAT: {product?.vat_rate || '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Stan magazynu</div>
            <div className="text-lg font-bold">{fmt(stock)} {product?.unit || 'szt'}</div>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Wartość netto</div>
            <div className="text-lg font-bold whitespace-nowrap">{fmt(totalValue)}&nbsp;zł</div>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Cena sprzedaży</div>
            <div className="text-lg font-bold whitespace-nowrap">{fmt(product?.default_sale_price_net)}&nbsp;zł</div>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Liczba partii</div>
            <div className="text-lg font-bold">{batches.length}</div>
          </CardContent></Card>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Boxes className="h-4 w-4" /> Partie (FIFO)</h3>
          {!batches.length ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Brak partii — dodaj dokument zakupu.</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data przyjęcia</TableHead>
                    <TableHead>Dokument zakupu</TableHead>
                    <TableHead>Dostawca</TableHead>
                    <TableHead className="text-right">Przyjęto</TableHead>
                    <TableHead className="text-right">Pozostało</TableHead>
                    <TableHead className="text-right">Cena jedn.</TableHead>
                    <TableHead className="text-right">Wartość</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b: any) => {
                    const doc = b.purchase_document_id ? docMap[b.purchase_document_id] : null;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm">{b.received_at ? format(new Date(b.received_at), 'yyyy-MM-dd') : '—'}</TableCell>
                        <TableCell>
                          {doc ? (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{doc.document_number || '—'}</span>
                              {doc.file_url && (
                                <a href={doc.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="h-3 w-3 text-primary" />
                                </a>
                              )}
                            </div>
                          ) : <span className="text-xs text-muted-foreground italic">brak</span>}
                        </TableCell>
                        <TableCell className="text-sm">{doc?.supplier_name || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(b.qty_in)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(b.qty_remaining)}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">{fmt(b.unit_cost_net)}&nbsp;zł</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">{fmt(Number(b.qty_remaining) * Number(b.unit_cost_net))}&nbsp;zł</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4" /> Historia ruchów</h3>
          {!movements.length ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Brak ruchów magazynowych.</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Kierunek</TableHead>
                    <TableHead>Źródło</TableHead>
                    <TableHead className="text-right">Ilość</TableHead>
                    <TableHead className="text-right">Cena jedn.</TableHead>
                    <TableHead>Notatka</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{format(new Date(m.created_at), 'yyyy-MM-dd HH:mm')}</TableCell>
                      <TableCell>
                        <Badge variant={m.direction === 'in' ? 'default' : 'outline'}>
                          {m.direction === 'in' ? '+ Przyjęcie' : '− Wydanie'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.source_type || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(m.qty)}</TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">{m.unit_cost_net ? `${fmt(m.unit_cost_net)} zł` : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== DOKUMENTY ============================== */

function WarehouseDocuments({ providerId, search, setSearch }: { providerId: string; search: string; setSearch: (v: string) => void }) {
  const [docId, setDocId] = useState<string | null>(null);

  const { data: provider } = useQuery({
    queryKey: ['warehouse-provider-user', providerId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('service_providers').select('user_id').eq('id', providerId).maybeSingle();
      return data;
    },
  });
  const userId = provider?.user_id;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['warehouse-docs', userId, search],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('purchase_documents')
        .select('id, document_number, document_date, supplier_name, supplier_nip, status, net_total, gross_total, file_url, created_at')
        .eq('user_id', userId)
        .order('document_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).filter((d: any) =>
        !search ||
        d.document_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.supplier_nip?.includes(search)
      );
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" disabled><Plus className="h-4 w-4" /> Wystaw PZ ręcznie</Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj numeru / dostawcy / NIP" className="pl-9 w-[280px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !docs.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Brak dokumentów zakupu. Dokumenty pojawiają się automatycznie po wgraniu faktury kosztowej.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NUMER DOKUMENTU</TableHead>
                  <TableHead>DOSTAWCA</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>DATA</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead className="text-right">NETTO</TableHead>
                  <TableHead className="text-right">BRUTTO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d: any) => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setDocId(d.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{d.document_number || `PZ ${d.id.slice(0, 6)}`}</span>
                      </div>
                    </TableCell>
                    <TableCell>{d.supplier_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.supplier_nip || '—'}</TableCell>
                    <TableCell className="text-sm">{d.document_date || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'approved' ? 'default' : 'outline'}>{d.status || 'draft'}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{fmt(d.net_total)}&nbsp;zł</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{fmt(d.gross_total)}&nbsp;zł</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {docId && <PurchaseDocModal docId={docId} onClose={() => setDocId(null)} />}
    </div>
  );
}

function PurchaseDocModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { data: doc } = useQuery({
    queryKey: ['warehouse-doc', docId],
    queryFn: async () => {
      const { data } = await (supabase as any).from('purchase_documents').select('*').eq('id', docId).maybeSingle();
      return data;
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ['warehouse-doc-items', docId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('purchase_document_items')
        .select('id, raw_name_from_invoice, qty, unit, unit_net, vat_rate, net_total, gross_total, mapped_product_id, is_processed')
        .eq('purchase_document_id', docId);
      return data || [];
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {doc?.document_number || 'Dokument zakupu'}
          </DialogTitle>
          <DialogDescription>
            {doc?.supplier_name || '—'} · NIP {doc?.supplier_nip || '—'} · {doc?.document_date || '—'}
            {doc?.file_url && (
              <>
                {' · '}
                <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  Otwórz oryginał <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Netto</div>
            <div className="text-lg font-bold whitespace-nowrap">{fmt(doc?.net_total)}&nbsp;zł</div>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">VAT</div>
            <div className="text-lg font-bold whitespace-nowrap">{fmt(doc?.vat_total)}&nbsp;zł</div>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Brutto</div>
            <div className="text-lg font-bold whitespace-nowrap">{fmt(doc?.gross_total)}&nbsp;zł</div>
          </CardContent></Card>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pozycja</TableHead>
                <TableHead className="text-right">Ilość</TableHead>
                <TableHead className="text-right">Cena jedn.</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell className="text-sm">{it.raw_name_from_invoice}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(it.qty)} {it.unit || 'szt'}</TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">{fmt(it.unit_net)}&nbsp;zł</TableCell>
                  <TableCell className="text-sm">{it.vat_rate || '—'}</TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">{fmt(it.net_total)}&nbsp;zł</TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">{fmt(it.gross_total)}&nbsp;zł</TableCell>
                  <TableCell>
                    {it.mapped_product_id ? (
                      <Badge variant="default" className="text-xs">Zmapowano</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Niepowiązano</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">Brak pozycji</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent></Card>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== REZERWACJE ============================== */

function WarehouseReservations() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Brak rezerwacji części. Rezerwacje tworzone ze zleceń pojawią się tutaj.</p>
      </CardContent>
    </Card>
  );
}

/* ============================== INWENTARYZACJA ============================== */

function WarehouseInventoryCheck() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button className="gap-2" disabled><Plus className="h-4 w-4" /> Rozpocznij inwentaryzację</Button>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Brak historii inwentaryzacji. Rozpocznij nową inwentaryzację aby porównać stany magazynowe.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================== INTEGRACJE ============================== */

function WarehouseIntegrations({ providerId }: { providerId: string }) {
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['warehouse-integrations-status', providerId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workshop_parts_integrations')
        .select('supplier_code, supplier_name, is_enabled, last_connection_status, last_connection_at')
        .eq('provider_id', providerId);
      return data || [];
    },
  });

  const knownSuppliers = [
    { code: 'inter_cars', name: 'Inter Cars', logo: '🔴' },
    { code: 'auto_partner', name: 'Auto Partner', logo: '🔵' },
    { code: 'hart', name: 'Hart', logo: '🟡' },
    { code: 'gordon', name: 'Gordon', logo: '🟢' },
  ];

  const merged = knownSuppliers.map((s) => {
    const it = (integrations as any[]).find((i) => i.supplier_code === s.code);
    return { ...s, is_enabled: !!it?.is_enabled, status: it?.last_connection_status, lastAt: it?.last_connection_at };
  });

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30">
        <CardContent className="py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Integracje konfigurujesz w Ustawieniach warsztatu.</p>
            <p className="text-muted-foreground mt-0.5">Tutaj widzisz tylko status. Zielona kropka = aktywne. Po złożeniu zamówienia w naszym systemie dokumenty zakupu od dostawcy zostaną pobrane automatycznie i dodane do magazynu.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading ? (
          <div className="col-span-2 flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : merged.map((s) => (
          <Card key={s.code}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{s.logo}</span>
                <div>
                  <p className="font-medium">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${s.is_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-xs text-muted-foreground">
                      {s.is_enabled ? 'Aktywna' : 'Nieaktywna'}
                      {s.lastAt ? ` · ${format(new Date(s.lastAt), 'yyyy-MM-dd HH:mm')}` : ''}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info('Konfiguracja integracji znajduje się w Ustawieniach warsztatu → Integracje hurtowni.')}
              >
                Konfiguruj
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
