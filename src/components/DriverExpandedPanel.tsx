import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DriverDocumentStatuses } from "./DriverDocumentStatuses";
import { PlatformIdEditor } from "./PlatformIdEditor";
import { Driver } from "@/hooks/useDrivers";

interface DriverExpandedPanelProps {
  driver: Driver;
  onUpdate: () => void;
}

export function DriverExpandedPanel({ driver, onUpdate }: DriverExpandedPanelProps) {
  const platforms = ['uber', 'bolt', 'freenow'];
  
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

  const billingDisplay = getBillingMethodDisplay(driver.billing_method || '39+8%');

  return (
    <Card className="mt-2 p-4 bg-muted/20 border-l-4 border-primary/20">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
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