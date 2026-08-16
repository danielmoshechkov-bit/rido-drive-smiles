import { DoladowanieModal } from '@/components/billing/DoladowanieModal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Zostaje w interfejsie dla zgodności z siedmioma miejscami wywołania, ale
   * NIE JEST używany. Doładowanie idzie przez `billing-payu-order`, a nie
   * przez handler w przeglądarce — poprzedni handler dopisywał SMS-y wprost
   * do salda bez pobrania płatności.
   */
  onPurchase?: (count: number, priceNet: number) => void;
}

/** Zachowane dla zgodności — cena jest teraz w `billing_addon_products`. */
export const PRICE_PER_SMS = 0.20;

/**
 * Cienka nakładka na wspólny suwak doładowań. Osobny plik zostaje, żeby nie
 * przepisywać wszystkich miejsc, które go importują.
 */
export function SmsPurchaseModal({ open, onOpenChange }: Props) {
  return (
    <DoladowanieModal
      open={open}
      onOpenChange={onOpenChange}
      productCode="sms"
      tytul="Dokup SMS-y"
      jednostka="wiadomości SMS"
    />
  );
}
