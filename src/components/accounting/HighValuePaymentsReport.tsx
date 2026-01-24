import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldX,
  FileText,
  Download,
  RefreshCw,
  Loader2,
  CreditCard,
  Building2,
  Calendar,
  TrendingUp,
  Info,
  HelpCircle,
  Filter
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

interface HighValuePaymentsReportProps {
  entityId: string;
}

interface BuyerSnapshot {
  name?: string;
  nip?: string;
  bank_account?: string;
  address?: string;
}

interface WhitelistData {
  accountNumbers?: string[];
  statusVat?: string;
  isActiveVat?: boolean;
}

interface InvoiceWithRecipient {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  gross_amount: number;
  status: string;
  type: string;
  payment_method: string | null;
  buyer_snapshot: BuyerSnapshot | null;
  recipient_id: string | null;
  recipient?: {
    id: string;
    name: string;
    nip: string | null;
    bank_account: string | null;
    verification_status: string | null;
    whitelist_data: WhitelistData | null;
    last_verified_at: string | null;
  } | null;
}

interface ReportStats {
  totalInvoices: number;
  totalAmount: number;
  verifiedCount: number;
  unverifiedCount: number;
  pendingCount: number;
}

const THRESHOLD_AMOUNT = 15000;

// Bank identification helper
function getBankInfo(iban: string): { name: string; color: string } | null {
  const cleanIban = iban.replace(/[\s-]/g, '');
  const bankPrefix = cleanIban.substring(2, 6);
  
  const banks: Record<string, { name: string; color: string }> = {
    '1020': { name: 'PKO BP', color: 'bg-blue-600' },
    '1050': { name: 'ING', color: 'bg-orange-500' },
    '1140': { name: 'mBank', color: 'bg-teal-500' },
    '1160': { name: 'Millennium', color: 'bg-purple-600' },
    '1240': { name: 'Pekao SA', color: 'bg-red-600' },
    '1090': { name: 'Santander', color: 'bg-red-500' },
    '2490': { name: 'Alior Bank', color: 'bg-amber-500' },
    '1060': { name: 'BNP Paribas', color: 'bg-green-600' },
  };
  
  return banks[bankPrefix] || null;
}

function formatIBAN(iban: string): string {
  const clean = iban.replace(/[\s-]/g, '');
  return clean.replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, '$1 $2 $3 $4 $5 $6 $7').trim();
}

function getVerificationStatus(
  recipient: InvoiceWithRecipient['recipient'],
  buyerBankAccount?: string
): 'verified' | 'unverified' | 'pending' | 'no_account' {
  if (!recipient) return 'pending';
  
  const bankAccount = recipient.bank_account || buyerBankAccount;
  if (!bankAccount) return 'no_account';
  
  // Check if account is on whitelist
  const whitelistAccounts = recipient.whitelist_data?.accountNumbers || [];
  const cleanAccount = bankAccount.replace(/[\s-]/g, '');
  
  if (whitelistAccounts.some(acc => acc.replace(/[\s-]/g, '') === cleanAccount)) {
    return 'verified';
  }
  
  if (recipient.verification_status === 'verified') {
    return 'verified';
  }
  
  return 'unverified';
}

function VerificationBadge({ status }: { status: 'verified' | 'unverified' | 'pending' | 'no_account' }) {
  switch (status) {
    case 'verified':
      return (
        <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="h-3 w-3" />
          Zweryfikowane
        </Badge>
      );
    case 'unverified':
      return (
        <Badge variant="outline" className="gap-1 bg-red-50 text-red-700 border-red-200">
          <XCircle className="h-3 w-3" />
          Niezweryfikowane
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="h-3 w-3" />
          Do weryfikacji
        </Badge>
      );
    case 'no_account':
      return (
        <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground">
          <CreditCard className="h-3 w-3" />
          Brak konta
        </Badge>
      );
  }
}

export function HighValuePaymentsReport({ entityId }: HighValuePaymentsReportProps) {
  const [invoices, setInvoices] = useState<InvoiceWithRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState<ReportStats>({
    totalInvoices: 0,
    totalAmount: 0,
    verifiedCount: 0,
    unverifiedCount: 0,
    pendingCount: 0,
  });

  const getPeriodDates = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'current':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'previous':
        const prev = subMonths(now, 1);
        return { start: startOfMonth(prev), end: endOfMonth(prev) };
      case 'quarter':
        return { start: subMonths(startOfMonth(now), 2), end: endOfMonth(now) };
      case 'year':
        return { start: new Date(now.getFullYear(), 0, 1), end: endOfMonth(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates();
      
      // Fetch high-value invoices
      const { data: invoicesData, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          issue_date,
          due_date,
          gross_amount,
          status,
          type,
          payment_method,
          buyer_snapshot,
          recipient_id
        `)
        .eq('entity_id', entityId)
        .gte('gross_amount', THRESHOLD_AMOUNT)
        .gte('issue_date', format(start, 'yyyy-MM-dd'))
        .lte('issue_date', format(end, 'yyyy-MM-dd'))
        .in('type', ['sale', 'vat', 'cost'])
        .order('gross_amount', { ascending: false });

      if (error) throw error;

      // Fetch recipients for these invoices
      const recipientIds = [...new Set((invoicesData || [])
        .map(inv => inv.recipient_id)
        .filter(Boolean))];

      let recipientsMap: Record<string, InvoiceWithRecipient['recipient']> = {};
      
      if (recipientIds.length > 0) {
        const { data: recipients } = await supabase
          .from('invoice_recipients')
          .select('id, name, nip, bank_account, verification_status, whitelist_data, last_verified_at')
          .in('id', recipientIds);

        if (recipients) {
          recipientsMap = recipients.reduce((acc, r) => {
            acc[r.id] = {
              ...r,
              whitelist_data: r.whitelist_data as WhitelistData | null
            };
            return acc;
          }, {} as Record<string, InvoiceWithRecipient['recipient']>);
        }
      }

      // Combine data
      const enrichedInvoices: InvoiceWithRecipient[] = (invoicesData || []).map(inv => ({
        ...inv,
        buyer_snapshot: inv.buyer_snapshot as BuyerSnapshot | null,
        recipient: inv.recipient_id ? recipientsMap[inv.recipient_id] : null,
      }));

      setInvoices(enrichedInvoices);

      // Calculate stats
      const newStats: ReportStats = {
        totalInvoices: enrichedInvoices.length,
        totalAmount: enrichedInvoices.reduce((sum, inv) => sum + (inv.gross_amount || 0), 0),
        verifiedCount: 0,
        unverifiedCount: 0,
        pendingCount: 0,
      };

      enrichedInvoices.forEach(inv => {
        const status = getVerificationStatus(inv.recipient, inv.buyer_snapshot?.bank_account);
        if (status === 'verified') newStats.verifiedCount++;
        else if (status === 'unverified') newStats.unverifiedCount++;
        else newStats.pendingCount++;
      });

      setStats(newStats);

    } catch (error) {
      console.error('Error fetching high value payments:', error);
      toast.error('Błąd podczas pobierania danych raportu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [entityId, selectedPeriod]);

  const verifyBankAccount = async (invoice: InvoiceWithRecipient) => {
    if (!invoice.recipient?.nip) {
      toast.error('Brak NIP kontrahenta do weryfikacji');
      return;
    }

    const bankAccount = invoice.recipient.bank_account || invoice.buyer_snapshot?.bank_account;
    if (!bankAccount) {
      toast.error('Brak numeru konta bankowego do weryfikacji');
      return;
    }

    setVerifyingId(invoice.id);

    try {
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/registry-whitelist',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
          },
          body: JSON.stringify({
            nip: invoice.recipient.nip.replace(/[\s-]/g, ''),
            bankAccount: bankAccount.replace(/[\s-]/g, ''),
            recipientId: invoice.recipient.id,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        if (result.data?.bankAccountVerified) {
          toast.success('Konto zweryfikowane na białej liście VAT');
        } else {
          toast.warning('Konto NIE znajduje się na białej liście VAT');
        }
        await fetchInvoices(); // Refresh data
      } else {
        toast.error(result.error || 'Błąd weryfikacji');
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Błąd połączenia z API weryfikacji');
    } finally {
      setVerifyingId(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'all') return true;
    const status = getVerificationStatus(inv.recipient, inv.buyer_snapshot?.bank_account);
    return status === statusFilter;
  });

  const exportToCSV = () => {
    const headers = ['Nr faktury', 'Data', 'Kontrahent', 'NIP', 'Kwota brutto', 'Konto bankowe', 'Status weryfikacji', 'Status płatności'];
    const rows = filteredInvoices.map(inv => {
      const status = getVerificationStatus(inv.recipient, inv.buyer_snapshot?.bank_account);
      const statusLabels: Record<string, string> = {
        verified: 'Zweryfikowane',
        unverified: 'Niezweryfikowane',
        pending: 'Do weryfikacji',
        no_account: 'Brak konta',
      };
      return [
        inv.invoice_number,
        inv.issue_date,
        inv.recipient?.name || inv.buyer_snapshot?.name || '-',
        inv.recipient?.nip || inv.buyer_snapshot?.nip || '-',
        inv.gross_amount.toFixed(2),
        inv.recipient?.bank_account || inv.buyer_snapshot?.bank_account || '-',
        statusLabels[status],
        inv.status,
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raport-platnosci-15000-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Raport wyeksportowany');
  };

  return (
    <div className="space-y-6">
      {/* Header with info */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-medium text-amber-900">Obowiązek weryfikacji rachunku bankowego</h4>
              <p className="text-sm text-amber-700">
                Zgodnie z art. 19 ustawy o VAT, płatności powyżej <strong>15 000 zł</strong> muszą być realizowane 
                na rachunek bankowy zarejestrowany na białej liście VAT. Płatność na niezweryfikowane konto 
                może skutkować brakiem możliwości zaliczenia wydatku do kosztów oraz solidarną odpowiedzialnością za VAT.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <FileText className="h-4 w-4" />
              Faktury &gt;15000 PLN
            </div>
            <p className="text-2xl font-bold">{stats.totalInvoices}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Łączna wartość
            </div>
            <p className="text-2xl font-bold">{stats.totalAmount.toLocaleString('pl-PL')} zł</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-700 text-sm mb-1">
              <CheckCircle2 className="h-4 w-4" />
              Zweryfikowane
            </div>
            <p className="text-2xl font-bold text-green-700">{stats.verifiedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-red-700 text-sm mb-1">
              <XCircle className="h-4 w-4" />
              Do weryfikacji
            </div>
            <p className="text-2xl font-bold text-red-700">{stats.unverifiedCount + stats.pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Raport płatności powyżej 15 000 zł
              </CardTitle>
              <CardDescription>
                Lista faktur wymagających weryfikacji konta bankowego
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Odśwież
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Eksportuj CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter controls */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="space-y-1">
              <Label className="text-xs">Okres</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Bieżący miesiąc</SelectItem>
                  <SelectItem value="previous">Poprzedni miesiąc</SelectItem>
                  <SelectItem value="quarter">Ostatni kwartał</SelectItem>
                  <SelectItem value="year">Rok bieżący</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status weryfikacji</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="verified">Zweryfikowane</SelectItem>
                  <SelectItem value="unverified">Niezweryfikowane</SelectItem>
                  <SelectItem value="pending">Do weryfikacji</SelectItem>
                  <SelectItem value="no_account">Brak konta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak faktur spełniających kryteria</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr faktury</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Kontrahent</TableHead>
                    <TableHead className="text-right">Kwota brutto</TableHead>
                    <TableHead>Konto bankowe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const verificationStatus = getVerificationStatus(
                      invoice.recipient, 
                      invoice.buyer_snapshot?.bank_account
                    );
                    const bankAccount = invoice.recipient?.bank_account || invoice.buyer_snapshot?.bank_account;
                    const bank = bankAccount ? getBankInfo(bankAccount) : null;

                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.issue_date), 'd MMM yyyy', { locale: pl })}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-sm truncate max-w-[200px]">
                              {invoice.recipient?.name || invoice.buyer_snapshot?.name || '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              NIP: {invoice.recipient?.nip || invoice.buyer_snapshot?.nip || '-'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {invoice.gross_amount.toLocaleString('pl-PL')} zł
                        </TableCell>
                        <TableCell>
                          {bankAccount ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2">
                                    {bank && (
                                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0", bank.color)}>
                                        {bank.name.substring(0, 2)}
                                      </div>
                                    )}
                                    <span className="font-mono text-xs truncate max-w-[120px]">
                                      {formatIBAN(bankAccount).substring(0, 15)}...
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-mono">{formatIBAN(bankAccount)}</p>
                                  {bank && <p className="text-xs text-muted-foreground">{bank.name}</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <VerificationBadge status={verificationStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          {verificationStatus !== 'verified' && invoice.recipient?.nip && bankAccount && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => verifyBankAccount(invoice)}
                              disabled={verifyingId === invoice.id}
                            >
                              {verifyingId === invoice.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Weryfikuj
                                </>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
