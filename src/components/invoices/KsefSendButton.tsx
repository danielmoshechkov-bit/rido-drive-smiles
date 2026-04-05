import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface KsefSendButtonProps {
  invoiceId: string;
  size?: 'sm' | 'default';
  onStatusChange?: () => void;
}

interface InvoiceKsefSnapshot {
  ksef_status: string | null;
  ksef_reference: string | null;
  ksef_invoice_ref: string | null;
  ksef_session_ref: string | null;
}

export function KsefSendButton({ invoiceId, size = 'sm', onStatusChange }: KsefSendButtonProps) {
  const [ksefStatus, setKsefStatus] = useState<string | null>(null);
  const [ksefReference, setKsefReference] = useState<string | null>(null);
  const [sessionRef, setSessionRef] = useState<string | null>(null);
  const [invoiceRef, setInvoiceRef] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function syncSnapshot(
    snapshot: Partial<InvoiceKsefSnapshot> & {
      status?: string | null;
      session_ref?: string | null;
      invoice_ref?: string | null;
    },
    notifyParent = false,
  ) {
    const nextReference = snapshot.ksef_reference || null;
    const nextStatus = nextReference ? 'accepted' : (snapshot.status ?? snapshot.ksef_status ?? null);
    const nextSessionRef = snapshot.session_ref ?? snapshot.ksef_session_ref ?? null;
    const nextInvoiceRef = snapshot.invoice_ref ?? snapshot.ksef_invoice_ref ?? null;

    setKsefStatus(nextStatus);
    setKsefReference(nextReference);
    setSessionRef(nextSessionRef);
    setInvoiceRef(nextInvoiceRef);

    if (nextStatus === 'processing' || nextStatus === 'sent') {
      setPollingTimedOut(false);
      startPolling(nextSessionRef, nextInvoiceRef);
    } else {
      clearPolling();
      setPollingTimedOut(false);
    }

    if (notifyParent) {
      onStatusChange?.();
    }
  }

  async function fetchCurrentStatusFromDb(): Promise<InvoiceKsefSnapshot | null> {
    const { data, error } = await (supabase.from('user_invoices') as any)
      .select('ksef_status, ksef_reference, ksef_invoice_ref, ksef_session_ref')
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) throw error;
    return (data || null) as InvoiceKsefSnapshot | null;
  }

  async function loadKsefStatus(notifyParent = false) {
    setLoading(true);
    try {
      const data = await fetchCurrentStatusFromDb();

      if (data) {
        syncSnapshot(data, notifyParent);

        const effectiveStatus = data.ksef_reference ? 'accepted' : (data.ksef_status || null);
        if ((effectiveStatus === 'processing' || effectiveStatus === 'sent') && !data.ksef_session_ref && !data.ksef_invoice_ref) {
          const { data: tx } = await (supabase.from('ksef_transmissions') as any)
            .select('ksef_reference_number, ksef_invoice_ref')
            .eq('invoice_id', invoiceId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (tx?.ksef_reference_number || tx?.ksef_invoice_ref) {
            syncSnapshot(
              {
                status: effectiveStatus,
                ksef_reference: data.ksef_reference,
                session_ref: tx?.ksef_reference_number || null,
                invoice_ref: tx?.ksef_invoice_ref || null,
              },
              notifyParent,
            );
          }
        }
      }

      return data;
    } catch (err) {
      console.error('Error loading KSeF status:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function startPolling(sRef?: string | null, iRef?: string | null) {
    clearPolling();
    setPollingTimedOut(false);

    let attempts = 0;
    const maxAttempts = 12;

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearPolling();
        setPollingTimedOut(true);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('ksef-integration', {
          body: {
            action: 'check_status',
            session_ref: sRef ?? null,
            invoice_ref: iRef ?? null,
            invoice_id: invoiceId,
          },
        });

        if (error) {
          return;
        }

        if (data?.status === 'accepted') {
          syncSnapshot(data, true);
          toast.success('Faktura zaakceptowana przez KSeF' + (data.ksef_reference ? `: ${data.ksef_reference}` : ''));
        } else if (data?.status === 'rejected') {
          syncSnapshot(data, true);
          toast.error('Faktura odrzucona przez KSeF: ' + (data.error || ''));
        }
      } catch {
        // ignore transient polling errors
      }
    }, 5000);
  }

  useEffect(() => {
    void loadKsefStatus();

    const channel = supabase
      .channel(`invoice-ksef-status-${invoiceId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_invoices',
          filter: `id=eq.${invoiceId}`,
        },
        (payload) => {
          syncSnapshot(payload.new as any, true);
        },
      )
      .subscribe();

    return () => {
      clearPolling();
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const handleSendToKsef = async () => {
    setSending(true);

    try {
      const freshInvoice = await fetchCurrentStatusFromDb();
      const freshStatus = freshInvoice?.ksef_reference ? 'accepted' : (freshInvoice?.ksef_status || null);

      if (freshStatus === 'accepted') {
        syncSnapshot(freshInvoice || {}, true);
        toast.success('Faktura jest już zaakceptowana przez KSeF');
        return;
      }

      if (freshStatus === 'processing' || freshStatus === 'sent') {
        syncSnapshot(freshInvoice || {}, true);
        toast.success('Faktura jest już przetwarzana przez KSeF');
        return;
      }

      setKsefStatus('processing');

      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'send', invoice_id: invoiceId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Błąd wysyłania do KSeF');

      if (data.status === 'accepted' && data.ksef_reference) {
        syncSnapshot(data, true);
        toast.success('Faktura zaakceptowana przez KSeF' + (data.ksef_reference ? `: ${data.ksef_reference}` : ''));
        return;
      }

      if (data.status === 'processing' || data.status === 'sent') {
        syncSnapshot(data, true);
        toast.success(data.message || 'Faktura wysłana do KSeF');
        return;
      }

      await loadKsefStatus(true);
      toast.success(data.message || 'Faktura wysłana do KSeF');
    } catch (err: any) {
      console.error('Error sending to KSeF:', err);

      const recoveredInvoice = await fetchCurrentStatusFromDb().catch(() => null);
      const recoveredStatus = recoveredInvoice?.ksef_reference ? 'accepted' : (recoveredInvoice?.ksef_status || null);

      if (recoveredStatus === 'accepted') {
        syncSnapshot(recoveredInvoice || {}, true);
        toast.success('Faktura jest już zaakceptowana przez KSeF');
        return;
      }

      if (recoveredStatus === 'processing' || recoveredStatus === 'sent') {
        syncSnapshot(recoveredInvoice || {}, true);
        toast.success('Faktura jest już przetwarzana przez KSeF');
        return;
      }

      toast.error('Błąd wysyłania do KSeF: ' + (err.message || ''));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Button size={size} variant="outline" disabled>
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        KSeF
      </Button>
    );
  }

  if (sending) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ⏳ Wysyłanie do KSeF...
      </Badge>
    );
  }

  if (ksefStatus === 'accepted') {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
        <CheckCircle className="h-3 w-3 mr-1" />
        ✅ Wysłano
      </Badge>
    );
  }

  if (ksefStatus === 'processing' || ksefStatus === 'sent') {
    if (pollingTimedOut) {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            <Clock className="h-3 w-3 mr-1" />
            KSeF przetwarza — sprawdź za chwilę
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setPollingTimedOut(false);
              startPolling(sessionRef, invoiceRef);
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Sprawdź status
          </Button>
        </div>
      );
    }

    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
        <Clock className="h-3 w-3 mr-1 animate-pulse" />
        ⏳ Przetwarzanie przez KSeF...
      </Badge>
    );
  }

  if (ksefStatus === 'rejected') {
    return (
      <Button
        size={size}
        variant="outline"
        className="text-destructive hover:bg-destructive/10"
        onClick={handleSendToKsef}
      >
        <RefreshCw className="h-4 w-4 mr-1" />
        ❌ Ponów KSeF
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant="outline"
      className="text-primary hover:bg-primary/10"
      onClick={handleSendToKsef}
    >
      <Send className="h-4 w-4 mr-1" />
      Wyślij do KSeF
    </Button>
  );
}
