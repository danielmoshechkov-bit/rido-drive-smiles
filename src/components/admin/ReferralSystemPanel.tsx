import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Users, AlertTriangle, CheckCircle, XCircle, 
  Settings, BarChart3, RefreshCw, Eye, Coins
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface ReferralSettings {
  id: string;
  is_enabled: boolean;
  coins_per_referral: number;
  max_referrals_per_day: number;
  suspicious_same_ip_threshold: number;
  min_days_before_payout: number;
}

interface ReferralAlert {
  id: string;
  referral_code_id: string | null;
  alert_type: string;
  description: string | null;
  details: any;
  is_reviewed: boolean;
  created_at: string;
}

interface ReferralStats {
  total_codes: number;
  total_uses: number;
  total_coins_awarded: number;
  pending_uses: number;
  suspicious_uses: number;
}

export function ReferralSystemPanel() {
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [alerts, setAlerts] = useState<ReferralAlert[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load settings
      const { data: settingsData } = await supabase
        .from('referral_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settingsData) {
        setSettings(settingsData as ReferralSettings);
      }

      // Load alerts
      const { data: alertsData } = await supabase
        .from('referral_alerts')
        .select('*')
        .eq('is_reviewed', false)
        .order('created_at', { ascending: false })
        .limit(20);

      setAlerts((alertsData as ReferralAlert[]) || []);

      // Load stats
      const { data: codesData } = await supabase
        .from('referral_codes')
        .select('id, uses_count, total_earnings');

      const { data: usesData } = await supabase
        .from('referral_uses')
        .select('status, coins_awarded');

      if (codesData && usesData) {
        const totalCoins = (usesData as any[]).reduce((sum, u) => sum + (u.coins_awarded || 0), 0);
        const pending = (usesData as any[]).filter(u => u.status === 'pending').length;
        const suspicious = (usesData as any[]).filter(u => u.status === 'suspicious').length;

        setStats({
          total_codes: codesData.length,
          total_uses: usesData.length,
          total_coins_awarded: totalCoins,
          pending_uses: pending,
          suspicious_uses: suspicious
        });
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
      toast.error('Błąd ładowania danych');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSystem = async (enabled: boolean) => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('referral_settings')
        .update({ is_enabled: enabled })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings({ ...settings, is_enabled: enabled });
      toast.success(enabled ? 'System poleceń włączony' : 'System poleceń wyłączony');
    } catch (error) {
      console.error('Error toggling system:', error);
      toast.error('Błąd zmiany ustawień');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('referral_settings')
        .update({
          coins_per_referral: settings.coins_per_referral,
          max_referrals_per_day: settings.max_referrals_per_day,
          suspicious_same_ip_threshold: settings.suspicious_same_ip_threshold,
          min_days_before_payout: settings.min_days_before_payout
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Ustawienia zapisane');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Błąd zapisywania ustawień');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewAlert = async (alertId: string, approve: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('referral_alerts')
        .update({ 
          is_reviewed: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success(approve ? 'Alert zaakceptowany' : 'Alert odrzucony');
    } catch (error) {
      console.error('Error reviewing alert:', error);
      toast.error('Błąd przeglądania alertu');
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      same_ip: 'Ten sam IP',
      same_fleet: 'Ta sama flota',
      high_volume: 'Wysoki wolumen',
      pattern_detected: 'Wykryty wzorzec'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Toggle Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                System Poleceń
              </CardTitle>
              <CardDescription>
                Zarządzaj systemem kodów polecających i nagród
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {settings?.is_enabled ? 'Włączony' : 'Wyłączony'}
              </span>
              <Switch
                checked={settings?.is_enabled || false}
                onCheckedChange={handleToggleSystem}
                disabled={saving}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{stats.total_codes}</p>
              <p className="text-xs text-muted-foreground">Aktywne kody</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{stats.total_uses}</p>
              <p className="text-xs text-muted-foreground">Użycia razem</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Coins className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">{stats.total_coins_awarded}</p>
              <p className="text-xs text-muted-foreground">Rozdane monety</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <RefreshCw className="h-6 w-6 mx-auto mb-2 text-orange-500" />
              <p className="text-2xl font-bold">{stats.pending_uses}</p>
              <p className="text-xs text-muted-foreground">Oczekujące</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold">{stats.suspicious_uses}</p>
              <p className="text-xs text-muted-foreground">Podejrzane</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Ustawienia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Monety za polecenie</Label>
              <Input
                type="number"
                value={settings?.coins_per_referral || 50}
                onChange={(e) => setSettings(prev => prev ? { ...prev, coins_per_referral: parseInt(e.target.value) || 0 } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max poleceń dziennie</Label>
              <Input
                type="number"
                value={settings?.max_referrals_per_day || 10}
                onChange={(e) => setSettings(prev => prev ? { ...prev, max_referrals_per_day: parseInt(e.target.value) || 0 } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Próg podejrzeń (IP)</Label>
              <Input
                type="number"
                value={settings?.suspicious_same_ip_threshold || 3}
                onChange={(e) => setSettings(prev => prev ? { ...prev, suspicious_same_ip_threshold: parseInt(e.target.value) || 0 } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Min dni do wypłaty</Label>
              <Input
                type="number"
                value={settings?.min_days_before_payout || 7}
                onChange={(e) => setSettings(prev => prev ? { ...prev, min_days_before_payout: parseInt(e.target.value) || 0 } : null)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Alerty podejrzeń
                {alerts.length > 0 && (
                  <Badge variant="destructive">{alerts.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Poleceń wymagających przeglądu
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Odśwież
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50 text-green-500" />
              <p>Brak alertów do przeglądu</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-orange-50/50"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getAlertTypeLabel(alert.alert_type)}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(alert.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{alert.description || 'Brak opisu'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleReviewAlert(alert.id, false)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Odrzuć
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleReviewAlert(alert.id, true)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Przeglądnięte
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}