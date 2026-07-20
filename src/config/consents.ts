// DO WERYFIKACJI PRAWNEJ — projekty treści zgód klienta końcowego warsztatu,
// zbieranych przy podpisie protokołu przyjęcia pojazdu / zlecenia.
//
// NIE ZAIMPLEMENTOWANE W UI — ten plik to wyłącznie projekt treści do
// akceptacji przez prawnika. Wdrożenie checkboxów w flow podpisu protokołu
// nastąpi osobno, po akceptacji.
//
// Zasady konstrukcyjne (RODO art. 7):
// - zgody są rozdzielne i niezależne — jeden checkbox = jedna zgoda,
// - zgoda marketingowa (b) jest w pełni dobrowolna i NIE może warunkować
//   realizacji naprawy ani zgody (a),
// - każda zgoda zawiera informację o prawie jej wycofania w dowolnym momencie.

import { LEGAL_ENTITY } from "@/config/legal";

export interface ConsentDefinition {
  /** Stały identyfikator zgody — do zapisu w bazie razem z wersją i timestampem */
  id: string;
  /** Wersja treści — podbijać przy każdej zmianie tekstu */
  version: string;
  required: boolean;
  /** Krótka etykieta przy checkboxie */
  label: string;
  /** Pełna treść zgody */
  text: string;
}

export const CLIENT_CONSENTS: ConsentDefinition[] = [
  {
    id: "workshop-service-processing",
    version: "1.0-draft",
    required: true,
    label: "Zgoda na obsługę naprawy (wymagana)",
    text:
      "Przyjmuję do wiadomości, że administratorem moich danych osobowych jest warsztat " +
      "wskazany w protokole, a dane (imię i nazwisko, dane kontaktowe, dane pojazdu i zakres " +
      "zlecenia) będą przetwarzane w celu realizacji naprawy, w tym komunikacji o statusie " +
      "zlecenia (SMS/e-mail: kosztorys, potwierdzenie przyjęcia pojazdu, status naprawy, " +
      "link do podpisu protokołu). Dostawcą systemu informatycznego, działającym na zlecenie " +
      `warsztatu jako podmiot przetwarzający, jest ${LEGAL_ENTITY.name}. ` +
      "Podanie danych jest niezbędne do realizacji zlecenia. Przysługuje mi prawo dostępu " +
      "do danych, ich sprostowania, usunięcia i ograniczenia przetwarzania.",
  },
  {
    id: "getrido-marketing",
    version: "1.0-draft",
    required: false,
    label: "Zgoda na komunikację marketingową GetRido (dobrowolna)",
    text:
      `Wyrażam dobrowolną zgodę na przetwarzanie moich danych kontaktowych przez ${LEGAL_ENTITY.name} ` +
      `(ul. ${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.city}) jako administratora, ` +
      "w celu przesyłania mi informacji handlowych i marketingowych dotyczących usług platformy " +
      "GetRido drogą elektroniczną (e-mail, SMS). Zgoda jest niezależna od realizacji naprawy — " +
      "jej brak nie wpływa na wykonanie zlecenia. Zgodę mogę wycofać w każdej chwili, pisząc na " +
      `${LEGAL_ENTITY.email}, bez wpływu na zgodność z prawem przetwarzania sprzed wycofania.`,
  },
];
