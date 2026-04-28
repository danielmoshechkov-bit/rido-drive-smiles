const SUPABASE_URL = 'https://wclrrytmrscqvsyxyvnn.supabase.co';

function buildProxyUrl(fileName: string, agency?: string, path?: string): string {
  const params = new URLSearchParams({ f: fileName });
  if (agency) params.set('agency', agency);
  if (path) params.set('p', path.replace(/^\/+/, ''));
  return `${SUPABASE_URL}/functions/v1/foto-proxy?${params.toString()}`;
}

/**
 * Rewrite broken getrido.pl/crm-import photo URLs to use foto-proxy edge function.
 * The PHP import cached photos on the server, but SPA routing now intercepts those paths.
 */
export function rewritePhotoUrl(url: string): string {
  if (!url) return '/placeholder.svg';
  if (url.includes('/functions/v1/foto-proxy') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  const crmMatch = url.match(/(?:https?:\/\/[^/]+\/)?(crm-import\/(agencja_[^/]+)\/foto\/([^/?#]+))/i);
  if (crmMatch) {
    return buildProxyUrl(decodeURIComponent(crmMatch[3]), crmMatch[2], crmMatch[1]);
  }

  const asariFileMatch = url.match(/(?:foto|cdn|k2)\.asari\.[^/]+\/(?:foto\/)?([^/?#]+\.(?:jpe?g|png|webp))/i);
  if (asariFileMatch) {
    return buildProxyUrl(decodeURIComponent(asariFileMatch[1]));
  }
  return url;
}
