import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Building, User, Loader2, Save, Search } from 'lucide-react';
import { shortenCompanyName } from '@/utils/companyName';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 5);
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function capitalizeFirst(val: string) {
  if (!val) return val;
  return val.charAt(0).toUpperCase() + val.slice(1);
}

export function WorkshopEditClientDialog({ open, onOpenChange, client }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  // BUG 6: allow switching the client type while editing (e.g. a walk-in private
  // person who later wants a company invoice). Same model as the "Add client" form —
  // for a company the person columns (first/last name, phone, email) hold the contact
  // person, so converting a person → company keeps their data as the contact.
  const [clientType, setClientType] = useState<'individual' | 'company'>(client?.client_type === 'company' ? 'company' : 'individual');
  const [nipLoading, setNipLoading] = useState(false);
  const [shortNameSuggestion, setShortNameSuggestion] = useState<string | null>(null);

  // Parse street back into parts
  const parseStreet = (street: string | null) => {
    if (!street) return { street: '', house_number: '', apartment_number: '' };
    const mMatch = street.match(/^(.*?)\s+(\S+)\s+m\.\s+(\S+)$/);
    if (mMatch) return { street: mMatch[1], house_number: mMatch[2], apartment_number: mMatch[3] };
    const parts = street.split(' ');
    if (parts.length >= 2) return { street: parts.slice(0, -1).join(' '), house_number: parts[parts.length - 1], apartment_number: '' };
    return { street, house_number: '', apartment_number: '' };
  };

  const streetParts = parseStreet(client?.street);

  const [form, setForm] = useState({
    company_name: client?.company_name || '',
    nip: client?.nip || '',
    first_name: client?.first_name || '',
    last_name: client?.last_name || '',
    phone: client?.phone || '',
    email: client?.email || '',
    postal_code: client?.postal_code || '',
    city: client?.city || '',
    street: streetParts.street,
    house_number: streetParts.house_number,
    apartment_number: streetParts.apartment_number,
    country: client?.country || 'Polska',
    description: client?.description || '',
    marketing_consent: client?.marketing_consent ?? true,
  });

  useEffect(() => {
    if (client) {
      setClientType(client.client_type === 'company' ? 'company' : 'individual');
      const sp = parseStreet(client.street);
      setForm({
        company_name: client.company_name || '',
        nip: client.nip || '',
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        phone: client.phone || '',
        email: client.email || '',
        postal_code: client.postal_code || '',
        city: client.city || '',
        street: sp.street,
        house_number: sp.house_number,
        apartment_number: sp.apartment_number,
        country: client.country || 'Polska',
        description: client.description || '',
        marketing_consent: client.marketing_consent ?? true,
      });
    }
  }, [client]);

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));
  const isCompany = clientType === 'company';

  // Same NIP → company-data lookup as the "Add client" form (lookup-nip edge function).
  const handleNipLookup = async () => {
    const cleanNip = form.nip.replace(/[\s-]/g, '');
    if (cleanNip.length < 10) {
      toast.error(t('workshop.clients.invalidNip'));
      return;
    }
    setNipLoading(true);
    try {
      const { data, error: fnErr } = await (supabase as any).functions.invoke('lookup-nip', {
        body: { nip: cleanNip },
      });
      if (fnErr) throw fnErr;
      if (!data?.valid) {
        toast.error(data?.error || t('workshop.clients.companyNotFound'));
        return;
      }
      const c = data.data;
      setForm(prev => ({
        ...prev,
        company_name: c.name || prev.company_name,
        nip: c.nip || prev.nip,
        street: c.street || prev.street,
        house_number: c.buildingNumber || prev.house_number,
        apartment_number: c.apartmentNumber || prev.apartment_number,
        city: c.city || prev.city,
        postal_code: c.postalCode || prev.postal_code,
      }));
      const shortened = shortenCompanyName(c.name || '');
      setShortNameSuggestion(shortened && shortened !== (c.name || '') ? shortened : null);
      toast.success(t('workshop.clients.companyDataFetched'));
    } catch {
      toast.error(t('workshop.clients.companyRegistryError'));
    } finally {
      setNipLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fullStreet = [form.street, form.house_number, form.apartment_number ? `m. ${form.apartment_number}` : ''].filter(Boolean).join(' ');
      const { error } = await (supabase as any)
        .from('workshop_clients')
        .update({
          client_type: clientType,
          company_name: isCompany ? form.company_name : null,
          nip: form.nip || null,
          first_name: capitalizeFirst(form.first_name) || null,
          last_name: capitalizeFirst(form.last_name) || null,
          phone: form.phone || null,
          email: form.email || null,
          postal_code: form.postal_code || null,
          city: form.city || null,
          street: fullStreet || null,
          country: form.country || 'Polska',
          description: form.description || null,
          marketing_consent: form.marketing_consent,
        })
        .eq('id', client.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['workshop-clients'] });
      toast.success(t('workshop.clients.clientUpdated'));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCompany ? <Building className="h-5 w-5" /> : <User className="h-5 w-5" />}
            {t('workshop.clients.editClient')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type toggle — switch between private person and company while editing */}
          <div className="flex gap-2 justify-center">
            <Button variant={clientType === 'individual' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('individual')} className="gap-2">
              <User className="h-4 w-4" /> {t('workshop.clients.individual')}
            </Button>
            <Button variant={clientType === 'company' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('company')} className="gap-2">
              <Building className="h-4 w-4" /> {t('workshop.clients.company')}
            </Button>
          </div>

          {isCompany ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.companyNameRequired')}</Label>
                  <Input value={form.company_name} onChange={e => { set('company_name', e.target.value); setShortNameSuggestion(null); }} placeholder={t('workshop.clients.companyName')} />
                  {shortNameSuggestion && form.company_name !== shortNameSuggestion && (
                    <button
                      type="button"
                      onClick={() => { set('company_name', shortNameSuggestion); setShortNameSuggestion(null); }}
                      className="text-xs text-primary hover:underline text-left"
                      title="Wstaw skróconą nazwę"
                    >
                      Skrót: <span className="font-medium">{shortNameSuggestion}</span> — kliknij, aby użyć
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.nipLabel')}</Label>
                  <div className="relative">
                    <Input
                      value={form.nip}
                      onChange={e => set('nip', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNipLookup(); } }}
                      placeholder={t('workshop.clients.companyNipPlaceholder')}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleNipLookup}
                      disabled={nipLoading}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                      title={t('workshop.clients.fetchCompanyData')}
                    >
                      {nipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">{t('workshop.clients.contactPerson')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.firstName')}</Label>
                    <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.lastName')}</Label>
                    <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('workshop.clients.firstNameRequired')}</Label>
                <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('workshop.clients.lastName')}</Label>
                <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.phone')}</Label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.email')}</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.street')}</Label>
              <Input value={form.street} onChange={e => set('street', e.target.value)} />
            </div>
            <div className="space-y-1.5 w-24">
              <Label>{t('workshop.clients.houseNumber')}</Label>
              <Input value={form.house_number} onChange={e => set('house_number', e.target.value)} />
            </div>
            <div className="space-y-1.5 w-24">
              <Label>{t('workshop.clients.apartmentNumber')}</Label>
              <Input value={form.apartment_number} onChange={e => set('apartment_number', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.postalCode')}</Label>
              <Input value={form.postal_code} onChange={e => set('postal_code', formatPostalCode(e.target.value))} placeholder="00-000" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.city')}</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('workshop.clients.country')}</Label>
              <Input value={form.country} onChange={e => set('country', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('workshop.clients.notes')}</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.marketing_consent} onCheckedChange={v => set('marketing_consent', v)} />
            <Label className="text-sm">{t('workshop.clients.marketingConsentLabel')}</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> {t('workshop.clients.saveChanges')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
