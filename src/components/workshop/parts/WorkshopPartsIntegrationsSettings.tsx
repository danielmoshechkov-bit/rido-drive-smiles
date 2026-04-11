import { WholesalerIntegrationsSettings } from './WholesalerIntegrationsSettings';
import { IcCatalogSettings } from './IcCatalogSettings';

interface Props {
  providerId: string;
}

export function WorkshopPartsIntegrationsSettings({ providerId }: Props) {
  return (
    <div className="space-y-6">
      <WholesalerIntegrationsSettings providerId={providerId} />
      <IcCatalogSettings providerId={providerId} />
    </div>
  );
}
