import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
// Role check removed - any authenticated user can access
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { AuthModal } from '@/components/auth/AuthModal';
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
  Send,
  Building2,
  LogIn
} from 'lucide-react';
import { NewInvoiceWizard } from '@/components/invoices/NewInvoiceWizard';
import { CostInvoiceModal } from '@/components/invoices/CostInvoiceModal';
import { PaymentRemindersPanel } from '@/components/invoices/PaymentRemindersPanel';
import { CompanySetupWizard } from '@/components/invoices/CompanySetupWizard';
import { ContractorsList } from '@/components/invoices/ContractorsList';
import { MonthlySummaryDialog, MonthlySummaryData } from '@/components/invoices/MonthlySummaryDialog';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
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
  // Removed role restrictions - any authenticated user can access
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
  const [showCompanySetup, setShowCompanySetup] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  
  // AI Voice
  const [isListening, setIsListening] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  
  // Controlled tabs for voice navigation
  const [activeTab, setActiveTab] = useState('sales');
  
  // Summary dialog
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryData, setSummaryData] = useState<MonthlySummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  
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
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (event === 'SIGNED_IN' && session?.user) {
          // Defer Supabase call to avoid deadlock
          setTimeout(() => {
            fetchEntities();
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setEntities([]);
          setSelectedEntity('');
          setInvoices([]);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchEntities();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedEntity) {
      fetchInvoices();
    }
  }, [selectedEntity, selectedMonth, statusFilter]);

  // Require login for actions (creating invoices, etc.)
  const requireLogin = (): boolean => {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }
    return true;
  };

  const fetchEntities = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    
    if (!currentUser) {
      console.log('fetchEntities: No user logged in');
      setEntities([]);
      setSelectedEntity('');
      return;
    }
    
    console.log('fetchEntities: Fetching for user', currentUser.id);
    
    const { data, error } = await supabase
      .from('entities')
      .select('id, name')
      .eq('owner_user_id', currentUser.id)
      .order('name');
    
    if (error) {
      console.error('fetchEntities error:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('fetchEntities: Found', data.length, 'entities');
      setEntities(data);
      setSelectedEntity(data[0].id);
    } else {
      console.log('fetchEntities: No entities found');
      setEntities([]);
      setSelectedEntity('');
    }
  };

  const handleCompanyCreated = (entity: { id: string; name: string }) => {
    setEntities(prev => [...prev, entity]);
    setSelectedEntity(entity.id);
    setShowCompanySetup(false);
  };

  const handleNewInvoiceClick = () => {
    if (!selectedEntity) {
      // Pokazujemy toast z przypomnieniem ale pozwalamy kontynuować
      toast.warning('Nie masz jeszcze firmy sprzedawcy. Dane wprowadzisz ręcznie na fakturze lub dodaj firmę w ustawieniach.');
    }
    setShowNewInvoice(true);
  };

  const handleCostInvoiceClick = () => {
    if (!selectedEntity) {
      toast.warning('Nie masz jeszcze firmy. Dane wprowadzisz ręcznie lub dodaj firmę w ustawieniach.');
    }
    setShowCostInvoice(true);
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
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { 
          invoice_id: pendingReminderConfirmation.invoice_id,
          type: 'payment_reminder'
        }
      });
      
      if (error) {
        console.error('Send reminder error:', error);
        toast.error(error.message || 'Nie udało się wysłać przypomnienia');
      } else if (data?.success) {
        toast.success(`Przypomnienie wysłane do ${pendingReminderConfirmation.buyer_name}`);
      } else {
        toast.error(data?.error || 'Błąd wysyłania przypomnienia');
      }
    } catch (err) {
      console.error('Send reminder exception:', err);
      toast.error('Nie udało się wysłać przypomnienia');
    } finally {
      setIsSendingReminder(false);
      setPendingReminderConfirmation(null);
    }
  };

  const fetchMonthlySummary = async (month: number, year: number) => {
    if (!selectedEntity) return;
    
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-invoice-assistant', {
        body: { 
          command: `podsumowanie ${month} ${year}`,
          entity_id: selectedEntity
        }
      });

      if (error) throw error;

      if (data?.summary) {
        setSummaryData(data.summary);
      }
    } catch (err) {
      console.error('Error fetching monthly summary:', err);
      toast.error('Nie udało się pobrać podsumowania');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSummaryMonthChange = (month: number, year: number) => {
    fetchMonthlySummary(month, year);
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

  // Remove check for !isAdmin - we already checked access above
  // Allow users to enter even without entities
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <UniversalHomeButton />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/klient')}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Portal Klienta</span>
              </Button>
              <div className="hidden md:flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg">Program do Faktur</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {user ? (
                <>
                  {entities.length > 0 && (
                    <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                      <SelectTrigger className="w-40 sm:w-48">
                        <SelectValue placeholder="Wybierz firmę" />
                      </SelectTrigger>
                      <SelectContent>
                        {entities.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setShowCompanySetup(true)}>
                    <Plus className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Dodaj firmę</span>
                  </Button>
                  <MyGetRidoButton user={user} />
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    setAuthModalMode('login');
                    setShowAuthModal(true);
                  }}>
                    <LogIn className="h-4 w-4 mr-1" />
                    Zaloguj
                  </Button>
                  <Button size="sm" onClick={() => {
                    setAuthModalMode('register');
                    setShowAuthModal(true);
                  }}>
                    Zarejestruj
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        {/* AI Voice Bar - Full width at top */}
        <div className="mb-6">
          <div className="relative max-w-3xl mx-auto">
            <Mic className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${isListening ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            <Input
              placeholder="Powiedz: wystaw fakturę, dodaj koszt, pokaż nieopłacone..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiCommand()}
              className="pl-12 pr-20 h-12 rounded-full border-2 border-primary/20 focus:border-primary"
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
        </div>

        {/* Guest view OR logged-in users without entity - show SimpleFreeInvoice */}
        {(!user || entities.length === 0) && (
          <div className="max-w-4xl mx-auto">
            <SimpleFreeInvoice />
            
            {/* Bottom prompt based on login state */}
            {!user ? (
              <Card className="mt-8 border-primary/20">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground mb-4">
                    Chcesz zapisywać faktury, zarządzać kontrahentami i generować raporty?
                  </p>
                  <Button onClick={() => setShowAuthModal(true)} variant="outline" className="gap-2">
                    <LogIn className="h-4 w-4" />
                    Zaloguj się do pełnego portalu
                  </Button>
                </CardContent>
              </Card>
            ) : entities.length === 0 ? (
              <Card className="mt-4 border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Chcesz automatycznie wypełniać dane sprzedawcy?</p>
                    <p className="text-sm text-muted-foreground">Dodaj swoją firmę, a dane będą uzupełniane automatycznie</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowCompanySetup(true)} className="shrink-0 gap-1">
                    <Plus className="h-4 w-4" />
                    Dodaj firmę
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {/* Stats Grid - only show when user has entities */}
        {user && entities.length > 0 && (
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
        )}

        {/* Main Tabs - only for logged in users with entities */}
        {user && entities.length > 0 && (
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
              <Button onClick={handleNewInvoiceClick} className="gap-2">
                <Plus className="h-4 w-4" />
                Nowa faktura
              </Button>
              <Button variant="outline" onClick={handleCostInvoiceClick} className="gap-2">
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
                    <Button className="mt-4" onClick={handleNewInvoiceClick}>
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
            {selectedEntity ? (
              <ContractorsList entityId={selectedEntity} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Wybierz firmę, aby zobaczyć kontrahentów</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        )}

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

      {/* Modals - Always render, pass empty entityId if none selected */}
      <NewInvoiceWizard
        open={showNewInvoice}
        onOpenChange={setShowNewInvoice}
        entityId={selectedEntity || ''}
        onCreated={() => {
          fetchEntities(); // Refresh entities in case new one was created
          fetchInvoices();
        }}
        onOpenCompanySetup={() => setShowCompanySetup(true)}
      />
      {selectedEntity && (
        <CostInvoiceModal
          open={showCostInvoice}
          onOpenChange={setShowCostInvoice}
          entityId={selectedEntity}
          onCreated={fetchInvoices}
        />
      )}

      {/* Monthly Summary Dialog */}
      <MonthlySummaryDialog
        open={showSummaryDialog}
        onOpenChange={setShowSummaryDialog}
        data={summaryData}
        onMonthChange={handleSummaryMonthChange}
      />

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

      {/* Company Setup Wizard */}
      <CompanySetupWizard
        open={showCompanySetup}
        onOpenChange={setShowCompanySetup}
        onCreated={handleCompanyCreated}
      />

      {/* Auth Modal for login prompts */}
      <AuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        initialMode={authModalMode}
        customDescription={authModalMode === 'register' 
          ? "Zarejestruj się, aby korzystać z programu do faktur"
          : "Zaloguj się, aby korzystać z programu do faktur"}
        onSuccess={() => {
          setShowAuthModal(false);
          // Auth state listener will handle the rest
        }}
      />
    </div>
  );
}
