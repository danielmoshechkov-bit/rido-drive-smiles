import { useState, useEffect, useRef } from 'react';
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

export function KsefSendButton({ invoiceId, size = 'sm', onStatusChange }: KsefSendButtonProps) {
  const [ksefStatus, setKsefStatus] = useState<string | null>(null);
  const [ksefReference, setKsefReference] = useState<string | null>(null);
  const [sessionRef, setSessionRef] = useState<string | null>(null);
  const [invoiceRef, setInvoiceRef] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadKsefStatus();
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [invoiceId]);

  const loadKsefStatus = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_invoices')
        .select('ksef_status, ksef_reference, ksef_invoice_ref')
        .eq('id', invoiceId)
        .single();

      if (data) {
        setKsefStatus(data.ksef_status || null);
        setKsefReference(data.ksef_reference || null);
        setInvoiceRef((data as any).ksef_invoice_ref || null);
        if (data.ksef_status === 'processing' || data.ksef_status === 'sent') {
          const { data: tx } = await supabase
            .from('ksef_transmissions')
            .select('ksef_reference_number, ksef_invoice_ref')
            .eq('invoice_id', invoiceId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (tx?.ksef_reference_number) {
            setSessionRef(tx.ksef_reference_number);
            setInvoiceRef((tx as any).ksef_invoice_ref || null);
            startPolling(tx.ksef_reference_number, (tx as any).ksef_invoice_ref);
          }
        }
      }
    } catch (err) {
      console.error('Error loading KSeF status:', err);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (sRef: string, iRef?: string | null) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setPollingTimedOut(false);
    let attempts = 0;
    const maxAttempts = 12;
    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setPollingTimedOut(true);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke('ksef-integration', {
          body: { action: 'check_status', session_ref: sRef, invoice_ref: iRef || invoiceRef, invoice_id: invoiceId },
        });
        if (error) return;
        if (data?.status === 'accepted') {
          setKsefStatus('accepted');
          setKsefReference(data.ksef_reference || null);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast.success('Faktura zaakceptowana przez KSeF' + (data.ksef_reference ? `: ${data.ksef_reference}` : ''));
          onStatusChange?.();
        } else if (data?.status === 'rejected') {
          setKsefStatus('rejected');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast.error('Faktura odrzucona przez KSeF: ' + (data.error || ''));
          onStatusChange?.();
        }
      } catch { /* ignore polling errors */ }
    }, 5000);
  };

  const handleSendToKsef = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'send', invoice_id: invoiceId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Błąd wysyłania do KSeF');

      setKsefStatus('processing');
      if (data.session_ref) {
        setSessionRef(data.session_ref);
        setInvoiceRef(data.invoice_ref || null);
        startPolling(data.session_ref, data.invoice_ref);
      }
      toast.success(data.message || 'Faktura wysłana do KSeF');
      onStatusChange?.();
    } catch (err: any) {
      console.error('Error sending to KSeF:', err);
      toast.error('Błąd wysyłania do KSeF: ' + (err.message || ''));
      setKsefStatus('rejected');
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

  if (ksefStatus === 'accepted') {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          ✅ Wysłano
        </Badge>
        {ksefReference && (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={ksefReference}>
            {ksefReference}
          </span>
        )}
      </div>
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
              if (sessionRef) startPolling(sessionRef, invoiceRef);
              else loadKsefStatus();
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

  if (sending) {
    return (
      <Button size={size} variant="outline" disabled>
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        Wysyłanie...
      </Button>
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
