import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProviderOfferService {
  id: string;
  name: string;
  category: string | null;
  short_description: string | null;
  price_from: number | null;
  price_to: number | null;
  duration_minutes: number | null;
}

export interface ProviderOfferCompany {
  company_name: string;
  description: string | null;
  location: string;
  phone: string | null;
}

export interface ProviderOfferHour {
  day_of_week: number; // 0 = niedziela (zgodnie z Date.getDay())
  start_time: string;
  end_time: string;
  is_working: boolean;
}

export interface ProviderOffer {
  company: ProviderOfferCompany | null;
  services: ProviderOfferService[];
  hours: ProviderOfferHour[];
  hoursText: string;
}

const DAY_LABELS = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // pon → nd

const hhmm = (t: string) => String(t).slice(0, 5);

/** „Pon–Pt 8:00–18:00, Sob 9:00–14:00" — skleja kolejne dni o tych samych godzinach. */
export function formatWorkingHours(hours: ProviderOfferHour[]): string {
  if (!hours.length) return '';
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]));
  const parts: string[] = [];
  let runStart: number | null = null;
  let runRange = '';

  const flush = (runEnd: number | null) => {
    if (runStart === null || runEnd === null) return;
    const a = DAY_LABELS[runStart];
    const b = DAY_LABELS[runEnd];
    parts.push(`${a === b ? a : `${a}–${b}`} ${runRange}`);
    runStart = null;
    runRange = '';
  };

  let prevDay: number | null = null;
  for (const day of DAY_ORDER) {
    const h = byDay.get(day);
    const range = h?.is_working ? `${hhmm(h.start_time)}–${hhmm(h.end_time)}` : '';
    if (range && range === runRange) {
      prevDay = day;
      continue;
    }
    flush(prevDay);
    if (range) {
      runStart = day;
      runRange = range;
    }
    prevDay = day;
  }
  flush(prevDay);
  return parts.join(', ');
}

/**
 * Jedno źródło prawdy o ofercie usługodawcy dla agentów AI:
 * dane firmy + usługi z cenami („Moje usługi") + godziny pracy.
 * Agent nie ma własnej kopii cennika — bierze go stąd.
 */
export function useProviderOffer(providerId: string | null) {
  return useQuery<ProviderOffer>({
    queryKey: ['provider-offer', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const [{ data: provider }, { data: services }, { data: swh }] = await Promise.all([
        supabase
          .from('service_providers')
          .select('company_name, description, company_address, company_city, company_phone, user_id')
          .eq('id', providerId!)
          .maybeSingle(),
        supabase
          .from('provider_services')
          .select('id, name, category, short_description, price_from, price_to, duration_minutes')
          .eq('provider_id', providerId!)
          .eq('is_active', true)
          .order('category', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('service_working_hours')
          .select('day_of_week, start_time, end_time, is_working')
          .eq('provider_id', providerId!)
          .is('employee_id', null),
      ]);

      let hours: ProviderOfferHour[] = (swh || []).map((h: any) => ({
        day_of_week: h.day_of_week,
        start_time: h.start_time,
        end_time: h.end_time,
        is_working: h.is_working !== false,
      }));

      // Fallback: godziny z ustawień warsztatu ([Pon…Nd] {open, from, to})
      if (!hours.length && provider?.user_id) {
        const { data: ws } = await (supabase as any)
          .from('workshop_settings')
          .select('working_hours')
          .eq('user_id', provider.user_id)
          .maybeSingle();
        if (Array.isArray(ws?.working_hours)) {
          hours = ws.working_hours.map((d: any, idx: number) => ({
            day_of_week: idx === 6 ? 0 : idx + 1,
            start_time: (d?.from || '09:00') + ':00',
            end_time: (d?.to || '17:00') + ':00',
            is_working: !!d?.open,
          }));
        }
      }

      return {
        company: provider
          ? {
              company_name: provider.company_name,
              description: provider.description,
              location: [provider.company_address, provider.company_city].filter(Boolean).join(', '),
              phone: provider.company_phone,
            }
          : null,
        services: (services || []) as ProviderOfferService[],
        hours,
        hoursText: formatWorkingHours(hours),
      };
    },
  });
}

/** Cennik jednej usługi w formie tekstowej: „od 100 zł do 250 zł". */
export function formatServicePrice(s: ProviderOfferService): string {
  const from = Number(s.price_from) || 0;
  const to = Number(s.price_to) || 0;
  if (from && to && to > from) return `od ${from} zł do ${to} zł`;
  if (from) return `od ${from} zł`;
  if (to) return `do ${to} zł`;
  return 'cena po wycenie';
}
