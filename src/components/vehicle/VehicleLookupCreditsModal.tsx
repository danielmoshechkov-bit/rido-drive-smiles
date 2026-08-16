import { DoladowanieModal } from '@/components/billing/DoladowanieModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Zostaje dla zgodności z siedmioma miejscami wywołania, ale NIE JEST
   * używany. Wcześniejszy handler dopisywał kredyty bez pobrania płatności
   * („simulate purchase, payment gateway integration later") i był dostępny
   * z każdego z tych ekranów.
   */
  // BEZ `onPurchase`. Każde z pięciu miejsc, które go podawało, dopisywało
  // jednostki do bazy bez pobrania pieniędzy albo udawało przekierowanie.
  // Zakup prowadzi wyłącznie przez `billing-payu-order`.
}

/** Zachowane dla zgodności — cena jest teraz w `billing_addon_products`. */
export const PRICE_PER_CREDIT = 1.70;

/** Cienka nakładka na wspólny suwak doładowań. */
export function VehicleLookupCreditsModal({ open, onOpenChange }: Props) {
  return (
    <DoladowanieModal
      open={open}
      onOpenChange={onOpenChange}
      productCode="vehicle_lookup"
      tytul="Dokup sprawdzenia pojazdu"
      jednostka="sprawdzeń pojazdu (VIN)"
    />
  );
}
