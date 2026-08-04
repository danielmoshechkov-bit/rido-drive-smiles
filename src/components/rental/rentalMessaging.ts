import { supabase } from '@/integrations/supabase/client';
import { buildPublicUrl } from '@/lib/publicUrl';
import { toast } from 'sonner';

/**
 * Wysyłka SMS/e-mail dla wynajmu. DOMYŚLNIE dry-run (log zamiast realnej
 * wysyłki) — żeby testy lokalne nie generowały kosztów/realnych wiadomości.
 * Klient przeglądarkowy nie jest zaufanym miejscem do włączania wysyłki.
 * Realne wysyłki mogą wrócić wyłącznie przez serwerowy endpoint z autoryzacją,
 * tenantem, zgodami, limitami, audytem oraz idempotency key.
 */
export function getDryRun(): boolean {
  return true;
}
export function setDryRun(_v: boolean) {
  // Zachowanie zgodności API bez możliwości odblokowania produkcyjnej akcji
  // przez zmianę localStorage lub wywołanie funkcji z konsoli.
  localStorage.removeItem('rental_dry_run');
}

export async function sendRentalSms(phone: string, message: string): Promise<{ dryRun: boolean; ok: boolean }> {
  if (getDryRun()) {
    console.log('[DRY-RUN SMS]', phone, message);
    toast.info(`SMS (dry-run) → ${phone}`);
    return { dryRun: true, ok: true };
  }
  try {
    const { error } = await (supabase as any).functions.invoke('send-sms', { body: { phone, message, type: 'rental', sender: 'GetRido' } });
    if (error) throw error;
    toast.success(`SMS wysłany → ${phone}`);
    return { dryRun: false, ok: true };
  } catch (e: any) {
    toast.error('SMS: ' + (e.message || 'błąd (sprawdź konfigurację SMS firmy)'));
    return { dryRun: false, ok: false };
  }
}

export async function sendRentalEmail(to: string, subject: string, html: string): Promise<{ dryRun: boolean; ok: boolean }> {
  if (getDryRun()) {
    console.log('[DRY-RUN EMAIL]', to, subject);
    toast.info(`E-mail (dry-run) → ${to}`);
    return { dryRun: true, ok: true };
  }
  try {
    const { error } = await (supabase as any).functions.invoke('rido-mail', { body: { to, subject, html } });
    if (error) throw error;
    toast.success(`E-mail wysłany → ${to}`);
    return { dryRun: false, ok: true };
  } catch (e: any) {
    toast.error('E-mail: ' + (e.message || 'błąd (sprawdź konfigurację mail firmy)'));
    return { dryRun: false, ok: false };
  }
}

export function contractLink(token: string): string {
  return buildPublicUrl(`/wynajem/umowa/${token}`);
}
