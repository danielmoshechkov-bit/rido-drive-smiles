import { useState, useEffect, useCallback } from 'react';
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

const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

const DEFAULT_HOURS = DAYS.map((_, i) => ({
  open: i < 5,
  from: '08:00',
  to: '17:00',
}));

interface WorkStation {
  name: string;
  active: boolean;
}

export const WorkshopSettingsPage = () => {
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

      const { data, error } = await (supabase.from('workshop_settings') as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setSettingsId(data.id);
        setFirmName(data.firm_name || '');
        setShortName(data.short_name || '');
        setNip(data.nip || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setPostalCode(data.postal_code || '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setWebsite(data.website || '');
        setBankAccount(data.bank_account || '');
        setLogoUrl(data.logo_url || '');
        setHourlyRate(data.hourly_rate || 150);
        setShowPricesAs(data.show_prices_as || 'brutto');
        setPaymentDays(data.payment_days || 0);
        setPaymentMethod(data.payment_method || 'cash');
        setDiscountsEnabled(data.discounts_enabled ?? true);
        setWorkingHours(data.working_hours || DEFAULT_HOURS);
        setWorkStations(data.work_stations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNipSearch = async () => {
    const cleanNip = nip.replace(/[\s-]/g, '');
    if (!cleanNip || cleanNip.length !== 10) {
      toast.error('Wpisz poprawny NIP (10 cyfr)');
      return;
    }
    setNipSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: cleanNip },
      });
      if (error) throw error;
      if (data?.name) {
        setFirmName(data.name);
        if (!shortName) setShortName(data.name.split(' ').slice(0, 2).join(' '));
        if (data.street) setAddress(data.street);
        if (data.city) setCity(data.city);
        if (data.postalCode || data.zipCode) setPostalCode(data.postalCode || data.zipCode);
        toast.success('Dane firmy pobrane z rejestru');
      } else {
        toast.info('Nie znaleziono firmy o podanym NIP');
      }
    } catch (e: any) {
      toast.error('Błąd wyszukiwania: ' + (e.message || 'nieznany'));
    } finally {
      setNipSearching(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak autoryzacji');

      if (nip && !/^\d{10}$/.test(nip.replace(/[\s-]/g, ''))) {
        toast.error('NIP musi zawierać 10 cyfr');
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
      toast.success('Ustawienia warsztatu zapisane');
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
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
        toast.error('Plik max 2MB');
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
          <TabsTrigger value="basic"><Settings className="h-4 w-4 mr-2" />Podstawowe</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-2" />Godziny pracy</TabsTrigger>
          <TabsTrigger value="stations"><Wrench className="h-4 w-4 mr-2" />Stanowiska</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader><CardTitle>Dane warsztatu</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nazwa firmy</Label>
                  <Input value={firmName} onChange={e => setFirmName(e.target.value)} placeholder="Pełna nazwa firmy" />
                </div>
                <div className="space-y-2">
                  <Label>NIP</Label>
                  <div className="flex gap-2">
                    <Input value={nip} onChange={e => setNip(e.target.value)} placeholder="1234567890" maxLength={13} className="flex-1" />
                    <Button variant="outline" size="icon" onClick={handleNipSearch} disabled={nipSearching} title="Wyszukaj dane firmy po NIP">
                      {nipSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nazwa skrócona (widoczna w SMS, dokumentach)</Label>
                  <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="Np. AutoSerwis" />
                </div>
                <div className="space-y-2">
                  <Label>Adres</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="ul. Przykładowa 1" />
                </div>
                <div className="space-y-2">
                  <Label>Kod pocztowy i miasto</Label>
                  <div className="flex gap-2">
                    <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="00-000" maxLength={6} className="w-28" />
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Warszawa" className="flex-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 123 456 789" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="warsztat@firma.pl" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Strona WWW</Label>
                  <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Nr konta bankowego</Label>
                  <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="PL 00 0000 0000 0000 0000 0000 0000" />
                </div>
              </div>

              {/* Logo with drag & drop */}
              <div className="space-y-2">
                <Label>Logo firmy</Label>
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
                      else if (file) toast.error('Plik max 2MB');
                    };
                    input.click();
                  }}
                >
                  {(logoFile || logoUrl) ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={logoFile ? URL.createObjectURL(logoFile) : logoUrl}
                        alt="Logo"
                        className="h-16 w-16 object-contain rounded border"
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium">{logoFile ? logoFile.name : 'Aktualne logo'}</p>
                        <p className="text-xs text-muted-foreground">Kliknij lub przeciągnij aby zmienić</p>
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
                      <p className="text-sm text-muted-foreground">Przeciągnij logo lub kliknij aby wybrać plik</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG do 2 MB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stawka roboczogodziny netto (PLN)</Label>
                  <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Domyślnie pokazuj kwoty</Label>
                  <Select value={showPricesAs} onValueChange={setShowPricesAs}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="netto">Netto</SelectItem>
                      <SelectItem value="brutto">Brutto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Domyślny termin płatności</Label>
                  <Select value={String(paymentDays)} onValueChange={v => setPaymentDays(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Natychmiast</SelectItem>
                      <SelectItem value="7">7 dni</SelectItem>
                      <SelectItem value="14">14 dni</SelectItem>
                      <SelectItem value="30">30 dni</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Domyślna forma płatności</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Gotówka</SelectItem>
                      <SelectItem value="transfer">Przelew</SelectItem>
                      <SelectItem value="card">Karta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label>Włącz obsługę rabatów</Label>
                  <p className="text-sm text-muted-foreground">Pozwól na stosowanie rabatów w zleceniach</p>
                </div>
                <Switch checked={discountsEnabled} onCheckedChange={setDiscountsEnabled} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card>
            <CardHeader><CardTitle>Godziny pracy</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {DAYS.map((day, i) => (
                <div key={day} className="flex items-center gap-4 p-3 rounded-lg border">
                  <Switch checked={workingHours[i]?.open ?? false} onCheckedChange={v => {
                    const h = [...workingHours];
                    h[i] = { ...h[i], open: v };
                    setWorkingHours(h);
                  }} />
                  <span className="w-28 font-medium text-sm">{day}</span>
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
                    <span className="text-sm text-muted-foreground">Zamknięte</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stations">
          <Card>
            <CardHeader><CardTitle>Stanowiska warsztatowe</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newStation} onChange={e => setNewStation(e.target.value)} placeholder="Np. Podnośnik 1, Kanał, Myjnia"
                  onKeyDown={e => e.key === 'Enter' && addStation()} />
                <Button onClick={addStation} size="sm"><Plus className="h-4 w-4 mr-1" />Dodaj</Button>
              </div>
              {workStations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Brak stanowisk. Dodaj pierwsze stanowisko powyżej.</p>
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
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zapisywanie...</> : <><Save className="h-4 w-4 mr-2" />Zapisz ustawienia</>}
      </Button>
    </div>
  );
};
