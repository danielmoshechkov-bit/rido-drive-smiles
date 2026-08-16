import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, MessageSquare } from 'lucide-react';
import { VehicleLookupCreditsModal } from './vehicle/VehicleLookupCreditsModal';
import { SmsPurchaseModal } from './SmsPurchaseModal';

export function TopBarCredits() {
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  const { data: vehicleCredits } = useQuery({
    queryKey: ['vehicle-lookup-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // 🔴 NAPRAWIONE 16.08.2026 (audyt). Pasek czytał `vehicle_lookup_credits`
      // — saldo OSOBISTE. Migracja 4.12 przeniosła kredyty właścicieli do puli
      // warsztatu (paczki), więc po wdrożeniu ta kolumna jest u nich zerowa
      // i pasek pokazywał zero komuś, kto ma 48 sprawdzeń. Klient mógłby
      // kupić drugi raz to, co już ma.
      const { data: warsztat } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Bez warsztatu (portal klienta, flota) prawdą nadal jest saldo osobiste.
      if (!warsztat?.id) {
        const { data } = await supabase
          .from('vehicle_lookup_credits')
          .select('remaining_credits')
          .eq('user_id', user.id)
          .maybeSingle();
        return data?.remaining_credits ?? 0;
      }

      const { data: stan, error } = await (supabase as any).rpc('check_usage', {
        p_subscriber_type: 'service_provider',
        p_subscriber_id: warsztat.id,
        p_feature_key: 'vehicle_lookup',
        p_amount: 1,
      });
      if (error) return 0;

      // Sprawdzenia są poza abonamentem (limit 0 w każdym planie), więc
      // w praktyce liczy się `packs_remaining`. Pula planu zostaje w sumie
      // na wypadek, gdyby kiedyś wróciła do pakietów.
      if ((stan as any)?.reason === 'unlimited') return null;
      const limit = Number((stan as any)?.limit ?? 0);
      const uzyte = Number((stan as any)?.used ?? 0);
      const paczki = Number((stan as any)?.packs_remaining ?? 0);
      return Math.max(limit - uzyte, 0) + paczki;
    },
  });

  const { data: smsCredits } = useQuery({
    queryKey: ['sms-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { data } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        // Konto może mieć więcej niż jeden warsztat (plan Sieci). `maybeSingle`
        // zwraca wtedy BŁĄD, nie pierwszy wiersz — ekran się wywala. Bierzemy
        // najstarszy i tak samo we wszystkich miejscach, żeby różne ekrany
        // nie pokazywały różnych firm.
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!data?.id) return 0;

      // Wyłącznie `sms_dostepne` — pula planu plus paczki. Wcześniej pasek
      // czytał najpierw `service_providers.sms_balance`, a tę kolumnę klient
      // może sobie zapisać z przeglądarki (polityka „Users can update own
      // provider"). Pasek pokazywałby wtedy liczbę, którą sam wpisał.
      const { data: dostepne, error } = await (supabase as any)
        .rpc('sms_dostepne', { p_provider_id: data.id });
      if (error) return 0;
      // `null` = plan bez limitu; pasek pokazuje wtedy kreskę zamiast liczby.
      return dostepne === null ? null : Number(dostepne ?? 0);
    },
  });



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
          {/* `null` z `sms_dostepne` znaczy plan bez limitu — kreska zamiast
              zmyślonej liczby. `undefined` to jeszcze niewczytane. */}
          <span className="text-sm font-semibold text-foreground">
            {smsCredits === null ? '∞' : (smsCredits ?? 0)}
          </span>
        </button>
      </div>

      <VehicleLookupCreditsModal
        open={showVehicleModal}
        onOpenChange={setShowVehicleModal}
      />

      <SmsPurchaseModal
        open={showSmsModal}
        onOpenChange={setShowSmsModal}
      />
    </>
  );
}
