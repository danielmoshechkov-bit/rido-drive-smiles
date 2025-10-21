import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriverDocumentStatuses } from "./DriverDocumentStatuses";
import { PlatformIdEditor } from "./PlatformIdEditor";
import { Driver } from "@/hooks/useDrivers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Key, Copy } from "lucide-react";

interface DriverExpandedPanelProps {
  driver: Driver;
  onUpdate: () => void;
}

export function DriverExpandedPanel({ driver, onUpdate }: DriverExpandedPanelProps) {
  const platforms = ['uber', 'bolt', 'freenow'];
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  
  const getPlatformId = (platform: string) => {
    return driver.platform_ids?.find(p => p.platform === platform)?.platform_id || '';
  };

  const getBillingMethodDisplay = (method: string) => {
    switch (method) {
      case '39+8%':
        return { label: '39zł + 8%', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20' };
      case '159+0%':
        return { label: '159zł + 0%', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20' };
      default:
        return { label: method || '39zł + 8%', color: 'bg-gray-500/10 text-gray-700 border-gray-500/20' };
    }
  };

  const handleCreateAuthAccount = async () => {
    if (!driver.email) {
      toast.error('Kierowca nie ma adresu email');
      return;
    }

    const confirmed = confirm(
      `Czy na pewno chcesz utworzyć/zresetować konto Auth dla ${driver.first_name} ${driver.last_name}?\n\nEmail: ${driver.email}\n\nHasło zostanie wygenerowane automatycznie.`
    );

    if (!confirmed) return;

    setCreatingAccount(true);
    try {
      // Call edge function to reset/create password
      const { data, error } = await supabase.functions.invoke('reset-driver-password', {
        body: { email: driver.email }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Błąd podczas tworzenia konta');
      }

      setGeneratedPassword(data.password);
      
      if (data.action === 'created') {
        toast.success(`✅ Konto utworzone dla ${driver.email}`);
      } else {
        toast.success(`✅ Hasło zresetowane dla ${driver.email}`);
      }

      onUpdate();
    } catch (error) {
      console.error('Error creating auth account:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd podczas tworzenia konta');
    } finally {
      setCreatingAccount(false);
    }
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success('Hasło skopiowane do schowka');
    }
  };

  const billingDisplay = getBillingMethodDisplay(driver.billing_method || '39+8%');

  return (
    <Card className="mt-2 p-4 bg-muted/20 border-l-4 border-primary/20">
      {generatedPassword && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="font-semibold text-green-800 mb-1">Hasło tymczasowe wygenerowane:</p>
              <code className="text-lg font-mono bg-white px-3 py-2 rounded border">{generatedPassword}</code>
              <p className="text-sm text-green-700 mt-2">
                ⚠️ Kierowca będzie musiał zmienić hasło przy pierwszym logowaniu
              </p>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={copyPassword}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Kopiuj
            </Button>
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Button
              onClick={handleCreateAuthAccount}
              disabled={creatingAccount || !driver.email}
              className="w-full gap-2"
              variant="outline"
            >
              <Key className="h-4 w-4" />
              {creatingAccount ? 'Tworzenie...' : 'Utwórz konto Auth + hasło'}
            </Button>
            {!driver.email && (
              <p className="text-xs text-muted-foreground">
                Dodaj email kierowcy aby utworzyć konto
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h4 className="font-medium text-sm">ID Platform</h4>
            <div className="space-y-3">
              {platforms.map(platform => (
                <PlatformIdEditor
                  key={platform}
                  driverId={driver.id}
                  platform={platform}
                  currentId={getPlatformId(platform)}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Sposób rozliczenia</h4>
            <Badge className={billingDisplay.color} variant="outline">
              {billingDisplay.label}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <DriverDocumentStatuses documentStatuses={driver.document_statuses || []} />
          
          {driver.vehicle_assignment?.status === 'active' && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Status wynajmu</h4>
              <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                WYNAJMUJE
              </Badge>
              {driver.vehicle_assignment.fleet_name && (
                <p className="text-sm text-muted-foreground">
                  Flota: {driver.vehicle_assignment.fleet_name}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}