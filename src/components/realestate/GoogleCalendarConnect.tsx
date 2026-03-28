import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Link2, Unlink, CheckCircle, Loader2, RefreshCw } from 'lucide-react';

interface GoogleCalendarConnectProps {
  agentId: string;
}

export function GoogleCalendarConnect({ agentId }: GoogleCalendarConnectProps) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
  }, [agentId]);

  const checkConnection = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('agent_calendar_tokens' as any)
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (data && (data as any).google_refresh_token) {
      setConnected(true);
      setCalendarId((data as any).google_calendar_id || 'primary');
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    
    // Google OAuth2 flow
    // In production, this would redirect to Google OAuth consent screen
    // For now, we'll show instructions
    const googleApiKey = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    if (!googleApiKey) {
      toast.info(
        'Integracja z Google Calendar wymaga konfiguracji Google OAuth. Skontaktuj się z administratorem.',
        { duration: 5000 }
      );
      setConnecting(false);
      return;
    }

    // OAuth2 redirect
    const redirectUri = `${window.location.origin}/nieruchomosci/agent/panel?tab=calendar-callback`;
    const scope = 'https://www.googleapis.com/auth/calendar';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleApiKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    const { error } = await supabase
      .from('agent_calendar_tokens' as any)
      .update({ 
        google_access_token: null, 
        google_refresh_token: null,
        token_expires_at: null,
      } as any)
      .eq('agent_id', agentId);

    if (error) {
      toast.error('Błąd odłączania kalendarza');
    } else {
      setConnected(false);
      setCalendarId(null);
      toast.success('Kalendarz Google odłączony');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Google Calendar
          {connected && <Badge variant="secondary" className="bg-green-100 text-green-700">Połączony</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Kalendarz zsynchronizowany: {calendarId}
            </div>
            <p className="text-xs text-muted-foreground">
              System automatycznie sprawdza Twoją dostępność i dodaje nowe oglądania do kalendarza.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={checkConnection} className="gap-1">
                <RefreshCw className="h-3 w-3" /> Odśwież
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1 text-destructive">
                <Unlink className="h-3 w-3" /> Odłącz
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Połącz swój Google Calendar, aby system automatycznie sprawdzał Twoją dostępność 
              i dodawał nowe terminy oglądań.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Automatyczna synchronizacja terminów</li>
              <li>Blokowanie zajętych slotów</li>
              <li>Nowe oglądania pojawiają się w Twoim kalendarzu</li>
            </ul>
            <Button onClick={handleConnect} disabled={connecting} className="gap-2 w-full">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Połącz Google Calendar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
