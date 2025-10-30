import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Save } from 'lucide-react';

interface SettlementPlan {
  id: string;
  name: string;
  base_fee: number;
  tax_percentage: number | null;
  service_fee: number;
  description: string | null;
  is_active: boolean;
}

export const SettlementPlansManagement = () => {
  const [plans, setPlans] = useState<SettlementPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SettlementPlan | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('settlement_plans')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      toast.error('Błąd ładowania planów: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async (plan: Partial<SettlementPlan>) => {
    try {
      if (plan.id) {
        // Update existing
        const { error } = await supabase
          .from('settlement_plans')
          .update({
            name: plan.name,
            base_fee: plan.base_fee,
            tax_percentage: plan.tax_percentage,
            service_fee: plan.service_fee,
            description: plan.description,
            is_active: plan.is_active
          })
          .eq('id', plan.id);

        if (error) throw error;
        toast.success('Plan zaktualizowany');
      } else {
        // Create new
        const { error } = await supabase
          .from('settlement_plans')
          .insert({
            name: plan.name,
            base_fee: plan.base_fee || 0,
            tax_percentage: plan.tax_percentage,
            service_fee: plan.service_fee || 0,
            description: plan.description,
            is_active: plan.is_active !== false
          });

        if (error) throw error;
        toast.success('Plan dodany');
      }

      setEditingPlan(null);
      setShowAddForm(false);
      loadPlans();
    } catch (error: any) {
      toast.error('Błąd zapisu planu: ' + error.message);
    }
  };

  const deletePlan = async (planId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten plan?')) return;

    try {
      const { error } = await supabase
        .from('settlement_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;
      toast.success('Plan usunięty');
      loadPlans();
    } catch (error: any) {
      toast.error('Błąd usuwania planu: ' + error.message);
    }
  };

  const PlanForm = ({ plan, onSave, onCancel }: { 
    plan: Partial<SettlementPlan>, 
    onSave: (plan: Partial<SettlementPlan>) => void,
    onCancel: () => void 
  }) => {
    const [formData, setFormData] = useState(plan);

    return (
      <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nazwa planu</Label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="np. 50+8%"
            />
          </div>
          <div>
            <Label>Opłata podstawowa (PLN)</Label>
            <Input
              type="number"
              value={formData.base_fee || 0}
              onChange={(e) => setFormData({ ...formData, base_fee: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Podatek (%)</Label>
            <Input
              type="number"
              value={formData.tax_percentage || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                tax_percentage: e.target.value ? Number(e.target.value) : null 
              })}
              placeholder="np. 8 lub zostaw puste"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Zostaw puste jeśli plan nie ma podatku
            </p>
          </div>
          <div>
            <Label>Dodatkowa opłata serwisowa (PLN)</Label>
            <Input
              type="number"
              value={formData.service_fee || 0}
              onChange={(e) => setFormData({ ...formData, service_fee: Number(e.target.value) })}
            />
          </div>
        </div>
        <div>
          <Label>Opis</Label>
          <Textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Dodatkowe informacje o planie"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.is_active !== false}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
          <Label>Plan aktywny</Label>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onSave(formData)} className="gap-2">
            <Save className="h-4 w-4" />
            Zapisz
          </Button>
          <Button onClick={onCancel} variant="outline">
            Anuluj
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Ładowanie planów...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Plany rozliczeniowe</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Zarządzaj planami rozliczeń dla kierowców
            </p>
          </div>
          <Button onClick={() => setShowAddForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Dodaj plan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <PlanForm
            plan={{}}
            onSave={savePlan}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {plans.map((plan) => (
          <div key={plan.id}>
            {editingPlan?.id === plan.id ? (
              <PlanForm
                plan={editingPlan}
                onSave={savePlan}
                onCancel={() => setEditingPlan(null)}
              />
            ) : (
              <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{plan.name}</h3>
                      {!plan.is_active && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          Nieaktywny
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Opłata podstawowa:</span>
                        <span className="ml-2 font-medium">{plan.base_fee} PLN</span>
                      </div>
                      {plan.tax_percentage !== null && (
                        <div>
                          <span className="text-muted-foreground">Podatek:</span>
                          <span className="ml-2 font-medium">{plan.tax_percentage}%</span>
                        </div>
                      )}
                      {plan.service_fee > 0 && (
                        <div>
                          <span className="text-muted-foreground">Opłata serwisowa:</span>
                          <span className="ml-2 font-medium">{plan.service_fee} PLN</span>
                        </div>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingPlan(plan)}
                      className="text-primary hover:text-primary/80"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePlan(plan.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};