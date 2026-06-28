import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { FLEET_NAV_ITEMS } from '@/components/fleet-modules/fleetNavConfig';

/**
 * „Wybierz moduł" dla floty — toggle widoczności modułów opcjonalnych na pasku.
 * Zapis do fleet_nav_preferences.hidden_tabs (per-użytkownik). Core zawsze widoczne.
 */
export function FleetModulePicker() {
  const sb = supabase as any;
  const [userId, setUserId] = useState<string | undefined>();
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id);
      if (user) { const { data } = await sb.from('fleet_nav_preferences').select('hidden_tabs').eq('user_id', user.id).maybeSingle(); setHidden(Array.isArray(data?.hidden_tabs) ? data.hidden_tabs : []); }
      setLoading(false);
    })();
  }, [sb]);

  const toggle = async (key: string, visible: boolean) => {
    if (!userId) return;
    const next = visible ? hidden.filter(h => h !== key) : [...new Set([...hidden, key])];
    setHidden(next); setSaving(true);
    try { await sb.from('fleet_nav_preferences').upsert({ user_id: userId, hidden_tabs: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); }
    catch (e: any) { toast.error(e.message || 'Błąd'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-lg font-semibold flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /> Wybierz moduł {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</h2>
      <p className="text-sm text-muted-foreground">Włącz/wyłącz moduły na pasku. Moduły podstawowe są zawsze widoczne.</p>
      <Card><CardContent className="py-3 space-y-1">
        {FLEET_NAV_ITEMS.map(item => (
          <div key={item.key} className="flex items-center gap-3 border-b py-2 text-sm">
            <span className="flex-1">{item.label}</span>
            {item.core
              ? <span className="text-xs text-muted-foreground">podstawowy (zawsze)</span>
              : <Switch checked={!hidden.includes(item.key)} onCheckedChange={(v) => toggle(item.key, v)} />}
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
