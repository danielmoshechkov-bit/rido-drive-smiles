import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface SettlementPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  google_sheet_url: string;
}

const SettlementSheetView = () => {
  const { settlementId } = useParams<{ settlementId: string }>();
  const navigate = useNavigate();
  const [settlement, setSettlement] = useState<SettlementPeriod | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettlement();
  }, [settlementId]);

  const loadSettlement = async () => {
    if (!settlementId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settlement_periods')
        .select('*')
        .eq('id', settlementId)
        .single();

      if (error) throw error;
      setSettlement(data);
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

  if (!settlement) {
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
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/admin/dashboard')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Powrót
              </Button>
              <div>
                <h1 className="text-xl font-bold text-primary">
                  Rozliczenie: {format(new Date(settlement.week_start), 'dd.MM.yyyy', { locale: pl })} - {format(new Date(settlement.week_end), 'dd.MM.yyyy', { locale: pl })}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Status: <span className="font-medium">{settlement.status}</span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(settlement.google_sheet_url, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Otwórz w nowej karcie
            </Button>
          </div>
        </div>
      </div>

      {/* Google Sheets Iframe */}
      <div className="container mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden" style={{ height: '90vh' }}>
          <iframe
            src={settlement.google_sheet_url}
            className="w-full h-full"
            frameBorder="0"
            title="Google Sheets - Rozliczenie"
          />
        </div>
      </div>
    </div>
  );
};

export default SettlementSheetView;
