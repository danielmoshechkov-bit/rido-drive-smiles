import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SettlementPreview } from '@/components/SettlementPreview';

interface SettlementPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
}

export default function SettlementSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [settlementPeriod, setSettlementPeriod] = useState<SettlementPeriod | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    try {
      const { data: periodData, error: periodError } = await supabase
        .from('settlement_periods')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (periodError) throw periodError;
      setSettlementPeriod(periodData);
    } catch (error) {
      console.error('Error loading settlement:', error);
      toast.error('Błąd ładowania rozliczenia');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  if (!settlementPeriod) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nie znaleziono rozliczenia</p>
          <Button onClick={() => navigate('/admin/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Powrót do panelu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/dashboard')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Powrót
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Rozliczenie {new Date(settlementPeriod.week_start).toLocaleDateString('pl-PL')} - {new Date(settlementPeriod.week_end).toLocaleDateString('pl-PL')}
              </h1>
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium">{settlementPeriod.status}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Settlement Preview with full details */}
      <div className="container mx-auto px-4 py-6">
        <SettlementPreview 
          periodId={id!}
          periodFrom={settlementPeriod.week_start}
          periodTo={settlementPeriod.week_end}
        />
      </div>
    </div>
  );
}
