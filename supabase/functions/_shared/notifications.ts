/**
 * Universal notification dispatcher (shared by edge functions).
 *
 * Routes a single notification event to all channels (email/sms/telegram/app)
 * enabled in the user's notification_preferences, respecting quiet hours
 * (except for `critical: true` types).
 *
 * NOTE: This helper is *prepared infrastructure*. It is NOT yet wired into
 * existing edge functions. Future integration:
 *   import { sendNotification } from "../_shared/notifications.ts";
 *   await sendNotification(supabaseAdmin, userId, "warsztat_new_order", { orderId, ... });
 *
 * The telegram-notify edge function is NOT yet implemented; this helper will
 * silently log a `skipped_no_channel` entry for telegram until it exists.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type NotifChannel = 'email' | 'sms' | 'telegram' | 'app';

interface PrefsRow {
  prefs: Record<string, boolean>;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // 'HH:MM:SS'
  quiet_hours_end: string;
}

interface SendOptions {
  /** Override critical flag; bypasses quiet hours when true. */
  critical?: boolean;
  /** Localized message body / subject for non-telegram channels. */
  email?: { subject: string; html: string };
  sms?: { text: string };
  telegram?: { text: string; parse_mode?: 'HTML' | 'MarkdownV2' };
  /** App payload (deep link, title, body). */
  app?: { title: string; body: string; link?: string };
}

function isInQuietHours(start: string, end: string, now = new Date()): boolean {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Range crossing midnight (e.g. 20:00 -> 08:00)
  if (startMin > endMin) {
    return nowMin >= startMin || nowMin < endMin;
  }
  return nowMin >= startMin && nowMin < endMin;
}

async function logEntry(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  channel: NotifChannel,
  status: string,
  payload?: unknown,
  error?: string
) {
  await supabase.from('notification_log').insert({
    user_id: userId,
    notification_type: type,
    channel,
    status,
    payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
    error_message: error ?? null,
  });
}

export async function sendNotification(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  options: SendOptions = {}
): Promise<void> {
  const { data: prefsRow } = await supabase
    .from('notification_preferences')
    .select('prefs,quiet_hours_enabled,quiet_hours_start,quiet_hours_end')
    .eq('user_id', userId)
    .maybeSingle<PrefsRow>();

  const prefs = prefsRow?.prefs || {};
  const quietActive =
    !options.critical &&
    !!prefsRow?.quiet_hours_enabled &&
    isInQuietHours(prefsRow.quiet_hours_start || '20:00:00', prefsRow.quiet_hours_end || '08:00:00');

  const channels: NotifChannel[] = ['email', 'sms', 'telegram', 'app'];
  for (const ch of channels) {
    const key = `${type}_${ch}`;
    const enabled = prefs[key];
    if (enabled === false) {
      await logEntry(supabase, userId, type, ch, 'skipped_preferences');
      continue;
    }
    // If pref undefined, fall back to "skip" for safety (user hasn't opted in to new types).
    if (enabled !== true) {
      await logEntry(supabase, userId, type, ch, 'skipped_no_default');
      continue;
    }
    if (quietActive && (ch === 'sms' || ch === 'telegram')) {
      await logEntry(supabase, userId, type, ch, 'skipped_quiet_hours');
      continue;
    }

    try {
      switch (ch) {
        case 'email':
          if (!options.email) {
            await logEntry(supabase, userId, type, ch, 'skipped_no_payload');
            break;
          }
          // TODO: wire to existing send-email function when integrating.
          await logEntry(supabase, userId, type, ch, 'queued', options.email);
          break;
        case 'sms':
          if (!options.sms) {
            await logEntry(supabase, userId, type, ch, 'skipped_no_payload');
            break;
          }
          // TODO: wire to existing send-sms.
          await logEntry(supabase, userId, type, ch, 'queued', options.sms);
          break;
        case 'telegram': {
          const { data: conn } = await supabase
            .from('telegram_connections')
            .select('telegram_chat_id,is_active')
            .eq('user_id', userId)
            .maybeSingle();
          if (!conn?.is_active || !conn.telegram_chat_id) {
            await logEntry(supabase, userId, type, ch, 'skipped_no_connection');
            break;
          }
          // TODO: invoke supabase.functions.invoke('telegram-notify', {...}) when ready.
          await logEntry(supabase, userId, type, ch, 'queued', { chat_id: conn.telegram_chat_id, ...options.telegram });
          break;
        }
        case 'app':
          await logEntry(supabase, userId, type, ch, 'queued', options.app);
          break;
      }
    } catch (e) {
      await logEntry(supabase, userId, type, ch, 'failed', undefined, (e as Error).message);
    }
  }
}

/** Convenience to build a service-role client inside an edge function. */
export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}
