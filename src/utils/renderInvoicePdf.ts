import { supabase } from '@/integrations/supabase/client';

// Render faktury (HTML) -> base64 PDF przez serwerowy renderer (real Chrome / tryb druku),
// żeby PDF z maila i z „Pobierz" wyglądały IDENTYCZNIE jak portal. Zwraca null, gdy
// renderer niedostępny — wtedy wołający robi fallback (html2canvas / window.print).
export async function renderInvoicePdf(html: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('render-invoice-pdf', { body: { html } });
    if (error || !(data as any)?.pdf_base64) return null;
    return (data as any).pdf_base64 as string;
  } catch {
    return null;
  }
}
