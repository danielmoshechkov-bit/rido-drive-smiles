import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';

const fmt = (v: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v || 0);

// Tolerancja na prefiks namespace KSeF (np. <tns:P_7>)
function tag(xml: string, name: string): string {
  return xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]+)</(?:\\w+:)?${name}>`))?.[1]?.trim() || '';
}
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
// Zwraca liczbę albo null, jeśli pole nieobecne/puste (rozróżnienie „brak" vs „0")
const numOrNull = (s: string): number | null => {
  const t = (s || '').trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

interface Item { idx: number; name: string; unit: string; qty: number; net: number | null; rate: string; vat: number | null; gross: number | null; }

// Obsługuje OBA warianty FA: „od netto" (P_11) i „od brutto" (P_11A + P_11Vat).
// Priorytet netto: P_11 → (P_11A − P_11Vat) → (ilość × cena netto P_9A) → null („—").
function parseItems(xml: string): Item[] {
  const blocks = xml.match(/<(?:\w+:)?FaWiersz[\s\S]*?<\/(?:\w+:)?FaWiersz>/g) || [];
  return blocks.map((b, idx) => {
    const rate = tag(b, 'P_12');
    const vatRate = /^\d+$/.test(rate) ? Number(rate) : 0;
    const qty = num(tag(b, 'P_8B'));
    const unitNet = numOrNull(tag(b, 'P_9A'));   // cena jedn. netto
    const p11 = numOrNull(tag(b, 'P_11'));        // wartość netto pozycji
    const p11a = numOrNull(tag(b, 'P_11A'));      // wartość brutto pozycji
    const p11vat = numOrNull(tag(b, 'P_11Vat'));  // VAT pozycji

    let net: number | null = null;
    if (p11 != null) net = p11;
    else if (p11a != null && p11vat != null) net = r2(p11a - p11vat);
    else if (qty && unitNet != null) net = r2(qty * unitNet);

    let vat: number | null = null;
    if (p11vat != null) vat = p11vat;
    else if (net != null) vat = r2(net * vatRate / 100);

    let gross: number | null = null;
    if (p11a != null) gross = p11a;
    else if (net != null) gross = r2(net + (vat || 0));

    return { idx, name: tag(b, 'P_7') || '—', unit: tag(b, 'P_8A'), qty, net, rate: rate || '—', vat, gross };
  });
}

interface PurchaseInvoicePreviewModalProps {
  invoice: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseInvoicePreviewModal({ invoice, open, onOpenChange }: PurchaseInvoicePreviewModalProps) {
  const items = useMemo(() => (invoice?.xml_content ? parseItems(invoice.xml_content) : []), [invoice]);
  if (!invoice) return null;

  const downloadXml = () => {
    const blob = new Blob([invoice.xml_content || ''], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.ksef_number || invoice.document_number || 'faktura'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isNumRate = (r: string) => /^\d+$/.test(String(r));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Faktura zakupowa {invoice.document_number || ''}</DialogTitle>
        </DialogHeader>

        {/* Nagłówek */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div><span className="text-muted-foreground">Dostawca: </span><span className="font-medium">{invoice.supplier_name || '—'}</span></div>
          <div><span className="text-muted-foreground">NIP: </span><span className="font-mono">{invoice.supplier_nip || '—'}</span></div>
          <div><span className="text-muted-foreground">Numer: </span>{invoice.document_number || '—'}</div>
          <div><span className="text-muted-foreground">Data: </span>{invoice.purchase_date || '—'}</div>
          <div className="col-span-2"><span className="text-muted-foreground">Nr KSeF: </span><span className="font-mono text-xs">{invoice.ksef_number || '—'}</span></div>
          {invoice.document_type && <div><span className="text-muted-foreground">Typ: </span>{invoice.document_type}</div>}
          {invoice.corrected_ksef_number && (
            <div className="col-span-2"><span className="text-muted-foreground">Korekta do: </span><span className="font-mono text-xs">{invoice.corrected_ksef_number}</span></div>
          )}
        </div>

        {/* Pozycje (FaWiersz) */}
        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Nazwa</TableHead>
                <TableHead className="text-right">Ilość</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Brak pozycji w XML</TableCell></TableRow>
              ) : items.map((it) => (
                <TableRow key={it.idx}>
                  <TableCell>{it.idx + 1}</TableCell>
                  <TableCell className="max-w-[280px]">{it.name}{it.unit ? ` (${it.unit})` : ''}</TableCell>
                  <TableCell className="text-right">{it.qty || '—'}</TableCell>
                  <TableCell className="text-right">{it.net == null ? '—' : fmt(it.net)}</TableCell>
                  <TableCell className="text-right">{it.rate}{isNumRate(it.rate) ? '%' : ''} · {it.vat == null ? '—' : fmt(it.vat)}</TableCell>
                  <TableCell className="text-right font-medium">{it.gross == null ? '—' : fmt(it.gross)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Podsumowanie (z danych faktury) */}
        <div className="flex flex-wrap justify-end gap-6 text-sm">
          <div><span className="text-muted-foreground">Netto: </span><span className="font-medium">{fmt(invoice.total_net)}</span></div>
          <div><span className="text-muted-foreground">VAT: </span><span className="font-medium">{fmt(invoice.total_vat)}</span></div>
          <div><span className="text-muted-foreground">Brutto: </span><span className="font-bold">{fmt(invoice.total_gross)}</span></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={downloadXml} className="gap-2">
            <Download className="h-4 w-4" /> Pobierz XML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
