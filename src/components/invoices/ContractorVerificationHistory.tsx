import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  User,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface VerificationLog {
  id: string;
  verification_type: string;
  nip: string | null;
  result: Record<string, unknown> | null;
  is_valid: boolean | null;
  verified_at: string;
  verified_by: string | null;
}

interface ContractorVerificationHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string;
  contractorName: string;
}

export function ContractorVerificationHistory({
  open,
  onOpenChange,
  contractorId,
  contractorName,
}: ContractorVerificationHistoryProps) {
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && contractorId) {
      fetchLogs();
    }
  }, [open, contractorId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contractor_verification_logs')
        .select('*')
        .eq('recipient_id', contractorId)
        .order('verified_at', { ascending: false });

      if (error) throw error;
      setLogs((data || []) as VerificationLog[]);
    } catch (err) {
      console.error('Error fetching verification logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (log: VerificationLog) => {
    const result = log.result as Record<string, unknown> | null;
    const statusVat = result?.statusVat as string;

    if (log.is_valid && statusVat === 'Czynny') {
      return (
        <Badge className="bg-green-600 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Czynny VAT
        </Badge>
      );
    }

    if (statusVat === 'Zwolniony') {
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800">
          <AlertTriangle className="h-3 w-3" />
          Zwolniony
        </Badge>
      );
    }

    if (log.is_valid === false) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Nieaktywny
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1">
        <FileText className="h-3 w-3" />
        Sprawdzono
      </Badge>
    );
  };

  const getVerificationTypeLabel = (type: string) => {
    switch (type) {
      case 'whitelist':
        return 'Biała lista VAT';
      case 'gus':
        return 'Rejestr GUS';
      case 'vies':
        return 'VIES (UE)';
      default:
        return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historia weryfikacji
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{contractorName}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Brak historii weryfikacji</p>
            <p className="text-sm mt-1">
              Wykonaj pierwszą weryfikację VAT dla tego kontrahenta
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-4">
              {logs.map((log, index) => {
                const result = log.result as Record<string, unknown> | null;
                
                return (
                  <div
                    key={log.id}
                    className={`relative pl-6 pb-4 ${
                      index < logs.length - 1 ? 'border-l-2 border-muted ml-2' : ''
                    }`}
                  >
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                        log.is_valid
                          ? 'bg-green-100 border-green-600'
                          : log.is_valid === false
                          ? 'bg-red-100 border-destructive'
                          : 'bg-muted border-muted-foreground'
                      }`}
                    />

                    <div className="bg-muted/30 rounded-lg p-4 ml-2">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(log.verified_at), 'dd MMM yyyy, HH:mm', {
                            locale: pl,
                          })}
                        </div>
                        {getStatusBadge(log)}
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Typ:</span>
                          <span>{getVerificationTypeLabel(log.verification_type)}</span>
                        </div>

                        {log.nip && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">NIP:</span>
                            <span className="font-mono">{log.nip}</span>
                          </div>
                        )}

                        {result?.name && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Nazwa:</span>
                            <span className="truncate">{result.name as string}</span>
                          </div>
                        )}

                        {result?.regon && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">REGON:</span>
                            <span className="font-mono">{result.regon as string}</span>
                          </div>
                        )}

                        {result?.accountNumbers && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0">Konta:</span>
                            <span>
                              {(result.accountNumbers as string[]).length} zarejestrowanych
                            </span>
                          </div>
                        )}

                        {result?.bankAccountVerified !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Konto bankowe:</span>
                            <Badge
                              variant={result.bankAccountVerified ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {result.bankAccountVerified
                                ? 'Na białej liście'
                                : 'Poza białą listą'}
                            </Badge>
                          </div>
                        )}

                        {log.verified_by && (
                          <div className="flex items-center gap-2 pt-2 border-t mt-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              Zweryfikował: {log.verified_by}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
