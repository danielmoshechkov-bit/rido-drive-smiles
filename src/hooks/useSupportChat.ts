import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Czat wsparcia — rozmowa klienta z adminem GetRido.
 *
 * Etap 1: tylko zalogowani (rozmowy gości bez konta dochodzą w etapie 2 przez
 * funkcję serwerową z tokenem — celowo NIE przez anonimowy dostęp do tabeli).
 *
 * Uprawnienia pilnuje baza: klient czyta i pisze wyłącznie w swojej rozmowie,
 * admin widzi wszystkie. Tu nie ma żadnego filtrowania „na wiarę" po stronie UI.
 */

export interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_role: 'user' | 'admin' | 'ai';
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface SupportConversation {
  id: string;
  user_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  subject: string | null;
  origin_path: string | null;
  status: 'open' | 'closed';
  last_message_at: string;
  unread_for_admin: number;
  unread_for_user: number;
  created_at: string;
  /** Ustawiane, gdy sprawa trafiła do człowieka (asystent nie znał odpowiedzi). */
  escalated_at?: string | null;
  ai_replies_count?: number;
}

const CONVERSATIONS_KEY = ['support-conversations'];
const messagesKey = (conversationId?: string | null) => ['support-messages', conversationId];

/** Rozmowa zalogowanego użytkownika (najnowsza). Nie tworzy nic na zapas. */
export function useMySupportConversation(enabled = true) {
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, 'mine'],
    enabled,
    queryFn: async (): Promise<SupportConversation | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('support_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
  });
}

export function useSupportMessages(conversationId?: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId),
    enabled: !!conversationId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await (supabase as any)
        .from('support_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Wysyłka wiadomości klienta. Przy pierwszej wiadomości zakłada rozmowę —
 * dzięki temu w skrzynce admina nie lądują puste wątki „ktoś otworzył dymek".
 */
export function useSendSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId?: string | null; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Zaloguj się, żeby napisać do nas.');

      let convId = conversationId;
      if (!convId) {
        const meta = (user.user_metadata || {}) as Record<string, string>;
        const { data, error } = await (supabase as any)
          .from('support_conversations')
          .insert({
            user_id: user.id,
            contact_email: user.email || null,
            contact_name: meta.full_name || meta.name || null,
            contact_phone: meta.phone || null,
            origin_path: typeof window !== 'undefined' ? window.location.pathname : null,
          })
          .select('id')
          .single();
        if (error) throw error;
        convId = data.id;
      }

      const meta = (user.user_metadata || {}) as Record<string, string>;
      const { error: msgError } = await (supabase as any)
        .from('support_messages')
        .insert({
          conversation_id: convId,
          sender_role: 'user',
          sender_user_id: user.id,
          sender_name: meta.full_name || meta.name || user.email || null,
          body: body.trim(),
        });
      if (msgError) throw msgError;

      // Pierwsza linia to asystent AI: sam odpowie z bazy wiedzy albo przekaże
      // sprawę człowiekowi (wtedy on wysyła SMS). Nieudane wywołanie nie może
      // zablokować wysłania wiadomości — klient ma widzieć, że poszła.
      void supabase.functions
        .invoke('support-ai-reply', { body: { conversation_id: convId } })
        .catch(() => undefined);

      return convId as string;
    },
    onSuccess: (convId) => {
      qc.invalidateQueries({ queryKey: [...CONVERSATIONS_KEY, 'mine'] });
      qc.invalidateQueries({ queryKey: messagesKey(convId) });
    },
  });
}

/** Skrzynka admina — wszystkie rozmowy, nieprzeczytane i najnowsze na górze. */
export function useSupportInbox(enabled = true) {
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, 'inbox'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<SupportConversation[]> => {
      const { data, error } = await (supabase as any)
        .from('support_conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAdminReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak sesji.');
      const meta = (user.user_metadata || {}) as Record<string, string>;
      const { error } = await (supabase as any)
        .from('support_messages')
        .insert({
          conversation_id: conversationId,
          sender_role: 'admin',
          sender_user_id: user.id,
          sender_name: meta.full_name || 'Wsparcie GetRido',
          body: body.trim(),
        });
      if (error) throw error;

      // Klient dostaje maila, że czeka odpowiedź (jeśli nie siedzi w czacie).
      void supabase.functions
        .invoke('support-notify', { body: { conversation_id: conversationId, sender_role: 'admin' } })
        .catch(() => undefined);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...CONVERSATIONS_KEY, 'inbox'] });
      qc.invalidateQueries({ queryKey: messagesKey(vars.conversationId) });
    },
  });
}

/** Zerowanie licznika nieprzeczytanych po otwarciu wątku. */
export function useMarkSupportRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, side }: { conversationId: string; side: 'admin' | 'user' }) => {
      const { error } = await (supabase as any)
        .from('support_conversations')
        .update(side === 'admin' ? { unread_for_admin: 0 } : { unread_for_user: 0 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}

export function useCloseSupportConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, status }: { conversationId: string; status: 'open' | 'closed' }) => {
      const { error } = await (supabase as any)
        .from('support_conversations')
        .update({ status })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}

/**
 * Podgląd na żywo. Jeden kanał na zamontowany widok; przy każdej nowej
 * wiadomości odświeżamy wątek i listę, żeby licznik nieprzeczytanych zgadzał
 * się z tym, co policzył trigger w bazie (a nie z domysłem po stronie UI).
 */
export function useSupportRealtime(conversationId?: string | null, channelName = 'support-chat') {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = (supabase as any)
      .channel(`${channelName}-${conversationId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload: any) => {
        const convId = payload?.new?.conversation_id;
        qc.invalidateQueries({ queryKey: messagesKey(convId) });
        qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [qc, conversationId, channelName]);
}

/** Ustawienia powiadomień wsparcia (widoczne wyłącznie dla admina). */
export interface SupportSettings {
  notify_phone: string | null;
  ai_enabled: boolean;
  ai_model: string;
  ai_escalate_after: number;
  sms_enabled: boolean;
  sms_throttle_minutes: number;
  quiet_hours_enabled: boolean;
  quiet_hours_from: number;
  quiet_hours_to: number;
  email_client_on_reply: boolean;
}

export function useSupportSettings(enabled = true) {
  return useQuery({
    queryKey: ['support-settings'],
    enabled,
    queryFn: async (): Promise<SupportSettings | null> => {
      const { data, error } = await (supabase as any)
        .from('support_settings').select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return data || null;
    },
  });
}

export function useSaveSupportSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SupportSettings>) => {
      const { error } = await (supabase as any)
        .from('support_settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-settings'] }),
  });
}

/** Wiedza, z której korzysta asystent AI. */
export interface SupportKnowledge {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string | null;
  is_active: boolean;
}

export function useSupportKnowledge(enabled = true) {
  return useQuery({
    queryKey: ['support-knowledge'],
    enabled,
    queryFn: async (): Promise<SupportKnowledge[]> => {
      const { data, error } = await (supabase as any)
        .from('support_knowledge').select('*').order('category').order('question');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSaveSupportKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<SupportKnowledge> & { id?: string }) => {
      const payload = {
        category: entry.category?.trim() || 'ogolne',
        question: entry.question?.trim(),
        answer: entry.answer?.trim(),
        keywords: entry.keywords?.trim() || null,
        is_active: entry.is_active ?? true,
        updated_at: new Date().toISOString(),
      };
      const query = entry.id
        ? (supabase as any).from('support_knowledge').update(payload).eq('id', entry.id)
        : (supabase as any).from('support_knowledge').insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-knowledge'] }),
  });
}

export function useDeleteSupportKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('support_knowledge').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-knowledge'] }),
  });
}

/**
 * Ostatnia wiadomość każdej rozmowy — podgląd na liście w skrzynce.
 *
 * Przy kilkudziesięciu zgłoszeniach sama nazwa i data nic nie mówią; admin musi
 * widzieć, o co chodzi, zanim w cokolwiek kliknie. Pobieramy jednym zapytaniem
 * dla wszystkich widocznych rozmów, a nie po jednym na wiersz.
 */
export function useSupportPreviews(conversationIds: string[]) {
  const klucz = [...conversationIds].sort().join(',');
  return useQuery({
    queryKey: ['support-previews', klucz],
    enabled: conversationIds.length > 0,
    queryFn: async (): Promise<Record<string, { body: string; sender_role: string }>> => {
      const { data, error } = await (supabase as any)
        .from('support_messages')
        .select('conversation_id, body, sender_role, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const out: Record<string, { body: string; sender_role: string }> = {};
      for (const m of data || []) {
        // Lista jest posortowana malejąco, więc pierwszy trafiony wpis
        // dla danej rozmowy to jej ostatnia wiadomość.
        if (!out[m.conversation_id]) out[m.conversation_id] = { body: m.body, sender_role: m.sender_role };
      }
      return out;
    },
  });
}
