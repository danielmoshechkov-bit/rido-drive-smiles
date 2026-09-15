import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ClipboardCheck, FileText, Receipt } from 'lucide-react';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { FiscalReceiptDialog } from '@/components/fiscal/FiscalReceiptDialog';
import { ExistingInvoiceModal } from './ExistingInvoiceModal';
import { zbudujDokumentZlecenia } from '@/utils/workshopOrderDocument';
import {
  przygotujFaktureZeZlecenia, znajdzFaktureZlecenia, type PrzygotowanaFaktura,
} from '@/lib/fakturaZeZlecenia';

/**
 * WYSTAWIANIE DOKUMENTÓW DO ZLECENIA — jeden mechanizm, dwa miejsca użycia.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SEDNO: PONOWNE WYDANIE TEJ SAMEJ FAKTURY, NIE NOWEJ
 * ═══════════════════════════════════════════════════════════════════════════
 * Klient dzwoni po fakturę do zlecenia sprzed pół roku — zgubił, potrzebuje do
 * księgowości. System ma ODNALEŹĆ ten dokument i wydać GO: ten sam numer, ta
 * sama treść, ta sama data. Nie wolno wystawić drugiego z nowym numerem, bo
 * to jest druga sprzedaż w księgach i drugi dokument w KSeF.
 *
 * Dlatego przy każdym „Faktura" pytamy najpierw `znajdzFaktureZlecenia`.
 * Gdy coś wróci — otwieramy `ExistingInvoiceModal`, z którego idzie wysyłka
 * mailem i pobranie PDF-a. Nowa faktura powstaje WYŁĄCZNIE wtedy, gdy do
 * zlecenia nie wystawiono jeszcze żadnej.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO OSOBNY KOMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Te same trzy dokumenty wystawia się z listy zleceń i z historii zleceń przy
 * pojeździe. Druga kopia tego kodu znaczyłaby, że następna poprawka trafia do
 * jednej z nich — a warsztat wystawiający dokument drugą drogą dostaje starą
 * usterkę. Składanie danych siedzi w `lib/fakturaZeZlecenia.ts`, okna tutaj.
 */
export function WorkshopDokumentyZlecenia({
  providerId,
  zlecenie,
  onZmiana,
}: {
  providerId: string;
  /** Dokładnie jedno zaznaczone zlecenie; `null` = menu nieczynne. */
  zlecenie: any | null;
  onZmiana?: () => void;
}) {
  const qc = useQueryClient();
  const [istniejaca, setIstniejaca] = useState<any | null>(null);
  const [nowaFaktura, setNowaFaktura] = useState<PrzygotowanaFaktura | null>(null);
  const [zlecenieFaktury, setZlecenieFaktury] = useState<any | null>(null);
  const [potwierdzenie, setPotwierdzenie] = useState<any | null>(null);
  const [paragonZlecenie, setParagonZlecenie] = useState<any | null>(null);

  const faktura = async () => {
    if (!zlecenie) return;
    try {
      const juzJest = await znajdzFaktureZlecenia(zlecenie.id);
      if (juzJest) {
        setZlecenieFaktury(zlecenie);
        setIstniejaca(juzJest);
        return;
      }
      setNowaFaktura(await przygotujFaktureZeZlecenia(zlecenie));
      setZlecenieFaktury(zlecenie);
    } catch (e: any) {
      toast.error('Nie udało się wczytać pozycji zlecenia.');
    }
  };

  const potwierdzenieWykonania = async () => {
    if (!zlecenie) return;
    try {
      setPotwierdzenie(await zbudujDokumentZlecenia(zlecenie, 'service_confirmation'));
    } catch (e: any) {
      toast.error('Nie udało się złożyć potwierdzenia: ' + (e?.message ?? 'nieznany błąd'));
    }
  };

  const brak = !zlecenie;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <FileText className="h-4 w-4" /> Wystaw <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* Menu otwiera się zawsze — warsztat ma widzieć, że funkcja istnieje,
              zanim zaznaczy zlecenie. Tak samo jak w liście zleceń. */}
          {brak && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground max-w-[240px]">
              Zaznacz jedno zlecenie, żeby wystawić do niego dokument.
            </div>
          )}
          <DropdownMenuItem disabled={brak} onClick={faktura}>
            <FileText className="h-4 w-4 mr-2" /> Faktura
          </DropdownMenuItem>
          <DropdownMenuItem disabled={brak} onClick={() => setParagonZlecenie(zlecenie)}>
            <Receipt className="h-4 w-4 mr-2" /> Paragon fiskalny
          </DropdownMenuItem>
          <DropdownMenuItem disabled={brak} onClick={potwierdzenieWykonania}>
            <ClipboardCheck className="h-4 w-4 mr-2" /> Potwierdzenie wykonania usługi
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* FAKTURA JUŻ WYSTAWIONA — wydajemy ją, nie tworzymy drugiej. */}
      {istniejaca && (
        <ExistingInvoiceModal
          open={!!istniejaca}
          onOpenChange={(v) => { if (!v) { setIstniejaca(null); setZlecenieFaktury(null); } }}
          invoice={istniejaca}
          orderNumber={zlecenieFaktury?.order_number}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['fiscal-order-badges'] });
            onZmiana?.();
          }}
        />
      )}

      {/* NOWA FAKTURA — tylko gdy do zlecenia nie było jeszcze żadnej. */}
      {nowaFaktura && zlecenieFaktury && (
        <Dialog open onOpenChange={(v) => { if (!v) { setNowaFaktura(null); setZlecenieFaktury(null); } }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">Wystaw fakturę</DialogTitle>
            <SimpleFreeInvoice
              onClose={() => { setNowaFaktura(null); setZlecenieFaktury(null); }}
              onSaved={() => {
                setNowaFaktura(null);
                setZlecenieFaktury(null);
                toast.success('Faktura wystawiona');
                qc.invalidateQueries({ queryKey: ['fiscal-order-badges'] });
                qc.invalidateQueries({ queryKey: ['workshop-orders'] });
                onZmiana?.();
              }}
              prefillItems={nowaFaktura.pozycje}
              prefillBuyer={nowaFaktura.nabywca}
              prefillVehicleNotes={nowaFaktura.uwagiPojazd}
              prefillOrderNotes={nowaFaktura.uwagiZlecenie}
              prefillOrderNumber={zlecenieFaktury.order_number}
              prefillWorkshopOrderId={zlecenieFaktury.id}
            />
          </DialogContent>
        </Dialog>
      )}

      {potwierdzenie && (
        <InvoicePreviewModal
          open={!!potwierdzenie}
          onOpenChange={(v) => { if (!v) setPotwierdzenie(null); }}
          invoiceData={potwierdzenie}
          isLoggedIn
          mode="document"
          titleLabel="Potwierdzenie wykonania usługi"
        />
      )}

      <FiscalReceiptDialog
        open={!!paragonZlecenie}
        onOpenChange={(v) => { if (!v) setParagonZlecenie(null); }}
        providerId={providerId}
        order={paragonZlecenie}
        onIssueInvoice={() => {
          // Skrót z paragonu powyżej 450 zł — firma potrzebuje pełnej faktury.
          setParagonZlecenie(null);
          void faktura();
        }}
      />
    </>
  );
}
