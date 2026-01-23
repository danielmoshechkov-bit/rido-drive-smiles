import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Search,
  FileText,
  Download,
  Eye,
  Loader2,
  Calendar
} from 'lucide-react';

interface FleetPaymentPanelProps {
  fleetId?: string;
}

interface DriverInvoice {
  id: string;
  invoice_number: string;
  driver_name: string;
  driver_id: string;
  company_name: string;
  nip: string;
  issue_date: string;
  due_date: string;
  gross_amount: number;
  status: 'pending' | 'paid' | 'overdue';
  pdf_url?: string;
}

export function FleetPaymentPanel({ fleetId }: FleetPaymentPanelProps) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<DriverInvoice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchInvoices();
  }, [fleetId, dateFrom, dateTo]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      // Fetch driver B2B invoices from invoices table
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('type', 'b2b_driver')
        .gte('issue_date', dateFrom)
        .lte('issue_date', dateTo)
        .order('issue_date', { ascending: false });

      if (error) throw error;

      // Transform data
      const transformed: DriverInvoice[] = (data || []).map(inv => {
        const buyer = inv.buyer_snapshot as Record<string, unknown> | null;
        
        // Determine status based on due date and payment
        let status: 'pending' | 'paid' | 'overdue' = 'pending';
        if (inv.status === 'paid') {
          status = 'paid';
        } else if (inv.due_date && new Date(inv.due_date) < new Date()) {
          status = 'overdue';
        }

        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          driver_name: (buyer?.driver_name as string) || 'Nieznany kierowca',
          driver_id: (buyer?.driver_id as string) || '',
          company_name: (buyer?.name as string) || '',
          nip: (buyer?.nip as string) || '',
          issue_date: inv.issue_date,
          due_date: inv.due_date || '',
          gross_amount: inv.gross_amount || 0,
          status,
          pdf_url: inv.pdf_url || undefined,
        };
      });

      setInvoices(transformed);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      toast.error('Błąd ładowania faktur');
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          status: 'paid',
          paid_amount: invoices.find(i => i.id === invoiceId)?.gross_amount || 0
        })
        .eq('id', invoiceId);

      if (error) throw error;

      toast.success('Faktura oznaczona jako opłacona');
      fetchInvoices();
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      toast.error('Błąd aktualizacji');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Opłacona</Badge>;
      case 'overdue':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Zaległa</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Oczekuje</Badge>;
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.nip.includes(searchQuery);
    
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Summary stats
  const totalPending = filteredInvoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.gross_amount, 0);
  const totalOverdue = filteredInvoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.gross_amount, 0);
  const totalPaid = filteredInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.gross_amount, 0);

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              Do zapłaty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalPending)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredInvoices.filter(i => i.status === 'pending').length} faktur
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Zaległe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOverdue)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredInvoices.filter(i => i.status === 'overdue').length} faktur
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Opłacone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredInvoices.filter(i => i.status === 'paid').length} faktur
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Faktury B2B od kierowców
          </CardTitle>
          <CardDescription>
            Zarządzaj płatnościami za faktury wystawione przez kierowców B2B
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj po nazwie, NIP, numerze..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="pending">Oczekujące</SelectItem>
                <SelectItem value="overdue">Zaległe</SelectItem>
                <SelectItem value="paid">Opłacone</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          </div>

          {/* Invoices table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak faktur do wyświetlenia</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr faktury</TableHead>
                    <TableHead>Kierowca / Firma</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Data wystawienia</TableHead>
                    <TableHead>Termin płatności</TableHead>
                    <TableHead className="text-right">Kwota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{invoice.driver_name}</p>
                          <p className="text-xs text-muted-foreground">{invoice.company_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{invoice.nip}</TableCell>
                      <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(invoice.gross_amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {invoice.pdf_url && (
                            <Button variant="ghost" size="icon" asChild>
                              <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {invoice.status !== 'paid' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => markAsPaid(invoice.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Zapłacono
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
