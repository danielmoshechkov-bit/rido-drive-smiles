import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { CheckCircle2, FileSignature, Loader2, Car, User, Wrench, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { useWorkshopTranslations, TranslatableField } from '@/hooks/useWorkshopTranslations';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { TranslationLoader } from '@/components/workshop/TranslationLoader';
import { BASE_LANGS, pretranslateContent, type ContentItem } from '@/lib/contentTranslation';

const statusColors: Record<string, string> = {
  'Nowe zlecenie': 'bg-red-500 text-white',
  'Przyjęcie do serwisu': 'bg-orange-500 text-white',
  'Wycena gotowa': 'bg-yellow-500 text-black',
  'Wycena wysłana': 'bg-orange-400 text-black',
  'Zaakceptowano': 'bg-green-500 text-white',
  'Akceptacja klienta': 'bg-green-500 text-white',
  'W trakcie naprawy': 'bg-blue-500 text-white',
  'Zadania wykonane': 'bg-green-500 text-white',
  'Gotowy do odbioru': 'bg-gray-500 text-white',
  'Zakończone': 'bg-gray-700 text-white',
};

type TabKey = 'reception' | 'estimate' | 'release';

export default function WorkshopClientCard() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const isAdminPreview = searchParams.get('admin') === '1';
  // ETAP B: ?sig=<id podpisu> → zamrożony dowód konkretnego podpisu (z panelu).
  const sigParam = searchParams.get('sig');
  const [order, setOrder] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Co klient widzi (sterowane w ustawieniach warsztatu). Domyślnie wszystko.
  const [displaySettings, setDisplaySettings] = useState({ show_net: true, show_vat: true, show_gross: true });
  const [signingDoc, setSigningDoc] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>((isAdminPreview || searchParams.get('sig')) ? 'estimate' : 'reception');
  const [initialTabSet, setInitialTabSet] = useState(false);

  useEffect(() => { loadOrder(); }, [code]);

  // Watchdog: spinner nie może wisieć w nieskończoność (wolna/zrywająca sieć).
  // Po 12 s bez wyniku pokaż ekran z ponowieniem zamiast wiecznego kręcenia.
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => { setLoadError(true); setLoading(false); }, 12000);
    return () => clearTimeout(id);
  }, [loading]);

  // Admin preview: realtime live refresh of order + items
  useEffect(() => {
    if (!isAdminPreview || !order?.id) return;
    const channel = (supabase as any)
      .channel(`workshop-card-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_order_items', filter: `order_id=eq.${order.id}` }, () => loadOrder())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workshop_orders', filter: `id=eq.${order.id}` }, () => loadOrder())
      .subscribe();
    // Also refresh on tab focus
    const onFocus = () => loadOrder();
    window.addEventListener('focus', onFocus);
    return () => {
      (supabase as any).removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAdminPreview, order?.id]);

  // CORE: tłumaczenie treści zlecenia/wyceny na język KLIENTA (i18n.language).
  // 'auto' — opisy pisze admin (PL), pozycje mógł wpisać mechanik (UA/RU); klient widzi u siebie.
  const tcFields = useMemo<TranslatableField[]>(() => {
    if (!order) return [];
    const out: TranslatableField[] = [];
    const oid = String(order.id);
    if (order.description) out.push({ entity_type: 'order', entity_id: oid, field: 'description', text: order.description });
    if (order.damage_description) out.push({ entity_type: 'order', entity_id: oid, field: 'damage_description', text: order.damage_description });
    for (const it of (order.items || [])) {
      if (it?.id && it?.name) out.push({ entity_type: 'item', entity_id: String(it.id), field: 'name', text: it.name });
    }
    return out;
  }, [order]);
  const { t: tc, loading: tcLoading, targetLang: tcTarget } = useWorkshopTranslations(tcFields, 'auto');
  // Języki bazowe są pre-tłumaczone przy zapisie → cache hit, brak flasha.
  // Tylko dla języków spoza bazowych (DE/VI/KZ…) pokazujemy brandowany loader.
  const showTranslationLoader = tcLoading && tcFields.length > 0 && !BASE_LANGS.includes(tcTarget);

  // ETAP B: hook MUSI być wywołany przed early-returnami (loading / !order),
  // inaczej "Rendered more hooks than during the previous render". Zależy tylko
  // od signatures (state), nie od order — bezpieczny do wyliczenia zawsze.
  const estimateSignatures = useMemo(
    () => (signatures || [])
      .filter((s: any) => s.document_type === 'cost_estimate' && s.snapshot)
      .sort((a: any, b: any) => new Date(a.signed_at || 0).getTime() - new Date(b.signed_at || 0).getTime()),
    [signatures]
  );

  const loadOrder = async (attempt = 0) => {
    // 'null'/'undefined' jako string → stare zlecenie bez client_code (link /klient/null)
    if (!code || code === 'null' || code === 'undefined') {
      setLoadError(false);
      setLoading(false);
      return;
    }
    try {
      // SECFIX1: jedyny dostęp anona = SECURITY DEFINER RPC walidujące PEŁNY
      // client_code jako sekret (koniec z bezpośrednim czytaniem tabel po
      // otwartych politykach anon — te zdjęte migracją SECFIX1). RPC zwraca
      // w jednym jsonb: order + client/vehicle/items/signatures + provider +
      // display_settings. Brak dopasowania kodu → data == null ("nie znaleziono").
      const { data, error } = await (supabase as any)
        .rpc('get_workshop_order_by_client_code', { p_code: code });

      if (error) throw error;

      if (data) {
        setLoadError(false);
        const { provider: prov, display_settings: ds, signatures: sigs, ...orderData } = data as any;
        setOrder(orderData);
        setProvider(prov || null);
        setSignatures(Array.isArray(sigs) ? sigs : []);
        if (ds) setDisplaySettings({
          show_net: ds.show_net ?? true,
          show_vat: ds.show_vat ?? true,
          show_gross: ds.show_gross ?? true,
        });

        // Warmuj globalny cache tłumaczeń dla treści klienta (fire-and-forget) —
        // następne otwarcie (i inne języki bazowe, np. EN) trafią w cache od razu.
        const warm: ContentItem[] = [];
        if (data.description) warm.push({ entity_type: 'order', entity_id: String(data.id), field: 'description', text: data.description, source_lang: 'auto' });
        if (data.damage_description) warm.push({ entity_type: 'order', entity_id: String(data.id), field: 'damage_description', text: data.damage_description, source_lang: 'auto' });
        for (const it of (data.items || [])) if (it?.id && it?.name) warm.push({ entity_type: 'item', entity_id: String(it.id), field: 'name', text: it.name, source_lang: 'auto' });
        if (warm.length) void pretranslateContent(warm);

        // Auto-open kosztorys if reception is signed AND estimate was sent to client
        // In admin preview mode we already default to 'estimate' and skip this auto-switch
        if (!initialTabSet && !isAdminPreview) {
          const receptionIsSigned = (sigs || []).some((s: any) => s.document_type === 'reception_protocol');
          if (receptionIsSigned && data.estimate_sent_to_client) {
            setActiveTab('estimate');
          }
          setInitialTabSet(true);
        }
        setLoading(false);
      } else {
        // Brak rekordu — może to świeży link, gdzie zapis statusu jeszcze nie dotarł
        // (race po wysłaniu SMS) albo nieświeży cache PWA. Spróbuj raz ponownie
        // (nie zdejmujemy loadera, żeby nie mignął ekran "nie znaleziono").
        if (attempt < 1) {
          setTimeout(() => loadOrder(attempt + 1), 1200);
          return;
        }
        setLoadError(false); // realny brak → ekran "nie znaleziono" (order pozostaje null)
        setLoading(false);
      }
    } catch (e) {
      // Błąd sieci/serwera — odróżniamy od "nie znaleziono": pokaż retry, spróbuj raz sam.
      console.warn('[WorkshopClientCard] loadOrder error', e);
      if (attempt < 2) {
        setTimeout(() => loadOrder(attempt + 1), 1200);
        return;
      }
      setLoadError(true);
      setLoading(false);
    }
  };

  const hasSigned = (docType: string) => signatures.some(s => s.document_type === docType);

  const handleSign = async (docType: string) => {
    setSigning(true);
    const nowIso = new Date().toISOString();
    try {
      // SECFIX1: podpis + zmiana statusu atomowo przez SECURITY DEFINER RPC,
      // które waliduje PEŁNY client_code (koniec z anon insertem podpisu i anon
      // updatem zlecenia — te zdjęte migracją). Bez poprawnego kodu → RPC zwraca
      // null (nie da się podpisać cudzego order_id).
      const { data: signRes, error: sigErr } = await (supabase as any).rpc(
        'sign_workshop_document_by_client_code',
        { p_code: code, p_doc_type: docType, p_user_agent: navigator.userAgent }
      );
      if (sigErr) throw sigErr;
      if (!signRes) throw new Error(t('workshop.clientCard.orderNotFound'));

      const updates: any = {};
      if (docType === 'reception_protocol') {
        updates.client_acceptance_confirmed = true;
        updates.status_name = 'Przyjęcie do serwisu';
      }
      if (docType === 'cost_estimate') {
        updates.quote_accepted = true;
        updates.status_name = 'Zaakceptowano';
      }

      // RPC zwraca zaktualizowane podpisy + zlecenie — użyj ich wprost zamiast
      // optimistic zgadywania (i tak natychmiast, bez ponownego pobierania).
      const freshSigs = Array.isArray(signRes?.signatures) ? signRes.signatures : null;
      setSignatures(freshSigs ?? ((prev: any[]) => [...prev, { id: `optim-${docType}`, order_id: order.id, document_type: docType, signed_at: nowIso, signature_method: 'button' }]) as any);
      setOrder((o: any) => ({ ...o, ...(signRes?.order ?? updates) }));
      toast.success(t('workshop.clientCard.documentSigned'));
      setSigningDoc(null);
      setAccepted(false);
      setSigning(false);

      // Tło: powiadom mechanika o akceptacji kosztorysu (flagi zlecenia utrwalił
      // już RPC atomowo — bez osobnego anon updatu). SECFIX3: przekaż client_code
      // — funkcja autoryzuje anonimowego klienta po sekrecie kodu tego zlecenia.
      if (docType === 'cost_estimate') {
        supabase.functions.invoke('workshop-notify-employee', {
          body: { order_id: order.id, event: 'quote_accepted', client_code: code },
        }).catch(() => {});
      }
    } catch (e: any) {
      toast.error(e.message);
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="p-8 text-center space-y-4 max-w-sm">
          <p className="text-lg text-muted-foreground">
            {loadError
              ? t('workshop.clientCard.loadErrorRetry', 'Nie udało się wczytać zlecenia. Sprawdź połączenie i spróbuj ponownie.')
              : t('workshop.clientCard.orderNotFound')}
          </p>
          {loadError && (
            <Button onClick={() => { setLoading(true); setLoadError(false); loadOrder(); }} className="gap-2">
              <Loader2 className="h-4 w-4" /> {t('workshop.clientCard.retry', 'Spróbuj ponownie')}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const clientName = order.client?.client_type === 'company'
    ? order.client?.company_name
    : `${order.client?.first_name || ''} ${order.client?.last_name || ''}`.trim();

  // Podpis uznany TAKŻE gdy warsztat potwierdził go w systemie (admin) — flagi
  // client_acceptance_confirmed / quote_accepted. Liczone TUTAJ (przed blokiem
  // ETAP B), bo afterChangeSnap poniżej używa estimateSigned — inaczej TDZ.
  const receptionSigned = hasSigned('reception_protocol') || !!order.client_acceptance_confirmed;
  const estimateSigned = hasSigned('cost_estimate') || !!order.quote_accepted;

  // ── ETAP B: źródło renderu kosztorysu — live / snapshot / zamrożony dowód ──
  // (estimateSignatures wyliczane hookiem NA GÓRZE komponentu — przed early-return,
  //  żeby nie łamać Rules of Hooks. Tu tylko czyste obliczenia.)
  const estimateNumber = (sigId: string) => {
    const idx = estimateSignatures.findIndex((s: any) => String(s.id) === String(sigId));
    return idx >= 0 ? idx + 1 : null;
  };
  // Tryb "zamrożony dowód": ?sig=<id> — render TEGO podpisu ze snapshotu (panel).
  const frozenSig = sigParam ? (signatures || []).find((s: any) => String(s.id) === sigParam && s.snapshot) : null;
  // Tryb "podpisany po zmianie": bez ?sig, gdy podpisano i warsztat zmienił wycenę
  // → pokaż najnowszy podpisany snapshot (co klient podpisał), nie live.
  const latestEstimateSnapSig = estimateSignatures[estimateSignatures.length - 1];
  const afterChangeSnap = (!sigParam && estimateSigned && order.estimate_changed_after_send)
    ? latestEstimateSnapSig : null;
  const proofSig: any = frozenSig || afterChangeSnap || null;
  const displaySnapshot: any = proofSig?.snapshot || null;
  const isFrozenView = !!frozenSig?.snapshot; // ?sig → pełny read-only dowód

  // Pozycje do wyświetlenia: ze snapshotu (zamrożone) albo live.
  const displayItems: any[] = displaySnapshot?.items ?? (order.items || []);
  const tasks = displayItems.filter((i: any) => i.item_type === 'service' || i.item_type === 'task');
  const goods = displayItems.filter((i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other');
  const tasksTotal = tasks.reduce((s: number, t: any) => s + (t.total_gross || 0), 0);
  const tasksNetTotal = tasks.reduce((s: number, t: any) => s + (t.total_net || 0), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + (g.total_gross || 0), 0);
  const goodsNetTotal = goods.reduce((s: number, g: any) => s + (g.total_net || 0), 0);
  const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // VAT nie ma osobnej kolumny w DB — to różnica brutto − netto.
  const vatOf = (it: any) => (it.total_gross || 0) - (it.total_net || 0);
  const tasksVatTotal = tasksTotal - tasksNetTotal;
  const goodsVatTotal = goodsTotal - goodsNetTotal;
  const grandNet = tasksNetTotal + goodsNetTotal;
  const grandVat = tasksVatTotal + goodsVatTotal;
  const grandGross = tasksTotal + goodsTotal;
  const { show_net: showNet, show_vat: showVat, show_gross: showGross } = displaySettings;

  // receptionSigned / estimateSigned policzone wyżej (przed blokiem ETAP B).
  const statusLabel = translateWorkshopStatus(order.status_name, t);
  const statusColor = statusColors[order.status_name] || 'bg-muted';

  const estimateAvailable = isAdminPreview || (receptionSigned && order.estimate_sent_to_client && !order.estimate_changed_after_send);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; locked?: boolean }[] = [
    { key: 'reception', label: t('workshop.clientCard.receptionProtocol'), icon: <Wrench className="h-4 w-4" /> },
    // ETAP B: podpisany kosztorys ZAWSZE dostępny w read-only (koniec blokady —
    // wcześniej po przełączeniu na Protokół nie dało się wrócić na Kosztorys).
    { key: 'estimate', label: t('workshop.clientCard.estimate'), icon: <FileSignature className="h-4 w-4" />, locked: !(estimateAvailable || estimateSigned) },
    { key: 'release', label: t('workshop.clientCard.releaseProtocol'), icon: <Shield className="h-4 w-4" />, locked: !isAdminPreview && !estimateSigned },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Language bar — klient wybiera język; treść wyceny tłumaczy się na żywo */}
      <div className="border-b bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-2 md:px-8 flex justify-end">
          <LanguageSwitcher variant="outline" />
        </div>
      </div>
      {/* Company Header — clean, no heavy gradient */}
      <div className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-4 py-5 md:px-8">
          {/* DESKTOP layout */}
          <div className="hidden md:flex md:items-center md:justify-between gap-6">
            {/* Left: logo + company info */}
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {provider?.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider?.company_name || t('workshop.clientCard.logoAlt')}
                  className="max-h-16 w-auto object-contain shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary shrink-0">
                  {provider?.company_name?.charAt(0) || 'W'}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-foreground truncate">{provider?.company_name || t('workshop.clientCard.serviceFallback')}</h1>
                <p className="text-sm text-muted-foreground truncate">
                  {[provider?.company_address, provider?.company_city].filter(Boolean).join(', ')}
                  {provider?.company_nip && ` · NIP: ${provider.company_nip}`}
                </p>
              </div>
            </div>
            {/* Right: order number */}
            <div className="text-right space-y-1 shrink-0">
              <p className="text-lg font-bold text-foreground">{order.order_number}</p>
              <p className="text-sm text-muted-foreground">
                {order.created_at ? format(new Date(order.created_at), 'dd.MM.yyyy') : '---'}
              </p>
              <Badge className={`${statusColor} border-0`}>{statusLabel}</Badge>
            </div>
          </div>

          {/* MOBILE layout */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center gap-3">
              {provider?.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider?.company_name || t('workshop.clientCard.logoAlt')}
                  className="h-12 w-12 object-contain shrink-0 rounded-md bg-white"
                />
              ) : (
                <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                  {provider?.company_name?.charAt(0) || 'W'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-foreground leading-tight">{provider?.company_name || t('workshop.clientCard.serviceFallback')}</h1>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {[provider?.company_address, provider?.company_city].filter(Boolean).join(', ')}
                </p>
                {provider?.company_website && (
                  <p className="text-[11px] text-primary leading-tight truncate">
                    {provider.company_website.replace(/^https?:\/\//, '')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div>
                <p className="text-sm font-bold text-foreground">{order.order_number}</p>
                <p className="text-[11px] text-muted-foreground">
                  {order.created_at ? format(new Date(order.created_at), 'dd.MM.yyyy') : '---'}
                </p>
              </div>
              <Badge className={`${statusColor} border-0 text-[11px]`}>{statusLabel}</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 mt-6">
        {/* Client & Vehicle cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="shadow-md border-0">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-primary">{t('workshop.clientCard.clientData')}</h3>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><span className="text-muted-foreground">{t('workshop.clientCard.fullName')}:</span> <span className="font-semibold">{clientName || '---'}</span></p>
                {order.client?.phone && <p><span className="text-muted-foreground">{t('workshop.clientCard.phone')}:</span> <span className="font-medium">{order.client.phone}</span></p>}
                {order.client?.email && <p><span className="text-muted-foreground">{t('workshop.clientCard.email')}:</span> <span className="font-medium">{order.client.email}</span></p>}
                {order.client?.address && <p><span className="text-muted-foreground">{t('workshop.clientCard.address')}:</span> <span className="font-medium">{order.client.address}</span></p>}
                {order.client?.nip && <p><span className="text-muted-foreground">{t('workshop.clientCard.nip')}:</span> <span className="font-medium">{order.client.nip}</span></p>}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-0">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-primary">{t('workshop.clientCard.vehicleData')}</h3>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><span className="text-muted-foreground">{t('workshop.clientCard.brandModel')}:</span> <span className="font-semibold">{order.vehicle?.brand} {order.vehicle?.model}</span></p>
                <p><span className="text-muted-foreground">{t('workshop.clientCard.plateNumber')}:</span> <span className="font-medium">{order.vehicle?.plate || '---'}</span></p>
                <p><span className="text-muted-foreground">{t('workshop.clientCard.vin')}:</span> <span className="font-medium">{order.vehicle?.vin || '---'}</span></p>
                <p><span className="text-muted-foreground">{t('workshop.clientCard.year')}:</span> <span className="font-medium">{order.vehicle?.year || '---'}</span></p>
                <p><span className="text-muted-foreground">{t('workshop.clientCard.fuelLevel')}:</span> <span className="font-medium">{order.fuel_level || '---'}</span></p>
                {order.mileage && <p><span className="text-muted-foreground">{t('workshop.clientCard.mileage')}:</span> <span className="font-medium">{order.mileage} km</span></p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-xl overflow-x-auto">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const isLocked = tab.locked;
            return (
              <button
                key={tab.key}
                onClick={() => !isLocked && setActiveTab(tab.key)}
                className={`
                  flex items-center gap-1.5 px-2.5 sm:px-5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-1 min-w-0 justify-center
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : isLocked
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer'
                  }
                `}
              >
                {isLocked ? <Lock className="h-3.5 w-3.5" /> : tab.icon}
                {tab.label}
                {hasSigned(tab.key === 'reception' ? 'reception_protocol' : tab.key === 'estimate' ? 'cost_estimate' : 'release_protocol') && (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <Card className="shadow-md border-0 mb-8">
          <CardContent className="pt-6 pb-6">
            {showTranslationLoader && <TranslationLoader />}
            {!showTranslationLoader && activeTab === 'reception' && (
              <div className="space-y-6">
                {/* Order description */}
                {order.description && (
                  <div>
                    <h4 className="text-sm font-bold text-primary mb-1">{t('workshop.clientCard.orderDescription')}:</h4>
                    <p className="text-sm font-medium bg-muted/30 rounded-lg p-3 whitespace-pre-line">{tc('order', String(order.id), 'description', order.description)}</p>
                  </div>
                )}

                {/* Damage */}
                {order.damage_description && (
                  <div>
                    <h4 className="text-sm font-bold text-primary mb-1">{t('workshop.clientCard.damageDescription')}:</h4>
                    <p className="text-sm font-medium bg-muted/30 rounded-lg p-3 whitespace-pre-line">{tc('order', String(order.id), 'damage_description', order.damage_description)}</p>
                  </div>
                )}

                {/* Checklist */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-2">{t('workshop.clientCard.additionalInfo')}:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { labelKey: 'workshop.clientCard.testDrive', val: order.test_drive_consent },
                      { labelKey: 'workshop.clientCard.returnParts', val: order.return_parts_to_client },
                      { labelKey: 'workshop.clientCard.registrationDoc', val: order.registration_document },
                      { labelKey: 'workshop.clientCard.refillFluids', val: order.top_up_fluids },
                      { labelKey: 'workshop.clientCard.refillLights', val: order.top_up_lights },
                    ].map(item => (
                      <div key={item.labelKey} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                        <span className="text-sm">{t(item.labelKey)}</span>
                        <Badge variant="outline" className={item.val ? 'border-green-500 text-green-600 bg-green-50' : 'border-red-400 text-red-500 bg-red-50'}>
                          {item.val ? t('workshop.clientCard.yes') : t('workshop.clientCard.no')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECFIX2: zdjęcia przyjęcia to dowód WYŁĄCZNIE dla warsztatu
                    (na wypadek sporu) — klient ich NIE ogląda. Brak sekcji zdjęć. */}

                {/* Service scope */}
                {tasks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-2">{t('workshop.clientCard.serviceScope')}:</h4>
                    <div className="space-y-1">
                      {tasks.map((t: any, i: number) => (
                        <div key={t.id} className="flex items-center gap-2 py-1.5 px-3 bg-muted/20 rounded-lg text-sm">
                          <span className="text-muted-foreground font-medium">{i + 1}.</span>
                          <span>{tc('item', String(t.id), 'name', t.name)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sign button or status */}
                {!receptionSigned ? (
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setSigningDoc('reception_protocol')} size="lg" className="gap-2 shadow-lg" disabled={isAdminPreview}>
                      <FileSignature className="h-5 w-5" /> {isAdminPreview ? t('workshop.clientCard.awaitingClientSignature') : t('workshop.clientCard.signReceptionProtocol')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-1">
                    <p className="flex items-center justify-center gap-2 text-green-700 font-medium">
                      <CheckCircle2 className="h-5 w-5" /> {t('workshop.clientCard.receptionProtocolAccepted')}
                    </p>
                    {signatures.find(s => s.document_type === 'reception_protocol') && (
                      <p className="text-xs text-green-600">
                        {t('workshop.clientCard.signatureDate')}: {format(new Date(signatures.find(s => s.document_type === 'reception_protocol')!.signed_at), 'dd.MM.yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!showTranslationLoader && activeTab === 'estimate' && (
              // ETAP B: gdy mamy podpisany snapshot (dowód / wersja po zmianie),
              // bramki "podpisz protokół najpierw" / "w przygotowaniu" pomijamy —
              // pokazujemy zamrożony kosztorys.
              (!isAdminPreview && !displaySnapshot && !receptionSigned) ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">{t('workshop.clientCard.acceptReceptionFirst')}</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">{t('workshop.clientCard.estimateAfterProtocol')}</p>
                </div>
              ) : (!isAdminPreview && !displaySnapshot && !order.estimate_sent_to_client) ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">{t('workshop.clientCard.estimateInPreparation')}</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">{t('workshop.clientCard.estimateSmsNotice')}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* ETAP B: baner trybu snapshotu — zamrożony dowód (?sig) lub
                      wersja podpisana przed zmianą wyceny. */}
                  {displaySnapshot && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900 space-y-0.5">
                      <p className="font-semibold flex items-center gap-2">
                        <FileSignature className="h-4 w-4" />
                        {isFrozenView && proofSig && estimateNumber(proofSig.id)
                          ? `${t('workshop.clientCard.estimate')} nr ${estimateNumber(proofSig.id)}`
                          : t('workshop.clientCard.estimate')}
                        {displaySnapshot.signed_at && ` — ${t('workshop.clientCard.signedOn', { defaultValue: 'podpisano' })} ${format(new Date(displaySnapshot.signed_at), 'dd.MM.yyyy HH:mm')}`}
                      </p>
                      {displaySnapshot.client_phone && (
                        <p className="text-xs text-blue-700">tel.: {displaySnapshot.client_phone}</p>
                      )}
                      {!isFrozenView && order.estimate_changed_after_send && (
                        <p className="text-xs text-blue-700">{t('workshop.clientCard.signedVersionNotice', { defaultValue: 'To wersja, którą podpisałeś. Warsztat przygotowuje zmienioną wycenę — zobaczysz ją, gdy zostanie wysłana.' })}</p>
                      )}
                    </div>
                  )}
                  {isAdminPreview && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
                      <span>👁️ {t('workshop.clientCard.managerPreview')}</span>
                      {order.estimate_changed_after_send && (
                        <span className="font-semibold text-destructive">⚠ {t('workshop.clientCard.changedAfterSend')}</span>
                      )}
                    </div>
                  )}
                  {order.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-1">{t('workshop.clientCard.orderDescription')}:</h4>
                      <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-line">{tc('order', String(order.id), 'description', order.description)}</p>
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-2">{t('workshop.clientCard.services')}:</h4>

                      {/* MOBILE: karty — netto/VAT delikatne, BRUTTO pogrubione */}
                      <div className="md:hidden space-y-2">
                        {tasks.map((task: any, i: number) => (
                          <div key={task.id} className="border rounded-lg p-3 bg-card">
                            <div className="flex gap-2">
                              <span className="text-muted-foreground text-sm shrink-0">{i + 1}.</span>
                              <span className="font-medium text-sm break-words flex-1 min-w-0">{tc('item', String(task.id), 'name', task.name)}</span>
                            </div>
                            <div className="flex items-end justify-between gap-3 mt-2 pt-2 border-t">
                              <div className="text-[11px] text-muted-foreground space-y-0.5">
                                {showNet && <div>{t('workshop.clientCard.colNet')}: <span className="tabular-nums">{fmt(task.total_net || 0)}&nbsp;zł</span></div>}
                                {showVat && <div>{t('workshop.clientCard.colVat', 'VAT')}: <span className="tabular-nums">{fmt(vatOf(task))}&nbsp;zł</span></div>}
                              </div>
                              {showGross && <span className="font-bold tabular-nums text-base">{fmt(task.total_gross || 0)}&nbsp;zł</span>}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                          <span className="font-semibold">{t('workshop.clientCard.totalServices')}</span>
                          {showGross && <span className="font-bold text-primary tabular-nums">{fmt(tasksTotal)}&nbsp;zł</span>}
                        </div>
                      </div>

                      {/* DESKTOP: tabela */}
                      <div className="hidden md:block border rounded-xl overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="w-[44px]">{t('workshop.clientCard.colNo')}</TableHead>
                              <TableHead>{t('workshop.clientCard.colName')}</TableHead>
                              {showNet && <TableHead className="text-right text-muted-foreground font-normal w-[110px]">{t('workshop.clientCard.colNet')}</TableHead>}
                              {showVat && <TableHead className="text-right text-muted-foreground font-normal w-[100px]">{t('workshop.clientCard.colVat', 'VAT')}</TableHead>}
                              {showGross && <TableHead className="text-right w-[120px]">{t('workshop.clientCard.colGross')}</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tasks.map((task: any, i: number) => (
                              <TableRow key={task.id}>
                                <TableCell className="text-muted-foreground align-top">{i + 1}</TableCell>
                                <TableCell className="font-medium break-words">{tc('item', String(task.id), 'name', task.name)}</TableCell>
                                {showNet && <TableCell className="text-right tabular-nums whitespace-nowrap align-top text-muted-foreground text-sm">{fmt(task.total_net || 0)}&nbsp;zł</TableCell>}
                                {showVat && <TableCell className="text-right tabular-nums whitespace-nowrap align-top text-muted-foreground text-sm">{fmt(vatOf(task))}&nbsp;zł</TableCell>}
                                {showGross && <TableCell className="text-right font-bold tabular-nums whitespace-nowrap align-top">{fmt(task.total_gross || 0)}&nbsp;zł</TableCell>}
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={2} className="font-semibold">{t('workshop.clientCard.totalServices')}</TableCell>
                              {showNet && <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground text-sm">{fmt(tasksNetTotal)}&nbsp;zł</TableCell>}
                              {showVat && <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground text-sm">{fmt(tasksVatTotal)}&nbsp;zł</TableCell>}
                              {showGross && <TableCell className="text-right font-bold text-primary tabular-nums whitespace-nowrap">{fmt(tasksTotal)}&nbsp;zł</TableCell>}
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {goods.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-2">{t('workshop.clientCard.partsAndMaterials')}:</h4>

                      {/* MOBILE: karty */}
                      <div className="md:hidden space-y-2">
                        {goods.map((g: any, i: number) => (
                          <div key={g.id} className="border rounded-lg p-3 bg-card">
                            <div className="flex gap-2">
                              <span className="text-muted-foreground text-sm shrink-0">{i + 1}.</span>
                              <span className="font-medium text-sm break-words flex-1 min-w-0">{tc('item', String(g.id), 'name', g.name)}</span>
                            </div>
                            <div className="flex items-end justify-between gap-3 mt-2 pt-2 border-t">
                              <div className="text-[11px] text-muted-foreground space-y-0.5">
                                <div>{t('workshop.clientCard.colQty')}: <span className="tabular-nums">{g.quantity} {g.unit}</span></div>
                                {showNet && <div>{t('workshop.clientCard.colNet')}: <span className="tabular-nums">{fmt(g.total_net || 0)}&nbsp;zł</span></div>}
                                {showVat && <div>{t('workshop.clientCard.colVat', 'VAT')}: <span className="tabular-nums">{fmt(vatOf(g))}&nbsp;zł</span></div>}
                              </div>
                              {showGross && <span className="font-bold tabular-nums text-base">{fmt(g.total_gross || 0)}&nbsp;zł</span>}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                          <span className="font-semibold">{t('workshop.clientCard.totalParts')}</span>
                          {showGross && <span className="font-bold text-primary tabular-nums">{fmt(goodsTotal)}&nbsp;zł</span>}
                        </div>
                      </div>

                      {/* DESKTOP: tabela */}
                      <div className="hidden md:block border rounded-xl overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="w-[40px]">{t('workshop.clientCard.colNo')}</TableHead>
                              <TableHead>{t('workshop.clientCard.colName')}</TableHead>
                              <TableHead className="text-right w-[54px]">{t('workshop.clientCard.colQty')}</TableHead>
                              <TableHead className="w-[50px]">{t('workshop.clientCard.colUnit')}</TableHead>
                              {showNet && <TableHead className="text-right text-muted-foreground font-normal w-[110px]">{t('workshop.clientCard.colNet')}</TableHead>}
                              {showVat && <TableHead className="text-right text-muted-foreground font-normal w-[100px]">{t('workshop.clientCard.colVat', 'VAT')}</TableHead>}
                              {showGross && <TableHead className="text-right w-[120px]">{t('workshop.clientCard.colGross')}</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {goods.map((g: any, i: number) => (
                              <TableRow key={g.id}>
                                <TableCell className="text-muted-foreground align-top">{i + 1}</TableCell>
                                <TableCell className="font-medium break-words">{tc('item', String(g.id), 'name', g.name)}</TableCell>
                                <TableCell className="text-right tabular-nums whitespace-nowrap align-top">{g.quantity}</TableCell>
                                <TableCell className="align-top">{g.unit}</TableCell>
                                {showNet && <TableCell className="text-right tabular-nums whitespace-nowrap align-top text-muted-foreground text-sm">{fmt(g.total_net || 0)}&nbsp;zł</TableCell>}
                                {showVat && <TableCell className="text-right tabular-nums whitespace-nowrap align-top text-muted-foreground text-sm">{fmt(vatOf(g))}&nbsp;zł</TableCell>}
                                {showGross && <TableCell className="text-right font-bold tabular-nums whitespace-nowrap align-top">{fmt(g.total_gross || 0)}&nbsp;zł</TableCell>}
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={4} className="font-semibold">{t('workshop.clientCard.totalParts')}</TableCell>
                              {showNet && <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground text-sm">{fmt(goodsNetTotal)}&nbsp;zł</TableCell>}
                              {showVat && <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground text-sm">{fmt(goodsVatTotal)}&nbsp;zł</TableCell>}
                              {showGross && <TableCell className="text-right font-bold text-primary tabular-nums whitespace-nowrap">{fmt(goodsTotal)}&nbsp;zł</TableCell>}
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Podsumowanie — netto + VAT delikatne, BRUTTO wyróżnione (to płaci klient) */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden">
                    {(showNet || showVat) && (
                      <div className="px-4 py-3 space-y-1 border-b border-primary/10">
                        {showNet && (
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{t('workshop.clientCard.colNet')}</span>
                            <span className="tabular-nums">{fmt(grandNet)}&nbsp;zł</span>
                          </div>
                        )}
                        {showVat && (
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{t('workshop.clientCard.colVat', 'VAT')}</span>
                            <span className="tabular-nums">{fmt(grandVat)}&nbsp;zł</span>
                          </div>
                        )}
                      </div>
                    )}
                    {showGross && (
                      <div className="px-4 py-4 flex flex-wrap justify-between items-center gap-2">
                        <span className="font-bold text-lg">{t('workshop.clientCard.totalToPay')}</span>
                        <span className="text-2xl font-extrabold text-primary tabular-nums whitespace-nowrap">{fmt(grandGross)}&nbsp;zł</span>
                      </div>
                    )}
                  </div>

                  {!estimateSigned && !isFrozenView ? (
                    <div className="flex justify-end pt-2">
                      <Button onClick={() => setSigningDoc('cost_estimate')} size="lg" className="gap-2 shadow-lg" disabled={isAdminPreview}>
                        <FileSignature className="h-5 w-5" /> {isAdminPreview ? t('workshop.clientCard.awaitingClientAcceptance') : t('workshop.clientCard.acceptEstimate')}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-1">
                      <p className="flex items-center justify-center gap-2 text-green-700 font-medium">
                        <CheckCircle2 className="h-5 w-5" /> {t('workshop.clientCard.estimateAccepted')}
                      </p>
                      {signatures.find(s => s.document_type === 'cost_estimate') && (
                        <p className="text-xs text-green-600">
                          {t('workshop.clientCard.signatureDate')}: {format(new Date(signatures.find(s => s.document_type === 'cost_estimate')!.signed_at), 'dd.MM.yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            )}

            {!showTranslationLoader && activeTab === 'release' && (
              !estimateSigned ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">{t('workshop.clientCard.releaseAfterEstimate')}</p>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  {t('workshop.clientCard.releaseComingSoon')}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Signature history */}
        {signatures.length > 0 && (
          <Card className="shadow-md border-0 mb-8">
            <CardContent className="pt-5 pb-4">
              <h3 className="font-semibold text-primary mb-3">{t('workshop.clientCard.signatureHistory')}</h3>
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>{t('workshop.clientCard.documentType')}</TableHead>
                      <TableHead>{t('workshop.clientCard.signatureDate')}</TableHead>
                      <TableHead>{t('workshop.clientCard.method')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signatures.map(sig => (
                      <TableRow key={sig.id}>
                        <TableCell className="font-medium">
                          {sig.document_type === 'reception_protocol' ? t('workshop.clientCard.receptionProtocol') :
                           sig.document_type === 'cost_estimate' ? t('workshop.clientCard.estimate') : t('workshop.clientCard.releaseProtocol')}
                        </TableCell>
                        <TableCell>{sig.signed_at ? format(new Date(sig.signed_at), 'dd.MM.yyyy HH:mm') : '---'}</TableCell>
                        <TableCell>{t('workshop.clientCard.confirmationButton')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8">
          <p>Powered by <strong>GetRido</strong></p>
        </div>
      </div>

      {/* Signing dialog — compact, collapsible legal text */}
      <Dialog open={!!signingDoc} onOpenChange={() => { setSigningDoc(null); setAccepted(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {t('workshop.clientCard.signDocument')} — {signingDoc === 'reception_protocol' ? t('workshop.clientCard.receptionProtocol') :
                signingDoc === 'cost_estimate' ? t('workshop.clientCard.estimate') : t('workshop.clientCard.releaseProtocol')}
            </DialogTitle>
          </DialogHeader>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="flex items-center gap-2 text-primary font-semibold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              {t('workshop.clientCard.clickToSign')}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              id="accept-terms"
              className="mt-0.5"
            />
            <div>
              <label htmlFor="accept-terms" className="text-sm font-medium leading-relaxed cursor-pointer">
                {t('workshop.clientCard.declarationCheckbox')}
              </label>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer text-primary font-medium hover:underline">{t('workshop.clientCard.expandDeclaration')}</summary>
                <div className="mt-2 space-y-2 border-l-2 border-primary/20 pl-3">
                  <div>
                    <p className="font-semibold text-foreground">{t('workshop.clientCard.personalDataTitle')}</p>
                    <p>{t('workshop.clientCard.personalDataBody')}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{t('workshop.clientCard.retentionRightTitle')}</p>
                    <p>{t('workshop.clientCard.retentionRightBody')}</p>
                  </div>
                </div>
              </details>
            </div>
          </div>

          <Button
            onClick={() => signingDoc && handleSign(signingDoc)}
            disabled={!accepted || signing}
            className="w-full gap-2 h-12 text-base font-semibold"
            size="lg"
          >
            <CheckCircle2 className="h-5 w-5" />
            {signing ? t('workshop.clientCard.signing') : t('workshop.clientCard.acceptDocument')}
          </Button>

          <button
            onClick={() => { setSigningDoc(null); setAccepted(false); }}
            className="text-sm text-muted-foreground hover:text-foreground text-center transition-colors"
          >
            {t('workshop.clientCard.close')}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
