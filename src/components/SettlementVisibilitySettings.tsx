import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const SettlementVisibilitySettings = () => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('settlement_visibility_settings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    
    if (error) {
      console.error('Error loading visibility settings:', error);
      toast.error('Błąd ładowania ustawień');
      return;
    }
    
    setSettings(data);
    setLoading(false);
  };
  
  const updateSetting = async (field: string, value: boolean | string) => {
    if (!settings?.id) return;
    
    const { error } = await supabase
      .from('settlement_visibility_settings')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', settings.id);
    
    if (error) {
      console.error('Error updating setting:', error);
      toast.error('Błąd zapisu');
      return;
    }
    
    toast.success('Ustawienia zapisane');
    loadSettings();
  };
  
  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Ładowanie...</div>;
  }
  
  if (!settings) {
    return <div className="p-8 text-center text-muted-foreground">Brak ustawień</div>;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Widoczność danych dla kierowców</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ustaw, które pola z rozliczeń mają być widoczne dla kierowców w ich panelu.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* UBER */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Uber</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_uber" className="cursor-pointer">Uber (łącznie)</Label>
              <Switch 
                id="show_uber"
                checked={settings.show_uber} 
                onCheckedChange={(v) => updateSetting('show_uber', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_uber_cashless" className="cursor-pointer">Uber bezgotówka</Label>
              <Switch 
                id="show_uber_cashless"
                checked={settings.show_uber_cashless} 
                onCheckedChange={(v) => updateSetting('show_uber_cashless', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_uber_cash" className="cursor-pointer">Uber gotówka</Label>
              <Switch 
                id="show_uber_cash"
                checked={settings.show_uber_cash} 
                onCheckedChange={(v) => updateSetting('show_uber_cash', v)}
              />
            </div>
          </div>
          
          {/* BOLT */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Bolt</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_bolt_gross" className="cursor-pointer">Bolt brutto</Label>
              <Switch 
                id="show_bolt_gross"
                checked={settings.show_bolt_gross} 
                onCheckedChange={(v) => updateSetting('show_bolt_gross', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_bolt_net" className="cursor-pointer">Bolt netto</Label>
              <Switch 
                id="show_bolt_net"
                checked={settings.show_bolt_net} 
                onCheckedChange={(v) => updateSetting('show_bolt_net', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_bolt_commission" className="cursor-pointer">Bolt prowizja</Label>
              <Switch 
                id="show_bolt_commission"
                checked={settings.show_bolt_commission} 
                onCheckedChange={(v) => updateSetting('show_bolt_commission', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_bolt_cash" className="cursor-pointer">Bolt gotówka</Label>
              <Switch 
                id="show_bolt_cash"
                checked={settings.show_bolt_cash} 
                onCheckedChange={(v) => updateSetting('show_bolt_cash', v)}
              />
            </div>
          </div>
          
          {/* FREENOW */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">FreeNow</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_freenow_gross" className="cursor-pointer">FreeNow brutto</Label>
              <Switch 
                id="show_freenow_gross"
                checked={settings.show_freenow_gross} 
                onCheckedChange={(v) => updateSetting('show_freenow_gross', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_freenow_net" className="cursor-pointer">FreeNow netto</Label>
              <Switch 
                id="show_freenow_net"
                checked={settings.show_freenow_net} 
                onCheckedChange={(v) => updateSetting('show_freenow_net', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_freenow_commission" className="cursor-pointer">FreeNow prowizja</Label>
              <Switch 
                id="show_freenow_commission"
                checked={settings.show_freenow_commission} 
                onCheckedChange={(v) => updateSetting('show_freenow_commission', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_freenow_cash" className="cursor-pointer">FreeNow gotówka</Label>
              <Switch 
                id="show_freenow_cash"
                checked={settings.show_freenow_cash} 
                onCheckedChange={(v) => updateSetting('show_freenow_cash', v)}
              />
            </div>
          </div>
          
          {/* INNE */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Podsumowanie</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_total_cash" className="cursor-pointer">Razem gotówka</Label>
              <Switch 
                id="show_total_cash"
                checked={settings.show_total_cash} 
                onCheckedChange={(v) => updateSetting('show_total_cash', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_total_commission" className="cursor-pointer">Razem prowizja</Label>
              <Switch 
                id="show_total_commission"
                checked={settings.show_total_commission} 
                onCheckedChange={(v) => updateSetting('show_total_commission', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_tax" className="cursor-pointer">Podatek 8%/49</Label>
              <Switch 
                id="show_tax"
                checked={settings.show_tax} 
                onCheckedChange={(v) => updateSetting('show_tax', v)}
              />
            </div>
          </div>
          
          {/* PALIWO */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Paliwo</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_fuel" className="cursor-pointer">Paliwo</Label>
              <Switch 
                id="show_fuel"
                checked={settings.show_fuel} 
                onCheckedChange={(v) => updateSetting('show_fuel', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_fuel_vat" className="cursor-pointer">VAT z paliwa</Label>
              <Switch 
                id="show_fuel_vat"
                checked={settings.show_fuel_vat} 
                onCheckedChange={(v) => updateSetting('show_fuel_vat', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show_fuel_vat_refund" className="cursor-pointer">Zwrot VAT</Label>
              <Switch 
                id="show_fuel_vat_refund"
                checked={settings.show_fuel_vat_refund} 
                onCheckedChange={(v) => updateSetting('show_fuel_vat_refund', v)}
              />
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-3">
          <div>
            <Label htmlFor="payout_formula">Formuła wypłaty dla kierowcy</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Użyj nazw pól: uberCashless, boltNet, freenowNet, fuel, fuelVATRefund. Przykład: uberCashless + boltNet + freenowNet - fuel
            </p>
          </div>
          <Textarea 
            id="payout_formula"
            value={settings.payout_formula || ''} 
            onChange={(e) => setSettings({...settings, payout_formula: e.target.value})}
            placeholder="uberCashless + boltNet + freenowNet - fuel + fuelVATRefund"
            rows={3}
          />
          <Button 
            onClick={() => updateSetting('payout_formula', settings.payout_formula)}
            className="w-full"
          >
            Zapisz formułę
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};