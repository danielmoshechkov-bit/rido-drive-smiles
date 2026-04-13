const SUPABASE_URL = 'https://wclrrytmrscqvsyxyvnn.supabase.co';

/**
 * Rewrite broken getrido.pl/crm-import photo URLs to use foto-proxy edge function.
 * The PHP import cached photos on the server, but SPA routing now intercepts those paths.
 */
export function rewritePhotoUrl(url: string): string {
  if (!url) return '/placeholder.svg';
  const match = url.match(/getrido\.pl\/crm-import\/[^/]+\/foto\/(\d+\.\w+)/);
  if (match) {
    return `${SUPABASE_URL}/functions/v1/foto-proxy?f=${match[1]}`;
  }
  return url;
}
