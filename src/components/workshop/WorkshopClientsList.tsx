import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkshopClients } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { WorkshopEditClientDialog } from './WorkshopEditClientDialog';
import { Plus, Search, Loader2, Building, User, Phone, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopClientsList({ providerId, onBack }: Props) {
  const { t } = useTranslation();
  const { data: clients = [], isLoading } = useWorkshopClients(providerId);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter((c: any) => {
      const name = c.client_type === 'company'
        ? (c.company_name || '')
        : `${c.first_name || ''} ${c.last_name || ''}`;
      return name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.nip || '').includes(q);
    });
  }, [clients, search]);

  const getClientName = (c: any) => {
    if (c.client_type === 'company') return c.company_name || t('workshop.clients.noData');
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    return name || t('workshop.clients.noData');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">{t('workshop.dashboard.tiles.klienci')}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> {t('workshop.clients.create')}
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input onFocus={e => e.currentTarget.select()} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('workshop.clients.colMarketingConsent')}</TableHead>
                  <TableHead>{t('workshop.clients.colClientData')}</TableHead>
                  <TableHead>{t('workshop.clients.colEmail')}</TableHead>
                  <TableHead>{t('workshop.clients.colPhone')}</TableHead>
                  <TableHead>{t('workshop.clients.colPriceGroup')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id} className="hover:bg-accent/50 cursor-pointer" onClick={() => setEditClient(c)}>
                    <TableCell>
                      <Badge variant={c.marketing_consent ? 'default' : 'secondary'} className="text-xs">
                        {c.marketing_consent ? t('ui.yes') : t('ui.no')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.client_type === 'company' ? (
                          <Building className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{getClientName(c)}</span>
                        {c.nip && <span className="text-xs text-muted-foreground">{t('workshop.orders.nip')} {c.nip}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t('workshop.clients.priceGroupDefault')}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {t('workshop.clients.noClients')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {t('workshop.clients.resultsRange', { shown: filtered.length, total: clients.length })}
      </div>

      <WorkshopAddClientDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
      <WorkshopEditClientDialog open={!!editClient} onOpenChange={(v) => { if (!v) setEditClient(null); }} client={editClient} />
    </div>
  );
}
