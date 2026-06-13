export type ServiceProviderNavTabKey =
  | 'dashboard'
  | 'services'
  | 'workshop'
  | 'accounting'
  | 'calendar'
  | 'leads'
  | 'ads'
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
  'leads',
  'ads',
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
  'leads',
  'account',
];

export const SERVICE_PROVIDER_TAB_LABELS: Record<ServiceProviderNavTabKey, string> = {
  dashboard: 'Pulpit',
  services: 'Moje usługi',
  workshop: 'Warsztat & Auto',
  accounting: 'Księgowość',
  calendar: 'Kalendarz',
  leads: 'Leady',
  ads: 'Reklamy',
  'ai-agent': 'AI Agenci',
  account: 'Wybierz moduł',
  workspace: 'Workspace',
  website: 'Strona WWW',
  settings: 'Ustawienia',
};


export const SERVICE_PROVIDER_TAB_LABEL_KEYS: Record<ServiceProviderNavTabKey, string> = {
  dashboard: 'sp.tabs.dashboard',
  services: 'sp.tabs.services',
  workshop: 'sp.tabs.workshop',
  accounting: 'sp.tabs.accounting',
  calendar: 'sp.tabs.calendar',
  leads: 'sp.tabs.leads',
  ads: 'sp.tabs.ads',
  'ai-agent': 'sp.tabs.aiAgent',
  account: 'sp.tabs.selectModule',
  workspace: 'sp.tabs.workspace',
  website: 'sp.tabs.website',
  settings: 'sp.tabs.settings',
};
