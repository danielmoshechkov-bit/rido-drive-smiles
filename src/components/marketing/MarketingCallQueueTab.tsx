import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Phone, PhoneCall, Flame, Snowflake, Sun, X, Clock, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

type QueueItem = any;

const PRIORITY_META: Record<string, { color: string; icon: any; label: string }> = {
  hot: { color: 'bg-red-500', icon: Flame, label: 'HOT' },
  warm: { color: 'bg-orange-500', icon: Sun, label: 'WARM' },
  cold: { color: 'bg-blue-500', icon: Snowflake, label: 'COLD' },
};

export function MarketingCallQueueTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<QueueItem | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('call_queue')
      .select('*, client:agency_clients(company_name), lead:marketing_leads(message, email)')
      .in('status', ['queued', 'calling'])
      .order('ai_priority', { ascending: true })
      .order('scheduled_for', { ascending: true })
      .limit(100);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = {
    hot: items.filter(i => i.ai_priority === 'hot'),
    warm: items.filter(i => i.ai_priority === 'warm'),
    cold: items.filter(i => i.ai_priority === 'cold' || !i.ai_priority),
  };

  if (active) return <CallMode item={active} onClose={() => { setActive(null); load(); }} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><PhoneCall className="h-6 w-6" /> Obdzwanianie</h2>
        <p className="text-muted-foreground text-sm">Kolejka leadów do kontaktu telefonicznego. Skrypt rozmowy generowany przez AI.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <PhoneCall className="h-12 w-12 mx-auto mb-3 opacity-30" />
          Kolejka pusta. Hot leady są dodawane automatycznie co 5 minut.
        </CardContent></Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {(['hot', 'warm', 'cold'] as const).map(prio => {
            const meta = PRIORITY_META[prio];
            const Icon = meta.icon;
            return (
              <div key={prio} className="space-y-3">
                <div className={`${meta.color} text-white rounded-lg px-4 py-2 flex items-center justify-between`}>
                  <div className="flex items-center gap-2 font-bold"><Icon className="h-4 w-4" /> {meta.label}</div>
                  <Badge variant="secondary">{grouped[prio].length}</Badge>
                </div>
                {grouped[prio].length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Brak</p>
                ) : grouped[prio].map(item => (
                  <Card key={item.id} className="hover:shadow-md transition cursor-pointer" onClick={() => setActive(item)}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{item.lead_name || 'Bez nazwy'}</p>
                          <p className="text-sm text-muted-foreground">{item.phone_to_call}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.client?.company_name}</p>
                          {item.ai_score && <Badge variant="outline" className="mt-1 text-xs">Score: {item.ai_score}/100</Badge>}
                        </div>
                        <Button size="sm"><Phone className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CallMode({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState('');
  const script = item.ai_script || {};

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);

  const start = async () => {
    setRunning(true);
    await (supabase as any).from('call_queue').update({ status: 'calling', started_at: new Date().toISOString() }).eq('id', item.id);
    window.location.href = `tel:${item.phone_to_call}`;
  };

  const finish = async (outcome: string) => {
    setRunning(false);
    await (supabase as any).from('call_logs').insert({
      queue_id: item.id,
      lead_id: item.lead_id,
      client_id: item.client_id,
      outcome,
      duration_seconds: seconds,
      notes,
    });
    await (supabase as any).from('call_queue').update({
      status: outcome === 'no_answer' ? 'queued' : 'done',
      completed_at: new Date().toISOString(),
      outcome,
    }).eq('id', item.id);
    toast.success('Rozmowa zapisana');
    onClose();
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">{item.lead_name}</h1>
            <p className="text-muted-foreground">{item.phone_to_call} • {item.client?.company_name}</p>
          </div>
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-2" /> Zamknij</Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Skrypt */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-bold text-lg">📜 Skrypt rozmowy AI</h3>
              {script.opening && (
                <div><p className="text-xs uppercase text-muted-foreground font-semibold">Otwarcie</p><p className="text-sm mt-1">{script.opening}</p></div>
              )}
              {script.discovery_question && (
                <div><p className="text-xs uppercase text-muted-foreground font-semibold">Pytanie odkrywcze</p><p className="text-sm mt-1">{script.discovery_question}</p></div>
              )}
              {script.key_benefits?.length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Kluczowe korzyści</p>
                  <ul className="text-sm mt-1 space-y-1">{script.key_benefits.map((b: string, i: number) => <li key={i}>• {b}</li>)}</ul>
                </div>
              )}
              {script.objection_handlers && Object.keys(script.objection_handlers).length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Obsługa obiekcji</p>
                  <div className="space-y-2 mt-1">
                    {Object.entries(script.objection_handlers).map(([k, v]: any) => (
                      <div key={k} className="text-sm bg-muted p-2 rounded">
                        <p className="font-medium">"{k}"</p>
                        <p className="text-muted-foreground">→ {v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {script.closing && (
                <div><p className="text-xs uppercase text-muted-foreground font-semibold">Zamknięcie</p><p className="text-sm mt-1">{script.closing}</p></div>
              )}
              {item.lead?.message && (
                <div className="border-t pt-3">
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Wiadomość od leadu</p>
                  <p className="text-sm mt-1 italic">{item.lead.message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timer + akcje */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="text-center py-6">
                <Clock className="h-8 w-8 mx-auto text-primary mb-2" />
                <div className="text-5xl font-mono font-bold tabular-nums">{fmt(seconds)}</div>
                <p className="text-sm text-muted-foreground mt-1">{running ? 'Rozmowa trwa...' : 'Gotowy do wybrania'}</p>
              </div>

              {!running ? (
                <Button size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={start}>
                  <Phone className="h-5 w-5 mr-2" /> Zadzwoń teraz
                </Button>
              ) : (
                <div className="space-y-2">
                  <Textarea placeholder="Notatki z rozmowy..." value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => finish('interested')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Zainteresowany
                    </Button>
                    <Button variant="default" className="bg-blue-600 hover:bg-blue-700" onClick={() => finish('booked')}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Umówiono
                    </Button>
                    <Button variant="outline" onClick={() => finish('not_interested')}>
                      <XCircle className="h-4 w-4 mr-1" /> Nie zainteresowany
                    </Button>
                    <Button variant="outline" onClick={() => finish('no_answer')}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Brak odpowiedzi
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
