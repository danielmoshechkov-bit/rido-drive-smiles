import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SettlementPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  google_sheet_url: string;
}

export default function SettlementSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [settlement, setSettlement] = useState<SettlementPeriod | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettlement();
  }, [id]);

  const loadSettlement = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('settlement_periods')
        .select('*')
        .eq('id', id)
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
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
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
              <h1 className="text-xl font-bold text-primary">
                Rozliczenie {new Date(settlement.week_start).toLocaleDateString('pl-PL')} - {new Date(settlement.week_end).toLocaleDateString('pl-PL')}
              </h1>
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium">{settlement.status}</span>
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => window.open(settlement.google_sheet_url, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Otwórz w nowej karcie
          </Button>
        </div>
      </div>

      {/* Google Sheets iframe */}
      <div className="flex-1 container mx-auto px-4 py-4">
        <div className="h-full rounded-lg overflow-hidden shadow-elegant border">
          <iframe
            src={settlement.google_sheet_url}
            className="w-full h-[calc(90vh-100px)]"
            frameBorder="0"
            title="Google Sheets Settlement"
          />
        </div>
      </div>
    </div>
  );
}
