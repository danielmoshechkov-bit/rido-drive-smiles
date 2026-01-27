import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { 
  Loader2, 
  Search, 
  Building2, 
  Sparkles, 
  Users, 
  Activity,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  nip: string | null;
}

interface AIProSubscription {
  id: string;
  entity_id: string;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  activated_at: string | null;
  entity?: Entity;
}

interface AIProExemption {
  id: string;
  email: string;
  scope: string[];
  valid_until: string | null;
  note: string | null;
  created_at: string;
}

interface AIJob {
  id: string;
  entity_id: string | null;
  user_id: string | null;
  job_type: string;
  provider: string | null;
  status: string;
  created_at: string;
  entity?: { name: string };
}

export function AIProManagementPanel() {
  const [activeTab, setActiveTab] = useState('subscriptions');
  const [loading, setLoading] = useState(true);
  
  // Subscriptions
  const [entities, setEntities] = useState<Entity[]>([]);
  const [subscriptions, setSubscriptions] = useState<AIProSubscription[]>([]);
  const [entitySearch, setEntitySearch] = useState('');
  
  // Exemptions
  const [exemptions, setExemptions] = useState<AIProExemption[]>([]);
  const [showExemptionDialog, setShowExemptionDialog] = useState(false);
  const [newExemption, setNewExemption] = useState({
    email: '',
    scope: '*',
    valid_until: '',
    note: ''
  });
  
  // AI Jobs
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [jobFilter, setJobFilter] = useState({ status: 'all', type: 'all' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEntitiesAndSubscriptions(),
        loadExemptions(),
        loadJobs()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadEntitiesAndSubscriptions = async () => {
    const [entitiesRes, subsRes] = await Promise.all([
      supabase.from('entities').select('id, name, nip').order('name'),
      supabase.from('ai_pro_subscriptions').select('*')
    ]);

    if (entitiesRes.data) setEntities(entitiesRes.data);
    if (subsRes.data) setSubscriptions(subsRes.data as AIProSubscription[]);
  };

  const loadExemptions = async () => {
    const { data } = await supabase
      .from('ai_pro_exemptions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      setExemptions(data.map(e => ({
        ...e,
        scope: Array.isArray(e.scope) ? e.scope.map(String) : ['*']
      })));
    }
  };

  const loadJobs = async () => {
    const { data } = await supabase
      .from('ai_jobs')
      .select('*, entity:entities(name)')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (data) setJobs(data as AIJob[]);
  };

  const getSubscriptionForEntity = (entityId: string) => {
    return subscriptions.find(s => s.entity_id === entityId);
  };

  const handleStatusChange = async (entityId: string, newStatus: string) => {
    try {
      const existing = getSubscriptionForEntity(entityId);
      
      if (existing) {
        await supabase
          .from('ai_pro_subscriptions')
          .update({ 
            status: newStatus,
            activated_at: ['active_paid', 'active_comped'].includes(newStatus) ? new Date().toISOString() : null,
            disabled_at: newStatus === 'disabled' ? new Date().toISOString() : null
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('ai_pro_subscriptions')
          .insert({
            entity_id: entityId,
            status: newStatus,
            activated_at: ['active_paid', 'active_comped'].includes(newStatus) ? new Date().toISOString() : null
          });
      }

      toast.success('Status AI PRO zaktualizowany');
      loadEntitiesAndSubscriptions();
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error('Błąd aktualizacji statusu');
    }
  };

  const handleAddExemption = async () => {
    if (!newExemption.email) {
      toast.error('Podaj adres email');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from('ai_pro_exemptions')
        .insert({
          email: newExemption.email.toLowerCase(),
          scope: newExemption.scope === '*' ? ['*'] : newExemption.scope.split(',').map(s => s.trim()),
          valid_until: newExemption.valid_until || null,
          note: newExemption.note || null,
          created_by_user_id: user?.id
        });

      toast.success('Wykluczenie dodane');
      setShowExemptionDialog(false);
      setNewExemption({ email: '', scope: '*', valid_until: '', note: '' });
      loadExemptions();
    } catch (err: any) {
      console.error('Error adding exemption:', err);
      toast.error('Błąd dodawania wykluczenia');
    }
  };

  const handleDeleteExemption = async (id: string) => {
    try {
      await supabase.from('ai_pro_exemptions').delete().eq('id', id);
      toast.success('Wykluczenie usunięte');
      loadExemptions();
    } catch (err: any) {
      console.error('Error deleting exemption:', err);
      toast.error('Błąd usuwania');
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      disabled: { label: 'Wyłączony', className: 'bg-gray-100 text-gray-600' },
      trial_active: { label: 'Trial aktywny', className: 'bg-blue-100 text-blue-600' },
      trial_expired: { label: 'Trial wygasł', className: 'bg-orange-100 text-orange-600' },
      active_paid: { label: 'Aktywny (płatny)', className: 'bg-green-100 text-green-600' },
      active_comped: { label: 'Aktywny (gratis)', className: 'bg-purple-100 text-purple-600' },
      pending_payment: { label: 'Oczekuje płatności', className: 'bg-yellow-100 text-yellow-600' }
    };
    const { label, className } = config[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
    return <Badge className={className}>{label}</Badge>;
  };

  const filteredEntities = entities.filter(e => 
    e.name.toLowerCase().includes(entitySearch.toLowerCase()) ||
    (e.nip && e.nip.includes(entitySearch))
  );

  const filteredJobs = jobs.filter(j => {
    if (jobFilter.status !== 'all' && j.status !== jobFilter.status) return false;
    if (jobFilter.type !== 'all' && j.job_type !== jobFilter.type) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">AI PRO - Zarządzanie</h2>
          <p className="text-sm text-muted-foreground">Subskrypcje, wykluczenia i logi AI</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="subscriptions" className="gap-2">
            <Building2 className="h-4 w-4" />
            Subskrypcje
          </TabsTrigger>
          <TabsTrigger value="exemptions" className="gap-2">
            <Users className="h-4 w-4" />
            Wykluczenia
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            Logi AI
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj firmy..."
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {filteredEntities.map(entity => {
                  const sub = getSubscriptionForEntity(entity.id);
                  const status = sub?.status || 'disabled';
                  
                  return (
                    <div 
                      key={entity.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{entity.name}</p>
                          {entity.nip && (
                            <p className="text-xs text-muted-foreground">NIP: {entity.nip}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {getStatusBadge(status)}
                        
                        <Select
                          value={status}
                          onValueChange={(v) => handleStatusChange(entity.id, v)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disabled">Wyłączony</SelectItem>
                            <SelectItem value="trial_active">Trial aktywny</SelectItem>
                            <SelectItem value="trial_expired">Trial wygasł</SelectItem>
                            <SelectItem value="active_paid">Aktywny (płatny)</SelectItem>
                            <SelectItem value="active_comped">Aktywny (gratis)</SelectItem>
                            <SelectItem value="pending_payment">Oczekuje płatności</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}

                {filteredEntities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak firm do wyświetlenia</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exemptions Tab */}
        <TabsContent value="exemptions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowExemptionDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj wykluczenie
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {exemptions.map(ex => (
                  <div 
                    key={ex.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{ex.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">
                          {ex.scope.includes('*') ? 'Wszystkie funkcje' : ex.scope.join(', ')}
                        </Badge>
                        {ex.valid_until ? (
                          <span className="text-xs text-muted-foreground">
                            do {format(new Date(ex.valid_until), 'd MMM yyyy', { locale: pl })}
                          </span>
                        ) : (
                          <span className="text-xs text-primary">Bezterminowo</span>
                        )}
                      </div>
                      {ex.note && (
                        <p className="text-xs text-muted-foreground mt-1">{ex.note}</p>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteExemption(ex.id)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {exemptions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak wykluczeń</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Jobs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <div className="flex items-center gap-4">
            <Select
              value={jobFilter.status}
              onValueChange={(v) => setJobFilter(prev => ({ ...prev, status: v }))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="success">Sukces</SelectItem>
                <SelectItem value="failed">Błąd</SelectItem>
                <SelectItem value="running">W toku</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={jobFilter.type}
              onValueChange={(v) => setJobFilter(prev => ({ ...prev, type: v }))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie typy</SelectItem>
                <SelectItem value="profit_analysis">Analiza zysku</SelectItem>
                <SelectItem value="invoice_extract">Ekstrakcja faktury</SelectItem>
                <SelectItem value="inventory_advice">Magazyn</SelectItem>
                <SelectItem value="sales_copy">Opis sprzedażowy</SelectItem>
                <SelectItem value="compliance_check">Compliance</SelectItem>
                <SelectItem value="tax_advice">Doradztwo podatkowe</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadJobs}>
              Odśwież
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {filteredJobs.map(job => (
                  <div 
                    key={job.id}
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {job.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-primary" />
                      ) : job.status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{job.job_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.entity?.name || 'Nieznana firma'} • {job.provider || 'n/a'}
                        </p>
                      </div>
                    </div>
                    
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), 'd MMM HH:mm', { locale: pl })}
                    </span>
                  </div>
                ))}

                {filteredJobs.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak logów AI</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Exemption Dialog */}
      <Dialog open={showExemptionDialog} onOpenChange={setShowExemptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj wykluczenie AI PRO</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newExemption.email}
                onChange={(e) => setNewExemption(prev => ({ ...prev, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Zakres funkcji</Label>
              <Select
                value={newExemption.scope}
                onValueChange={(v) => setNewExemption(prev => ({ ...prev, scope: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="*">Wszystkie funkcje</SelectItem>
                  <SelectItem value="ai_profit_analysis">Tylko analiza zysku</SelectItem>
                  <SelectItem value="ai_invoice_ocr_extract">Tylko OCR faktur</SelectItem>
                  <SelectItem value="ai_inventory_assistant">Tylko asystent magazynowy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Ważność do (opcjonalnie)</Label>
              <Input
                type="date"
                value={newExemption.valid_until}
                onChange={(e) => setNewExemption(prev => ({ ...prev, valid_until: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Pozostaw puste dla dostępu bezterminowego</p>
            </div>
            
            <div className="space-y-2">
              <Label>Notatka (opcjonalnie)</Label>
              <Input
                value={newExemption.note}
                onChange={(e) => setNewExemption(prev => ({ ...prev, note: e.target.value }))}
                placeholder="np. Early adopter, partner..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExemptionDialog(false)}>
              Anuluj
            </Button>
            <Button onClick={handleAddExemption}>
              Dodaj wykluczenie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
