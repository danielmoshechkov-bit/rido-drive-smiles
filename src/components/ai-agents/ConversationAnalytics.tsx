import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  Calendar, 
  TrendingUp, 
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ConversationAnalyticsProps {
  configId: string;
}

interface CallStats {
  totalCalls: number;
  completedCalls: number;
  bookedAppointments: number;
  avgDuration: number;
  successRate: number;
}

interface RecentCall {
  id: string;
  started_at: string;
  duration_seconds: number;
  outcome: string;
  sentiment: string;
}

export function ConversationAnalytics({ configId }: ConversationAnalyticsProps) {
  const [stats, setStats] = useState<CallStats>({
    totalCalls: 0,
    completedCalls: 0,
    bookedAppointments: 0,
    avgDuration: 0,
    successRate: 0,
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [configId]);

  const loadAnalytics = async () => {
    // Load call statistics
    const { data: calls } = await supabase
      .from('ai_agent_calls')
      .select('*')
      .eq('config_id', configId);

    if (calls) {
      const completed = calls.filter(c => c.call_status === 'completed');
      const booked = calls.filter(c => c.outcome === 'booked');
      const totalDuration = completed.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);

      setStats({
        totalCalls: calls.length,
        completedCalls: completed.length,
        bookedAppointments: booked.length,
        avgDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
        successRate: calls.length > 0 ? Math.round((booked.length / calls.length) * 100) : 0,
      });

      // Get recent calls
      setRecentCalls(
        calls
          .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
          .slice(0, 5)
          .map(c => ({
            id: c.id,
            started_at: c.started_at || '',
            duration_seconds: c.duration_seconds || 0,
            outcome: c.outcome || 'unknown',
            sentiment: c.sentiment || 'neutral',
          }))
      );
    }

    setLoading(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'booked':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Badge className="bg-green-100 text-green-700">Pozytywny</Badge>;
      case 'negative':
        return <Badge className="bg-red-100 text-red-700">Negatywny</Badge>;
      default:
        return <Badge variant="secondary">Neutralny</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="grid md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCalls}</p>
                <p className="text-xs text-muted-foreground">Wszystkie połączenia</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.bookedAppointments}</p>
                <p className="text-xs text-muted-foreground">Umówione wizyty</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</p>
                <p className="text-xs text-muted-foreground">Śr. czas rozmowy</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.successRate}%</p>
                <p className="text-xs text-muted-foreground">Skuteczność</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ostatnie rozmowy</CardTitle>
          <CardDescription>Historia połączeń AI agenta</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Brak zarejestrowanych rozmów
            </p>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div 
                  key={call.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getOutcomeIcon(call.outcome)}
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(call.started_at).toLocaleDateString('pl-PL', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Czas: {formatDuration(call.duration_seconds)}
                      </p>
                    </div>
                  </div>
                  {getSentimentBadge(call.sentiment)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
