import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import type { ProsbaOZgode } from '@/hooks/useVehicleLookup';

interface Props {
  prosba: ProsbaOZgode | null;
  onOdrzuc: () => void;
}

/**
 * Pytanie, zanim system sięgnie po prywatne kredyty pracownika.
 *
 * Kolejność pobierania to pula warsztatu → jego paczki → własne kredyty
 * pracownika. Trzeci poziom NIE uruchamia się sam: mechanik kupił te kredyty
 * jako osoba prywatna i nie ma dopłacać do pracy, nie wiedząc o tym. Bez tego
 * okna pula firmy skończyłaby się w środku dnia, a kolejne sprawdzenia po
 * cichu schodziłyby z jego salda — technicznie poprawnie, w odbiorze jak
 * kradzież.
 */
export function ZgodaNaWlasnyKredyt({ prosba, onOdrzuc }: Props) {
  const providerId = prosba?.providerId ?? null;
  const [wysylanie, setWysylanie] = useState(false);

  const poprosWlasciciela = async () => {
    if (!providerId) { toast.error('Nie wiadomo, do którego warsztatu wysłać prośbę'); return; }
    setWysylanie(true);
    try {
      const { error } = await supabase.functions.invoke('workshop-notify-owner', {
        body: { providerId, powod: 'vehicle_lookup_wyczerpane' },
      });
      if (error) throw error;
      toast.success('Właściciel dostał powiadomienie o pustej puli');
      onOdrzuc();
    } catch {
      toast.error('Nie udało się wysłać powiadomienia');
    } finally {
      setWysylanie(false);
    }
  };

  return (
    <AlertDialog open={!!prosba} onOpenChange={(o) => { if (!o) onOdrzuc(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pula warsztatu wyczerpana</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Sprawdzenia pojazdów w pakiecie warsztatu skończyły się.
                Użyć Twojego kredytu?
              </p>
              <p className="text-foreground font-medium">
                Zostanie Ci {prosba?.wlasnePozostalo ?? 0}.
              </p>
              <p className="text-xs">
                To Twoje prywatne kredyty — te, które kupiłeś dla siebie,
                nie firmowe.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={poprosWlasciciela}
            disabled={wysylanie || !providerId}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {wysylanie ? 'Wysyłanie…' : 'Poproś właściciela o doładowanie'}
          </Button>
          <AlertDialogCancel onClick={onOdrzuc}>Nie teraz</AlertDialogCancel>
          <AlertDialogAction onClick={() => prosba?.potwierdz()}>
            Użyj mojego kredytu
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
