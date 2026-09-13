import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, Phone, Mail, Building, User, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/**
 * Karta klienta — JEDNA na cały warsztat.
 *
 * Używają jej: karta zlecenia, tabela zleceń na komputerze i lista zleceń
 * na telefonie. Do 13.09.2026 lista zleceń miała WŁASNĄ kopię wklejoną
 * w JSX tabeli, przez co na telefonie nie było jej wcale.
 */
interface Props {
  client: any;
  children: React.ReactNode;
  /** „Otwórz" — karta klienta. */
  onEdit?: () => void;
  /** „Zmień" — podmiana klienta przypisanego do zlecenia. Tylko w liście zleceń. */
  onChange?: () => void;
}

export function WorkshopClientHoverCard({ client, children, onEdit, onChange }: Props) {
  const { t } = useTranslation();
  if (!client) return <>{children}</>;

  const copy = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast.success(message);
  };

  const isCompany = client.client_type === 'company';
  const name = isCompany
    ? client.company_name
    : `${client.first_name || ''} ${client.last_name || ''}`.trim();

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer hover:text-primary transition-colors">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-0" align="start">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              {isCompany ? <Building className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
              {name || t('workshop.clients.client')}
            </h4>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
                <ExternalLink className="h-3 w-3" /> {t('workshop.clients.edit')}
              </Button>
            )}
          </div>

          {isCompany && client.nip && (
            <div className="text-xs flex items-center gap-1.5 bg-muted/50 rounded px-2 py-1.5">
              <span className="text-muted-foreground">{t('workshop.clients.nip')}</span>
              <span className="font-medium">{client.nip}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => copy(client.nip, t('workshop.orders.copiedNip'))}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          {isCompany && (client.first_name || client.last_name) && (
            <div className="text-xs text-muted-foreground">
              {t('workshop.clients.contactPersonInline')} <span className="text-foreground font-medium">{client.first_name} {client.last_name}</span>
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            {client.phone && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>+48 {client.phone}</span>
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copy(client.phone, t('workshop.orders.copiedPhone'))}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" asChild>
                    <a href={`tel:+48${client.phone}`}><Phone className="h-3 w-3 text-green-500" /></a>
                  </Button>
                </div>
              </div>
            )}
            {client.email && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span>{client.email}</span>
                </span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copy(client.email, t('workshop.orders.copiedEmail'))}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {(client.city || client.street) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span>{[client.street, client.city].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </div>

          {/* Przyciski na dole, a nie tylko ikona w nagłówku: na telefonie to
              JEDYNA droga dalej, bo dotknięcie wyzwalacza otwiera kartę
              i nie odpala jego własnego `onClick`. Wysokość 32 px — palec. */}
          {onChange && (
            <div className="flex gap-2 pt-1">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1 text-xs"
                  onClick={onEdit}
                >
                  <ExternalLink className="h-3 w-3" /> {t('workshop.orders.open')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 gap-1 border-primary/40 text-xs text-primary hover:bg-primary/10"
                onClick={onChange}
                title={t('workshop.orders.changeClientTitle')}
              >
                <Search className="h-3 w-3" /> {t('workshop.orders.change')}
              </Button>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
