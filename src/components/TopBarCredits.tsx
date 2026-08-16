import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, MessageSquare } from 'lucide-react';
import { VehicleLookupCreditsModal } from './vehicle/VehicleLookupCreditsModal';
import { SmsPurchaseModal } from './SmsPurchaseModal';
import { toast } from 'sonner';

export function TopBarCredits() {
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  const { data: vehicleCredits } = useQuery({
    queryKey: ['vehicle-lookup-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { data } = await supabase
        .from('vehicle_lookup_credits')
        .select('remaining_credits')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.remaining_credits ?? 0;
    },
  });

  const { data: smsCredits } = useQuery({
    queryKey: ['sms-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      // SALDO SMS NIE JEST KOLUMNĄ W `service_providers` — takiej kolumny NIE MA
      // i nigdy nie było. Zapytanie zawodziło przy każdym otwarciu panelu,
      // błędu nikt nie sprawdzał, więc licznik w nagłówku pokazywał zero
      // każdemu warsztatowi, niezależnie od tego, ile SMS-ów naprawdę miał.
      //
      // Prawdziwe źródło to księga `sms_credit_ledger` i funkcja `sms_dostepne`,
      // która liczy z niej saldo. Wołamy funkcję, a nie księgę, bo to ona jest
      // jedynym miejscem, gdzie zapisana jest reguła liczenia salda.
      const { data: sp, error: bladProfilu } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (bladProfilu) { console.error('[TopBarCredits] profil usługodawcy:', bladProfilu.message); return 0; }
      if (!sp?.id) return 0;
      const { data, error } = await supabase.rpc('sms_dostepne', { p_provider_id: sp.id });
      if (error) { console.error('[TopBarCredits] saldo SMS:', error.message); return 0; }
      return Number(data ?? 0);
    },
  });

  const handleVehiclePurchase = (credits: number, priceNet: number) => {
    toast.info(`Przekierowanie do płatności za ${credits} kredytów (${priceNet.toFixed(2)} zł netto)`);
    setShowVehicleModal(false);
  };

  const handleSmsPurchase = (count: number, priceNet: number) => {
    toast.info(`Przekierowanie do płatności za ${count} SMS (${priceNet.toFixed(2)} zł netto)`);
    setShowSmsModal(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Vehicle lookup credits badge */}
        <button
          onClick={() => setShowVehicleModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
          title="Zapytania o pojazdy"
        >
          <Car className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-destructive">{vehicleCredits ?? 0}</span>
        </button>

        {/* SMS credits badge */}
        <button
          onClick={() => setShowSmsModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer border border-border"
          title="Pakiet SMS"
        >
          <MessageSquare className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold text-foreground">{smsCredits ?? 0}</span>
        </button>
      </div>

      <VehicleLookupCreditsModal
        open={showVehicleModal}
        onOpenChange={setShowVehicleModal}
        onPurchase={handleVehiclePurchase}
      />

      <SmsPurchaseModal
        open={showSmsModal}
        onOpenChange={setShowSmsModal}
        onPurchase={handleSmsPurchase}
      />
    </>
  );
}
