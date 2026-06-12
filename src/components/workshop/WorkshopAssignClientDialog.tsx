import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useWorkshopClients, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { Search, Plus, User, Building, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  orderId: string;
  onAssigned?: (client: any) => void;
}

export function WorkshopAssignClientDialog({ open, onOpenChange, providerId, orderId, onAssigned }: Props) {
  const { t } = useTranslation();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const updateOrder = useUpdateWorkshopOrder();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 30);
    return clients.filter((c: any) => {
      const name = c.client_type === 'company'
        ? (c.company_name || '')
        : `${c.first_name || ''} ${c.last_name || ''}`.trim();
      return [name, c.phone, c.email, c.nip]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q));
    }).slice(0, 50);
  }, [clients, search]);

  const assign = async (client: any) => {
    try {
      await updateOrder.mutateAsync({ id: orderId, client_id: client.id });
      toast.success(t('workshop.clients.clientAssigned'));
      onAssigned?.(client);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || t('workshop.clients.assignError'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" /> {t('workshop.clients.assignClientToOrder')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('workshop.clients.searchPlaceholder')}
                className="pl-9"
                autoFocus
              />
            </div>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-dashed"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4 text-green-600" /> {t('workshop.newOrder.createNewClient')}
            </Button>

            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">{t('workshop.newOrder.noResults')}</p>
              )}
              {filtered.map((c: any) => {
                const isCompany = c.client_type === 'company';
                const name = isCompany
                  ? c.company_name
                  : `${c.first_name || ''} ${c.last_name || ''}`.trim();
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => assign(c)}
                    className="w-full text-left p-2.5 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {isCompany ? <Building className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                      {name || t('workshop.clients.noName')}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                      {c.nip && <span>{t('workshop.orders.nip')} {c.nip}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkshopAddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        providerId={providerId}
        onCreated={(c) => {
          setAddOpen(false);
          if (c) assign(c);
        }}
      />
    </>
  );
}
