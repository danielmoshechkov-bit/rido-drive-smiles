import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Search,
  MoreVertical,
  RefreshCw,
  History,
  Edit,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Clock,
  Download,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ContractorDetailsSheet } from './ContractorDetailsSheet';
import { ContractorEditDialog } from './ContractorEditDialog';
import { ContractorVerificationHistory } from './ContractorVerificationHistory';

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

interface ContractorsListProps {
  entityId: string;
}

type StatusFilter = 'all' | 'verified' | 'warning' | 'error' | 'unchecked' | 'stale';

export function ContractorsList({ entityId }: ContractorsListProps) {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Verification state
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState({ current: 0, total: 0 });
  const [verifyingContractorId, setVerifyingContractorId] = useState<string | null>(null);
  
  // Sheet/Dialog state
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_recipients')
        .select('*')
        .eq('entity_id', entityId)
        .order('name');

      if (error) throw error;
      setContractors((data || []) as Contractor[]);
    } catch (err) {
      console.error('Error fetching contractors:', err);
      toast.error('Błąd pobierania kontrahentów');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  const isVerificationStale = (lastVerifiedAt: string | null): boolean => {
    if (!lastVerifiedAt) return true;
    return differenceInDays(new Date(), new Date(lastVerifiedAt)) > 30;
  };

  const getVatStatusBadge = (contractor: Contractor) => {
    const { verification_status, whitelist_data, last_verified_at } = contractor;
    
    if (!verification_status || verification_status === 'unchecked') {
      return (
        <Badge variant="outline" className="gap-1">
          <HelpCircle className="h-3 w-3" />
          Niesprawdzony
        </Badge>
      );
    }

    const isStale = isVerificationStale(last_verified_at);
    const statusVat = (whitelist_data as Record<string, unknown>)?.statusVat as string;

    if (verification_status === 'verified' && statusVat === 'Czynny') {
      return (
        <Badge className={`gap-1 ${isStale ? 'bg-green-600/70' : 'bg-green-600'}`}>
          <CheckCircle2 className="h-3 w-3" />
          Czynny VAT
          {isStale && <Clock className="h-3 w-3 ml-1" />}
        </Badge>
      );
    }

    if (verification_status === 'warning' || statusVat === 'Zwolniony') {
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          <AlertTriangle className="h-3 w-3" />
          Zwolniony
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Nieaktywny
      </Badge>
    );
  };

  const verifyContractor = async (contractor: Contractor): Promise<boolean> => {
    if (!contractor.nip) {
      toast.error('Kontrahent nie ma NIP');
      return false;
    }

    setVerifyingContractorId(contractor.id);
    try {
      const { data, error } = await supabase.functions.invoke('registry-whitelist', {
        body: {
          nip: contractor.nip,
          recipientId: contractor.id,
          bankAccount: contractor.bank_account,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Zweryfikowano: ${contractor.name}`);
        return true;
      } else {
        toast.warning(data?.error || 'Nie znaleziono w rejestrze');
        return false;
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast.error('Błąd weryfikacji');
      return false;
    } finally {
      setVerifyingContractorId(null);
    }
  };

  const verifyAllContractors = async () => {
    const contractorsWithNip = contractors.filter((c) => c.nip);
    
    if (contractorsWithNip.length === 0) {
      toast.info('Brak kontrahentów z NIP do weryfikacji');
      return;
    }

    setIsVerifyingAll(true);
    setVerificationProgress({ current: 0, total: contractorsWithNip.length });

    let successCount = 0;
    let errorCount = 0;

    for (const contractor of contractorsWithNip) {
      try {
        const { data } = await supabase.functions.invoke('registry-whitelist', {
          body: {
            nip: contractor.nip,
            recipientId: contractor.id,
            bankAccount: contractor.bank_account,
          },
        });

        if (data?.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }

      setVerificationProgress((prev) => ({
        ...prev,
        current: prev.current + 1,
      }));

      // Delay between requests (MF API rate limit)
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsVerifyingAll(false);
    await fetchContractors();
    
    toast.success(
      `Weryfikacja zakończona: ${successCount} poprawnych, ${errorCount} błędów`
    );
  };

  const exportToCSV = () => {
    const headers = ['Nazwa', 'NIP', 'Status VAT', 'Ostatnia weryfikacja', 'Email', 'Telefon', 'Konto bankowe'];
    const rows = filteredContractors.map((c) => [
      c.name,
      c.nip || '',
      c.verification_status || 'niesprawdzony',
      c.last_verified_at ? new Date(c.last_verified_at).toLocaleDateString('pl-PL') : '',
      c.email || '',
      c.phone || '',
      c.bank_account || '',
    ]);

    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kontrahenci_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Wyeksportowano do CSV');
  };

  // Filter contractors
  const filteredContractors = contractors.filter((c) => {
    // Search filter
    const matchesSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nip?.includes(searchQuery);

    // Status filter
    let matchesStatus = true;
    if (statusFilter === 'verified') {
      matchesStatus = c.verification_status === 'verified';
    } else if (statusFilter === 'warning') {
      matchesStatus = c.verification_status === 'warning';
    } else if (statusFilter === 'error') {
      matchesStatus = c.verification_status === 'error';
    } else if (statusFilter === 'unchecked') {
      matchesStatus = !c.verification_status || c.verification_status === 'unchecked';
    } else if (statusFilter === 'stale') {
      matchesStatus = isVerificationStale(c.last_verified_at);
    }

    return matchesSearch && matchesStatus;
  });

  // Statistics
  const stats = {
    total: contractors.length,
    verified: contractors.filter((c) => c.verification_status === 'verified').length,
    warning: contractors.filter((c) => c.verification_status === 'warning').length,
    error: contractors.filter((c) => c.verification_status === 'error').length,
    unchecked: contractors.filter((c) => !c.verification_status).length,
    stale: contractors.filter((c) => isVerificationStale(c.last_verified_at)).length,
  };

  const handleRowClick = (contractor: Contractor) => {
    setSelectedContractor(contractor);
    setShowDetails(true);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Kontrahenci ({stats.total})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={contractors.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button
                size="sm"
                onClick={verifyAllContractors}
                disabled={isVerifyingAll || contractors.length === 0}
              >
                {isVerifyingAll ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Weryfikuj wszystkich
              </Button>
            </div>
          </div>

          {/* Statistics */}
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              Czynni: {stats.verified}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
              Zwolnieni: {stats.warning}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3 text-destructive" />
              Nieaktywni: {stats.error}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <HelpCircle className="h-3 w-3 text-muted-foreground" />
              Niesprawdzeni: {stats.unchecked}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3 text-orange-500" />
              Do odświeżenia: {stats.stale}
            </Badge>
          </div>

          {/* Progress bar during mass verification */}
          {isVerifyingAll && (
            <div className="space-y-2">
              <Progress
                value={(verificationProgress.current / verificationProgress.total) * 100}
              />
              <p className="text-sm text-muted-foreground text-center">
                Weryfikacja: {verificationProgress.current} / {verificationProgress.total}
              </p>
            </div>
          )}

          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj po nazwie lub NIP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="verified">Czynni VAT</SelectItem>
                <SelectItem value="warning">Zwolnieni</SelectItem>
                <SelectItem value="error">Nieaktywni</SelectItem>
                <SelectItem value="unchecked">Niesprawdzeni</SelectItem>
                <SelectItem value="stale">Do odświeżenia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredContractors.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            {contractors.length === 0 ? (
              <>
                <p>Brak kontrahentów</p>
                <p className="text-sm mt-1">
                  Dodaj kontrahenta wystawiając pierwszą fakturę
                </p>
              </>
            ) : (
              <p>Brak wyników dla podanych filtrów</p>
            )}
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Status VAT</TableHead>
                  <TableHead>Ostatnia weryfikacja</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContractors.map((contractor) => (
                  <TableRow
                    key={contractor.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(contractor)}
                  >
                    <TableCell className="font-medium">
                      {contractor.name}
                      {contractor.address_city && (
                        <p className="text-xs text-muted-foreground">
                          {contractor.address_city}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {contractor.nip || '-'}
                    </TableCell>
                    <TableCell>{getVatStatusBadge(contractor)}</TableCell>
                    <TableCell>
                      {contractor.last_verified_at ? (
                        <span
                          className={
                            isVerificationStale(contractor.last_verified_at)
                              ? 'text-orange-500'
                              : 'text-muted-foreground'
                          }
                        >
                          {formatDistanceToNow(new Date(contractor.last_verified_at), {
                            addSuffix: true,
                            locale: pl,
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            {verifyingContractorId === contractor.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              verifyContractor(contractor).then(() => fetchContractors());
                            }}
                            disabled={!contractor.nip}
                          >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Weryfikuj VAT
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContractor(contractor);
                              setShowHistory(true);
                            }}
                          >
                            <History className="h-4 w-4 mr-2" />
                            Historia weryfikacji
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContractor(contractor);
                              setShowEdit(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edytuj
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Details Sheet */}
      {selectedContractor && (
        <ContractorDetailsSheet
          open={showDetails}
          onOpenChange={setShowDetails}
          contractor={selectedContractor}
          onVerify={() => verifyContractor(selectedContractor).then(() => fetchContractors())}
          onEdit={() => {
            setShowDetails(false);
            setShowEdit(true);
          }}
          onShowHistory={() => {
            setShowDetails(false);
            setShowHistory(true);
          }}
        />
      )}

      {/* Edit Dialog */}
      {selectedContractor && (
        <ContractorEditDialog
          open={showEdit}
          onOpenChange={setShowEdit}
          contractor={selectedContractor}
          onSaved={fetchContractors}
        />
      )}

      {/* History Dialog */}
      {selectedContractor && (
        <ContractorVerificationHistory
          open={showHistory}
          onOpenChange={setShowHistory}
          contractorId={selectedContractor.id}
          contractorName={selectedContractor.name}
        />
      )}
    </Card>
  );
}
