import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// Strona lądowania linku z maila — potwierdza zmianę numeru konta kierowcy.
export default function DriverBankChangeConfirm() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let done = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('driver-bank-change-confirm', { body: { token } });
        if (done) return;
        if (error || (data as any)?.error) {
          setState('error');
          setMessage((data as any)?.error || 'Nie udało się potwierdzić zmiany.');
        } else {
          setState('ok');
          setMessage('Numer konta został zmieniony.');
        }
      } catch (e: any) {
        if (!done) { setState('error'); setMessage(e.message || 'Wystąpił błąd.'); }
      }
    })();
    return () => { done = true; };
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4">
      <Card className="max-w-sm w-full shadow-lg border-0">
        <CardContent className="py-10 text-center space-y-4">
          {state === 'loading' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Potwierdzanie zmiany…</p>
            </>
          )}
          {state === 'ok' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
              <h1 className="text-lg font-bold">Numer konta zmieniony</h1>
              <p className="text-sm text-muted-foreground">{message} Od teraz przelewy pójdą na nowy numer.</p>
            </>
          )}
          {state === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <h1 className="text-lg font-bold">Nie udało się</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </>
          )}
          <p className="text-xs text-muted-foreground pt-2">GetRido</p>
        </CardContent>
      </Card>
    </div>
  );
}
