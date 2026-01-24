import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { 
  FileText, 
  Plus, 
  Download, 
  Search,
  Filter,
  ArrowLeft,
  Building2,
  Users,
  TrendingUp,
  Clock
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function InvoiceProgram() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    // Only allow main admin for now
    if (user?.email === 'daniel.moshechkov@gmail.com') {
      setIsAdmin(true);
    } else {
      toast.error('Brak dostępu do programu faktur');
      navigate('/');
      return;
    }
    
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // Mock stats for demo
  const stats = [
    { label: 'Wystawione faktury', value: '24', icon: FileText, trend: '+12%' },
    { label: 'Kontrahenci', value: '8', icon: Users, trend: '+3' },
    { label: 'Przychód miesięczny', value: '45 320 PLN', icon: TrendingUp, trend: '+8%' },
    { label: 'Oczekujące', value: '3', icon: Clock, trend: '' },
  ];

  // Mock invoices for demo
  const mockInvoices = [
    { id: '1', number: 'FV/2026/01/001', client: 'ABC Transport Sp. z o.o.', amount: 12500, status: 'paid', date: '2026-01-15' },
    { id: '2', number: 'FV/2026/01/002', client: 'Jan Kowalski DG', amount: 3200, status: 'pending', date: '2026-01-18' },
    { id: '3', number: 'FV/2026/01/003', client: 'XYZ Logistyka', amount: 8750, status: 'paid', date: '2026-01-20' },
    { id: '4', number: 'FV/2026/01/004', client: 'Auto-Serwis Nowak', amount: 2100, status: 'overdue', date: '2026-01-10' },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">Opłacona</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Oczekuje</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20">Przeterminowana</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">Program do Faktur</span>
            </div>
          </div>
          <MyGetRidoButton user={user} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć do strony głównej
        </Button>

        {/* Page Title */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Program do Faktur</h1>
            <p className="text-muted-foreground mt-1">Wystawiaj i zarządzaj fakturami online</p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nowa faktura
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    {stat.trend && (
                      <span className="text-xs text-green-600 font-medium">{stat.trend}</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-3">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Szukaj faktury lub kontrahenta..." className="pl-10" />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtry
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Eksport
          </Button>
        </div>

        {/* Invoices List */}
        <Card>
          <CardHeader>
            <CardTitle>Ostatnie faktury</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{invoice.number}</p>
                      <p className="text-sm text-muted-foreground">{invoice.client}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">{invoice.amount.toLocaleString('pl-PL')} PLN</p>
                      <p className="text-sm text-muted-foreground">{invoice.date}</p>
                    </div>
                    {getStatusBadge(invoice.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Info Banner */}
        <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-background border border-primary/10">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Program w fazie testowej</h3>
              <p className="text-muted-foreground">
                Aktualnie moduł fakturowania jest dostępny tylko dla administratorów w celach testowych. 
                Wkrótce będzie dostępny dla wszystkich zarejestrowanych użytkowników.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
