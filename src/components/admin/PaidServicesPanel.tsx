import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Save, CreditCard, Bot, Rocket, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PaidService {
  id: string;
  name: string;
  description: string | null;
  price_pln: number;
  pricing_type: 'one_time' | 'monthly' | 'per_use';
  is_active: boolean;
  category: string;
  icon: string | null;
  created_at: string;
}

interface ServiceSubscription {
  id: string;
  user_id: string;
  service_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  amount_paid: number;
}

const PRICING_TYPES = [
  { value: 'one_time', label: 'Jednorazowo' },
  { value: 'monthly', label: 'Miesięcznie' },
  { value: 'per_use', label: 'Za użycie' },
];

const CATEGORIES = [
  { value: 'ai', label: 'AI', icon: Bot },
  { value: 'promotion', label: 'Promocja', icon: Rocket },
  { value: 'listing', label: 'Ogłoszenia', icon: Star },
  { value: 'other', label: 'Inne', icon: CreditCard },
];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-red-500/10 text-red-600',
  expired: 'bg-gray-500/10 text-gray-600',
  pending: 'bg-yellow-500/10 text-yellow-600',
};

export function PaidServicesPanel() {
  const [services, setServices] = useState<PaidService[]>([]);
  const [subscriptions, setSubscriptions] = useState<ServiceSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingService, setEditingService] = useState<PaidService | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Use type assertion for new tables not yet in generated types
      const servicesRes = await supabase
        .from('paid_services' as any)
        .select('*')
        .order('category');

      const subsRes = await supabase
        .from('paid_service_subscriptions' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (servicesRes.data) {
        setServices(servicesRes.data as unknown as PaidService[]);
      }
      if (subsRes.data) {
        setSubscriptions(subsRes.data as unknown as ServiceSubscription[]);
      }
    } catch (error) {
      console.error('Error loading paid services:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się załadować usług płatnych",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addService = async () => {
    try {
      const { data, error } = await supabase
        .from('paid_services' as any)
        .insert({
          name: 'Nowa usługa',
          description: '',
          price_pln: 9.99,
          pricing_type: 'monthly',
          category: 'other',
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setServices([...services, data as unknown as PaidService]);
        setEditingService(data as unknown as PaidService);
      }
    } catch (error) {
      console.error('Error adding service:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się dodać usługi",
        variant: "destructive",
      });
    }
  };

  const saveService = async () => {
    if (!editingService) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('paid_services' as any)
        .update({
          name: editingService.name,
          description: editingService.description,
          price_pln: editingService.price_pln,
          pricing_type: editingService.pricing_type,
          category: editingService.category,
          is_active: editingService.is_active,
        })
        .eq('id', editingService.id);

      if (error) throw error;

      setServices(services.map(s => s.id === editingService.id ? editingService : s));
      setEditingService(null);
      toast({
        title: "Zapisano",
        description: "Usługa została zaktualizowana",
      });
    } catch (error) {
      console.error('Error saving service:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się zapisać usługi",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteService = async (id: string) => {
    try {
      const { error } = await supabase
        .from('paid_services' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setServices(services.filter(s => s.id !== id));
      toast({
        title: "Usunięto",
        description: "Usługa została usunięta",
      });
    } catch (error) {
      console.error('Error deleting service:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się usunąć usługi",
        variant: "destructive",
      });
    }
  };

  // Calculate revenue summary
  const totalRevenue = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + (s.amount_paid || 0), 0);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Revenue Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Łączny przychód
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toFixed(2)} PLN</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktywne subskrypcje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubscriptions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktywne usługi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.filter(s => s.is_active).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Services List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Usługi płatne
              </CardTitle>
              <CardDescription>
                Zarządzaj dostępnymi usługami płatnymi
              </CardDescription>
            </div>
            <Button onClick={addService}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj usługę
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead>Cena (PLN)</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const CategoryIcon = CATEGORIES.find(c => c.value === service.category)?.icon || CreditCard;
                return (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <CategoryIcon className="h-3 w-3" />
                        {CATEGORIES.find(c => c.value === service.category)?.label || service.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{service.price_pln.toFixed(2)}</TableCell>
                    <TableCell>
                      {PRICING_TYPES.find(t => t.value === service.pricing_type)?.label || service.pricing_type}
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.is_active ? "default" : "secondary"}>
                        {service.is_active ? "Aktywna" : "Nieaktywna"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingService(service)}
                        >
                          Edytuj
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteService(service.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Brak usług płatnych. Dodaj pierwszą usługę.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Service Dialog */}
      {editingService && (
        <Card>
          <CardHeader>
            <CardTitle>Edytuj usługę</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nazwa</Label>
                <Input
                  value={editingService.name}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Kategoria</Label>
                <Select
                  value={editingService.category}
                  onValueChange={(value) => setEditingService({ ...editingService, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cena (PLN)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingService.price_pln}
                  onChange={(e) => setEditingService({ ...editingService, price_pln: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Typ płatności</Label>
                <Select
                  value={editingService.pricing_type}
                  onValueChange={(value: 'one_time' | 'monthly' | 'per_use') => setEditingService({ ...editingService, pricing_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Textarea
                value={editingService.description || ''}
                onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingService.is_active}
                onCheckedChange={(checked) => setEditingService({ ...editingService, is_active: checked })}
              />
              <Label>Usługa aktywna</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveService} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Zapisz
              </Button>
              <Button variant="outline" onClick={() => setEditingService(null)}>
                Anuluj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Ostatnie subskrypcje</CardTitle>
          <CardDescription>
            Historia zakupów usług płatnych
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID usługi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kwota</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.slice(0, 10).map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-mono text-xs">
                    {sub.service_id?.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[sub.status] || ''}>
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{sub.amount_paid?.toFixed(2) || '0.00'} PLN</TableCell>
                  <TableCell>
                    {new Date(sub.started_at).toLocaleDateString('pl-PL')}
                  </TableCell>
                </TableRow>
              ))}
              {subscriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Brak subskrypcji
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
