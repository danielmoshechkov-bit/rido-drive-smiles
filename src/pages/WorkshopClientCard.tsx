import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { CheckCircle2, FileSignature, Loader2, Car, User, Wrench, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusLabels: Record<string, { label: string; color: string }> = {
  'Przyjęcie do serwisu': { label: 'Przyjęcie do serwisu', color: 'bg-red-500 text-white' },
  'Nowe zlecenie': { label: 'Nowe zlecenie', color: 'bg-amber-400 text-black' },
  'Akceptacja klienta': { label: 'Oczekuje na akceptację', color: 'bg-amber-400 text-black' },
  'W trakcie naprawy': { label: 'W trakcie naprawy', color: 'bg-blue-500 text-white' },
  'Zadania wykonane': { label: 'Zadania wykonane', color: 'bg-green-500 text-white' },
  'Gotowy do odbioru': { label: 'Gotowy do odbioru', color: 'bg-green-600 text-white' },
  'Zakończone': { label: 'Zakończone', color: 'bg-gray-700 text-white' },
};

type TabKey = 'reception' | 'estimate' | 'release';

export default function WorkshopClientCard() {
  const { code } = useParams<{ code: string }>();
  const [order, setOrder] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingDoc, setSigningDoc] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('reception');

  useEffect(() => { loadOrder(); }, [code]);

  const loadOrder = async () => {
    if (!code) return;
    const { data } = await (supabase as any)
      .from('workshop_orders')
      .select('*, client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)')
      .eq('client_code', code)
      .single();

    if (data) {
      setOrder(data);
      const { data: prov } = await (supabase as any)
        .from('service_providers')
        .select('*')
        .eq('id', data.provider_id)
        .single();
      setProvider(prov);

      const { data: sigs } = await (supabase as any)
        .from('workshop_order_signatures')
        .select('*')
        .eq('order_id', data.id);
      setSignatures(sigs || []);
    }
    setLoading(false);
  };

  const hasSigned = (docType: string) => signatures.some(s => s.document_type === docType);

  const handleSign = async (docType: string) => {
    setSigning(true);
    try {
      await (supabase as any).from('workshop_order_signatures').insert({
        order_id: order.id,
        document_type: docType,
        signed_at: new Date().toISOString(),
        ip_address: null,
        user_agent: navigator.userAgent,
        fingerprint: null,
        signature_method: 'button',
      });
      const updates: any = {};
      if (docType === 'reception_protocol') updates.client_acceptance_confirmed = true;
      if (docType === 'cost_estimate') updates.quote_accepted = true;
      if (Object.keys(updates).length > 0) {
        await (supabase as any).from('workshop_orders').update(updates).eq('id', order.id);
      }
      toast.success('Dokument został podpisany');
      setSigningDoc(null);
      setAccepted(false);
      await loadOrder();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="p-8 text-center">
          <p className="text-lg text-muted-foreground">Nie znaleziono zlecenia</p>
        </Card>
      </div>
    );
  }

  const clientName = order.client?.client_type === 'company'
    ? order.client?.company_name
    : `${order.client?.first_name || ''} ${order.client?.last_name || ''}`.trim();

  const tasks = (order.items || []).filter((i: any) => i.item_type !== 'goods');
  const goods = (order.items || []).filter((i: any) => i.item_type === 'goods');
  const tasksTotal = tasks.reduce((s: number, t: any) => s + (t.total_gross || 0), 0);
  const tasksNetTotal = tasks.reduce((s: number, t: any) => s + (t.total_net || 0), 0);
  const goodsTotal = goods.reduce((s: number, g: any) => s + (g.total_gross || 0), 0);
  const goodsNetTotal = goods.reduce((s: number, g: any) => s + (g.total_net || 0), 0);
  const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2 });

  const receptionSigned = hasSigned('reception_protocol');
  const estimateSigned = hasSigned('cost_estimate');
  const status = statusLabels[order.status_name] || { label: order.status_name, color: 'bg-muted' };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; locked?: boolean }[] = [
    { key: 'reception', label: 'Protokół przyjęcia', icon: <Wrench className="h-4 w-4" /> },
    { key: 'estimate', label: 'Kosztorys', icon: <FileSignature className="h-4 w-4" />, locked: !receptionSigned },
    { key: 'release', label: 'Protokół wydania', icon: <Shield className="h-4 w-4" />, locked: !estimateSigned },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Company Header — clean, no heavy gradient */}
      <div className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-4 py-5 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {provider?.logo_url ? (
                <img src={provider.logo_url} alt="Logo" className="h-12 w-12 rounded-xl border object-contain" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                  {provider?.company_name?.charAt(0) || 'W'}
                </div>
              )}
              <div>
                <h1 className="text-lg md:text-xl font-bold text-foreground">{provider?.company_name || 'Serwis'}</h1>
                <p className="text-sm text-muted-foreground">
                  {[provider?.company_address, provider?.company_city].filter(Boolean).join(', ')}
                  {provider?.company_nip && ` · NIP: ${provider.company_nip}`}
                </p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-lg font-bold text-foreground">{order.order_number}</p>
              <p className="text-sm text-muted-foreground">
                {order.created_at ? format(new Date(order.created_at), 'dd.MM.yyyy') : '---'}
              </p>
              <Badge className={`${status.color} border-0`}>{status.label}</Badge>
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
                <h3 className="font-semibold text-primary">Dane klienta</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Imię i nazwisko:</span> <strong>{clientName || '---'}</strong></p>
                {order.client?.phone && <p><span className="text-muted-foreground">Telefon:</span> {order.client.phone}</p>}
                {order.client?.email && <p><span className="text-muted-foreground">Email:</span> {order.client.email}</p>}
                {order.client?.address && <p><span className="text-muted-foreground">Adres:</span> {order.client.address}</p>}
                {order.client?.nip && <p><span className="text-muted-foreground">NIP:</span> {order.client.nip}</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md border-0">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-primary">Dane pojazdu</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Marka i model:</span> <strong>{order.vehicle?.brand} {order.vehicle?.model}</strong></p>
                <p><span className="text-muted-foreground">Nr rejestracyjny:</span> {order.vehicle?.plate || '---'}</p>
                <p><span className="text-muted-foreground">VIN:</span> {order.vehicle?.vin || '---'}</p>
                <p><span className="text-muted-foreground">Rocznik:</span> {order.vehicle?.year || '---'}</p>
                <p><span className="text-muted-foreground">Poziom paliwa:</span> {order.fuel_level || '---'}</p>
                {order.mileage && <p><span className="text-muted-foreground">Przebieg:</span> {order.mileage} km</p>}
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
                  flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center
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
            {activeTab === 'reception' && (
              <div className="space-y-6">
                {/* Order description */}
                {order.description && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-1">Opis zlecenia:</h4>
                    <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-line">{order.description}</p>
                  </div>
                )}

                {/* Damage */}
                {order.damage_description && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-1">Opis uszkodzeń:</h4>
                    <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-line">{order.damage_description}</p>
                  </div>
                )}

                {/* Checklist */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-2">Dodatkowe informacje:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Jazda testowa', val: order.test_drive_consent },
                      { label: 'Zwrot części do klienta', val: order.return_parts_to_client },
                      { label: 'Dowód rejestracyjny', val: order.registration_document },
                      { label: 'Uzupełnić płyny', val: order.top_up_fluids },
                      { label: 'Uzupełnić oświetlenie', val: order.top_up_lights },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                        <span className="text-sm">{item.label}</span>
                        <Badge variant="outline" className={item.val ? 'border-green-500 text-green-600 bg-green-50' : 'border-red-400 text-red-500 bg-red-50'}>
                          {item.val ? 'TAK' : 'NIE'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Photos */}
                {order.reception_photos && Array.isArray(JSON.parse(order.reception_photos || '[]')) && JSON.parse(order.reception_photos || '[]').length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-2">Zdjęcia z przyjęcia:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {JSON.parse(order.reception_photos).map((photo: any, idx: number) => (
                        <div key={idx} className="rounded-xl overflow-hidden border aspect-[4/3]">
                          <img
                            src={photo.url || photo}
                            alt={photo.label || `Zdjęcie ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Service scope */}
                {tasks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-2">Zakres usług:</h4>
                    <div className="space-y-1">
                      {tasks.map((t: any, i: number) => (
                        <div key={t.id} className="flex items-center gap-2 py-1.5 px-3 bg-muted/20 rounded-lg text-sm">
                          <span className="text-muted-foreground font-medium">{i + 1}.</span>
                          <span>{t.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sign button or status */}
                {!receptionSigned ? (
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setSigningDoc('reception_protocol')} size="lg" className="gap-2 shadow-lg">
                      <FileSignature className="h-5 w-5" /> Podpisz protokół przyjęcia
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-1">
                    <p className="flex items-center justify-center gap-2 text-green-700 font-medium">
                      <CheckCircle2 className="h-5 w-5" /> Protokół przyjęcia zaakceptowany
                    </p>
                    {signatures.find(s => s.document_type === 'reception_protocol') && (
                      <p className="text-xs text-green-600">
                        Data podpisu: {format(new Date(signatures.find(s => s.document_type === 'reception_protocol')!.signed_at), 'dd.MM.yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'estimate' && (
              !receptionSigned ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">Najpierw zaakceptuj protokół przyjęcia</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Kosztorys będzie dostępny po podpisaniu protokołu.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {order.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-1">Opis zlecenia:</h4>
                      <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-line">{order.description}</p>
                    </div>
                  )}

                  {tasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-2">Usługi:</h4>
                      <div className="border rounded-xl overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="w-12">Lp.</TableHead>
                              <TableHead>Nazwa</TableHead>
                              <TableHead className="text-right">Netto</TableHead>
                              <TableHead className="text-right">Brutto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tasks.map((t: any, i: number) => (
                              <TableRow key={t.id}>
                                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="font-medium">{t.name}</TableCell>
                                <TableCell className="text-right">{fmt(t.total_net || 0)} zł</TableCell>
                                <TableCell className="text-right font-medium">{fmt(t.total_gross || 0)} zł</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted/20">
                              <TableCell colSpan={2}>Razem usługi</TableCell>
                              <TableCell className="text-right text-primary">{fmt(tasksNetTotal)} zł</TableCell>
                              <TableCell className="text-right text-primary">{fmt(tasksTotal)} zł</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {goods.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-primary mb-2">Części i materiały:</h4>
                      <div className="border rounded-xl overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="w-12">Lp.</TableHead>
                              <TableHead>Nazwa</TableHead>
                              <TableHead className="text-right">Ilość</TableHead>
                              <TableHead>J.m.</TableHead>
                              <TableHead className="text-right">Netto</TableHead>
                              <TableHead className="text-right">Brutto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {goods.map((g: any, i: number) => (
                              <TableRow key={g.id}>
                                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="font-medium">{g.name}</TableCell>
                                <TableCell className="text-right">{g.quantity}</TableCell>
                                <TableCell>{g.unit}</TableCell>
                                <TableCell className="text-right">{fmt(g.total_net || 0)} zł</TableCell>
                                <TableCell className="text-right font-medium">{fmt(g.total_gross || 0)} zł</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted/20">
                              <TableCell colSpan={4}>Razem części</TableCell>
                              <TableCell className="text-right text-primary">{fmt(goodsNetTotal)} zł</TableCell>
                              <TableCell className="text-right text-primary">{fmt(goodsTotal)} zł</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Grand total */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">Łącznie do zapłaty</span>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Netto: {fmt(tasksNetTotal + goodsNetTotal)} zł</p>
                        <p className="text-xl font-bold text-primary">{fmt(tasksTotal + goodsTotal)} zł brutto</p>
                      </div>
                    </div>
                  </div>

                  {!estimateSigned ? (
                    <div className="flex justify-end pt-2">
                      <Button onClick={() => setSigningDoc('cost_estimate')} size="lg" className="gap-2 shadow-lg">
                        <FileSignature className="h-5 w-5" /> Akceptuję kosztorys
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-1">
                      <p className="flex items-center justify-center gap-2 text-green-700 font-medium">
                        <CheckCircle2 className="h-5 w-5" /> Kosztorys zaakceptowany
                      </p>
                      {signatures.find(s => s.document_type === 'cost_estimate') && (
                        <p className="text-xs text-green-600">
                          Data podpisu: {format(new Date(signatures.find(s => s.document_type === 'cost_estimate')!.signed_at), 'dd.MM.yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            )}

            {activeTab === 'release' && (
              !estimateSigned ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">Protokół wydania będzie dostępny po akceptacji kosztorysu</p>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  Protokół wydania — wkrótce dostępny
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Signature history */}
        {signatures.length > 0 && (
          <Card className="shadow-md border-0 mb-8">
            <CardContent className="pt-5 pb-4">
              <h3 className="font-semibold text-primary mb-3">Historia podpisów</h3>
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Rodzaj dokumentu</TableHead>
                      <TableHead>Data podpisu</TableHead>
                      <TableHead>Metoda</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signatures.map(sig => (
                      <TableRow key={sig.id}>
                        <TableCell className="font-medium">
                          {sig.document_type === 'reception_protocol' ? 'Protokół przyjęcia' :
                           sig.document_type === 'cost_estimate' ? 'Kosztorys' : 'Protokół wydania'}
                        </TableCell>
                        <TableCell>{sig.signed_at ? format(new Date(sig.signed_at), 'dd.MM.yyyy HH:mm') : '---'}</TableCell>
                        <TableCell>Przycisk potwierdzenia</TableCell>
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

      {/* Signing dialog */}
      <Dialog open={!!signingDoc} onOpenChange={() => { setSigningDoc(null); setAccepted(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Podpisz dokument — {signingDoc === 'reception_protocol' ? 'Protokół przyjęcia' :
                signingDoc === 'cost_estimate' ? 'Kosztorys' : 'Protokół wydania'}
            </DialogTitle>
          </DialogHeader>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="flex items-center gap-2 text-primary font-medium text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Zapoznaj się z treścią i kliknij przycisk, aby zaakceptować
            </p>
          </div>

          <div className="text-xs text-muted-foreground space-y-3 max-h-48 overflow-y-auto border rounded-xl p-4 bg-muted/10">
            <div>
              <p className="font-semibold text-foreground">Dane osobowe</p>
              <p>Administrator Państwa danych osobowych i sposoby kontaktu z nim określono na wstępie karty zlecenia. Podanie danych jest konieczne dla realizacji zamówienia. Administrator może przetwarzać te dane (w szczególności: imię i nazwisko, nazwę, adresy, NIP, PESEL, REGON, nr telefonu, adres e-mail, dane dotyczące wykonanych dla Państwa usług i informacje o Państwa płatnościach).</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Prawo zatrzymania</p>
              <p>Informujemy, że zgodnie z art. 461 Kodeksu cywilnego przysługuje nam prawo zatrzymania pojazdu i innych powierzonych nam rzeczy do chwili zaspokojenia lub zabezpieczenia przysługujących nam roszczeń o zwrot nakładów na te rzeczy lub o naprawienie szkody przez nie wyrządzonej.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <Checkbox
              checked={accepted}
              onCheckedChange={(v) => setAccepted(!!v)}
              id="accept-terms"
            />
            <label htmlFor="accept-terms" className="text-sm leading-relaxed cursor-pointer">
              Oświadczam, że zapoznałem/am się z powyższą treścią i akceptuję ją
            </label>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => { setSigningDoc(null); setAccepted(false); }}>
              Zamknij
            </Button>
            <Button
              onClick={() => signingDoc && handleSign(signingDoc)}
              disabled={!accepted || signing}
              className="gap-2"
              size="lg"
            >
              <CheckCircle2 className="h-4 w-4" />
              {signing ? 'Podpisywanie...' : 'Akceptuję dokument'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
