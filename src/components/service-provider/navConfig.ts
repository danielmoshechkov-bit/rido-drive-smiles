export type ServiceProviderNavTabKey =
  | 'dashboard'
  | 'services'
  | 'workshop'
  | 'accounting'
  | 'calendar'
  | 'ai-agent'
  | 'account'
  | 'workspace'
  | 'website'
  | 'settings';

export const SERVICE_PROVIDER_TAB_ORDER: ServiceProviderNavTabKey[] = [
  'dashboard',
  'services',
  'workshop',
  'accounting',
  'calendar',
  'ai-agent',
  'account',
  'workspace',
  'website',
  'settings',
];

export const DEFAULT_SERVICE_PROVIDER_PRIMARY_TABS: ServiceProviderNavTabKey[] = [
  'dashboard',
  'services',
  'workshop',
  'accounting',
  'calendar',
  'account',
];

export const SERVICE_PROVIDER_TAB_LABELS: Record<ServiceProviderNavTabKey, string> = {
  dashboard: 'Pulpit',
  services: 'Moje usługi',
  workshop: 'Warsztat & Auto',
  accounting: 'Księgowość',
  calendar: 'Kalendarz',
  'ai-agent': 'AI Agenci',
  account: 'Wybierz moduł',
  workspace: 'Workspace',
  website: 'Strona WWW',
  settings: 'Ustawienia',
};
