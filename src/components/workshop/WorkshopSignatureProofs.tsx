import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileSignature, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface Props {
  order: any;
}

// ETAP B: lista podpisanych kosztorysów = dowód prawny warsztatu. NIE renderuje
// snapshotu — tylko linkuje do zamrożonej karty klienta (/warsztat/klient/:code
// ?sig=<id>), która pokazuje ten sam layout ze snapshotu. Druga wycena = drugi
// podpis = drugi wpis/link. Czyta przez politykę providera (SELECT).
export function WorkshopSignatureProofs({ order }: Props) {
  const { t } = useTranslation();
  const [sigs, setSigs] = useState<any[]>([]);
  const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    let cancelled = false;
    if (!order?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('workshop_order_signatures')
        .select('id, document_type, signed_at, snapshot')
        .eq('order_id', order.id)
        .eq('document_type', 'cost_estimate')
        .order('signed_at', { ascending: true });
      if (!cancelled) setSigs((data || []).filter((s: any) => s.snapshot));
    })();
    return () => { cancelled = true; };
  }, [order?.id]);

  if (sigs.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 mb-4">
      <h3 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
        <FileSignature className="h-4 w-4" /> {t('workshop.orderDetail.signedEstimates', { defaultValue: 'Podpisane kosztorysy' })}
      </h3>
      <ul className="space-y-1.5">
        {sigs.map((s, idx) => {
          const gross = Number(s.snapshot?.total_gross ?? 0);
          const href = order.client_code ? `/warsztat/klient/${order.client_code}?sig=${s.id}` : undefined;
          return (
            <li key={s.id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${href ? 'hover:bg-accent/40' : 'opacity-60 pointer-events-none'}`}
              >
                <span className="min-w-0">
                  <span className="font-medium">{t('workshop.clientCard.estimate', { defaultValue: 'Kosztorys' })} nr {idx + 1}</span>
                  <span className="text-muted-foreground">
                    {' '}— {t('workshop.clientCard.signedOn', { defaultValue: 'podpisano' })}{' '}
                    {s.signed_at ? format(new Date(s.signed_at), 'dd.MM.yyyy HH:mm') : '---'}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-primary tabular-nums whitespace-nowrap">{fmt(gross)}&nbsp;zł</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
