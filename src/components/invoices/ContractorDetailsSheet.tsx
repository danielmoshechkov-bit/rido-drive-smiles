import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  ShieldCheck,
  History,
  Edit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Contractor {
  id: string;
  name: string;
  nip: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  email: string | null;
  phone: string | null;
  bank_account: string | null;
  verification_status: string | null;
  whitelist_data: Record<string, unknown> | null;
  last_verified_at: string | null;
  created_at: string;
  notes: string | null;
}

interface ContractorDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: Contractor;
  onVerify: () => void;
  onEdit: () => void;
  onShowHistory: () => void;
}

export function ContractorDetailsSheet({
  open,
  onOpenChange,
  contractor,
  onVerify,
  onEdit,
  onShowHistory,
}: ContractorDetailsSheetProps) {
  const whitelistData = contractor.whitelist_data as Record<string, unknown> | null;
  const accountNumbers = (whitelistData?.accountNumbers as string[]) || [];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopiowano do schowka');
  };

  const getVatStatusInfo = () => {
    const status = contractor.verification_status;
    const statusVat = whitelistData?.statusVat as string;

    if (!status || status === 'unchecked') {
      return {
        icon: <HelpCircle className="h-5 w-5 text-muted-foreground" />,
        label: 'Niesprawdzony',
        description: 'Status VAT nie został jeszcze zweryfikowany',
        variant: 'outline' as const,
      };
    }

    if (status === 'verified' && statusVat === 'Czynny') {
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
        label: 'Czynny podatnik VAT',
        description: 'Podmiot zarejestrowany jako czynny podatnik VAT',
        variant: 'default' as const,
      };
    }

    if (status === 'warning' || statusVat === 'Zwolniony') {
      return {
        icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
        label: 'Zwolniony z VAT',
        description: 'Podmiot korzysta ze zwolnienia z VAT',
        variant: 'secondary' as const,
      };
    }

    return {
      icon: <XCircle className="h-5 w-5 text-destructive" />,
      label: 'Niezarejestrowany',
      description: 'Podmiot nie jest zarejestrowany jako podatnik VAT',
      variant: 'destructive' as const,
    };
  };

  const vatInfo = getVatStatusInfo();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {contractor.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* VAT Status Section */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-start gap-3">
              {vatInfo.icon}
              <div className="flex-1">
                <p className="font-medium">{vatInfo.label}</p>
                <p className="text-sm text-muted-foreground">{vatInfo.description}</p>
                {contractor.last_verified_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Sprawdzono{' '}
                    {formatDistanceToNow(new Date(contractor.last_verified_at), {
                      addSuffix: true,
                      locale: pl,
                    })}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={onVerify}>
                <ShieldCheck className="h-4 w-4 mr-1" />
                Weryfikuj
              </Button>
            </div>
          </div>

          <Separator />

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Dane podstawowe
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">NIP</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{contractor.nip || '-'}</span>
                  {contractor.nip && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(contractor.nip!)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {whitelistData?.regon && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">REGON</span>
                  <span className="font-mono">{whitelistData.regon as string}</span>
                </div>
              )}

              {whitelistData?.krs && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">KRS</span>
                  <span className="font-mono">{whitelistData.krs as string}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Address */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Adres
            </h3>
            
            <div className="text-sm">
              {contractor.address_street || contractor.address_city ? (
                <>
                  {contractor.address_street && <p>{contractor.address_street}</p>}
                  {(contractor.address_postal_code || contractor.address_city) && (
                    <p>
                      {contractor.address_postal_code} {contractor.address_city}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Brak danych adresowych</p>
              )}
            </div>

            {whitelistData?.workingAddress && (
              <div className="mt-2 p-3 bg-muted/50 rounded text-sm">
                <p className="text-xs text-muted-foreground mb-1">Adres z białej listy:</p>
                <p>{whitelistData.workingAddress as string}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Kontakt
            </h3>
            
            <div className="space-y-2">
              {contractor.email ? (
                <a
                  href={`mailto:${contractor.email}`}
                  className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {contractor.email}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  Brak email
                </div>
              )}

              {contractor.phone ? (
                <a
                  href={`tel:${contractor.phone}`}
                  className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {contractor.phone}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  Brak telefonu
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Bank Accounts */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Konta bankowe
            </h3>

            {contractor.bank_account && (
              <div className="p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Zapisane konto:</p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{contractor.bank_account}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(contractor.bank_account!)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {accountNumbers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Konta z białej listy MF ({accountNumbers.length}):
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {accountNumbers.map((account, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm font-mono"
                    >
                      <span className="truncate">{account}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(account)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!contractor.bank_account && accountNumbers.length === 0 && (
              <p className="text-sm text-muted-foreground">Brak zarejestrowanych kont</p>
            )}
          </div>

          {/* Notes */}
          {contractor.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Notatki
                </h3>
                <p className="text-sm">{contractor.notes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onShowHistory}>
              <History className="h-4 w-4 mr-2" />
              Historia
            </Button>
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edytuj
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
