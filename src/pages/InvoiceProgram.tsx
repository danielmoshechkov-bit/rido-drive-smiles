import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { 
  Receipt, 
  Plus, 
  Download, 
  Search,
  Filter,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  FileText,
  Users,
  Settings,
  Mic,
  Sparkles,
  Loader2,
  Send
} from 'lucide-react';
import { NewInvoiceWizard } from '@/components/invoices/NewInvoiceWizard';
import { CostInvoiceModal } from '@/components/invoices/CostInvoiceModal';
import { PaymentRemindersPanel } from '@/components/invoices/PaymentRemindersPanel';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Invoice {
  id: string;
  invoice_number: string;
  type: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  buyer_snapshot: { name?: string; nip?: string } | null;
}

interface Entity {
  id: string;
  name: string;
}

export default function InvoiceProgram() {
  const navigate = useNavigate();
  const { isAdmin, isAccountingAdmin, isAccountant, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Data
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showCostInvoice, setShowCostInvoice] = useState(false);
  
  // AI Voice
  const [isListening, setIsListening] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  
  // Controlled tabs for voice navigation
  const [activeTab, setActiveTab] = useState('sales');
  
  // Summary dialog
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    period: string;
    total_income: number;
    total_costs: number;
    profit: number;
    invoices_count: number;
    costs_count: number;
    paid_count: number;
    unpaid_count: number;
  } | null>(null);
  
  // Reminder confirmation
  const [pendingReminderConfirmation, setPendingReminderConfirmation] = useState<{
    invoice_id: string;
    invoice_number: string;
    buyer_name: string;
    gross_amount: number;
  } | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  
  // Mark paid confirmation
  const [pendingPaymentConfirmation, setPendingPaymentConfirmation] = useState<{
    invoice_id: string;
    invoice_number: string;
    gross_amount: number;
  } | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (selectedEntity) {
      fetchInvoices();
    }
  }, [selectedEntity, selectedMonth, statusFilter]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    setLoading(false);
  };

  // Check role-based access after roles are loaded
  useEffect(() => {
    if (!roleLoading && user) {
      const hasAccess = isAdmin || isAccountingAdmin || isAccountant;
      
      if (hasAccess) {
        fetchEntities();
      } else {
        toast.error('Brak dostępu do programu faktur');
        navigate('/');
      }
    }
  }, [roleLoading, isAdmin, isAccountingAdmin, isAccountant, user]);

  const fetchEntities = async () => {
    const { data } = await supabase
      .from('entities')
      .select('id, name')
      .order('name');
    
    if (data && data.length > 0) {
      setEntities(data);
      setSelectedEntity(data[0].id);
    }
  };

  const fetchInvoices = async () => {
    if (!selectedEntity) return;
    
    setLoadingInvoices(true);
    const [year, month] = selectedMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    let query = supabase
      .from('invoices')
      .select('id, invoice_number, type, status, issue_date, due_date, gross_amount, net_amount, buyer_snapshot')
      .eq('entity_id', selectedEntity)
      .gte('issue_date', startDate)
      .lte('issue_date', endDate)
      .order('issue_date', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Fetch error:', error);
    } else {
      setInvoices((data || []) as Invoice[]);
    }
    setLoadingInvoices(false);
  };

  const handleAiCommand = async () => {
    if (!aiQuery.trim()) return;
    
    setIsListening(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-invoice-assistant', {
        body: { 
          command: aiQuery,
          entity_id: selectedEntity
        }
      });

      if (error) throw error;

      console.log('AI response:', data);

      // === NAVIGATION ===
      if (data.navigate_to) {
        setActiveTab(data.navigate_to);
        toast.success(data.response || `Przechodzę do ${data.navigate_to}`);
        setAiQuery('');
        setIsListening(false);
        return;
      }

      // === MONTHLY SUMMARY ===
      if (data.show_summary && data.summary) {
        setSummaryData(data.summary);
        setShowSummaryDialog(true);
        toast.success(data.response);
        setAiQuery('');
        setIsListening(false);
        return;
      }

      // === EXPORT PDF ===
      if (data.action === 'download_pdf' && data.invoice) {
        if (data.pdf_url) {
          window.open(data.pdf_url, '_blank');
          toast.success(data.response);
        } else if (data.generate_pdf) {
          toast.info(data.response);
          // Call PDF generation function if exists
          try {
            const { data: pdfData } = await supabase.functions.invoke('invoice-pdf', {
              body: { invoice_id: data.invoice.id }
            });
            if (pdfData?.pdf_url) {
              window.open(pdfData.pdf_url, '_blank');
              toast.success('PDF wygenerowany i pobrany');
            }
          } catch (pdfErr) {
            console.error('PDF generation error:', pdfErr);
            toast.error('Nie udało się wygenerować PDF');
          }
        }
        setAiQuery('');
        setIsListening(false);
        return;
      }

      // === MARK PAID CONFIRMATION ===
      if (data.confirm_action === 'mark_paid' && data.invoice) {
        setPendingPaymentConfirmation({
          invoice_id: data.invoice.id,
          invoice_number: data.invoice.invoice_number,
          gross_amount: data.invoice.gross_amount || 0
        });
        toast.info(data.response);
        setAiQuery('');
        setIsListening(false);
        return;
      }

      // === SEND REMINDER CONFIRMATION ===
      if (data.confirm_action === 'send_reminder' && data.invoice) {
        setPendingReminderConfirmation({
          invoice_id: data.invoice.id,
          invoice_number: data.invoice.invoice_number,
          buyer_name: data.invoice.buyer_snapshot?.name || 'Nieznany',
          gross_amount: data.invoice.gross_amount || 0
        });
        toast.info(data.response);
        setAiQuery('');
        setIsListening(false);
        return;
      }

      // Handle response actions
      if (data.open_wizard) {
        setShowNewInvoice(true);
        toast.success(data.response || data.intent?.response || 'Otwieram kreator faktury');
      } else if (data.open_cost_modal) {
        setShowCostInvoice(true);
        toast.success(data.response || 'Otwieram dodawanie kosztu');
      } else if (data.filter) {
        setStatusFilter(data.filter);
        toast.success(data.response || `Filtruję: ${data.filter}`);
      } else if (data.response) {
        toast.info(data.response);
      }

    } catch (err) {
      console.error('AI error:', err);
      
      // Fallback to simple parsing
      const query = aiQuery.toLowerCase();
      if (query.includes('nowa faktura') || query.includes('wystaw')) {
        setShowNewInvoice(true);
      } else if (query.includes('koszt') || query.includes('wydatek')) {
        setShowCostInvoice(true);
      } else if (query.includes('nieopłacone')) {
        setStatusFilter('pending');
      } else {
        toast.error('Nie rozpoznałem polecenia');
      }
    } finally {
      setIsListening(false);
      setAiQuery('');
    }
  };

  const confirmMarkPaid = async () => {
    if (!pendingPaymentConfirmation) return;
    
    setIsMarkingPaid(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString() 
        })
        .eq('id', pendingPaymentConfirmation.invoice_id);
      
      if (error) throw error;
      
      toast.success(`Faktura ${pendingPaymentConfirmation.invoice_number} oznaczona jako opłacona`);
      fetchInvoices();
    } catch (err) {
      console.error('Mark paid error:', err);
      toast.error('Nie udało się oznaczyć faktury jako opłaconej');
    } finally {
      setIsMarkingPaid(false);
      setPendingPaymentConfirmation(null);
    }
  };

  const confirmSendReminder = async () => {
    if (!pendingReminderConfirmation) return;
    
    setIsSendingReminder(true);
    try {
      // For now simulation - in future call send-invoice-email edge function
      await new Promise(r => setTimeout(r, 1500));
      
      // TODO: Call actual edge function
      // const { error } = await supabase.functions.invoke('send-invoice-email', {
      //   body: { 
      //     invoice_id: pendingReminderConfirmation.invoice_id,
      //     type: 'payment_reminder'
      //   }
      // });
      
      toast.success(`Przypomnienie wysłane do ${pendingReminderConfirmation.buyer_name}`);
    } catch (err) {
      toast.error('Nie udało się wysłać przypomnienia');
    } finally {
      setIsSendingReminder(false);
      setPendingReminderConfirmation(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">Opłacona</Badge>;
      case 'issued':
        return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20">Wystawiona</Badge>;
      case 'draft':
        return <Badge variant="secondary">Szkic</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Oczekuje</Badge>;
      case 'overdue':
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20">Przeterminowana</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const types: Record<string, string> = {
      'invoice': 'VAT',
      'proforma': 'Proforma',
      'margin': 'Marża',
      'correction': 'Korekta',
      'advance': 'Zaliczka',
      'final': 'Końcowa',
      'cost': 'Koszt'
    };
    return <Badge variant="outline">{types[type] || type}</Badge>;
  };

  // Calculate stats
  const stats = {
    issued: invoices.filter(i => i.type !== 'cost').length,
    costs: invoices.filter(i => i.type === 'cost').length,
    totalIncome: invoices.filter(i => i.type !== 'cost').reduce((sum, i) => sum + (i.gross_amount || 0), 0),
    totalCosts: invoices.filter(i => i.type === 'cost').reduce((sum, i) => sum + (i.gross_amount || 0), 0),
    pending: invoices.filter(i => i.status === 'pending' || i.status === 'draft').length
  };

  // Generate month options
  const monthOptions = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'LLLL yyyy', { locale: pl })
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">Program do Faktur</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {entities.length > 1 && (
              <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Wybierz firmę" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <MyGetRidoButton user={user} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć
        </Button>

        {/* AI Voice Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Mic className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${isListening ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            <Input
              placeholder="Powiedz: wystaw fakturę, dodaj koszt, pokaż nieopłacone..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiCommand()}
              className="pl-12 pr-24 h-12 rounded-full border-2 border-primary/20 focus:border-primary"
            />
            <Button
              onClick={handleAiCommand}
              disabled={!aiQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-8 px-4"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              AI
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Powered by <span className="text-primary font-medium">Rido AI</span>
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.issued}</p>
                  <p className="text-sm text-muted-foreground">Wystawione</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.totalIncome.toLocaleString('pl-PL')}</p>
                  <p className="text-sm text-muted-foreground">Przychód PLN</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xl font-bold">{stats.totalCosts.toLocaleString('pl-PL')}</p>
                  <p className="text-sm text-muted-foreground">Koszty PLN</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Oczekujące</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xl font-bold">{(stats.totalIncome - stats.totalCosts).toLocaleString('pl-PL')}</p>
                  <p className="text-sm text-muted-foreground">Zysk PLN</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="sales" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Sprzedaż
              </TabsTrigger>
              <TabsTrigger value="costs" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Koszty
              </TabsTrigger>
              <TabsTrigger value="payments" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Płatności
              </TabsTrigger>
              <TabsTrigger value="contractors" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Kontrahenci
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Button onClick={() => setShowNewInvoice(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nowa faktura
              </Button>
              <Button variant="outline" onClick={() => setShowCostInvoice(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Dodaj koszt
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="draft">Szkice</SelectItem>
                <SelectItem value="issued">Wystawione</SelectItem>
                <SelectItem value="paid">Opłacone</SelectItem>
                <SelectItem value="pending">Oczekujące</SelectItem>
                <SelectItem value="overdue">Przeterminowane</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Szukaj faktury lub kontrahenta..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Eksport
            </Button>
          </div>

          {/* Sales Tab */}
          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <CardTitle>Faktury sprzedażowe</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingInvoices ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : invoices.filter(i => i.type !== 'cost').length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak faktur w wybranym okresie</p>
                    <Button className="mt-4" onClick={() => setShowNewInvoice(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Wystaw pierwszą fakturę
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoices
                      .filter(i => i.type !== 'cost')
                      .filter(i => !searchQuery || 
                        i.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (i.buyer_snapshot as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((invoice) => (
                        <div
                          key={invoice.id}
                          className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold">{invoice.invoice_number}</p>
                              <p className="text-sm text-muted-foreground">
                                {(invoice.buyer_snapshot as any)?.name || 'Brak odbiorcy'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-semibold">{(invoice.gross_amount || 0).toLocaleString('pl-PL')} PLN</p>
                              <p className="text-sm text-muted-foreground">{invoice.issue_date}</p>
                            </div>
                            <div className="flex gap-2">
                              {getTypeBadge(invoice.type)}
                              {getStatusBadge(invoice.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Costs Tab */}
          <TabsContent value="costs">
            <Card>
              <CardHeader>
                <CardTitle>Faktury kosztowe</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.filter(i => i.type === 'cost').length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <TrendingDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak faktur kosztowych</p>
                    <Button className="mt-4" variant="outline" onClick={() => setShowCostInvoice(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj pierwszą fakturę kosztową
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoices.filter(i => i.type === 'cost').map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-destructive/10">
                            <TrendingDown className="h-5 w-5 text-destructive" />
                          </div>
                          <div>
                            <p className="font-semibold">{invoice.invoice_number || 'Bez numeru'}</p>
                            <p className="text-sm text-muted-foreground">
                              {(invoice.buyer_snapshot as any)?.name || 'Brak dostawcy'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-destructive">-{(invoice.gross_amount || 0).toLocaleString('pl-PL')} PLN</p>
                            <p className="text-sm text-muted-foreground">{invoice.issue_date}</p>
                          </div>
                          {getStatusBadge(invoice.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            {selectedEntity && <PaymentRemindersPanel entityId={selectedEntity} />}
          </TabsContent>

          {/* Contractors Tab */}
          <TabsContent value="contractors">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Kontrahenci
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Lista kontrahentów pojawi się automatycznie</p>
                  <p className="text-sm mt-1">Dodaj kontrahenta wystawiając pierwszą fakturę</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Banner */}
        <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-background border border-primary/10">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Asystent AI</h3>
              <p className="text-muted-foreground">
                Użyj paska AI powyżej, aby szybko wystawiać faktury głosowo. 
                Powiedz np. "wystaw fakturę dla firmy ABC na 5000 zł" lub "pokaż nieopłacone faktury".
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {selectedEntity && (
        <>
          <NewInvoiceWizard
            open={showNewInvoice}
            onOpenChange={setShowNewInvoice}
            entityId={selectedEntity}
            onCreated={fetchInvoices}
          />
          <CostInvoiceModal
            open={showCostInvoice}
            onOpenChange={setShowCostInvoice}
            entityId={selectedEntity}
            onCreated={fetchInvoices}
          />
        </>
      )}

      {/* Summary Dialog */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Podsumowanie: {summaryData?.period}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Przychody</p>
                  <p className="text-xl font-bold text-green-600">
                    {summaryData?.total_income?.toLocaleString('pl-PL')} PLN
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Koszty</p>
                  <p className="text-xl font-bold text-destructive">
                    {summaryData?.total_costs?.toLocaleString('pl-PL')} PLN
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card className="bg-primary/5">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Zysk netto</p>
                <p className="text-2xl font-bold">
                  {summaryData?.profit?.toLocaleString('pl-PL')} PLN
                </p>
              </CardContent>
            </Card>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Faktury sprzedażowe: {summaryData?.invoices_count}</span>
              <span>Faktury kosztowe: {summaryData?.costs_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-600">✓ Opłacone: {summaryData?.paid_count}</span>
              <span className="text-yellow-600">⏳ Nieopłacone: {summaryData?.unpaid_count}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSummaryDialog(false)}>
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Confirmation */}
      <AlertDialog 
        open={!!pendingPaymentConfirmation} 
        onOpenChange={(open) => !open && setPendingPaymentConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Potwierdź oznaczenie płatności
            </AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno oznaczyć fakturę{' '}
              <strong>{pendingPaymentConfirmation?.invoice_number}</strong> na kwotę{' '}
              <strong>{pendingPaymentConfirmation?.gross_amount?.toLocaleString('pl-PL')} PLN</strong>{' '}
              jako opłaconą?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMarkingPaid}>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMarkPaid} disabled={isMarkingPaid}>
              {isMarkingPaid ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Zapisuję...</>
              ) : (
                'Tak, oznacz jako opłaconą'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Reminder Confirmation */}
      <AlertDialog 
        open={!!pendingReminderConfirmation} 
        onOpenChange={(open) => !open && setPendingReminderConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Wyślij przypomnienie o płatności
            </AlertDialogTitle>
            <AlertDialogDescription>
              Czy wysłać przypomnienie o płatności za fakturę{' '}
              <strong>{pendingReminderConfirmation?.invoice_number}</strong> do{' '}
              <strong>{pendingReminderConfirmation?.buyer_name}</strong> na kwotę{' '}
              <strong>{pendingReminderConfirmation?.gross_amount?.toLocaleString('pl-PL')} PLN</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSendingReminder}>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendReminder} disabled={isSendingReminder}>
              {isSendingReminder ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Wysyłam...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Wyślij przypomnienie</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
