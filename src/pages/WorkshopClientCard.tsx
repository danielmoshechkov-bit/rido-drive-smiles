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
import { CheckCircle2, FileSignature, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  'Przyjęcie do serwisu': 'bg-red-500 text-white',
  'Nowe zlecenie': 'bg-amber-400 text-black',
  'Akceptacja klienta': 'bg-amber-400 text-black',
  'W trakcie naprawy': 'bg-amber-400 text-black',
  'Zadania wykonane': 'bg-green-500 text-white',
  'Gotowy do odbioru': 'bg-green-500 text-white',
  'Zakończone': 'bg-gray-800 text-white',
};

export default function WorkshopClientCard() {
  const { code } = useParams<{ code: string }>();
  const [order, setOrder] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingDoc, setSigningDoc] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  
  // Section expand state
  const [expandedSections, setExpandedSections] = useState({
    reception: true,
    estimate: false,
    release: false,
  });

  useEffect(() => {
    loadOrder();
  }, [code]);

  const loadOrder = async () => {
    if (!code) return;
    const { data } = await (supabase as any)
      .from('workshop_orders')
      .select('*, client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)')
      .eq('client_code', code)
      .single();
    
    if (data) {
      setOrder(data);
      // Load provider info
      const { data: prov } = await (supabase as any)
        .from('service_providers')
        .select('*')
        .eq('id', data.provider_id)
        .single();
      setProvider(prov);
      
      // Load signatures
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

      // Update order flags
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

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Nie znaleziono zlecenia</p>
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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          {provider?.business_name && (
            <h1 className="text-xl font-bold text-primary">{provider.business_name}</h1>
          )}
          {provider?.address && <p className="text-sm text-muted-foreground">{provider.address}</p>}
          {provider?.nip && <p className="text-sm text-muted-foreground">NIP: {provider.nip}</p>}
          {provider?.phone && <p className="text-sm text-muted-foreground">Telefon: {provider.phone}</p>}
        </div>
        <div className="text-right space-y-1">
          <p className="text-lg font-bold text-primary">{order.order_number}</p>
          <p className="text-sm text-muted-foreground">
            Data utworzenia: {order.created_at ? format(new Date(order.created_at), 'yyyy-MM-dd') : '---'}
          </p>
          <Badge className={statusColors[order.status_name] || 'bg-muted'}>{order.status_name}</Badge>
        </div>
      </div>

      {/* Client & Vehicle info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-primary mb-2">Dane klienta:</h3>
              <p><strong>Imię i nazwisko:</strong> {clientName}</p>
              {order.client?.phone && <p><strong>Numer telefonu:</strong> {order.client.phone}</p>}
              {order.client?.email && <p><strong>Email:</strong> {order.client.email}</p>}
              {order.client?.address && <p><strong>Adres:</strong> {order.client.address}</p>}
            </div>
            <div>
              <h3 className="font-semibold text-primary mb-2">Dane pojazdu:</h3>
              <p><strong>Marka i model:</strong> {order.vehicle?.brand} {order.vehicle?.model}</p>
              <p><strong>Numer rejestracyjny:</strong> {order.vehicle?.plate || '---'}</p>
              <p><strong>VIN:</strong> {order.vehicle?.vin || '---'}</p>
              <p><strong>Poziom paliwa:</strong> {order.fuel_level || '---'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Protokół przyjęcia */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <button 
            onClick={() => toggleSection('reception')} 
            className="flex items-center gap-2 w-full text-left"
          >
            {receptionSigned 
              ? <CheckCircle2 className="h-5 w-5 text-green-500" /> 
              : <FileSignature className="h-5 w-5 text-muted-foreground" />}
            <span className="font-semibold flex-1">Protokół przyjęcia</span>
            {expandedSections.reception ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expandedSections.reception && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-primary">Opis zlecenia:</h4>
                <p className="text-sm">{order.description || 'Brak opisu'}</p>
              </div>

              {order.damage_description && (
                <div>
                  <h4 className="text-sm font-semibold text-primary">Opis uszkodzeń:</h4>
                  <p className="text-sm">{order.damage_description}</p>
                </div>
              )}

              {/* Additional info toggles */}
              <div>
                <h4 className="text-sm font-semibold text-primary mb-2">Dodatkowe informacje:</h4>
                <div className="space-y-1">
                  {[
                    { label: 'Jazda testowa', val: order.test_drive_consent },
                    { label: 'Zwrot części do klienta', val: order.return_parts_to_client },
                    { label: 'Dowód rejestracyjny', val: order.registration_document },
                    { label: 'Uzupełnić płyny', val: order.top_up_fluids },
                    { label: 'Uzupełnić oświetlenie', val: order.top_up_lights },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-sm">{item.label}</span>
                      <Badge variant={item.val ? 'default' : 'destructive'} className={item.val ? 'bg-green-500' : 'bg-red-500'}>
                        {item.val ? 'TAK' : 'NIE'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Service scope */}
              {tasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-2">Zakres usług:</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {!receptionSigned && (
                <div className="flex justify-end">
                  <Button onClick={() => setSigningDoc('reception_protocol')} className="gap-2">
                    <FileSignature className="h-4 w-4" /> Podpisz dokument
                  </Button>
                </div>
              )}

              {receptionSigned && (
                <div className="border rounded-lg p-3 bg-muted/50 text-center text-sm text-muted-foreground space-y-1">
                  <p>Dokument został podpisany przyciskiem akceptacji</p>
                  {signatures.find(s => s.document_type === 'reception_protocol') && (
                    <>
                      <p><strong>Data podpisu:</strong> {format(new Date(signatures.find(s => s.document_type === 'reception_protocol')!.signed_at), 'yyyy-MM-dd HH:mm:ss')}</p>
                      <p><strong>Przeglądarka:</strong> {signatures.find(s => s.document_type === 'reception_protocol')!.user_agent?.substring(0, 80)}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kosztorys */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <button 
            onClick={() => toggleSection('estimate')} 
            className="flex items-center gap-2 w-full text-left"
          >
            {estimateSigned 
              ? <CheckCircle2 className="h-5 w-5 text-green-500" /> 
              : <FileSignature className="h-5 w-5 text-muted-foreground" />}
            <span className="font-semibold flex-1">Kosztorys</span>
            {expandedSections.estimate ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expandedSections.estimate && (
            !receptionSigned ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-amber-700">
                Aby zobaczyć kosztorys musisz podpisać protokół przyjęcia
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-primary">Opis zlecenia:</h4>
                  <p className="text-sm">{order.description || 'Brak opisu'}</p>
                </div>

                {tasks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-2">Usługi:</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lp.</TableHead>
                          <TableHead>Nazwa</TableHead>
                          <TableHead className="text-right">Koszt netto</TableHead>
                          <TableHead className="text-right">Koszt brutto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasks.map((t: any, i: number) => (
                          <TableRow key={t.id}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{t.name}</TableCell>
                            <TableCell className="text-right">{fmt(t.total_net || 0)} zł</TableCell>
                            <TableCell className="text-right">{fmt(t.total_gross || 0)} zł</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold">
                          <TableCell colSpan={2}>RAZEM</TableCell>
                          <TableCell className="text-right text-primary">{fmt(tasksNetTotal)} zł</TableCell>
                          <TableCell className="text-right text-primary">{fmt(tasksTotal)} zł</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}

                {goods.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-primary mb-2">Towary:</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lp.</TableHead>
                          <TableHead>Nazwa</TableHead>
                          <TableHead className="text-right">Ilość</TableHead>
                          <TableHead>J.m.</TableHead>
                          <TableHead className="text-right">Koszt netto</TableHead>
                          <TableHead className="text-right">Koszt brutto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {goods.map((g: any, i: number) => (
                          <TableRow key={g.id}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{g.name}</TableCell>
                            <TableCell className="text-right">{g.quantity}</TableCell>
                            <TableCell>{g.unit}</TableCell>
                            <TableCell className="text-right">{fmt(g.total_net || 0)} zł</TableCell>
                            <TableCell className="text-right">{fmt(g.total_gross || 0)} zł</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold">
                          <TableCell colSpan={4}>RAZEM</TableCell>
                          <TableCell className="text-right text-primary">{fmt(goodsNetTotal)} zł</TableCell>
                          <TableCell className="text-right text-primary">{fmt(goodsTotal)} zł</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="border-t pt-3">
                  <div className="flex justify-end gap-8 font-bold text-lg">
                    <span>Łącznie</span>
                    <span>{fmt(tasksNetTotal + goodsNetTotal)} zł</span>
                    <span>{fmt(tasksTotal + goodsTotal)} zł</span>
                  </div>
                </div>

                {!estimateSigned && (
                  <div className="flex justify-end">
                    <Button onClick={() => setSigningDoc('cost_estimate')} className="gap-2">
                      <FileSignature className="h-4 w-4" /> Podpisz dokument
                    </Button>
                  </div>
                )}

                {estimateSigned && (
                  <div className="border rounded-lg p-3 bg-muted/50 text-center text-sm text-muted-foreground">
                    <p>Kosztorys zaakceptowany</p>
                    {signatures.find(s => s.document_type === 'cost_estimate') && (
                      <p><strong>Data podpisu:</strong> {format(new Date(signatures.find(s => s.document_type === 'cost_estimate')!.signed_at), 'yyyy-MM-dd HH:mm:ss')}</p>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Protokół wydania */}
      <Card>
        <CardContent className="pt-4">
          <button 
            onClick={() => toggleSection('release')} 
            className="flex items-center gap-2 w-full text-left"
          >
            {hasSigned('release_protocol')
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <FileSignature className="h-5 w-5 text-muted-foreground" />}
            <span className="font-semibold flex-1">Protokół wydania</span>
            {expandedSections.release ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardContent>
      </Card>

      {/* Historia podpisów */}
      {signatures.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-primary">Historia podpisów:</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rodzaj dokumentu</TableHead>
                <TableHead>Data podpisu</TableHead>
                <TableHead>Rodzaj podpisu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signatures.map(sig => (
                <TableRow key={sig.id}>
                  <TableCell>
                    {sig.document_type === 'reception_protocol' ? 'Protokół przyjęcia' :
                     sig.document_type === 'cost_estimate' ? 'Kosztorys' : 'Protokół wydania'}
                  </TableCell>
                  <TableCell>{sig.signed_at ? format(new Date(sig.signed_at), 'yyyy-MM-dd HH:mm:ss') : '---'}</TableCell>
                  <TableCell>Przycisk potwierdzenia</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Signing dialog */}
      <Dialog open={!!signingDoc} onOpenChange={() => { setSigningDoc(null); setAccepted(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Podpisz dokument {signingDoc === 'reception_protocol' ? 'Protokół przyjęcia' : 
                signingDoc === 'cost_estimate' ? 'Kosztorys' : 'Protokół wydania'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <p className="flex items-center gap-2 text-primary font-medium">
              <CheckCircle2 className="h-5 w-5" />
              Kliknij przycisk poniżej, aby podpisać dokument
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox 
              checked={accepted} 
              onCheckedChange={(v) => setAccepted(!!v)} 
              id="accept-terms"
            />
            <label htmlFor="accept-terms" className="text-sm leading-relaxed cursor-pointer">
              Oświadczam, że zapoznałem/am się z poniższą treścią i akceptuję ją
            </label>
          </div>

          <div className="text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto border rounded p-3">
            <p className="font-semibold">Dane osobowe</p>
            <p>Administrator Państwa danych osobowych i sposoby kontaktu z nim określono na wstępie karty zlecenia. Podanie danych jest konieczne dla realizacji zamówienia.</p>
            <p className="font-semibold">Prawo zatrzymania</p>
            <p>Informujemy, że zgodnie z art. 461 Kodeksu cywilnego przysługuje nam prawo zatrzymania pojazdu i innych powierzonych nam rzeczy do chwili zaspokojenia lub zabezpieczenia przysługujących nam roszczeń o zwrot nakładów na te rzeczy lub o naprawienie szkody przez nie wyrządzonej.</p>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={() => { setSigningDoc(null); setAccepted(false); }}>
              Zamknij
            </Button>
            <Button 
              onClick={() => signingDoc && handleSign(signingDoc)} 
              disabled={!accepted || signing}
              className="gap-2"
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
