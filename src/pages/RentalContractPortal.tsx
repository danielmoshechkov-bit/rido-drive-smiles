import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { SignaturePad } from '@/components/fleet/SignaturePad';
import { toast } from 'sonner';
import { sanitizeDocumentHtml } from '@/security/htmlSanitizer';

/**
 * Publiczny portal podpisu umowy najmu (bez logowania) — token = bookings.confirmation_token.
 * Reuse SignaturePad. Dane przez RPC rental_get_contract / rental_sign_contract (SECURITY DEFINER).
 */
export default function RentalContractPortal() {
  const { token } = useParams();
  const sb = supabase as any;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: d } = await sb.rpc('rental_get_contract', { p_token: token });
      setData(d);
      if (d?.instance?.status === 'signed') setDone(true);
      setLoading(false);
    })();
  }, [token, sb]);

  const onSign = async (signatureDataUrl: string) => {
    const { data: r } = await sb.rpc('rental_sign_contract', { p_token: token, p_signature: signatureDataUrl, p_ip: null, p_ua: navigator.userAgent });
    if (r?.ok) { setDone(true); toast.success('Umowa podpisana. Dziękujemy!'); }
    else toast.error('Nie udało się podpisać: ' + (r?.error || 'błąd'));
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!data?.found || !data?.instance) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Nie znaleziono umowy do podpisania.</div>;

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="h-12 w-12 text-green-600" />
      <h1 className="text-xl font-bold">Umowa podpisana</h1>
      <p className="text-muted-foreground">Dziękujemy. Kopia trafi do wynajmującego.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-lg font-bold">Umowa najmu — {data.booking?.booking_number}</h1>
        <Card className="p-4 max-h-[55vh] overflow-y-auto" onScroll={(e) => {
          const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolledEnd(true);
        }}>
          <div dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(data.instance.filled_content) }} />
        </Card>
        {!scrolledEnd && <p className="text-xs text-muted-foreground text-center">Przewiń umowę do końca, aby kontynuować.</p>}
        {scrolledEnd && (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Zapoznałem/am się z treścią umowy i akceptuję warunki.</label>
            {accepted && !signing && <Button onClick={() => setSigning(true)}>Podpisz</Button>}
            {signing && <SignaturePad title="Podpis najemcy" onSign={onSign} onCancel={() => setSigning(false)} />}
          </>
        )}
      </div>
    </div>
  );
}
