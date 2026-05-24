import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, MessageCircle, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  variant?: 'large' | 'compact' | 'minimal';
  onConnect?: () => void;
}

type Status = 'idle' | 'waiting' | 'connected';

interface ConnectionRow {
  is_active: boolean;
  telegram_username: string | null;
  telegram_first_name: string | null;
}

export function TelegramConnectButton({ variant = 'compact', onConnect }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [link, setLink] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const timeoutRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load current connection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoadingInitial(false);
        return;
      }
      const { data } = await supabase
        .from('telegram_connections')
        .select('is_active,telegram_username,telegram_first_name')
        .eq('user_id', u.user.id)
        .maybeSingle();
      if (!cancelled) {
        if (data?.is_active) {
          setConnection(data);
          setStatus('connected');
        }
        setLoadingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  const handleConnect = async () => {
    toast.info('Integracja Telegram jest w trakcie konfiguracji. Preferencje możesz zapisać teraz — kanał aktywujemy po wdrożeniu backendu.', {
      duration: 5000,
    });
  };

  const handleDisconnect = async () => {
    const { error } = await supabase.rpc('disconnect_telegram');
    if (error) {
      toast.error('Błąd rozłączania: ' + error.message);
      return;
    }
    setConnection(null);
    setStatus('idle');
    toast.success('Rozłączono Telegram');
  };

  if (loadingInitial) {
    return (
      <Button variant="outline" disabled size={variant === 'large' ? 'default' : 'sm'}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (status === 'connected' && connection) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            Połączono {connection.telegram_username ? `@${connection.telegram_username}` : connection.telegram_first_name || ''}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDisconnect}>
          <XCircle className="h-4 w-4 mr-1" /> Rozłącz
        </Button>
      </div>
    );
  }

  const btnSize = variant === 'large' ? 'lg' : variant === 'minimal' ? 'sm' : 'default';

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size={btnSize as any}
              variant="outline"
              onClick={handleConnect}
              className="gap-2 border-primary text-primary hover:bg-primary/10"
            >
              <MessageCircle className="h-4 w-4" />
              {variant === 'minimal' ? 'Telegram' : 'Połącz z Telegram'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Wkrótce dostępne — backend Telegram jest w trakcie konfiguracji</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            cleanup();
            if (status !== 'connected') setStatus('idle');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Czekam na połączenie z Telegram</DialogTitle>
            <DialogDescription>
              Otwórz Telegram i kliknij <strong>START</strong> w czacie z botem. Po połączeniu okno zamknie się automatycznie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            {link && (
              <div className="space-y-2">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-primary underline break-all"
                >
                  Otwórz ponownie link
                </a>
                {/* QR code via free public API (graceful fallback) */}
                <div className="flex justify-center pt-2">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`}
                    alt="QR Telegram"
                    width={180}
                    height={180}
                    className="rounded-md border"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">Zeskanuj telefonem aby otworzyć w aplikacji</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
