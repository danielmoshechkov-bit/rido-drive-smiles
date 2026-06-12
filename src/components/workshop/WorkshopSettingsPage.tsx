import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Clock, Wrench, Plus, Trash2, Save, Loader2, Upload, Search } from 'lucide-react';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DEFAULT_HOURS = DAY_KEYS.map((_, i) => ({
  open: i < 5,
  from: '08:00',
  to: '17:00',
}));

interface WorkStation {
  name: string;
  active: boolean;
}

export const WorkshopSettingsPage = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const [firmName, setFirmName] = useState('');
  const [shortName, setShortName] = useState('');
  const [nip, setNip] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [hourlyRate, setHourlyRate] = useState(150);
  const [showPricesAs, setShowPricesAs] = useState('brutto');
  const [paymentDays, setPaymentDays] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountsEnabled, setDiscountsEnabled] = useState(true);
  const [workingHours, setWorkingHours] = useState(DEFAULT_HOURS);
  const [workStations, setWorkStations] = useState<WorkStation[]>([]);
  const [newStation, setNewStation] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [nipSearching, setNipSearching] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await (supabase.from('workshop_settings') as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Fallback: pobierz z service_providers / company_settings dla pełnej spójności
      const { data: sp } = await (supabase as any)
        .from('service_providers')
        .select('company_name,company_nip,company_address,company_city,company_postal_code,company_phone,owner_email,company_website,logo_url,short_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: cs } = await (supabase as any)
        .from('company_settings')
        .select('company_name,nip,address,city,postal_code,phone,email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) setSettingsId(data.id);
      setFirmName(data?.firm_name || sp?.company_name || cs?.company_name || '');
      setShortName(data?.short_name || sp?.short_name || '');
      setNip(data?.nip || sp?.company_nip || cs?.nip || '');
      setAddress(data?.address || sp?.company_address || cs?.address || '');
      setCity(data?.city || sp?.company_city || cs?.city || '');
      setPostalCode(data?.postal_code || sp?.company_postal_code || cs?.postal_code || '');
      setPhone(data?.phone || sp?.company_phone || cs?.phone || '');
      setEmail(data?.email || sp?.owner_email || cs?.email || '');
      setWebsite(data?.website || sp?.company_website || '');
      setLogoUrl(data?.logo_url || sp?.logo_url || '');
      setBankAccount(data?.bank_account || '');
      setHourlyRate(data?.hourly_rate || 150);
      setShowPricesAs(data?.show_prices_as || 'brutto');
      setPaymentDays(data?.payment_days || 0);
      setPaymentMethod(data?.payment_method || 'cash');
      setDiscountsEnabled(data?.discounts_enabled ?? true);
      setWorkingHours(data?.working_hours || DEFAULT_HOURS);
      setWorkStations(data?.work_stations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNipSearch = async () => {
    const cleanNip = nip.replace(/[\s-]/g, '');
    if (!cleanNip || cleanNip.length !== 10) {
      toast.error(t('workshop.settings.company.invalidNip'));
      return;
    }
    setNipSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: cleanNip },
      });
      if (error) throw error;
      // registry-gus zwraca { success, data: {...} }
      const company = data?.data || data;
      if (company?.name) {
        setFirmName(company.name);
        if (!shortName) setShortName(company.name.split(' ').slice(0, 2).join(' '));
        if (company.address || company.street) setAddress(company.address || company.street);
        if (company.city) setCity(company.city);
        if (company.postalCode || company.zipCode) setPostalCode(company.postalCode || company.zipCode);
        toast.success(t('workshop.settings.company.companyDataFetched'));
      } else {
        toast.info(data?.error || t('workshop.settings.company.companyNotFound'));
      }
    } catch (e: any) {
      toast.error(t('workshop.settings.company.searchError', { error: e.message || t('workshop.settings.company.unknownError') }));
    } finally {
      setNipSearching(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('workshop.settings.company.noAuth'));

      if (nip && !/^\d{10}$/.test(nip.replace(/[\s-]/g, ''))) {
        toast.error(t('workshop.settings.company.nipMustBe10Digits'));
        setSaving(false);
        return;
      }

      let uploadedLogoUrl = logoUrl;
      if (logoFile) {
        const path = `workshop-logos/${user.id}/${Date.now()}-${logoFile.name}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        uploadedLogoUrl = urlData.publicUrl;
      }

      const payload = {
        user_id: user.id,
        firm_name: firmName,
        short_name: shortName,
        nip: nip.replace(/[\s-]/g, ''),
        address,
        city,
        postal_code: postalCode,
        phone,
        email,
        website,
        bank_account: bankAccount,
        logo_url: uploadedLogoUrl,
        hourly_rate: hourlyRate,
        show_prices_as: showPricesAs,
        payment_days: paymentDays,
        payment_method: paymentMethod,
        discounts_enabled: discountsEnabled,
        working_hours: workingHours,
        work_stations: workStations,
        updated_at: new Date().toISOString(),
      };

      if (settingsId) {
        const { error } = await (supabase.from('workshop_settings') as any)
          .update(payload).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from('workshop_settings') as any)
          .insert(payload).select('id').single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      setLogoUrl(uploadedLogoUrl);
      setLogoFile(null);

      // Sync to service_providers
      try {
        const { data: sp } = await supabase
          .from('service_providers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (sp) {
          await supabase.from('service_providers').update({
            company_name: firmName,
            company_nip: nip.replace(/[\s-]/g, ''),
            company_address: address,
            company_city: city,
            company_postal_code: postalCode,
            company_phone: phone,
            owner_email: email,
            company_website: website,
            logo_url: uploadedLogoUrl || null,
          }).eq('id', sp.id);
        }
      } catch (_) { /* silent sync */ }

      toast.success(t('workshop.settings.company.settingsSaved'));
    } catch (err: any) {
      toast.error(err.message || t('common.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const addStation = () => {
    if (!newStation.trim()) return;
    setWorkStations([...workStations, { name: newStation.trim(), active: true }]);
    setNewStation('');
  };

  const removeStation = (i: number) => {
    setWorkStations(workStations.filter((_, idx) => idx !== i));
  };

  const toggleStation = (i: number) => {
    setWorkStations(workStations.map((s, idx) => idx === i ? { ...s, active: !s.active } : s));
  };

  const handleLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size <= 2 * 1024 * 1024) {
        setLogoFile(file);
      } else {
        toast.error(t('workshop.settings.company.fileMax2mb'));
      }
    }
  }, []);

  const handleLogoDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleLogoDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic"><Settings className="h-4 w-4 mr-2" />{t('workshop.settings.company.tabBasic')}</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-2" />{t('workshop.settings.company.tabHours')}</TabsTrigger>
          <TabsTrigger value="stations"><Wrench className="h-4 w-4 mr-2" />{t('workshop.settings.company.tabStations')}</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader><CardTitle>{t('workshop.settings.company.dataTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.companyName')}</Label>
                  <Input value={firmName} onChange={e => setFirmName(e.target.value)} placeholder={t('workshop.settings.company.fullCompanyNamePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label>NIP</Label>
                  <div className="flex gap-2">
                    <Input value={nip} onChange={e => setNip(e.target.value)} placeholder="1234567890" maxLength={13} className="flex-1" />
                    <Button variant="outline" size="icon" onClick={handleNipSearch} disabled={nipSearching} title={t('workshop.settings.company.nipSearchTooltip')}>
                      {nipSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.shortName')}</Label>
                  <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder={t('workshop.settings.company.shortNamePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.address')}</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="ul. Przykładowa 1" />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.postalCodeCity')}</Label>
                  <div className="flex gap-2">
                    <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="00-000" maxLength={6} className="w-28" />
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Warszawa" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.phone')}</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 123 456 789" />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.email')}</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="warsztat@firma.pl" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.website')}</Label>
                  <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t('workshop.settings.company.bankAccount')}</Label>
                  <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="PL 00 0000 0000 0000 0000 0000 0000" />
                </div>
              </div>

              {/* Logo with drag & drop */}
              <div className="space-y-2">
                <Label>{t('workshop.settings.company.companyLogo')}</Label>
                <div
                  className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragOver ? 'border-primary bg-primary/10' : logoFile || logoUrl ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                  onDragOver={handleLogoDragOver}
                  onDragLeave={handleLogoDragLeave}
                  onDrop={handleLogoDrop}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg';
                    input.onchange = (ev: any) => {
                      const file = ev.target.files?.[0];
                      if (file && file.size <= 2 * 1024 * 1024) setLogoFile(file);
                      else if (file) toast.error(t('workshop.settings.company.fileMax2mb'));
                    };
                    input.click();
                  }}
                >
                  {(logoFile || logoUrl) ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={logoFile ? URL.createObjectURL(logoFile) : logoUrl}
                        alt={t('workshop.settings.company.logoAlt')}
                        className="h-16 w-16 object-contain rounded border"
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium">{logoFile ? logoFile.name : t('workshop.settings.company.currentLogo')}</p>
                        <p className="text-xs text-muted-foreground">{t('workshop.settings.company.clickOrDragToChange')}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setLogoFile(null); setLogoUrl(''); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="py-2">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('workshop.settings.company.logoDropzone')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('workshop.settings.company.logoFormats')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.hourlyRateNet')}</Label>
                  <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.defaultShowAmounts')}</Label>
                  <Select value={showPricesAs} onValueChange={setShowPricesAs}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="netto">{t('workshop.settings.company.net')}</SelectItem>
                      <SelectItem value="brutto">{t('workshop.settings.company.gross')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.defaultPaymentTerm')}</Label>
                  <Select value={String(paymentDays)} onValueChange={v => setPaymentDays(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('workshop.settings.company.immediately')}</SelectItem>
                      <SelectItem value="7">{t('workshop.settings.company.days7')}</SelectItem>
                      <SelectItem value="14">{t('workshop.settings.company.days14')}</SelectItem>
                      <SelectItem value="30">{t('workshop.settings.company.days30')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('workshop.settings.company.defaultPaymentMethod')}</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('workshop.settings.company.cash')}</SelectItem>
                      <SelectItem value="transfer">{t('workshop.settings.company.transfer')}</SelectItem>
                      <SelectItem value="card">{t('workshop.settings.company.card')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label>{t('workshop.settings.company.enableDiscounts')}</Label>
                  <p className="text-sm text-muted-foreground">{t('workshop.settings.company.enableDiscountsDesc')}</p>
                </div>
                <Switch checked={discountsEnabled} onCheckedChange={setDiscountsEnabled} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card>
            <CardHeader><CardTitle>{t('workshop.settings.company.workingHours')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {DAY_KEYS.map((dayKey, i) => (
                <div key={dayKey} className="flex items-center gap-4 p-3 rounded-lg border">
                  <Switch checked={workingHours[i]?.open ?? false} onCheckedChange={v => {
                    const h = [...workingHours];
                    h[i] = { ...h[i], open: v };
                    setWorkingHours(h);
                  }} />
                  <span className="w-28 font-medium text-sm">{t(`workshop.settings.company.day.${dayKey}`)}</span>
                  {workingHours[i]?.open ? (
                    <div className="flex items-center gap-2">
                      <Input type="time" className="w-32" value={workingHours[i]?.from || '08:00'}
                        onChange={e => {
                          const h = [...workingHours];
                          h[i] = { ...h[i], from: e.target.value };
                          setWorkingHours(h);
                        }} />
                      <span className="text-muted-foreground">—</span>
                      <Input type="time" className="w-32" value={workingHours[i]?.to || '17:00'}
                        onChange={e => {
                          const h = [...workingHours];
                          h[i] = { ...h[i], to: e.target.value };
                          setWorkingHours(h);
                        }} />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('workshop.settings.company.closed')}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stations">
          <Card>
            <CardHeader><CardTitle>{t('workshop.settings.company.workstationsTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newStation} onChange={e => setNewStation(e.target.value)} placeholder={t('workshop.settings.company.workstationPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && addStation()} />
                <Button onClick={addStation} size="sm"><Plus className="h-4 w-4 mr-1" />{t('workshop.settings.company.add')}</Button>
              </div>
              {workStations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('workshop.settings.company.noWorkstations')}</p>
              )}
              {workStations.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Switch checked={s.active} onCheckedChange={() => toggleStation(i)} />
                    <span className={s.active ? 'font-medium' : 'text-muted-foreground line-through'}>{s.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeStation(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.saving')}</> : <><Save className="h-4 w-4 mr-2" />{t('workshop.settings.company.saveSettings')}</>}
      </Button>
    </div>
  );
};
