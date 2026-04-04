import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface KsefSendButtonProps {
  invoiceId: string;
  size?: 'sm' | 'default';
  onStatusChange?: () => void;
}

export function KsefSendButton({ invoiceId, size = 'sm', onStatusChange }: KsefSendButtonProps) {
  const [ksefStatus, setKsefStatus] = useState<string | null>(null);
  const [ksefReference, setKsefReference] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKsefStatus();
  }, [invoiceId]);

  const loadKsefStatus = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_invoices')
        .select('ksef_status, ksef_reference')
        .eq('id', invoiceId)
        .single();

      if (data) {
        setKsefStatus(data.ksef_status || null);
        setKsefReference(data.ksef_reference || null);
      }
    } catch (err) {
      console.error('Error loading KSeF status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToKsef = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'send', invoice_id: invoiceId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Błąd wysyłania do KSeF');

      toast.success('Faktura wysłana do KSeF');
      setKsefStatus('accepted');
      setKsefReference(data.ksef_reference || null);
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
          W KSeF
        </Badge>
        {ksefReference && (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={ksefReference}>
            {ksefReference}
          </span>
        )}
      </div>
    );
  }

  if (ksefStatus === 'sent' || ksefStatus === 'processing' || sending) {
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
        Ponów KSeF
      </Button>
    );
  }

  // Default - not sent
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
