import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreateWorkshopClient } from '@/hooks/useWorkshop';
import { useGusLookup } from '@/hooks/useGusLookup';
import { ShortenLegalFormCheckbox } from '@/components/shared/ShortenLegalFormCheckbox';
import { shortenCompanyName } from '@/utils/companyName';
import { toast } from 'sonner';
import { Users, Building, User, Loader2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  onCreated?: (client: any) => void;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 5);
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

export function WorkshopAddClientDialog({ open, onOpenChange, providerId, onCreated }: Props) {
  const { t } = useTranslation();
  const create = useCreateWorkshopClient();
  const { lookup: lookupNip, loading: nipLoading, shorten: gusShorten, setShorten: setGusShorten } = useGusLookup({
    onCompany: (c) => {
      setForm(prev => ({
        ...prev,
        company_name: c.nazwa || prev.company_name,
        nip: c.nip || prev.nip,
        street: c.ulica || prev.street,
        house_number: c.nr_domu || prev.house_number,
        apartment_number: c.nr_lokalu || prev.apartment_number,
        city: c.miasto || prev.city,
        postal_code: c.kod_pocztowy || prev.postal_code,
      }));
      const shortened = shortenCompanyName(c.nazwa || '');
      setShortNameSuggestion(shortened && shortened !== (c.nazwa || '') ? shortened : null);
    },
  });
  const [clientType, setClientType] = useState<'individual' | 'company'>('individual');
  const [shortNameSuggestion, setShortNameSuggestion] = useState<string | null>(null);
  const [form, setForm] = useState({
    company_name: '', nip: '', first_name: '', last_name: '',
    phone: '', email: '', postal_code: '', city: '', street: '', house_number: '', apartment_number: '',
    country: 'Polska', description: '', marketing_consent: true,
    contact_first_name: '', contact_last_name: '', contact_phone: '', contact_email: '',
  });

  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const handleNipLookup = async () => {
    const cleanNip = form.nip.replace(/[\s-]/g, '');
    if (cleanNip.length < 10) {
      toast.error(t('workshop.clients.invalidNip'));
      return;
    }
    try {
      const c = await lookupNip(cleanNip);
      if (!c) {
        toast.error(t('workshop.clients.companyNotFound'));
        return;
      }
      toast.success(t('workshop.clients.companyDataFetched'));
    } catch {
      toast.error(t('workshop.clients.companyRegistryError'));
    }
  };

  const handlePostalCode = (val: string) => {
    set('postal_code', formatPostalCode(val));
  };

  const capitalizeFirst = (val: string) => {
    if (!val) return val;
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const handleSubmit = async () => {
    const displayName = clientType === 'company' ? form.company_name : `${[form.first_name, form.last_name].filter(Boolean).join(' ')}`;
    if (!displayName.trim()) return;

    const fullStreet = [form.street, form.house_number, form.apartment_number ? `m. ${form.apartment_number}` : ''].filter(Boolean).join(' ');

    const client = await create.mutateAsync({
      provider_id: providerId,
      client_type: clientType,
      company_name: clientType === 'company' ? form.company_name : null,
      nip: form.nip || null,
      first_name: clientType === 'company' ? capitalizeFirst(form.contact_first_name) || null : capitalizeFirst(form.first_name) || null,
      last_name: clientType === 'company' ? capitalizeFirst(form.contact_last_name) || null : capitalizeFirst(form.last_name) || null,
      phone: clientType === 'company' ? form.contact_phone || form.phone || null : form.phone || null,
      email: clientType === 'company' ? form.contact_email || form.email || null : form.email || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      street: fullStreet || null,
      country: form.country || 'Polska',
      description: form.description || null,
      marketing_consent: form.marketing_consent,
    });
    onCreated?.(client);
    setForm({ company_name: '', nip: '', first_name: '', last_name: '', phone: '', email: '', postal_code: '', city: '', street: '', house_number: '', apartment_number: '', country: 'Polska', description: '', marketing_consent: true, contact_first_name: '', contact_last_name: '', contact_phone: '', contact_email: '' });
    onOpenChange(false);
  };

  const addressFields = (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3">
        <div className="space-y-1.5">
          <Label>{t('workshop.clients.street')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.street} onChange={e => set('street', e.target.value)} placeholder={t('workshop.clients.street')} />
        </div>
        <div className="space-y-1.5 w-24">
          <Label>{t('workshop.clients.houseNumber')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.house_number} onChange={e => set('house_number', e.target.value)} placeholder={t('workshop.clients.houseNumberShort')} />
        </div>
        <div className="space-y-1.5 w-24">
          <Label>{t('workshop.clients.apartmentNumber')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.apartment_number} onChange={e => set('apartment_number', e.target.value)} placeholder={t('workshop.clients.apartmentNumberShort')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>{t('workshop.clients.postalCode')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.postal_code} onChange={e => handlePostalCode(e.target.value)} placeholder="00-000" inputMode="numeric" maxLength={6} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('workshop.clients.city')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.city} onChange={e => set('city', e.target.value)} placeholder={t('workshop.clients.city')} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('workshop.clients.country')}</Label>
          <Input onFocus={e => e.currentTarget.select()} value={form.country} onChange={e => set('country', e.target.value)} />
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {t('workshop.clients.addNewClient')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2 justify-center">
            <Button variant={clientType === 'individual' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('individual')} className="gap-2">
              <User className="h-4 w-4" /> {t('workshop.clients.individual')}
            </Button>
            <Button variant={clientType === 'company' ? 'default' : 'outline'} size="sm" onClick={() => setClientType('company')} className="gap-2">
              <Building className="h-4 w-4" /> {t('workshop.clients.company')}
            </Button>
          </div>

          {clientType === 'company' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.companyNameRequired')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.company_name} onChange={e => { set('company_name', e.target.value); setShortNameSuggestion(null); }} placeholder={t('workshop.clients.companyName')} />
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
                      onFocus={e => e.currentTarget.select()}
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
                  <ShortenLegalFormCheckbox checked={gusShorten} onCheckedChange={setGusShorten} />
                </div>
              </div>
              {addressFields}
              {/* Contact person */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">{t('workshop.clients.contactPerson')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.firstName')}</Label>
                    <Input onFocus={e => e.currentTarget.select()} value={form.contact_first_name} onChange={e => set('contact_first_name', e.target.value)} placeholder={t('workshop.clients.firstName')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.lastName')}</Label>
                    <Input onFocus={e => e.currentTarget.select()} value={form.contact_last_name} onChange={e => set('contact_last_name', e.target.value)} placeholder={t('workshop.clients.lastName')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.phone')}</Label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                      <Input onFocus={e => e.currentTarget.select()} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder={t('workshop.clients.phone')} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('workshop.clients.email')}</Label>
                    <Input onFocus={e => e.currentTarget.select()} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder={t('workshop.clients.email')} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.firstNameRequired')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder={t('workshop.clients.firstName')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.lastName')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder={t('workshop.clients.lastName')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.phone')}</Label>
                  <div className="flex gap-2">
                    <span className="flex items-center px-3 border rounded-md bg-muted text-sm">+48</span>
                    <Input onFocus={e => e.currentTarget.select()} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder={t('workshop.clients.phone')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workshop.clients.email')}</Label>
                  <Input onFocus={e => e.currentTarget.select()} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder={t('workshop.clients.email')} />
                </div>
              </div>
              {addressFields}
            </>
          )}

          <div className="space-y-1.5">
            <Label>{t('workshop.clients.notes')}</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('workshop.clients.notesPlaceholder')} rows={2} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.marketing_consent} onCheckedChange={v => set('marketing_consent', v)} />
            <Label className="text-sm">{t('workshop.clients.marketingConsentLabel')}</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
