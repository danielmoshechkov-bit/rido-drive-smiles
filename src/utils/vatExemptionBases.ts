// Najczęstsze podstawy prawne zwolnienia z VAT (ustawa z 11.03.2004 o podatku
// od towarów i usług). Wybierana wartość trafia: na PDF faktury zw (wymóg
// art. 106e ust. 1 pkt 19) i do KSeF FA(3) jako P_19A.
export interface VatExemptionBasis {
  value: string; // pełny tekst przepisu — dokładnie to idzie na fakturę/do KSeF
  label: string; // krótki opis do listy wyboru
}

export const VAT_EXEMPTION_BASES: VatExemptionBasis[] = [
  { value: 'art. 113 ust. 1 ustawy o VAT', label: 'art. 113 ust. 1 — zwolnienie podmiotowe (sprzedaż do 200 000 zł rocznie)' },
  { value: 'art. 113 ust. 9 ustawy o VAT', label: 'art. 113 ust. 9 — zwolnienie podmiotowe (rozpoczęcie działalności w trakcie roku)' },
  { value: 'art. 43 ust. 1 pkt 18 ustawy o VAT', label: 'art. 43 ust. 1 pkt 18 — usługi opieki medycznej (podmioty lecznicze)' },
  { value: 'art. 43 ust. 1 pkt 19 ustawy o VAT', label: 'art. 43 ust. 1 pkt 19 — usługi medyczne (lekarze, pielęgniarki, psycholodzy, zawody medyczne)' },
  { value: 'art. 43 ust. 1 pkt 26 ustawy o VAT', label: 'art. 43 ust. 1 pkt 26 — usługi kształcenia (jednostki systemu oświaty, uczelnie)' },
  { value: 'art. 43 ust. 1 pkt 27 ustawy o VAT', label: 'art. 43 ust. 1 pkt 27 — prywatne nauczanie przez nauczycieli' },
  { value: 'art. 43 ust. 1 pkt 28 ustawy o VAT', label: 'art. 43 ust. 1 pkt 28 — nauczanie języków obcych' },
  { value: 'art. 43 ust. 1 pkt 37 ustawy o VAT', label: 'art. 43 ust. 1 pkt 37 — usługi ubezpieczeniowe' },
  { value: 'art. 43 ust. 1 pkt 38 ustawy o VAT', label: 'art. 43 ust. 1 pkt 38 — udzielanie kredytów i pożyczek' },
  { value: 'art. 43 ust. 1 pkt 40 ustawy o VAT', label: 'art. 43 ust. 1 pkt 40 — usługi finansowe (depozyty, rozliczenia, płatności)' },
  { value: 'art. 43 ust. 1 pkt 10 ustawy o VAT', label: 'art. 43 ust. 1 pkt 10 — dostawa budynków/lokali (po 2 latach od pierwszego zasiedlenia)' },
  { value: 'przepisy wydane na podstawie art. 82 ust. 3 ustawy o VAT', label: 'art. 82 ust. 3 — zwolnienia z rozporządzeń wykonawczych' },
];

export const VAT_EXEMPTION_CUSTOM = '__custom__';
