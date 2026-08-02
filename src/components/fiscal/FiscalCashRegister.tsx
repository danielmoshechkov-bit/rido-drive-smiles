/**
 * „Kasa fiskalna" — centrum obiegu dokumentów fiskalnych tenanta.
 *
 * Pięć pod-zakładek odpowiada temu, jak prawo dzieli te dokumenty:
 *   Paragony · Faktury · Zwroty (ewidencja B1) · Korekty pomyłek (ewidencja B2) · Raporty
 *
 * Zwroty i pomyłki są ODDZIELNE — rozporządzenie zabrania prowadzenia ich w jednej
 * ewidencji, więc nie ma tu wspólnej listy „korekt".
 */

import { useEffect, useMemo, useState } from 'react';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Receipt,
  FileText,
  Undo2,
  FileWarning,
  BarChart3,
  Copy,
  Download,
  TriangleAlert,
  FileBarChart,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useFiscalReceipts,
  useFiscalReturns,
  useFiscalCorrections,
  useFiscalInvoices,
  useFiscalPeriodSummary,
  useFiscalPrinter,
  useFiscalDayReport,
  useAutoDayReport,
  useMonthReportStatus,
  useConfirmMonthReport,
  useReceiptDocumentLabels,
  useProviderPrintHeader,
  RETURN_REASON_LABELS,
  FiscalError,
  type FiscalCorrectionRow,
  type FiscalReceiptRow,
  type FiscalReturnRow,
} from '@/hooks/useFiscal';
import { formatPln, RECEIPT_STATUS_LABELS } from '@/lib/fiscal';
import {
  printCorrectionProtocol,
  printCorrectionsRegister,
  printReceiptCopy,
  printReturnProtocol,
  printReturnsRegister,
} from '@/lib/fiscalCopy';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { FiscalReturnDialog } from './FiscalReturnDialog';
import { FiscalCorrectionDialog } from './FiscalCorrectionDialog';
import { FiscalReceiptDialog } from './FiscalReceiptDialog';

interface Props {
  providerId?: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  printed: 'default',
  failed: 'destructive',
  printing: 'secondary',
  pending: 'outline',
  cancelled: 'outline',
};

/** Pierwszy dzień bieżącego miesiąca / dziś — domyślny zakres raportów. */
function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

/** Miesiąc w formacie pola <input type="month">. */
const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/** Miesiąc → zakres dat; pusty miesiąc = bez ograniczenia (widok „wszystkie"). */
function monthRange(month: string): { from?: string; to?: string } {
  if (!month) return {};
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function FiscalCashRegister({ providerId }: Props) {
  const [tab, setTab] = useState('paragony');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState(defaultRange);
  const [returnReceipt, setReturnReceipt] = useState<FiscalReceiptRow | null>(null);
  const [correctionReceipt, setCorrectionReceipt] = useState<FiscalReceiptRow | null>(null);
  const [correctedOrder, setCorrectedOrder] = useState<{ id: string } | null>(null);

  // Lista paragonów: bieżący miesiąc, strona po stronie. Warsztat sięga po paragon
  // sprzed pół roku raz na kwartał, a codziennie szuka tego z dzisiaj.
  const [month, setMonth] = useState(monthKey());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedReturns, setSelectedReturns] = useState<Set<string>>(new Set());
  const [selectedCorrections, setSelectedCorrections] = useState<Set<string>>(new Set());
  const [invoiceForReceipt, setInvoiceForReceipt] = useState<FiscalReceiptRow | null>(null);

  const { data: receipts = [], isLoading: receiptsLoading } = useFiscalReceipts(
    providerId,
    undefined,
    1000,
    monthRange(month),
  );
  const { data: returns = [] } = useFiscalReturns(providerId);
  const { data: corrections = [] } = useFiscalCorrections(providerId);
  const { data: invoices = [] } = useFiscalInvoices(providerId);
  const { data: printer } = useFiscalPrinter(providerId);
  const { data: summary, isLoading: summaryLoading } = useFiscalPeriodSummary(providerId, range.from, range.to);
  const dayReport = useFiscalDayReport(providerId);
  const autoReport = useAutoDayReport(providerId, printer);
  const monthReport = useMonthReportStatus(printer);
  const confirmMonthReport = useConfirmMonthReport(providerId);

  const correctedIds = useMemo(() => new Set(corrections.map((c) => c.receipt_id)), [corrections]);
  const returnedIds = useMemo(() => new Set(returns.map((r) => r.receipt_id)), [returns]);
  const invoicedReceiptIds = useMemo(
    () => new Set(invoices.map((i) => i.fiscal_receipt_id).filter(Boolean) as string[]),
    [invoices],
  );

  const { data: docLabels } = useReceiptDocumentLabels(providerId, receipts);
  // Nagłówek z logo i danymi firmy — te dokumenty trafiają do rąk klienta.
  const { data: printHeader } = useProviderPrintHeader(providerId);

  /** Etykieta dokumentu źródłowego — numer zlecenia i klient albo „sprzedaż od ręki". */
  const labelOf = (receipt: FiscalReceiptRow) => {
    if (receipt.document_type === 'kasa_szybka') return { title: 'Sprzedaż od ręki', client: null as string | null };
    const found = receipt.document_id ? docLabels?.get(receipt.document_id) : undefined;
    return { title: found?.orderNumber ?? receipt.document_type ?? '—', client: found?.clientName ?? null };
  };

  const filteredReceipts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return receipts.filter((receipt) => {
      if (statusFilter !== 'all' && receipt.status !== statusFilter) return false;
      if (!term) return true;
      const label = labelOf(receipt);
      const itemNames = Array.isArray(receipt.items)
        ? (receipt.items as any[]).map((item) => String(item?.name ?? '')).join(' ')
        : '';
      const paymentNames = Array.isArray(receipt.payments)
        ? receipt.payments.map((payment) => payment.name).join(' ')
        : '';
      // Kwotę porównujemy w obu zapisach — kasjer wpisuje raz „123,00", raz „123.00".
      const amount = formatPln(receipt.total_grosze).toLowerCase();
      const amountDot = amount.replace(',', '.');
      return [
        String(receipt.printer_receipt_number ?? ''),
        receipt.buyer_nip ?? '',
        label.title,
        label.client ?? '',
        itemNames,
        paymentNames,
        amount,
        amountDot,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [receipts, search, statusFilter, docLabels]);

  // Filtr albo zmiana miesiąca cofa na pierwszą stronę — inaczej użytkownik ląduje
  // na pustej stronie 4 i myśli, że nic nie znalazło.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, month, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredReceipts.length / pageSize));
  const pageReceipts = filteredReceipts.slice((page - 1) * pageSize, page * pageSize);

  const handleConfirmMonthReport = async () => {
    if (!printer) return;
    if (!confirm(`Potwierdzić wykonanie raportu miesięcznego za ${monthReport.period}?`)) return;
    try {
      await confirmMonthReport.mutateAsync({ printerId: printer.id, period: monthReport.period });
      toast.success(`Raport za ${monthReport.period} oznaczony jako wykonany.`);
    } catch (e) {
      toast.error((e as FiscalError).message);
    }
  };

  const handleCopy = (receipt: FiscalReceiptRow) => {
    try {
      printReceiptCopy(receipt, printHeader ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /**
   * Faktura do paragonu.
   *
   * Art. 106b ust. 5 ustawy o VAT: fakturę dla firmy wolno wystawić tylko wtedy, gdy NIP nabywcy
   * znalazł się już NA PARAGONIE. Dopisanie go później jest zakazane i grozi sankcją, więc paragon
   * bez NIP-u przepuszczamy wyłącznie z ostrzeżeniem — dla osoby prywatnej to nadal legalne.
   */
  const handleIssueInvoice = (receipt: FiscalReceiptRow) => {
    if (!receipt.buyer_nip) {
      const proceed = confirm(
        'Ten paragon nie zawiera NIP-u nabywcy.\n\n' +
          'Fakturę do takiego paragonu można wystawić wyłącznie osobie prywatnej. ' +
          'Dla firmy jest to zakazane (art. 106b ust. 5 ustawy o VAT) — NIP musiał znaleźć się na paragonie.\n\n' +
          'Kontynuować jako faktura dla osoby prywatnej?',
      );
      if (!proceed) return;
    }
    setInvoiceForReceipt(receipt);
  };

  /** Pozycje paragonu → pozycje faktury (ceny na paragonie są brutto). */
  const invoicePrefillItems = useMemo(() => {
    const items = Array.isArray(invoiceForReceipt?.items) ? (invoiceForReceipt?.items as any[]) : [];
    return items.map((item) => ({
      name: String(item?.name ?? ''),
      quantity: Number(item?.quantity) || 1,
      unit: String(item?.unit ?? 'szt.'),
      unit_net_price: 0,
      unit_gross_price: Number(item?.unitPrice) || 0,
      vat_rate: String(item?.vatRate ?? '23'),
      discount_percent: 0,
    }));
  }, [invoiceForReceipt]);

  /** Paragon źródłowy dla wpisu ewidencji — nagłówek dokumentu musi go wskazać. */
  const receiptOf = (receiptId: string) => receipts.find((row) => row.id === receiptId) ?? null;

  // Dokumenty do podpisu można wydrukować ponownie w każdej chwili — kartka ginie,
  // a bez niej wpis w ewidencji jest niekompletny podczas kontroli.
  const handlePrintReturn = (row: FiscalReturnRow) => {
    try {
      printReturnProtocol(row, receiptOf(row.receipt_id), printHeader ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** Zaznaczone wpisy albo — gdy nic nie zaznaczono — cała lista. */
  const pickRows = <T extends { id: string }>(rows: T[], selected: Set<string>) =>
    selected.size ? rows.filter((row) => selected.has(row.id)) : rows;

  const toggleIn = (setter: (updater: (prev: Set<string>) => Set<string>) => void, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handlePrintReturnsRegister = () => {
    const rows = pickRows(returns, selectedReturns);
    if (!rows.length) return toast.error('Brak wpisów do wydruku.');
    try {
      printReturnsRegister(rows, printHeader ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePrintCorrectionsRegister = () => {
    const rows = pickRows(corrections, selectedCorrections);
    if (!rows.length) return toast.error('Brak wpisów do wydruku.');
    try {
      printCorrectionsRegister(rows, printHeader ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePrintCorrection = (row: FiscalCorrectionRow) => {
    try {
      printCorrectionProtocol(row, receiptOf(row.receipt_id), printHeader ?? {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDayReport = async () => {
    if (!confirm('Wykonać raport dobowy? Drukarka wydrukuje raport i zamknie dobę sprzedaży.')) return;
    try {
      const result = await dayReport.mutateAsync(printer ?? undefined);
      toast.success(result.message);
    } catch (e) {
      toast.error((e as FiscalError).message);
    }
  };

  /** Eksport podsumowania okresu — podstawa ujęcia zbiorczego RO w JPK_V7. */
  const exportRo = () => {
    if (!summary) return;
    const rows = [
      ['Typ', 'RO'],
      ['Okres od', summary.from],
      ['Okres do', summary.to],
      ['Liczba paragonów', String(summary.receiptsCount)],
      ['Obrót brutto', (summary.grossGrosze / 100).toFixed(2)],
      ['Zwroty i reklamacje', (summary.returnsGrosze / 100).toFixed(2)],
      ['Korekty pomyłek', (summary.correctionsGrosze / 100).toFixed(2)],
      ['Obrót po korektach', (summary.netGrosze / 100).toFixed(2)],
      ...Object.entries(summary.vatByRate).map(([rate, grosze]) => [
        `Sprzedaż brutto stawka ${rate === 'zw' ? 'zw.' : `${rate}%`}`,
        (grosze / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RO_${summary.from}_${summary.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Wyeksportowano podsumowanie RO.');
  };

  const tabs = [
    { value: 'paragony', label: `Paragony (${receipts.length})`, visible: true },
    { value: 'faktury', label: `Faktury (${invoices.length})`, visible: true },
    { value: 'zwroty', label: `Zwroty (${returns.length})`, visible: true },
    { value: 'korekty', label: `Korekty pomyłek (${corrections.length})`, visible: true },
    { value: 'raporty', label: 'Raporty', visible: true },
  ];

  return (
    <div className="space-y-4">
      <UniversalSubTabBar activeTab={tab} onTabChange={setTab} tabs={tabs} />

      {/* Zaległy raport dobowy widać wszędzie w Kasie fiskalnej — po 48 h drukarka
          przestaje sprzedawać, a to zamknięty warsztat, nie drobna niedogodność. */}
      {autoReport.due && printer && (
        <Alert variant={(autoReport.hoursSince ?? 0) >= 40 ? 'destructive' : 'default'}>
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>
              Raport dobowy nie został jeszcze wykonany
              {autoReport.hoursSince !== null && ` — od ostatniego minęło ${autoReport.hoursSince} h`}.
              {(autoReport.hoursSince ?? 0) >= 40 && ' Po 48 h drukarka zablokuje sprzedaż.'}
            </span>
            <Button size="sm" onClick={handleDayReport} disabled={dayReport.isPending} className="gap-2">
              {dayReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
              Wykonaj raport dobowy
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {tab === 'paragony' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" /> Paragony fiskalne
                </CardTitle>
                <CardDescription>Wszystkie próby fiskalizacji — również nieudane, z powodem błędu.</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {/* Szerzej niż domyślnie: polska nazwa miesiąca plus rok plus systemowa
                    ikona kalendarza nie mieściły się w ramce i ikona nachodziła na tekst. */}
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-52 pr-2"
                />
                {month ? (
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => setMonth('')}>
                    Wszystkie
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-9" onClick={() => setMonth(monthKey())}>
                    Bieżący miesiąc
                  </Button>
                )}
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Szukaj: numer, kwota, NIP, klient…"
                  className="h-9 w-56"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie statusy</SelectItem>
                    <SelectItem value="printed">Wydrukowane</SelectItem>
                    <SelectItem value="failed">Błędy</SelectItem>
                    <SelectItem value="cancelled">Anulowane</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {receiptsLoading ? (
              <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
              </div>
            ) : !filteredReceipts.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Brak paragonów w tym widoku.</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Nr</TableHead>
                      <TableHead>Kwota</TableHead>
                      <TableHead>Płatność</TableHead>
                      <TableHead>Nabywca / dokument</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dokumenty</TableHead>
                      <TableHead className="text-right">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageReceipts.map((receipt) => {
                      const payments = Array.isArray(receipt.payments) ? receipt.payments : [];
                      const isPrinted = receipt.status === 'printed';
                      return (
                        <TableRow key={receipt.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(receipt.printed_at || receipt.created_at).toLocaleString('pl-PL', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {receipt.printer_receipt_number ?? '—'}
                            {receipt.printer_mode === 'training' && (
                              <Badge variant="outline" className="ml-1 text-[10px]">szkol.</Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatPln(receipt.total_grosze)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {payments.map((p) => p.name).join(', ') || '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              const label = labelOf(receipt);
                              return (
                                <>
                                  <div>{label.client ?? label.title}</div>
                                  {label.client && (
                                    <div className="text-[10px] text-muted-foreground">{label.title}</div>
                                  )}
                                  {receipt.buyer_nip && (
                                    <div className="text-[10px] text-muted-foreground">NIP {receipt.buyer_nip}</div>
                                  )}
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[receipt.status] ?? 'outline'}>
                              {RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="space-x-1 whitespace-nowrap">
                            {invoicedReceiptIds.has(receipt.id) && (
                              <Badge variant="secondary" className="text-[10px]">Faktura</Badge>
                            )}
                            {returnedIds.has(receipt.id) && (
                              <Badge variant="secondary" className="text-[10px]">Zwrot</Badge>
                            )}
                            {correctedIds.has(receipt.id) && (
                              <Badge variant="destructive" className="text-[10px]">Korekta</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-1 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={!isPrinted}
                              onClick={() => handleCopy(receipt)}
                            >
                              <Copy className="h-3 w-3" /> Kopia
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={!isPrinted || invoicedReceiptIds.has(receipt.id)}
                              title={
                                invoicedReceiptIds.has(receipt.id)
                                  ? 'Do tego paragonu wystawiono już fakturę'
                                  : 'Wystaw fakturę do paragonu'
                              }
                              onClick={() => handleIssueInvoice(receipt)}
                            >
                              <FileText className="h-3 w-3" /> Faktura
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={!isPrinted}
                              onClick={() => setReturnReceipt(receipt)}
                            >
                              <Undo2 className="h-3 w-3" /> Zwrot
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={!isPrinted || correctedIds.has(receipt.id)}
                              onClick={() => setCorrectionReceipt(receipt)}
                            >
                              <FileWarning className="h-3 w-3" /> Pomyłka
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredReceipts.length > 0 && (
              <div className="flex items-center justify-between gap-3 pt-3 text-sm flex-wrap">
                {/* Ile na stronę stoi przy liczniku, bo obie liczby czyta się razem:
                    „pokaż 20, widzisz 1–20 z 137". Na górze pasek filtrów tylko puchł. */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Pokaż</span>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                    <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>
                    na stronę · {(page - 1) * pageSize + 1}–
                    {Math.min(page * pageSize, filteredReceipts.length)} z {filteredReceipts.length}
                    {month && ' w tym miesiącu'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Poprzednia
                  </Button>
                  <span className="px-2 text-muted-foreground">
                    strona {page} z {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Następna
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'faktury' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Faktury ze zleceń
            </CardTitle>
            <CardDescription>
              Faktury powiązane ze zleceniami; te wystawione do paragonu są oznaczone — ich sprzedaż jest już
              ujęta w raporcie dobowym i nie wolno liczyć jej drugi raz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!invoices.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Brak faktur.</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numer</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Nabywca</TableHead>
                      <TableHead>KSeF</TableHead>
                      <TableHead>Powiązanie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('pl-PL') : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{invoice.buyer_name ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={invoice.ksef_status === 'sent' ? 'default' : 'outline'} className="text-[10px]">
                            {invoice.ksef_status ?? 'brak'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {invoice.fiscal_receipt_id ? (
                            <Badge variant="secondary" className="text-[10px]">do paragonu</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">ze zlecenia</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'zwroty' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Undo2 className="h-4 w-4" /> Ewidencja zwrotów i uznanych reklamacji
                </CardTitle>
                <CardDescription>
                  Prowadzona poza kasą, zgodnie z rozporządzeniem. Zwrot nie kasuje paragonu — pomniejsza obrót
                  w dacie pierwotnej sprzedaży.
                </CardDescription>
              </div>
              {returns.length > 0 && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintReturnsRegister}>
                  <Printer className="h-3.5 w-3.5" />
                  {selectedReturns.size ? `Drukuj ewidencję (${selectedReturns.size})` : 'Drukuj całą ewidencję'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!returns.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Brak wpisów w ewidencji zwrotów.</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedReturns.size === returns.length && returns.length > 0}
                          onCheckedChange={(value) =>
                            setSelectedReturns(value === true ? new Set(returns.map((r) => r.id)) : new Set())
                          }
                        />
                      </TableHead>
                      <TableHead>Numer</TableHead>
                      <TableHead>Data zwrotu</TableHead>
                      <TableHead>Paragon</TableHead>
                      <TableHead>Kwota</TableHead>
                      <TableHead>Powód</TableHead>
                      <TableHead>Klient</TableHead>
                      <TableHead className="text-right">Dokument</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedReturns.has(row.id)}
                            onCheckedChange={() => toggleIn(setSelectedReturns, row.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{row.return_number}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(row.returned_at).toLocaleDateString('pl-PL')}
                        </TableCell>
                        <TableCell className="text-xs">nr {(row as any).receipt_number ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatPln(row.amount_grosze)}</TableCell>
                        <TableCell className="text-xs">{RETURN_REASON_LABELS[row.reason] ?? row.reason}</TableCell>
                        <TableCell className="text-xs">{row.customer_name ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 h-7 text-xs"
                            onClick={() => handlePrintReturn(row)}
                          >
                            <Printer className="h-3 w-3" /> Protokół
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'korekty' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileWarning className="h-4 w-4" /> Ewidencja oczywistych pomyłek
                </CardTitle>
                <CardDescription>
                  Odrębna od ewidencji zwrotów — prawo zabrania łączenia obu. Po wpisie zlecenie jest odblokowane
                  do ponownej, prawidłowej fiskalizacji.
                </CardDescription>
              </div>
              {corrections.length > 0 && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintCorrectionsRegister}>
                  <Printer className="h-3.5 w-3.5" />
                  {selectedCorrections.size
                    ? `Drukuj ewidencję (${selectedCorrections.size})`
                    : 'Drukuj całą ewidencję'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!corrections.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Brak wpisów w ewidencji pomyłek.</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedCorrections.size === corrections.length && corrections.length > 0}
                          onCheckedChange={(value) =>
                            setSelectedCorrections(
                              value === true ? new Set(corrections.map((c) => c.id)) : new Set(),
                            )
                          }
                        />
                      </TableHead>
                      <TableHead>Numer</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Błędny paragon</TableHead>
                      <TableHead>Błędna kwota</TableHead>
                      <TableHead>Przyczyna</TableHead>
                      <TableHead>Oryginał</TableHead>
                      <TableHead className="text-right">Dokument</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {corrections.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCorrections.has(row.id)}
                            onCheckedChange={() => toggleIn(setSelectedCorrections, row.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{row.correction_number}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(row.corrected_at).toLocaleDateString('pl-PL')}
                        </TableCell>
                        <TableCell className="text-xs">nr {row.receipt_number ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatPln(row.wrong_amount_grosze)}</TableCell>
                        <TableCell className="text-xs max-w-[280px]">{row.reason_note}</TableCell>
                        <TableCell>
                          {row.original_receipt_attached ? (
                            <Badge variant="secondary" className="text-[10px]">dołączony</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">brak</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 h-7 text-xs"
                            onClick={() => handlePrintCorrection(row)}
                          >
                            <Printer className="h-3 w-3" /> Dowód wewn.
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'raporty' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart className="h-4 w-4" /> Raporty drukarki
              </CardTitle>
              <CardDescription>
                Sprzedaż księguje się z raportów, nie z pojedynczych paragonów. Drukarka blokuje sprzedaż
                po 48 h bez raportu dobowego.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDayReport} disabled={dayReport.isPending || !printer} className="gap-2">
                  {dayReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                  Raport dobowy
                </Button>
                {printer?.last_day_report_at && (
                  <span className="text-xs text-muted-foreground">
                    ostatni: {new Date(printer.last_day_report_at).toLocaleString('pl-PL')}
                  </span>
                )}
              </div>
              {!printer && (
                <Alert>
                  <TriangleAlert className="h-4 w-4" />
                  <AlertDescription>
                    Nie skonfigurowano drukarki — przejdź do Ustawienia → Fiskalizacja.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart className="h-4 w-4" /> Raport miesięczny za {monthReport.period}
              </CardTitle>
              <CardDescription>
                Termin ustawowy: do 25. dnia miesiąca następnego. Raport drukuje się z menu drukarki —
                udokumentowana lista sekwencji ElzabESC go nie zawiera, a sekwencji na tej drukarce nie zgadujemy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {monthReport.done ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Raport za {monthReport.period} oznaczony jako wykonany
                    {printer?.last_month_report_at &&
                      ` (${new Date(printer.last_month_report_at).toLocaleDateString('pl-PL')})`}
                    .
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant={monthReport.overdue ? 'destructive' : 'default'}>
                  <TriangleAlert className="h-4 w-4" />
                  <AlertDescription>
                    {monthReport.overdue
                      ? `Termin na raport za ${monthReport.period} minął ${monthReport.deadline.toLocaleDateString('pl-PL')}.`
                      : `Do wykonania — zostało ${monthReport.daysLeft} dni (termin ${monthReport.deadline.toLocaleDateString('pl-PL')}).`}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!printer || monthReport.done || confirmMonthReport.isPending}
                onClick={handleConfirmMonthReport}
              >
                <CheckCircle2 className="h-4 w-4" /> Oznacz jako wykonany
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4" /> Podsumowanie okresu
                  </CardTitle>
                  <CardDescription>
                    Obrót brutto pomniejszony o obie ewidencje — podstawa ujęcia zbiorczego RO w JPK_V7.
                  </CardDescription>
                </div>
                <div className="flex items-end gap-2">
                  <Input
                    type="date"
                    value={range.from}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    className="h-9 w-40"
                  />
                  <Input
                    type="date"
                    value={range.to}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    className="h-9 w-40"
                  />
                  <Button variant="outline" onClick={exportRo} disabled={!summary} className="gap-2 h-9">
                    <Download className="h-4 w-4" /> Eksport RO
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summaryLoading || !summary ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Liczenie…
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Obrót brutto</div>
                      <div className="text-lg font-bold">{formatPln(summary.grossGrosze)}</div>
                      <div className="text-[11px] text-muted-foreground">{summary.receiptsCount} paragonów</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Zwroty</div>
                      <div className="text-lg font-bold text-amber-600">−{formatPln(summary.returnsGrosze)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Korekty pomyłek</div>
                      <div className="text-lg font-bold text-amber-600">−{formatPln(summary.correctionsGrosze)}</div>
                    </div>
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <div className="text-xs text-muted-foreground">Obrót po korektach</div>
                      <div className="text-lg font-bold">{formatPln(summary.netGrosze)}</div>
                    </div>
                  </div>

                  {Object.keys(summary.vatByRate).length > 0 && (
                    <div className="rounded-md border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Stawka VAT</TableHead>
                            <TableHead className="text-right">Sprzedaż brutto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(summary.vatByRate).map(([rate, grosze]) => (
                            <TableRow key={rate}>
                              <TableCell>{rate === 'zw' ? 'zw.' : `${rate}%`}</TableCell>
                              <TableCell className="text-right">{formatPln(grosze)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Faktura do paragonu — ten sam edytor faktur co ze zlecenia, z powiązaniem do paragonu. */}
      <Dialog open={!!invoiceForReceipt} onOpenChange={(open) => { if (!open) setInvoiceForReceipt(null); }}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">Faktura do paragonu</DialogTitle>
          {invoiceForReceipt && (
            <SimpleFreeInvoice
              onClose={() => setInvoiceForReceipt(null)}
              onSaved={() => {
                setInvoiceForReceipt(null);
                toast.success('Faktura wystawiona i powiązana z paragonem.');
              }}
              prefillItems={invoicePrefillItems}
              prefillBuyer={invoiceForReceipt.buyer_nip ? { nip: invoiceForReceipt.buyer_nip } : undefined}
              prefillNotes={
                invoiceForReceipt.printer_receipt_number
                  ? `Faktura do paragonu fiskalnego nr ${invoiceForReceipt.printer_receipt_number}`
                  : 'Faktura do paragonu fiskalnego'
              }
              prefillFiscalReceiptId={invoiceForReceipt.id}
              prefillFiscalReceiptNumber={invoiceForReceipt.printer_receipt_number}
            />
          )}
        </DialogContent>
      </Dialog>

      <FiscalReturnDialog
        open={!!returnReceipt}
        onOpenChange={(open) => { if (!open) setReturnReceipt(null); }}
        providerId={providerId ?? ''}
        receipt={returnReceipt}
      />
      <FiscalCorrectionDialog
        open={!!correctionReceipt}
        onOpenChange={(open) => { if (!open) setCorrectionReceipt(null); }}
        providerId={providerId ?? ''}
        receipt={correctionReceipt}
        onIssueCorrectedReceipt={
          correctionReceipt?.document_type === 'workshop_order' && correctionReceipt.document_id
            ? () => setCorrectedOrder({ id: correctionReceipt.document_id! })
            : undefined
        }
      />

      {/* Ponowna, prawidłowa fiskalizacja po korekcie pomyłki */}
      <FiscalReceiptDialog
        open={!!correctedOrder}
        onOpenChange={(open) => { if (!open) setCorrectedOrder(null); }}
        providerId={providerId ?? ''}
        order={correctedOrder}
      />
    </div>
  );
}
