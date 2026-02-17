// Rental Contract Generator - Universal Template
import { format } from "date-fns";
import { pl } from "date-fns/locale";

export interface ContractData {
  // Basic info
  contractNumber: string;
  createdAt: string;
  contractDate?: string; // custom date of contract signing (can be earlier)
  
  // Vehicle
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleVin: string;
  vehicleYear: number | null;
  
  // Driver/Tenant (Najemca - fleet partner)
  driverFirstName: string;
  driverLastName: string;
  driverPesel: string;
  driverAddress: string;
  driverPhone: string;
  driverEmail: string;
  driverLicenseNumber: string;
  
  // Fleet/Lessor (Wynajmujący - vehicle owner)
  fleetName: string;
  fleetNip?: string;
  fleetAddress?: string;
  fleetPhone?: string;
  fleetEmail?: string;
  fleetKrsCeidg?: string;
  fleetRepresentedBy?: string;
  
  // Rental terms
  rentalType: 'standard' | 'taxi' | 'long_term' | 'buyout';
  rentalStart: string;
  rentalEnd?: string | null;
  isIndefinite: boolean;
  weeklyFee: number;
  
  // Signatures
  driverSignatureUrl?: string;
  fleetSignatureUrl?: string;
  fleetStampUrl?: string;
  driverSignedAt?: string;
  fleetSignedAt?: string;
}

export function generateContractNumber(year: number, sequence: number): string {
  return `${sequence}/${year}`;
}

export function generateRentalContractHtml(data: ContractData): string {
  const contractDate = data.contractDate || data.createdAt;
  const formattedDate = format(new Date(contractDate), "d MMMM yyyy", { locale: pl });

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
    .title-block {
      text-align: center;
      margin-bottom: 30px;
    }
    .title-block h1 { 
      font-size: 16pt; 
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 5px;
    }
    .title-block .subtitle { 
      font-size: 11pt; 
      margin-bottom: 5px;
    }
    .section { margin-bottom: 20px; }
    .section-title { 
      font-size: 12pt; 
      font-weight: bold; 
      margin-bottom: 10px;
      text-align: center;
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
    .parties-block {
      margin-bottom: 20px;
    }
    .party-block {
      margin-bottom: 15px;
      padding-left: 20px;
    }
    .party-label { 
      font-weight: bold;
      margin-bottom: 5px;
    }
    .party-details { font-size: 11pt; line-height: 1.5; }
    .vehicle-info {
      padding-left: 20px;
      margin: 10px 0;
    }
    .vehicle-info p {
      margin-bottom: 4px;
    }
    .signatures { 
      display: flex; 
      justify-content: space-between;
      margin-top: 60px;
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
    ol, ul { margin-left: 25px; margin-bottom: 12px; }
    ol li, ul li { margin-bottom: 6px; }
    .small-text { font-size: 10pt; }
  </style>
</head>
<body>
  <div class="contract">
    <!-- Title -->
    <div class="title-block">
      <h1>Umowa Najmu Pojazdu</h1>
      <div class="subtitle">Nr: ${data.contractNumber}</div>
    </div>

    <p class="paragraph-no-indent" style="margin-bottom: 25px;">
      zawarta w dniu <strong>${formattedDate}</strong> pomiędzy:
    </p>

    <!-- Parties -->
    <div class="parties-block">
      <div class="party-block">
        <p><strong>${data.fleetName}</strong></p>
        <div class="party-details">
          ${data.fleetAddress ? `<p>z siedzibą: ${data.fleetAddress}</p>` : ''}
          ${data.fleetNip ? `<p>NIP: ${data.fleetNip}</p>` : ''}
          ${data.fleetKrsCeidg ? `<p>KRS / CEIDG: ${data.fleetKrsCeidg}</p>` : ''}
          ${data.fleetRepresentedBy ? `<p>reprezentowaną przez: ${data.fleetRepresentedBy}</p>` : ''}
        </div>
        <p>zwaną dalej <strong>„Najemcą"</strong></p>
      </div>

      <p style="text-align: center; margin: 15px 0;">a</p>

      <div class="party-block">
        <p><strong>${data.driverFirstName} ${data.driverLastName}</strong></p>
        <div class="party-details">
          ${data.driverPesel ? `<p>PESEL: ${data.driverPesel}</p>` : ''}
          ${data.driverAddress ? `<p>adres zamieszkania: ${data.driverAddress}</p>` : ''}
        </div>
        <p>zwanym/ą dalej <strong>„Wynajmującym"</strong></p>
      </div>
    </div>

    <!-- §1 Przedmiot umowy -->
    <div class="section">
      <div class="section-title">§1 Przedmiot umowy</div>
      <p class="paragraph-no-indent">Wynajmujący oddaje Najemcy do używania pojazd:</p>
      <div class="vehicle-info">
        <p>Marka: <strong>${data.vehicleBrand}</strong></p>
        <p>Model: <strong>${data.vehicleModel}</strong></p>
        <p>Numer VIN: <strong>${data.vehicleVin || '—'}</strong></p>
        <p>Numer rejestracyjny: <strong>${data.vehiclePlate}</strong></p>
      </div>
      <p class="paragraph-no-indent" style="margin-top: 15px;">Wynajmujący oświadcza, że:</p>
      <ol type="a" style="margin-left: 25px;">
        <li>jest właścicielem pojazdu lub posiada tytuł prawny do jego wynajmu,</li>
        <li>pojazd jest sprawny technicznie i dopuszczony do ruchu,</li>
        <li>pojazd posiada wymagane badania techniczne oraz ubezpieczenie OC,</li>
        <li>pojazd spełnia wymogi przewidziane przepisami prawa dla świadczenia usług przewozowych (jeżeli dotyczy).</li>
      </ol>
    </div>

    <!-- §2 Cel najmu -->
    <div class="section">
      <div class="section-title">§2 Cel najmu</div>
      <p class="paragraph">
        Pojazd zostaje oddany w najem w celu umożliwienia Najemcy korzystania z niego przy realizacji 
        usług przewozu osób lub rzeczy za pośrednictwem aplikacji transportowych.
      </p>
      <p class="paragraph">
        Umowa niniejsza ma charakter cywilnoprawny i nie stanowi umowy o pracę ani nie tworzy stosunku 
        podporządkowania pomiędzy Stronami.
      </p>
    </div>

    <!-- §3 Okres trwania umowy -->
    <div class="section">
      <div class="section-title">§3 Okres trwania umowy</div>
      <ol>
        <li>Umowa zostaje zawarta na czas nieokreślony.</li>
        <li>Każda ze Stron może wypowiedzieć umowę z zachowaniem 7-dniowego okresu wypowiedzenia.</li>
        <li>W przypadku rażącego naruszenia postanowień umowy każda ze Stron może rozwiązać umowę ze skutkiem natychmiastowym.</li>
      </ol>
    </div>

    <!-- §4 Czynsz najmu -->
    <div class="section">
      <div class="section-title">§4 Czynsz najmu</div>
      <ol>
        <li>Strony ustalają, że czynsz najmu będzie ustalany miesięcznie.</li>
        <li>Wysokość czynszu może być uzależniona od poziomu eksploatacji pojazdu, w szczególności liczby przejazdów, obrotu generowanego przy wykorzystaniu pojazdu lub liczby przejechanych kilometrów.</li>
        <li>Czynsz może być wypłacany w formie zaliczek w okresach tygodniowych.</li>
        <li>Ostateczne rozliczenie czynszu za dany miesiąc następuje do 10 dnia miesiąca następującego po miesiącu rozliczeniowym.</li>
        <li>Czynsz będzie płatny przelewem na rachunek bankowy Wynajmującego wskazany w niniejszej umowie.</li>
      </ol>
    </div>

    <!-- §5 Obowiązki Wynajmującego -->
    <div class="section">
      <div class="section-title">§5 Obowiązki Wynajmującego</div>
      <ol>
        <li>Utrzymywanie pojazdu w należytym stanie technicznym.</li>
        <li>Zapewnienie aktualnych badań technicznych i ubezpieczenia OC.</li>
        <li>Niezwłoczne informowanie Najemcy o wszelkich zdarzeniach mających wpływ na możliwość korzystania z pojazdu.</li>
      </ol>
    </div>

    <!-- §6 Odpowiedzialność podatkowa -->
    <div class="section">
      <div class="section-title">§6 Odpowiedzialność podatkowa</div>
      <ol>
        <li>Strony zgodnie potwierdzają, że czynsz najmu stanowi przychód Wynajmującego.</li>
        <li>Wynajmujący zobowiązuje się do samodzielnego rozliczania podatku dochodowego z tytułu otrzymanego czynszu zgodnie z obowiązującymi przepisami prawa.</li>
        <li>Najemca nie pełni funkcji płatnika podatku dochodowego od czynszu najmu.</li>
      </ol>
    </div>

    <!-- §7 Postanowienia końcowe -->
    <div class="section">
      <div class="section-title">§7 Postanowienia końcowe</div>
      <ol>
        <li>W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu cywilnego.</li>
        <li>Wszelkie zmiany niniejszej umowy wymagają formy pisemnej pod rygorem nieważności.</li>
        <li>Spory wynikłe z niniejszej umowy będą rozstrzygane przez sąd właściwy dla siedziby Najemcy.</li>
        <li>Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron.</li>
      </ol>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="signature">
        ${data.fleetSignatureUrl 
          ? `<img src="${data.fleetSignatureUrl}" class="signature-img" alt="Podpis Wynajmującego" />`
          : '<div style="height: 60px;"></div>'
        }
        ${data.fleetStampUrl ? `<img src="${data.fleetStampUrl}" style="max-width: 80px; max-height: 80px; margin-bottom: 5px;" alt="Pieczątka" />` : ''}
        <div class="signature-line">
          Wynajmujący<br>
          ${data.driverFirstName} ${data.driverLastName}
        </div>
        ${data.driverSignedAt 
          ? `<div class="signature-date">Podpisano: ${format(new Date(data.driverSignedAt), "d.MM.yyyy HH:mm")}</div>`
          : ''
        }
      </div>
      <div class="signature">
        ${data.driverSignatureUrl 
          ? `<img src="${data.driverSignatureUrl}" class="signature-img" alt="Podpis Najemcy" />`
          : '<div style="height: 60px;"></div>'
        }
        <div class="signature-line">
          Najemca<br>
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
