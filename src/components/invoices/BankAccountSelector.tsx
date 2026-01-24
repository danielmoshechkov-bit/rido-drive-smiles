import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Check, 
  Copy, 
  CreditCard, 
  ExternalLink, 
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BankAccountSelectorProps {
  accounts: string[];
  selectedAccount?: string;
  onSelectAccount: (account: string) => void;
  companyName?: string;
  nip?: string;
  compact?: boolean;
}

// Polish bank identification based on account prefix
function getBankInfo(iban: string): { name: string; color: string } | null {
  const cleanIban = iban.replace(/[\s-]/g, '');
  // Polish accounts: 2 check digits + 8 bank sort code + 16 account number
  const bankCode = cleanIban.substring(2, 10);
  
  const bankMap: Record<string, { name: string; color: string }> = {
    '10101023': { name: 'NBP', color: 'bg-emerald-500' },
    '10200032': { name: 'PKO BP', color: 'bg-blue-600' },
    '10201026': { name: 'PKO BP', color: 'bg-blue-600' },
    '10201055': { name: 'PKO BP', color: 'bg-blue-600' },
    '10201068': { name: 'PKO BP', color: 'bg-blue-600' },
    '10201097': { name: 'PKO BP', color: 'bg-blue-600' },
    '10301508': { name: 'Citi Handlowy', color: 'bg-sky-500' },
    '10500011': { name: 'ING', color: 'bg-orange-500' },
    '10501038': { name: 'ING', color: 'bg-orange-500' },
    '10501214': { name: 'ING', color: 'bg-orange-500' },
    '10600076': { name: 'BNP Paribas', color: 'bg-green-600' },
    '10902674': { name: 'Santander', color: 'bg-red-500' },
    '10902590': { name: 'Santander', color: 'bg-red-500' },
    '11400004': { name: 'mBank', color: 'bg-teal-500' },
    '11402004': { name: 'mBank', color: 'bg-teal-500' },
    '11601199': { name: 'Bank Millennium', color: 'bg-purple-600' },
    '12401037': { name: 'Pekao SA', color: 'bg-red-600' },
    '12403028': { name: 'Pekao SA', color: 'bg-red-600' },
    '12401112': { name: 'Pekao SA', color: 'bg-red-600' },
    '12402975': { name: 'Pekao SA', color: 'bg-red-600' },
    '24900001': { name: 'Alior Bank', color: 'bg-amber-500' },
    '24900005': { name: 'Alior Bank', color: 'bg-amber-500' },
    '25200001': { name: 'Credit Agricole', color: 'bg-lime-600' },
    '26100045': { name: 'VeloBank', color: 'bg-indigo-500' },
    '27000002': { name: 'BOŚ Bank', color: 'bg-green-700' },
  };
  
  // Check first 4 digits as bank identifier
  const bankPrefix = cleanIban.substring(2, 6);
  for (const [code, info] of Object.entries(bankMap)) {
    if (code.startsWith(bankPrefix) || bankCode.startsWith(code.substring(0, 4))) {
      return info;
    }
  }
  
  // Fallback for cooperative banks (BS)
  if (bankPrefix.startsWith('87') || bankPrefix.startsWith('85') || bankPrefix.startsWith('83')) {
    return { name: 'Bank Spółdzielczy', color: 'bg-slate-500' };
  }
  
  return null;
}

function formatIBAN(iban: string): string {
  const clean = iban.replace(/[\s-]/g, '');
  // Format as: XX XXXX XXXX XXXX XXXX XXXX XXXX
  return clean.replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, '$1 $2 $3 $4 $5 $6 $7').trim();
}

function BankAccountCard({ 
  account, 
  isSelected, 
  onSelect, 
  onCopy,
  showBankBadge = true 
}: { 
  account: string; 
  isSelected: boolean; 
  onSelect: () => void;
  onCopy: () => void;
  showBankBadge?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const bankInfo = getBankInfo(account);
  const formattedAccount = formatIBAN(account);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(account.replace(/[\s-]/g, ''));
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className={cn(
        "group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200",
        isSelected 
          ? "bg-primary/10 border-primary ring-1 ring-primary" 
          : "bg-card hover:bg-accent/50 border-border hover:border-primary/50"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {showBankBadge && bankInfo && (
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", bankInfo.color)}>
            {bankInfo.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        {showBankBadge && !bankInfo && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm truncate">
            {formattedAccount}
          </p>
          {bankInfo && (
            <p className="text-xs text-muted-foreground">{bankInfo.name}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{copied ? 'Skopiowano!' : 'Kopiuj numer'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {isSelected && (
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" />
            Wybrano
          </Badge>
        )}
      </div>
    </div>
  );
}

export function BankAccountSelector({
  accounts,
  selectedAccount,
  onSelectAccount,
  companyName,
  nip,
  compact = false,
}: BankAccountSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const displayLimit = compact ? 2 : 3;
  const hasMore = accounts.length > displayLimit;
  const visibleAccounts = expanded ? accounts : accounts.slice(0, displayLimit);

  const handleSelect = (account: string) => {
    onSelectAccount(account);
    toast.success('Wybrano konto bankowe z białej listy VAT');
    setDialogOpen(false);
  };

  const handleCopy = () => {
    toast.success('Numer konta skopiowany do schowka');
  };

  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Konta na białej liście VAT
          </span>
          <Badge variant="secondary" className="text-xs">
            {accounts.length}
          </Badge>
        </div>
        {hasMore && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="link" size="sm" className="text-xs h-auto p-0">
                Pokaż wszystkie
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Konta bankowe na białej liście
                </DialogTitle>
                {companyName && (
                  <p className="text-sm text-muted-foreground">
                    {companyName} {nip && `(NIP: ${nip})`}
                  </p>
                )}
              </DialogHeader>
              <ScrollArea className="max-h-[400px] pr-4">
                <div className="space-y-2">
                  {accounts.map((account, idx) => (
                    <BankAccountCard
                      key={idx}
                      account={account}
                      isSelected={selectedAccount === account}
                      onSelect={() => handleSelect(account)}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Dane z Wykazu Podatników VAT Ministerstwa Finansów
                </p>
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Zweryfikowane
                </Badge>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      
      <div className="space-y-2">
        {visibleAccounts.map((account, idx) => (
          <BankAccountCard
            key={idx}
            account={account}
            isSelected={selectedAccount === account}
            onSelect={() => handleSelect(account)}
            onCopy={handleCopy}
            showBankBadge={!compact}
          />
        ))}
      </div>
      
      {hasMore && !expanded && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          <ChevronDown className="h-4 w-4 mr-1" />
          Pokaż więcej ({accounts.length - displayLimit})
        </Button>
      )}
      
      {expanded && hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setExpanded(false)}
        >
          <ChevronUp className="h-4 w-4 mr-1" />
          Zwiń
        </Button>
      )}
    </div>
  );
}
