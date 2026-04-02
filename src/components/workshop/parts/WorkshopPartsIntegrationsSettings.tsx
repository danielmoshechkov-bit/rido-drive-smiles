import { WholesalerIntegrationsSettings } from './WholesalerIntegrationsSettings';

interface Props {
  providerId: string;
}

export function WorkshopPartsIntegrationsSettings({ providerId }: Props) {
  return <WholesalerIntegrationsSettings providerId={providerId} />;
}
