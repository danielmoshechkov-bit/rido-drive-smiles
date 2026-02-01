// Rental Contract Generator - Universal Template
import { format } from "date-fns";
import { pl } from "date-fns/locale";

export interface ContractData {
  // Basic info
  contractNumber: string;
  createdAt: string;
  
  // Vehicle
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleVin: string;
  vehicleYear: number | null;
  
  // Driver/Tenant
  driverFirstName: string;
  driverLastName: string;
  driverPesel: string;
  driverAddress: string;
  driverPhone: string;
  driverEmail: string;
  driverLicenseNumber: string;
  
  // Fleet/Lessor
  fleetName: string;
  fleetNip?: string;
  fleetAddress?: string;
  fleetPhone?: string;
  fleetEmail?: string;
  
  // Rental terms
  rentalType: 'standard' | 'taxi' | 'long_term' | 'buyout';
  rentalStart: string;
  rentalEnd?: string | null;
  isIndefinite: boolean;
  weeklyFee: number;
  
  // Signatures
  driverSignatureUrl?: string;
  fleetSignatureUrl?: string;
  driverSignedAt?: string;
  fleetSignedAt?: string;
}

const RENTAL_TYPE_LABELS: Record<string, string> = {
  standard: 'najem zwykły / prywatny',
  taxi: 'najem do celów przewozu osób (taxi/Uber/Bolt)',
  long_term: 'najem długoterminowy',
  buyout: 'najem z opcją wykupu',
};

export function generateRentalContractHtml(data: ContractData): string {
  const rentalTypeLabel = RENTAL_TYPE_LABELS[data.rentalType] || 'najem standardowy';
  const periodText = data.isIndefinite 
    ? `na czas nieokreślony, począwszy od dnia ${format(new Date(data.rentalStart), "d MMMM yyyy", { locale: pl })}`
    : `od dnia ${format(new Date(data.rentalStart), "d MMMM yyyy", { locale: pl })} do dnia ${data.rentalEnd ? format(new Date(data.rentalEnd), "d MMMM yyyy", { locale: pl }) : '—'}`;

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Umowa najmu pojazdu - ${data.contractNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 20mm; size: A4; }
    @media print {
      html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
      .contract { max-width: 100%; page-break-inside: avoid; }
    }
    body { 
      font-family: 'Times New Roman', Georgia, serif; 
      font-size: 12pt; 
      line-height: 1.6; 
      color: #000; 
      background: white;
    }
    .contract { 
      max-width: 210mm; 
      margin: 0 auto; 
      background: white;
      padding: 15mm;
    }
    .header { 
      text-align: right; 
      margin-bottom: 30px;
      font-size: 11pt;
    }
    .header-place-date {
      text-align: right;
      margin-bottom: 40px;
    }
    .title-block {
      text-align: center;
      margin-bottom: 30px;
    }
    .title-block h1 { 
      font-size: 16pt; 
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 10px;
    }
    .title-block .subtitle { 
      font-size: 11pt; 
    }
    .section { margin-bottom: 20px; }
    .section-title { 
      font-size: 12pt; 
      font-weight: bold; 
      margin-bottom: 10px;
      text-decoration: underline;
    }
    .paragraph { 
      margin-bottom: 12px; 
      text-align: justify; 
      text-indent: 1.5em;
    }
    .paragraph-no-indent {
      margin-bottom: 12px; 
      text-align: justify; 
    }
    .parties-table {
      width: 100%;
      margin-bottom: 20px;
      border-collapse: collapse;
    }
    .parties-table td {
      width: 50%;
      vertical-align: top;
      padding: 10px;
    }
    .party-label { 
      font-weight: bold;
      margin-bottom: 5px;
      text-transform: uppercase;
      font-size: 10pt;
    }
    .party-name { font-weight: bold; margin-bottom: 5px; }
    .party-details { font-size: 11pt; line-height: 1.4; }
    .vehicle-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      border: 1px solid #000;
    }
    .vehicle-table td, .vehicle-table th {
      border: 1px solid #000;
      padding: 8px 12px;
      text-align: left;
    }
    .vehicle-table th {
      background: #f5f5f5;
      font-weight: bold;
      width: 35%;
    }
    .terms-box { 
      border: 2px solid #000;
      padding: 15px;
      margin: 15px 0;
      background: #fafafa;
    }
    .fee { 
      font-size: 14pt; 
      font-weight: bold; 
    }
    .signatures { 
      display: flex; 
      justify-content: space-between;
      margin-top: 50px;
      padding-top: 20px;
    }
    .signature { 
      width: 45%;
      text-align: center; 
    }
    .signature-line { 
      border-top: 1px solid #000; 
      margin-top: 60px; 
      padding-top: 8px; 
      font-size: 10pt; 
    }
    .signature-img { max-width: 150px; max-height: 60px; }
    .signature-date { font-size: 9pt; margin-top: 5px; }
    .important { font-weight: bold; }
    ol, ul { margin-left: 25px; margin-bottom: 12px; }
    ol li, ul li { margin-bottom: 8px; }
    .small-text { font-size: 10pt; }
  </style>
</head>
<body>
  <div class="contract">
    <!-- Header with place and date -->
    <div class="header-place-date">
      Warszawa, dnia ${format(new Date(data.createdAt), "d MMMM yyyy", { locale: pl })} r.
    </div>

    <!-- Title -->
    <div class="title-block">
      <h1>Umowa Najmu Pojazdu</h1>
      <div class="subtitle">Nr: ${data.contractNumber}</div>
      <div class="subtitle small-text">zawarta w formie dokumentowej za pośrednictwem Portalu GetRido</div>
    </div>

    <div class="section">
      <div class="section-title">§1. Strony Umowy</div>
      <table class="parties-table">
        <tr>
          <td>
            <div class="party-label">Wynajmujący:</div>
            <div class="party-name">${data.fleetName}</div>
            <div class="party-details">
              ${data.fleetNip ? `NIP: ${data.fleetNip}<br>` : ''}
              ${data.fleetAddress || ''}<br>
              ${data.fleetPhone ? `Tel: ${data.fleetPhone}<br>` : ''}
              ${data.fleetEmail ? `Email: ${data.fleetEmail}` : ''}
            </div>
          </td>
          <td>
            <div class="party-label">Najemca:</div>
            <div class="party-name">${data.driverFirstName} ${data.driverLastName}</div>
            <div class="party-details">
              PESEL: ${data.driverPesel || '—'}<br>
              ${data.driverAddress}<br>
              Tel: ${data.driverPhone}<br>
              Email: ${data.driverEmail}<br>
              Prawo jazdy: ${data.driverLicenseNumber || '—'}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">§2. Przedmiot Umowy</div>
      <p class="paragraph-no-indent">
        Wynajmujący oddaje Najemcy do używania pojazd o następujących parametrach:
      </p>
      <table class="vehicle-table">
        <tr>
          <th>Marka i model</th>
          <td>${data.vehicleBrand} ${data.vehicleModel}</td>
        </tr>
        <tr>
          <th>Nr rejestracyjny</th>
          <td>${data.vehiclePlate}</td>
        </tr>
        <tr>
          <th>VIN</th>
          <td>${data.vehicleVin || '—'}</td>
        </tr>
        <tr>
          <th>Rok produkcji</th>
          <td>${data.vehicleYear || '—'}</td>
        </tr>
      </table>
      <p class="paragraph">
        Pojazd wydawany jest Najemcy w stanie opisanym w elektronicznym protokole zdawczo-odbiorczym, 
        stanowiącym integralną część niniejszej Umowy.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§3. Rodzaj i cel najmu</div>
      <p class="paragraph">
        Najem realizowany jest jako: <strong>${rentalTypeLabel}</strong>.
        ${data.rentalType === 'taxi' ? 'Pojazd może być wykorzystywany do świadczenia usług przewozu osób za pośrednictwem platform Uber, Bolt lub podobnych.' : ''}
        ${data.rentalType === 'buyout' ? 'Najemca ma prawo do wykupu pojazdu na warunkach określonych w osobnym aneksie.' : ''}
      </p>
    </div>

    <div class="section">
      <div class="section-title">§4. Czas trwania Umowy</div>
      <p class="paragraph">
        Umowa zostaje zawarta ${periodText}.
        ${data.isIndefinite ? 'Każda ze Stron może wypowiedzieć Umowę z zachowaniem 14-dniowego okresu wypowiedzenia.' : ''}
      </p>
    </div>

    <div class="section">
      <div class="section-title">§5. Czynsz i płatności</div>
      <div class="terms-box">
        <p>Stawka czynszu najmu: <span class="fee">${data.weeklyFee.toLocaleString('pl-PL')} zł tygodniowo</span></p>
        <p class="small-text" style="margin-top: 8px;">Czynsz płatny jest z góry, w cyklach tygodniowych, do każdego poniedziałku.</p>
      </div>
      <p class="paragraph">
        Wynajmujący ma prawo pobrać kaucję zabezpieczającą. Wcześniejszy zwrot pojazdu nie zwalnia 
        Najemcy z obowiązku zapłaty czynszu za pełny okres rozliczeniowy lub wypowiedzenia.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§6. Obowiązki Najemcy</div>
      <p class="paragraph">
        Najemca zobowiązuje się użytkować pojazd zgodnie z jego przeznaczeniem, przepisami prawa 
        oraz postanowieniami niniejszej Umowy. Zabrania się dokonywania jakichkolwiek przeróbek 
        lub ingerencji w pojazd bez pisemnej zgody Wynajmującego.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§7. Wypowiedzenie Umowy</div>
      <ol>
        <li>Najemca może wypowiedzieć Umowę zawartą na czas nieokreślony z 14-dniowym okresem wypowiedzenia.</li>
        <li>Wypowiedzenie nie zwalnia Najemcy z obowiązku zapłaty należnego czynszu.</li>
        <li>Wynajmujący może wypowiedzieć Umowę z zachowaniem 14 dni lub ze skutkiem natychmiastowym 
        w przypadku naruszenia Umowy, w szczególności przy braku płatności.</li>
        <li>Wypowiedzenie może nastąpić w formie dokumentowej (SMS, e-mail, komunikator).</li>
      </ol>
    </div>

    <div class="section">
      <div class="section-title">§8. Zwrot pojazdu</div>
      <p class="paragraph">
        Po wypowiedzeniu Umowy Najemca zobowiązany jest zwrócić pojazd w terminie wskazanym przez 
        Wynajmującego, nie krótszym niż 30 minut od doręczenia wypowiedzenia, w miejscu wskazanym 
        przez Wynajmującego. Brak zwrotu skutkuje naliczaniem kar oraz zgłoszeniem podejrzenia 
        przywłaszczenia pojazdu.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§9. Protokół zdawczo-odbiorczy</div>
      <p class="paragraph">
        Wydanie i zwrot pojazdu dokumentowane są elektronicznym protokołem w Portalu GetRido. 
        Protokół wraz ze zdjęciami i historią systemową stanowi dowód stanu pojazdu.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§10. Odpowiedzialność za części pojazdu</div>
      <p class="paragraph important">
        W przypadku demontażu, usunięcia lub wymiany jakichkolwiek części pojazdu bez zgody 
        Wynajmującego, Najemca ponosi koszt nowych części według cen ASO powiększonych o 50% 
        oraz pełny koszt naprawy w autoryzowanym serwisie.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§11. Dane osobowe</div>
      <p class="paragraph">
        Dane osobowe przetwarzane są przez Portal GetRido oraz Wynajmującego. Najemca wyraża zgodę 
        na przekazanie danych Policji, ubezpieczycielom i podmiotom windykacyjnym. Strony uznają 
        za dowody: dokumenty elektroniczne, zdjęcia, logi systemowe oraz dane GPS.
      </p>
    </div>

    <div class="section">
      <div class="section-title">§12. Postanowienia końcowe</div>
      <p class="paragraph">
        Do Umowy stosuje się prawo polskie. Umowa w wersji elektronicznej stanowi oryginał. 
        Integralną częścią Umowy są Ogólne Warunki Najmu (OWU) udostępnione w Portalu GetRido.
      </p>
    </div>

    <div class="signatures">
      <div class="signature">
        ${data.driverSignatureUrl 
          ? `<img src="${data.driverSignatureUrl}" class="signature-img" alt="Podpis Najemcy" />`
          : ''
        }
        <div class="signature-line">
          Podpis Najemcy<br>
          ${data.driverFirstName} ${data.driverLastName}
        </div>
        ${data.driverSignedAt 
          ? `<div class="signature-date">Podpisano: ${format(new Date(data.driverSignedAt), "d.MM.yyyy HH:mm")}</div>`
          : ''
        }
      </div>
      <div class="signature">
        ${data.fleetSignatureUrl 
          ? `<img src="${data.fleetSignatureUrl}" class="signature-img" alt="Podpis Wynajmującego" />`
          : ''
        }
        <div class="signature-line">
          Podpis Wynajmującego<br>
          ${data.fleetName}
        </div>
        ${data.fleetSignedAt 
          ? `<div class="signature-date">Podpisano: ${format(new Date(data.fleetSignedAt), "d.MM.yyyy HH:mm")}</div>`
          : ''
        }
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export function printRentalContract(data: ContractData): void {
  const html = generateRentalContractHtml(data);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }
}
