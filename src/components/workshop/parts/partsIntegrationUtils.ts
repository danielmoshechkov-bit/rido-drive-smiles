export function hasAutoPartnerCredentials(integration: any): boolean {
  const extra = integration?.api_extra_json || {};
  return Boolean(extra.clientCode && extra.wsPassword && extra.clientPassword);
}

export function hasHartCredentials(integration: any): boolean {
  return Boolean(integration?.api_username && integration?.api_password);
}

export function isPartsIntegrationConfigured(integration: any): boolean {
  if (!integration?.is_enabled) return false;

  switch (integration?.supplier_code) {
    case 'auto_partner':
      return hasAutoPartnerCredentials(integration);
    case 'hart':
    default:
      return hasHartCredentials(integration);
  }
}

export function getConfiguredPartsIntegrations<T = any>(integrations: T[]): T[] {
  return (integrations || []).filter((integration) => isPartsIntegrationConfigured(integration));
}