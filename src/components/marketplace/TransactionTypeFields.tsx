import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AdditionalFeesInput, AdditionalFee } from "./AdditionalFeesInput";
import { Card, CardContent } from "@/components/ui/card";

// Rent-to-own data
export interface RentToOwnData {
  totalInstallments: string;
  downPayment: string;
  monthlyRate: string;
  finalPayment: string;
  hasAdditionalFees: boolean;
  additionalFees: AdditionalFee[];
}

// Leasing transfer data
export interface LeasingTransferData {
  transferFee: string;
  grossRate: string;
  netRate: string;
  buyoutAmount: string;
  buyoutDate: string;
  contractDate: string;
  remainingInstallments: string;
  hasAdditionalFees: boolean;
  additionalFees: AdditionalFee[];
}

// Exchange data
export interface ExchangeData {
  exchangeType: "equal" | "i-pay" | "they-pay";
  extraPayment: string;
}

interface TransactionTypeFieldsProps {
  transactionType: string;
  rentToOwn: RentToOwnData;
  leasingTransfer: LeasingTransferData;
  exchange: ExchangeData;
  onRentToOwnChange: (data: RentToOwnData) => void;
  onLeasingTransferChange: (data: LeasingTransferData) => void;
  onExchangeChange: (data: ExchangeData) => void;
}

export const initialRentToOwn: RentToOwnData = {
  totalInstallments: "",
  downPayment: "",
  monthlyRate: "",
  finalPayment: "",
  hasAdditionalFees: false,
  additionalFees: [],
};

export const initialLeasingTransfer: LeasingTransferData = {
  transferFee: "",
  grossRate: "",
  netRate: "",
  buyoutAmount: "",
  buyoutDate: "",
  contractDate: "",
  remainingInstallments: "",
  hasAdditionalFees: false,
  additionalFees: [],
};

export const initialExchange: ExchangeData = {
  exchangeType: "equal",
  extraPayment: "",
};

export function TransactionTypeFields({
  transactionType,
  rentToOwn,
  leasingTransfer,
  exchange,
  onRentToOwnChange,
  onLeasingTransferChange,
  onExchangeChange,
}: TransactionTypeFieldsProps) {
  // Wynajem z wykupem
  if (transactionType === "wynajem-z-wykupem") {
    return (
      <Card className="mt-4 border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Szczegóły wynajmu z wykupem</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Liczba rat</Label>
              <Input
                type="number"
                placeholder="np. 36"
                value={rentToOwn.totalInstallments}
                onChange={(e) => onRentToOwnChange({ ...rentToOwn, totalInstallments: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Rata początkowa (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 5000"
                value={rentToOwn.downPayment}
                onChange={(e) => onRentToOwnChange({ ...rentToOwn, downPayment: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Rata miesięczna (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 1500"
                value={rentToOwn.monthlyRate}
                onChange={(e) => onRentToOwnChange({ ...rentToOwn, monthlyRate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Rata końcowa / wykup (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 10000"
                value={rentToOwn.finalPayment}
                onChange={(e) => onRentToOwnChange({ ...rentToOwn, finalPayment: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={rentToOwn.hasAdditionalFees}
              onCheckedChange={(v) => onRentToOwnChange({ 
                ...rentToOwn, 
                hasAdditionalFees: v,
                additionalFees: v ? rentToOwn.additionalFees : []
              })}
            />
            <Label className="text-sm">Dodatkowe opłaty</Label>
          </div>

          {rentToOwn.hasAdditionalFees && (
            <AdditionalFeesInput
              fees={rentToOwn.additionalFees}
              onChange={(fees) => onRentToOwnChange({ ...rentToOwn, additionalFees: fees })}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  // Cesja leasingu
  if (transactionType === "cesja-leasingu") {
    return (
      <Card className="mt-4 border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Szczegóły cesji leasingu</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Odstępne (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 15000"
                value={leasingTransfer.transferFee}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, transferFee: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Rata brutto (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 2000"
                value={leasingTransfer.grossRate}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, grossRate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Rata netto (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 1626"
                value={leasingTransfer.netRate}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, netRate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Wykup (PLN)</Label>
              <Input
                type="number"
                placeholder="np. 5000"
                value={leasingTransfer.buyoutAmount}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, buyoutAmount: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Kiedy wykup</Label>
              <Input
                type="date"
                value={leasingTransfer.buyoutDate}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, buyoutDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Data zawarcia umowy</Label>
              <Input
                type="date"
                value={leasingTransfer.contractDate}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, contractDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Pozostałe raty</Label>
              <Input
                type="number"
                placeholder="np. 24"
                value={leasingTransfer.remainingInstallments}
                onChange={(e) => onLeasingTransferChange({ ...leasingTransfer, remainingInstallments: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={leasingTransfer.hasAdditionalFees}
              onCheckedChange={(v) => onLeasingTransferChange({ 
                ...leasingTransfer, 
                hasAdditionalFees: v,
                additionalFees: v ? leasingTransfer.additionalFees : []
              })}
            />
            <Label className="text-sm">Dodatkowe opłaty</Label>
          </div>

          {leasingTransfer.hasAdditionalFees && (
            <AdditionalFeesInput
              fees={leasingTransfer.additionalFees}
              onChange={(fees) => onLeasingTransferChange({ ...leasingTransfer, additionalFees: fees })}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  // Zamiana
  if (transactionType === "zamiana") {
    return (
      <Card className="mt-4 border-primary/20 bg-primary/5">
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Warunki zamiany</h4>
          
          <RadioGroup
            value={exchange.exchangeType}
            onValueChange={(v) => onExchangeChange({ 
              ...exchange, 
              exchangeType: v as ExchangeData["exchangeType"],
              extraPayment: v === "equal" ? "" : exchange.extraPayment
            })}
            className="space-y-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="equal" id="equal" />
              <Label htmlFor="equal" className="cursor-pointer">1:1 (bez dopłat)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="they-pay" id="they-pay" />
              <Label htmlFor="they-pay" className="cursor-pointer">Oczekuję dopłaty od kupującego</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="i-pay" id="i-pay" />
              <Label htmlFor="i-pay" className="cursor-pointer">Dopłacam ze swojej strony</Label>
            </div>
          </RadioGroup>

          {exchange.exchangeType !== "equal" && (
            <div>
              <Label className="text-xs">
                Kwota dopłaty (PLN) - {exchange.exchangeType === "i-pay" ? "dopłacasz Ty" : "dopłaca kupujący"}
              </Label>
              <Input
                type="number"
                placeholder="np. 5000"
                value={exchange.extraPayment}
                onChange={(e) => onExchangeChange({ ...exchange, extraPayment: e.target.value })}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}
