/**
 * Centralna definicja wszystkich typów powiadomień w GetRido.
 * Każdy typ może być wysłany przez 4 kanały: email, sms, telegram, app.
 * `critical: true` oznacza alert wysyłany ZAWSZE (omija ciszę nocną).
 */

export type NotificationChannel = 'email' | 'sms' | 'telegram' | 'app';

export interface NotificationType {
  key: string;
  label: string;
  description?: string;
  critical?: boolean;
  defaultChannels: NotificationChannel[];
}

export interface NotificationModule {
  key: 'warsztat' | 'real_estate' | 'vehicle' | 'marketplace' | 'fleet' | 'ksef';
  label: string;
  icon: string; // lucide icon name
  types: NotificationType[];
}

export const NOTIFICATION_MODULES: NotificationModule[] = [
  {
    key: 'warsztat',
    label: 'Warsztat',
    icon: 'Wrench',
    types: [
      { key: 'warsztat_new_order', label: 'Nowe zlecenie umówione', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_signature_acceptance', label: 'Klient podpisał przyjęcie', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_estimate_sent_to_client', label: 'Kosztorys wysłany do klienta', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_estimate_approved', label: 'Klient zaakceptował kosztorys', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_estimate_modified', label: 'Kosztorys zaktualizowany (do klienta)', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_estimate_modified_approved', label: 'Klient zaakceptował zmianę kosztorysu', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_vehicle_ready', label: 'Auto gotowe do odbioru (do klienta)', defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'warsztat_vehicle_picked_up', label: 'Klient odebrał auto', defaultChannels: ['telegram', 'app'] },
      { key: 'warsztat_invoice_sent', label: 'Faktura wysłana (do klienta)', defaultChannels: ['email', 'telegram'] },
      { key: 'warsztat_invoice_paid', label: 'Faktura opłacona', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'warsztat_appointment_reminder', label: 'Przypomnienie o wizycie (24h / 2h)', defaultChannels: ['sms', 'telegram'] },
      { key: 'warsztat_new_call', label: 'Nowe połączenie (AI Voice)', defaultChannels: ['telegram', 'app'] },
      { key: 'warsztat_missed_call', label: 'Przegapione – oddzwoń', critical: true, defaultChannels: ['sms', 'telegram', 'app'] },
    ],
  },
  {
    key: 'real_estate',
    label: 'Nieruchomości',
    icon: 'Home',
    types: [
      { key: 'real_estate_new_message', label: 'Nowa wiadomość od klienta', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_viewing_request', label: 'Klient umawia oglądanie', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_viewing_confirmed', label: 'Agent potwierdził termin (do klienta)', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_viewing_cancelled', label: 'Oglądanie odwołane', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_viewing_rescheduled', label: 'Oglądanie przełożone', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_viewing_reminder', label: 'Przypomnienie o oglądaniu (24h / 2h)', defaultChannels: ['sms', 'telegram'] },
      { key: 'real_estate_new_inquiry', label: 'Nowe zapytanie z formularza', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'real_estate_new_matching_offer', label: 'Nowa oferta w moich kryteriach', defaultChannels: ['telegram', 'app'] },
      { key: 'real_estate_price_changed', label: 'Cena obniżona w obserwowanym', defaultChannels: ['telegram', 'app'] },
    ],
  },
  {
    key: 'vehicle',
    label: 'Giełda (pojazdy)',
    icon: 'Car',
    types: [
      { key: 'vehicle_listing_liked', label: 'Ktoś polubił moje ogłoszenie', defaultChannels: ['app'] },
      { key: 'vehicle_new_message', label: 'Nowa wiadomość o ogłoszenie', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'vehicle_listing_expiring', label: 'Ogłoszenie wygasa za 7 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'vehicle_listing_expired', label: 'Ogłoszenie wygasło', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'vehicle_new_matching_offer', label: 'Pasująca oferta dla mnie', defaultChannels: ['telegram', 'app'] },
      { key: 'vehicle_price_changed', label: 'Zmiana ceny w obserwowanym', defaultChannels: ['telegram', 'app'] },
    ],
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    icon: 'Store',
    types: [
      { key: 'marketplace_listing_liked', label: 'Ktoś polubił moje ogłoszenie', defaultChannels: ['app'] },
      { key: 'marketplace_new_message', label: 'Nowa wiadomość', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'marketplace_listing_expiring', label: 'Ogłoszenie wygasa', defaultChannels: ['email', 'telegram', 'app'] },
    ],
  },
  {
    key: 'fleet',
    label: 'Flota / Pojazdy',
    icon: 'Truck',
    types: [
      { key: 'fleet_oc_30_days', label: 'OC wygasa za 30 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_oc_7_days', label: 'OC wygasa za 7 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_oc_today', label: 'OC wygasa DZIŚ', critical: true, defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'fleet_oc_expired', label: 'OC wygasło', critical: true, defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'fleet_inspection_30_days', label: 'Przegląd techniczny za 30 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_inspection_14_days', label: 'Przegląd techniczny za 14 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_inspection_today', label: 'Przegląd DZIŚ', critical: true, defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'fleet_service_due', label: 'Serwis okresowy', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_fleet_invitation', label: 'Zaproszenie do floty', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_fleet_accepted', label: 'Zaproszenie zaakceptowane', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'fleet_driver_added', label: 'Nowy kierowca dodany', defaultChannels: ['telegram', 'app'] },
    ],
  },
  {
    key: 'ksef',
    label: 'KSeF / Księgowość',
    icon: 'FileText',
    types: [
      { key: 'ksef_invoice_accepted', label: 'Faktura zaakceptowana w KSeF', defaultChannels: ['telegram', 'app'] },
      { key: 'ksef_invoice_rejected', label: 'Faktura odrzucona w KSeF', critical: true, defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'ksef_tax_reminder_7_days', label: 'Termin podatku za 7 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'ksef_tax_reminder_3_days', label: 'Termin podatku za 3 dni', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'ksef_tax_today', label: 'Termin podatku DZIŚ', critical: true, defaultChannels: ['email', 'sms', 'telegram', 'app'] },
      { key: 'ksef_zus_reminder', label: 'Przypomnienie o ZUS', defaultChannels: ['email', 'telegram', 'app'] },
      { key: 'ksef_vat_reminder', label: 'Przypomnienie o VAT', defaultChannels: ['email', 'telegram', 'app'] },
    ],
  },
];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  telegram: 'Telegram',
  app: 'Aplikacja',
};

export const ALL_CHANNELS: NotificationChannel[] = ['email', 'sms', 'telegram', 'app'];

/** Default prefs map { "<type>_<channel>": boolean } */
export function buildDefaultPrefs(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of NOTIFICATION_MODULES) {
    for (const t of m.types) {
      for (const c of ALL_CHANNELS) {
        out[`${t.key}_${c}`] = t.defaultChannels.includes(c);
      }
    }
  }
  return out;
}

export function prefKey(type: string, channel: NotificationChannel) {
  return `${type}_${channel}`;
}
