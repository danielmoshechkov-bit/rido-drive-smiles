import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from './SettingsPanel';

/**
 * Standalone host dla działającego SettingsPanel (kafelek "Ustawienia" w dashboardzie).
 * Ładuje dane firmy do settingsForm (inaczej zapis wyzerowałby firmę), potem renderuje
 * pełny, funkcjonalny panel ustawień. Zastępuje zaślepkową siatkę WorkshopSettings.
 */
export function WorkshopSettingsStandalone({ providerId, onBack }: { providerId: string | null; onBack: () => void }) {
  const [settingsForm, setSettingsForm] = useState<any>(null);

  useEffect(() => {
    if (!providerId) return;
    (async () => {
      const { data: sp } = await (supabase as any)
        .from('service_providers')
        .select('company_name, short_name, company_nip, owner_first_name, owner_last_name, owner_email, company_phone, company_address, company_city, company_postal_code, company_website, description, logo_url')
        .eq('id', providerId).maybeSingle();
      setSettingsForm({
        company_name: sp?.company_name || '', short_name: sp?.short_name || '',
        nip: sp?.company_nip || '', first_name: sp?.owner_first_name || '', last_name: sp?.owner_last_name || '',
        email: sp?.owner_email || '', phone: sp?.company_phone || '', address: sp?.company_address || '',
        city: sp?.company_city || '', postal_code: sp?.company_postal_code || '', website: sp?.company_website || '',
        bio: sp?.description || '', logo_url: sp?.logo_url || '',
      });
    })();
  }, [providerId]);

  if (!settingsForm) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Pulpit</Button>
      <SettingsPanel providerId={providerId} settingsForm={settingsForm} setSettingsForm={setSettingsForm} />
    </div>
  );
}
