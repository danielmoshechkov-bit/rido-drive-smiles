import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NotificationSettingsProps {
  userId: string;
}

export function NotificationSettings({ userId }: NotificationSettingsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [settlementNotifications, setSettlementNotifications] = useState(true);
  const [documentExpiryNotifications, setDocumentExpiryNotifications] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    // Check if push notifications are supported
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
    }
    
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading notification settings:', error);
      }

      if (data) {
        setPushEnabled(data.push_enabled ?? true);
        setSettlementNotifications(data.settlement_notifications ?? true);
        setDocumentExpiryNotifications(data.document_expiry_notifications ?? true);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          user_id: userId,
          push_enabled: pushEnabled,
          settlement_notifications: settlementNotifications,
          document_expiry_notifications: documentExpiryNotifications,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success(t('settings.saved') || 'Ustawienia zapisane');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error(t('settings.saveError') || 'Błąd zapisu ustawień');
    } finally {
      setSaving(false);
    }
  };

  const requestPushPermission = async () => {
    if (!pushSupported) {
      toast.error(t('notifications.notSupported') || 'Powiadomienia push nie są obsługiwane');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      
      if (permission === 'granted') {
        toast.success(t('notifications.enabled') || 'Powiadomienia włączone');
        setPushEnabled(true);
        await saveSettings();
      } else if (permission === 'denied') {
        toast.error(t('notifications.denied') || 'Powiadomienia zostały zablokowane');
        setPushEnabled(false);
      }
    } catch (err) {
      console.error('Error requesting push permission:', err);
      toast.error(t('notifications.error') || 'Błąd podczas włączania powiadomień');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          {t('notifications.settings') || 'Ustawienia powiadomień'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Push notification permission status */}
        {pushSupported && pushPermission !== 'granted' && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1">
                {t('notifications.notEnabled') || 'Powiadomienia nie są włączone'}
              </span>
              <Button 
                size="sm" 
                onClick={requestPushPermission}
                disabled={pushPermission === 'denied'}
              >
                {pushPermission === 'denied' 
                  ? (t('notifications.blocked') || 'Zablokowane')
                  : (t('notifications.enable') || 'Włącz')}
              </Button>
            </div>
            {pushPermission === 'denied' && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('notifications.unblockInstructions') || 'Aby odblokować, zmień ustawienia w przeglądarce'}
              </p>
            )}
          </div>
        )}

        {/* Settings toggles - compact layout */}
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Switch
              id="push-enabled"
              checked={pushEnabled}
              onCheckedChange={setPushEnabled}
              disabled={!pushSupported || pushPermission !== 'granted'}
            />
            <Label htmlFor="push-enabled" className="flex-1">
              <span className="text-sm">{t('notifications.pushEnabled') || 'Powiadomienia push'}</span>
            </Label>
          </div>

          <div className="flex items-center gap-4">
            <Switch
              id="settlement-notifications"
              checked={settlementNotifications}
              onCheckedChange={setSettlementNotifications}
              disabled={!pushEnabled}
            />
            <Label htmlFor="settlement-notifications" className="flex-1">
              <span className="text-sm">{t('notifications.settlements') || 'Rozliczenia'}</span>
            </Label>
          </div>

          <div className="flex items-center gap-4">
            <Switch
              id="document-expiry"
              checked={documentExpiryNotifications}
              onCheckedChange={setDocumentExpiryNotifications}
              disabled={!pushEnabled}
            />
            <Label htmlFor="document-expiry" className="flex-1">
              <span className="text-sm">{t('notifications.documentExpiry') || 'Dokumenty'}</span>
            </Label>
          </div>
        </div>

        <Button 
          onClick={saveSettings} 
          disabled={saving}
          size="sm"
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('common.saving') || 'Zapisywanie...'}
            </>
          ) : (
            t('common.save') || 'Zapisz'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
