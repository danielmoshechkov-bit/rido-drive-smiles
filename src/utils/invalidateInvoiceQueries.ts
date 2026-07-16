import type { QueryClient } from '@tanstack/react-query';

// Unieważnia WSZYSTKIE zapytania zależne od zestawu faktur — po wystawieniu,
// edycji, usunięciu (soft-delete). Bez tego Przegląd (statystyki tax-overview
// + lista) pokazywał usunięte faktury i liczył je do sum/VAT, bo cache nie był
// odświeżany, gdy usunięcie zaszło w innym miejscu (np. w zakładce Faktury).
export function invalidateInvoiceQueries(queryClient: QueryClient) {
  ['invoices-module-sales', 'tax-overview-sales', 'tax-overview-purchases'].forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
}
