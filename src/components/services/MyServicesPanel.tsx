import { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Pencil, Trash2, MoreVertical, Upload, X, Clock, Phone, Wrench,
  Copy, EyeOff, Eye, Save, Image as ImageIcon, Star, GripVertical,
} from 'lucide-react';
import { AdvertiseServiceButton } from '@/components/marketing/AdvertiseServiceButton';
import {
  DAY_ORDER, DAY_LABELS, DEFAULT_WORKING_HOURS, normalizeWorkingHours, getOpenStatus,
  type WorkingHours, type DayKey,
} from '@/lib/provider-hours';
import { formatMoneyPLN } from '@/utils/formatters';

interface ProviderCategory {
  id: string;
  provider_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  service_category_id?: string | null;
}


interface ServiceItem {
  id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_minutes: number | null;
  category: string | null;
  category_id: string | null;
  is_active: boolean;
  photos: string[] | null;
  sort_order: number | null;
}

type PriceMode = 'fixed' | 'from' | 'range' | 'quote';

const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  fixed: 'Cena stała',
  from: 'Cena od',
  range: 'Zakres od–do',
  quote: 'Wycena indywidualna',
};

function derivePriceMode(s: { price_from: number | null; price_to: number | null }): PriceMode {
  const from = Number(s.price_from) || 0;
  const to = Number(s.price_to) || 0;
  if (from <= 0 && to <= 0) return 'quote';
  if (to > from) return 'range';
  if (to === from && from > 0) return 'fixed';
  return 'from';
}

function renderPrice(s: ServiceItem): string {
  const from = Number(s.price_from) || 0;
  const to = Number(s.price_to) || 0;
  switch (derivePriceMode(s)) {
    case 'quote': return 'Wycena indywidualna';
    case 'range': return `${formatMoneyPLN(from)} – ${formatMoneyPLN(to)}`;
    case 'fixed': return formatMoneyPLN(from);
    default: return `od ${formatMoneyPLN(from)}`;
  }
}

const EMPTY_FORM = {
  name: '',
  short_description: '',
  description: '',
  price_mode: 'from' as PriceMode,
  price_from: '',
  price_to: '',
  duration_minutes: '',
  category_id: '',
  is_active: true,
};

type SubTab = 'services' | 'hours' | 'contact';

export function MyServicesPanel({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('services');
  const [activeCat, setActiveCat] = useState<string>('all');

  // ---------- Kategorie ----------
  const { data: categories = [] } = useQuery({
    queryKey: ['provider-service-categories', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('provider_service_categories')
        .select('*')
        .eq('provider_id', providerId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ProviderCategory[];
    },
  });

  // Katalog kategorii portalu (jedno źródło prawdy — z niego wybiera usługodawca)
  const { data: portalCategories = [] } = useQuery({
    queryKey: ['portal-service-catalog'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('service_categories')
        .select('id, name, slug, description, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as { id: string; name: string; slug: string; description: string | null }[];
    },
  });

  const [catDialog, setCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<ProviderCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [pickedGroup, setPickedGroup] = useState<string>('');
  const [pickedSubs, setPickedSubs] = useState<string[]>([]);

  const catalogGroups = useMemo(() => groupCategories(portalCategories), [portalCategories]);


  const usedCatalogIds = useMemo(
    () => new Set(categories.map(c => c.service_category_id).filter(Boolean) as string[]),
    [categories],
  );

  // Zgłoszenie nowej kategorii do akceptacji przez portal
  const [reqDialog, setReqDialog] = useState(false);
  const [reqForm, setReqForm] = useState({ name: '', description: '', services: '', email: '' });

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!reqForm.name.trim()) throw new Error('Podaj nazwę kategorii');
      if (!reqForm.description.trim()) throw new Error('Opisz krótko czym jest ta kategoria');
      const { data, error } = await supabase.functions.invoke('submit-category-request', {
        body: {
          provider_id: providerId,
          category_name: reqForm.name.trim(),
          category_description: reqForm.description.trim(),
          example_services: reqForm.services.trim(),
          contact_email: reqForm.email.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      setReqDialog(false);
      setReqForm({ name: '', description: '', services: '', email: '' });
      toast.success('Zgłoszenie wysłane — kategoria pojawi się po akceptacji portalu');
    },
    onError: (e: any) => toast.error(e.message || 'Nie udało się wysłać zgłoszenia'),
  });

  const saveCat = useMutation({
    mutationFn: async () => {
      if (editingCat) {
        const name = catName.trim();
        if (!name) throw new Error('Podaj nazwę kategorii');
        const { error } = await (supabase as any)
          .from('provider_service_categories')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const picked = portalCategories.filter(c => pickedSubs.includes(c.id) && !usedCatalogIds.has(c.id));
        if (!picked.length) throw new Error('Wybierz przynajmniej jedną podkategorię');
        const { error } = await (supabase as any)
          .from('provider_service_categories')
          .insert(picked.map((p, i) => ({
            provider_id: providerId,
            name: p.name,
            service_category_id: p.id,
            sort_order: categories.length + i,
          })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-service-categories', providerId] });
      setCatDialog(false); setEditingCat(null); setCatName(''); setPickedGroup(''); setPickedSubs([]);

      toast.success('Zapisano kategorię');
    },
    onError: (e: any) => toast.error(e.message),
  });


  const deleteCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('provider_service_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-service-categories', providerId] });
      queryClient.invalidateQueries({ queryKey: ['provider-services', providerId] });
      setActiveCat('all');
      toast.success('Kategoria usunięta (usługi zostały zachowane)');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---------- Usługi ----------
  const { data: services = [] } = useQuery({
    queryKey: ['provider-services', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('provider_services')
        .select('*')
        .eq('provider_id', providerId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ServiceItem[];
    },
  });

  const visibleServices = useMemo(() => {
    if (activeCat === 'all') return services;
    if (activeCat === 'none') return services.filter(s => !s.category_id);
    return services.filter(s => s.category_id === activeCat);
  }, [services, activeCat]);

  const countFor = (catId: string) =>
    catId === 'all' ? services.length
      : catId === 'none' ? services.filter(s => !s.category_id).length
        : services.filter(s => s.category_id === catId).length;

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openNew = () => {
    setEditing(null);
    setNewPhotos([]);
    setForm({ ...EMPTY_FORM, category_id: activeCat !== 'all' && activeCat !== 'none' ? activeCat : '' });
    setDialog(true);
  };

  const openEdit = (s: ServiceItem) => {
    setEditing(s);
    setNewPhotos([]);
    setForm({
      name: s.name || '',
      short_description: s.short_description || '',
      description: s.description || '',
      price_mode: derivePriceMode(s),
      price_from: s.price_from ? String(s.price_from) : '',
      price_to: s.price_to ? String(s.price_to) : '',
      duration_minutes: s.duration_minutes ? String(s.duration_minutes) : '',
      category_id: s.category_id || '',
      is_active: s.is_active,
    });
    setDialog(true);
  };

  const saveService = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę usługi'); return; }
    setSaving(true);
    try {
      const photoUrls: string[] = [...(editing?.photos || [])];
      for (const file of newPhotos) {
        const ext = file.name.split('.').pop();
        const path = `services/${providerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
        if (upErr) { console.error(upErr); continue; }
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }

      const from = parseFloat(form.price_from) || 0;
      const to = parseFloat(form.price_to) || 0;
      let priceFrom = 0, priceTo = 0;
      if (form.price_mode === 'fixed') { priceFrom = from; priceTo = from; }
      else if (form.price_mode === 'from') { priceFrom = from; priceTo = 0; }
      else if (form.price_mode === 'range') { priceFrom = from; priceTo = Math.max(to, from); }

      const payload: any = {
        name: form.name.trim(),
        short_description: form.short_description,
        description: form.description,
        price_from: priceFrom,
        price_to: priceTo,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        category_id: form.category_id || null,
        is_active: form.is_active,
        photos: photoUrls,
      };

      if (editing) {
        const { error } = await (supabase as any).from('provider_services').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('provider_services')
          .insert({ ...payload, provider_id: providerId, category: 'ogolne', sort_order: services.length });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['provider-services', providerId] });
      setDialog(false);
      setEditing(null);
      setNewPhotos([]);
      toast.success('Zapisano usługę');
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const patchService = async (id: string, patch: any, msg: string) => {
    const { error } = await (supabase as any).from('provider_services').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['provider-services', providerId] });
    toast.success(msg);
  };

  const duplicateService = async (s: ServiceItem) => {
    const { id, ...rest } = s as any;
    const { error } = await (supabase as any)
      .from('provider_services')
      .insert({ ...rest, name: `${s.name} (kopia)`, provider_id: providerId, created_at: undefined, updated_at: undefined });
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['provider-services', providerId] });
    toast.success('Zduplikowano usługę');
  };

  const removeService = async (id: string) => {
    const { error } = await (supabase as any).from('provider_services').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['provider-services', providerId] });
    toast.success('Usunięto usługę');
  };

  const removeExistingPhoto = async (idx: number) => {
    if (!editing?.photos) return;
    const next = editing.photos.filter((_, i) => i !== idx);
    setEditing({ ...editing, photos: next });
    await patchService(editing.id, { photos: next }, 'Zdjęcie usunięte');
  };

  const setMainPhoto = async (idx: number) => {
    if (!editing?.photos || idx === 0) return;
    const next = [editing.photos[idx], ...editing.photos.filter((_, i) => i !== idx)];
    setEditing({ ...editing, photos: next });
    await patchService(editing.id, { photos: next }, 'Ustawiono zdjęcie główne');
  };

  // ---------- Profil: godziny + kontakt ----------
  const { data: provider } = useQuery({
    queryKey: ['provider-profile-contact', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('service_providers')
        .select('id, user_id, company_phone, company_email, company_address, company_city, company_postal_code, company_website, working_hours')
        .eq('id', providerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [hours, setHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);
  const [contact, setContact] = useState({
    company_phone: '', company_email: '', company_address: '',
    company_city: '', company_postal_code: '', company_website: '',
  });

  useEffect(() => {
    if (!provider) return;
    setHours(normalizeWorkingHours(provider.working_hours));
    setContact({
      company_phone: provider.company_phone || '',
      company_email: provider.company_email || '',
      company_address: provider.company_address || '',
      company_city: provider.company_city || '',
      company_postal_code: provider.company_postal_code || '',
      company_website: provider.company_website || '',
    });
  }, [provider]);

  const openStatus = useMemo(() => getOpenStatus(provider?.working_hours), [provider?.working_hours]);

  const saveHours = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('service_providers').update({ working_hours: hours }).eq('id', providerId);
      if (error) throw error;
      // synchronizacja z ustawieniami firmy (warsztat) — jedno źródło, dwa miejsca edycji
      if (provider?.user_id) {
        await (supabase as any)
          .from('workshop_settings').update({ working_hours: hours }).eq('user_id', provider.user_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-profile-contact', providerId] });
      toast.success('Godziny pracy zapisane');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveContact = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('service_providers').update(contact).eq('id', providerId);
      if (error) throw error;
      if (provider?.user_id) {
        await (supabase as any).from('workshop_settings').update({
          phone: contact.company_phone,
          email: contact.company_email,
          address: contact.company_address,
          city: contact.company_city,
          postal_code: contact.company_postal_code,
          website: contact.company_website,
        }).eq('user_id', provider.user_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-profile-contact', providerId] });
      toast.success('Dane kontaktowe zapisane i zsynchronizowane z Ustawieniami firmy');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyDay = (from: DayKey) => {
    setHours(prev => {
      const next = { ...prev };
      for (const d of DAY_ORDER) next[d] = { ...prev[from] };
      return next;
    });
    toast.success('Skopiowano na wszystkie dni');
  };

  // ---------- UI ----------
  const subTabs: { key: SubTab; label: string; icon: any }[] = [
    { key: 'services', label: 'Usługi', icon: Wrench },
    { key: 'hours', label: 'Godziny pracy', icon: Clock },
    { key: 'contact', label: 'Dane kontaktowe', icon: Phone },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-taby */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {subTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors border ${
              subTab === key
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'services' && (
        <>
          {/* Pigułki kategorii */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <CatPill active={activeCat === 'all'} onClick={() => setActiveCat('all')} label="Wszystkie" count={countFor('all')} />
            {categories.map(c => (
              <div key={c.id} className="shrink-0 group relative">
                <CatPill
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                  label={c.name}
                  count={countFor(c.id)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border shadow-sm items-center justify-center hidden group-hover:flex`}
                      aria-label={`Opcje kategorii ${c.name}`}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditingCat(c); setCatName(c.name); setCatDialog(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Zmień nazwę
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteCat.mutate(c.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Usuń kategorię
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {countFor('none') > 0 && (
              <CatPill active={activeCat === 'none'} onClick={() => setActiveCat('none')} label="Bez kategorii" count={countFor('none')} />
            )}
            <button
              onClick={() => { setEditingCat(null); setCatName(''); setPickedCatalogId(''); setCatDialog(true); }}
              className="shrink-0 h-9 w-9 rounded-full border border-dashed border-primary/50 text-primary flex items-center justify-center hover:bg-primary/5"
              aria-label="Dodaj kategorię"
            >
              <Plus className="h-4 w-4" />
            </button>

          </div>

          {/* Lista usług */}
          <Card className="rounded-2xl">
            <CardContent className="p-3 sm:p-4 space-y-2">
              {visibleServices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-foreground">Brak usług w tej kategorii</p>
                  <p className="text-sm">Dodaj pierwszą pozycję cennika — zobaczy ją klient na Twojej karcie.</p>
                </div>
              ) : (
                visibleServices.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:border-primary/40 ${
                      s.is_active ? '' : 'opacity-60'
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 hidden sm:block" />
                    {s.photos && s.photos.length > 0 && (
                      <img src={s.photos[0]} alt={s.name} className="h-14 w-14 rounded-lg object-cover border shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground truncate">{s.name}</span>
                        {!s.is_active && <Badge variant="secondary" className="text-[10px]">Ukryta</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {[s.duration_minutes ? `${s.duration_minutes} min` : null, s.short_description || null]
                          .filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-primary text-sm whitespace-nowrap">{renderPrice(s)}</div>
                    </div>
                    <div className="hidden md:block shrink-0">
                      <AdvertiseServiceButton service={{ id: s.id, name: s.name }} variant="outline" size="sm" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edytuj
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditing(s); setNewPhotos([]); openEdit(s); }}>
                          <ImageIcon className="h-3.5 w-3.5 mr-2" /> Zdjęcia
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateService(s)}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Duplikuj
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => patchService(s.id, { is_active: !s.is_active }, s.is_active ? 'Usługa ukryta' : 'Usługa widoczna')}>
                          {s.is_active ? <EyeOff className="h-3.5 w-3.5 mr-2" /> : <Eye className="h-3.5 w-3.5 mr-2" />}
                          {s.is_active ? 'Ukryj' : 'Pokaż'}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => removeService(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Usuń
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}

              <button
                onClick={openNew}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="h-4 w-4" /> Dodaj usługę
              </button>
            </CardContent>
          </Card>
        </>
      )}

      {subTab === 'hours' && (
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-3">
            {openStatus.label && (
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                openStatus.open ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
              }`}>
                <Clock className="h-3.5 w-3.5" /> {openStatus.label}
              </div>
            )}
            {DAY_ORDER.map(d => (
              <div key={d} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <span className="w-32 font-semibold text-sm">{DAY_LABELS[d]}</span>
                <Switch
                  checked={!hours[d].closed}
                  onCheckedChange={v => setHours(p => ({ ...p, [d]: { ...p[d], closed: !v } }))}
                />
                {hours[d].closed ? (
                  <span className="text-sm text-muted-foreground">Zamknięte</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input type="time" className="w-28" value={hours[d].open}
                      onChange={e => setHours(p => ({ ...p, [d]: { ...p[d], open: e.target.value } }))} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" className="w-28" value={hours[d].close}
                      onChange={e => setHours(p => ({ ...p, [d]: { ...p[d], close: e.target.value } }))} />
                  </div>
                )}
                <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => copyDay(d)}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Kopiuj na wszystkie
                </Button>
              </div>
            ))}
            <Button onClick={() => saveHours.mutate()} disabled={saveHours.isPending} className="gap-2">
              <Save className="h-4 w-4" /> Zapisz godziny
            </Button>
          </CardContent>
        </Card>
      )}

      {subTab === 'contact' && (
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Te dane widzi klient na Twojej karcie. Zmiana tutaj aktualizuje też Ustawienia firmy.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input value={contact.company_phone} onChange={e => setContact(p => ({ ...p, company_phone: e.target.value }))} placeholder="+48 600 000 000" />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={contact.company_email} onChange={e => setContact(p => ({ ...p, company_email: e.target.value }))} placeholder="kontakt@firma.pl" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Adres</Label>
                <Input value={contact.company_address} onChange={e => setContact(p => ({ ...p, company_address: e.target.value }))} placeholder="ul. Przykładowa 1" />
              </div>
              <div className="space-y-2">
                <Label>Kod pocztowy</Label>
                <Input value={contact.company_postal_code} onChange={e => setContact(p => ({ ...p, company_postal_code: e.target.value }))} placeholder="00-000" />
              </div>
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input value={contact.company_city} onChange={e => setContact(p => ({ ...p, company_city: e.target.value }))} placeholder="Warszawa" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Strona WWW</Label>
                <Input value={contact.company_website} onChange={e => setContact(p => ({ ...p, company_website: e.target.value }))} placeholder="https://" />
              </div>
            </div>
            <Button onClick={() => saveContact.mutate()} disabled={saveContact.isPending} className="gap-2">
              <Save className="h-4 w-4" /> Zapisz dane kontaktowe
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog kategorii — wybór z katalogu portalu */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Zmień nazwę kategorii' : 'Dodaj kategorię'}</DialogTitle>
          </DialogHeader>

          {editingCat ? (
            <div className="space-y-2">
              <Label>Nazwa wyświetlana</Label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} autoFocus />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Najpierw wybierz kategorię główną, potem zaznacz podkategorie — w nich Twoja firma pokaże się klientom.
              </p>

              <div className="flex flex-wrap gap-2">
                {catalogGroups.map(({ group }) => (
                  <button
                    key={group.id}
                    onClick={() => { setPickedGroup(group.id); setPickedSubs([]); }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      pickedGroup === group.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:border-primary/40 text-foreground'
                    }`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>

              {pickedGroup && (
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {(catalogGroups.find(g => g.group.id === pickedGroup)?.items || []).map(c => {
                    const used = usedCatalogIds.has(c.id);
                    const active = pickedSubs.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        disabled={used}
                        onClick={() => setPickedSubs(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}
                        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                          used
                            ? 'opacity-45 cursor-not-allowed bg-muted'
                            : active
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/40'
                        }`}
                      >
                        <span className="font-semibold text-sm text-foreground">{c.name}</span>
                        {used && <span className="ml-2 text-[11px] text-muted-foreground">już dodana</span>}
                        {active && !used && <span className="ml-2 text-[11px] font-semibold text-primary">wybrana</span>}
                        {c.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => { setCatDialog(false); setReqDialog(true); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" /> Nie ma mojej kategorii — zgłoś nową
              </button>
            </div>
          )}


          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Anuluj</Button>
            <Button
              onClick={() => saveCat.mutate()}
              disabled={saveCat.isPending || (!editingCat && !pickedCatalogId)}
            >
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog zgłoszenia nowej kategorii */}
      <Dialog open={reqDialog} onOpenChange={setReqDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zgłoś nową kategorię</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Zgłoszenie trafia do zespołu GetRido. Po akceptacji kategoria pojawi się w katalogu portalu.
            </p>
            <div className="space-y-2">
              <Label>Nazwa kategorii</Label>
              <Input
                value={reqForm.name}
                onChange={e => setReqForm(p => ({ ...p, name: e.target.value }))}
                placeholder="np. Wulkanizacja, Klimatyzacja, Auto szyby"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Opis kategorii</Label>
              <Textarea
                rows={3}
                className="resize-none"
                value={reqForm.description}
                onChange={e => setReqForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Czym zajmuje się ta kategoria?"
              />
            </div>
            <div className="space-y-2">
              <Label>Przykładowe usługi <span className="text-xs text-muted-foreground font-normal">(opcjonalnie)</span></Label>
              <Textarea
                rows={2}
                className="resize-none"
                value={reqForm.services}
                onChange={e => setReqForm(p => ({ ...p, services: e.target.value }))}
                placeholder="np. wymiana opon, wyważanie, przechowywanie kół"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail kontaktowy <span className="text-xs text-muted-foreground font-normal">(opcjonalnie)</span></Label>
              <Input
                type="email"
                value={reqForm.email}
                onChange={e => setReqForm(p => ({ ...p, email: e.target.value }))}
                placeholder="kontakt@firma.pl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDialog(false)}>Anuluj</Button>
            <Button onClick={() => submitRequest.mutate()} disabled={submitRequest.isPending}>
              {submitRequest.isPending ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog usługi */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj usługę' : 'Nowa usługa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa usługi</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="np. Wymiana oleju" />
            </div>
            <div className="space-y-2">
              <Label>Kategoria</Label>
              <Select value={form.category_id || 'none'} onValueChange={v => setForm(p => ({ ...p, category_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Bez kategorii" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez kategorii</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Krótki opis</Label>
              <Input value={form.short_description} onChange={e => setForm(p => ({ ...p, short_description: e.target.value }))} placeholder="Jedno zdanie widoczne na liście" />
            </div>
            <div className="space-y-2">
              <Label>Pełny opis</Label>
              <Textarea rows={3} className="resize-none" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Sposób podania ceny</Label>
              <Select value={form.price_mode} onValueChange={(v: PriceMode) => setForm(p => ({ ...p, price_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRICE_MODE_LABELS) as PriceMode[]).map(m => (
                    <SelectItem key={m} value={m}>{PRICE_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.price_mode !== 'quote' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{form.price_mode === 'fixed' ? 'Cena (zł)' : 'Cena od (zł)'}</Label>
                  <Input type="number" value={form.price_from} onChange={e => setForm(p => ({ ...p, price_from: e.target.value }))} placeholder="0" />
                </div>
                {form.price_mode === 'range' && (
                  <div className="space-y-2">
                    <Label>Cena do (zł)</Label>
                    <Input type="number" value={form.price_to} onChange={e => setForm(p => ({ ...p, price_to: e.target.value }))} placeholder="0" />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Czas trwania (min)</Label>
              <Input type="number" min="0" step="15" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: e.target.value }))} placeholder="np. 60" />
            </div>

            <div className="space-y-2">
              <Label>Zdjęcia <span className="text-xs text-muted-foreground font-normal">(opcjonalnie)</span></Label>
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={e => { e.preventDefault(); setDragging(false); }}
                onDrop={e => {
                  e.preventDefault(); setDragging(false);
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                  setNewPhotos(prev => [...prev, ...files].slice(0, 10));
                }}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">Przeciągnij lub kliknij, aby dodać zdjęcia</p>
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
                    setNewPhotos(prev => [...prev, ...files].slice(0, 10));
                  }} />
              </div>
              {editing?.photos && editing.photos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {editing.photos.map((url, i) => (
                    <div key={url + i} className="relative group h-20 w-20">
                      <img src={url} className="h-20 w-20 object-cover rounded-lg border" alt={`Zdjęcie ${i + 1}`} />
                      {i === 0 && <span className="absolute top-0 left-0 bg-primary text-primary-foreground text-[9px] px-1 rounded-tl-lg rounded-br">Główne</span>}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded-lg">
                        {i !== 0 && (
                          <button onClick={() => setMainPhoto(i)} title="Ustaw jako główne" className="bg-white/90 rounded p-0.5">
                            <Star className="h-3 w-3" />
                          </button>
                        )}
                        <button onClick={() => removeExistingPhoto(i)} title="Usuń" className="bg-destructive text-destructive-foreground rounded p-0.5">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {newPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {newPhotos.map((file, idx) => (
                    <div key={idx} className="relative group">
                      <img src={URL.createObjectURL(file)} className="h-16 w-16 object-cover rounded-lg border" alt={file.name} />
                      <button
                        onClick={() => setNewPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <Label>Usługa widoczna dla klientów</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Anuluj</Button>
            <Button onClick={saveService} disabled={!form.name.trim() || saving}>
              <Save className="h-4 w-4 mr-2" /> Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-foreground border-border hover:bg-muted'
      }`}
    >
      {label}
      <span className={`text-[11px] rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>{count}</span>
    </button>
  );
}
