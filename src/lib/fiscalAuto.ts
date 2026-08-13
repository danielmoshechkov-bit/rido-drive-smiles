/**
 * Automatyczny raport dobowy — ustawienie KOMPUTERA, nie firmy.
 *
 * PO CO: raport dobowy jest obowiązkiem (po zakończeniu sprzedaży, najpóźniej przed pierwszą
 * sprzedażą następnego dnia), a drukarka po 48 h bez raportu po prostu blokuje sprzedaż.
 * Zapomniany raport to zamknięty warsztat w poniedziałek rano.
 *
 * DLACZEGO NIE CRON W CHMURZE: drukarka stoi w sieci lokalnej i serwer jej nie widzi.
 * Raport może wykonać tylko komputer przy drukarce — ten sam, który ma mostek. Dlatego
 * harmonogram siedzi w przeglądarce tego stanowiska, a nie w bazie tenanta.
 *
 * Automat nie zwalnia z pilnowania: gdy komputer był wyłączony, po otwarciu panelu raport
 * wykona się od razu (zaległy), a Kasa fiskalna i tak pokazuje ostrzeżenie.
 */

export interface AutoReportConfig {
  enabled: boolean;
  /** Godzina (0–23), po której raport ma się wykonać — domyślnie po zamknięciu warsztatu. */
  hour: number;
}

const DEFAULT_CONFIG: AutoReportConfig = { enabled: false, hour: 21 };

const storageKey = (providerId?: string) => `fiscal_auto_report:${providerId ?? 'default'}`;

export function getAutoReportConfig(providerId?: string): AutoReportConfig {
  try {
    const raw = localStorage.getItem(storageKey(providerId));
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    const hour = Number(parsed.hour);
    return {
      enabled: Boolean(parsed.enabled),
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_CONFIG.hour,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setAutoReportConfig(config: AutoReportConfig, providerId?: string): void {
  localStorage.setItem(storageKey(providerId), JSON.stringify(config));
}

/**
 * Czy raport dobowy jest zaległy — liczone od godziny, o której miał się wykonać,
 * a nie „24 h od ostatniego". Warsztat pracuje w dobach, nie w oknach czasowych.
 */
export function dayReportDue(lastReportAt: string | null | undefined, hour: number, now = new Date()): boolean {
  const dueSince = new Date(now);
  dueSince.setHours(hour, 0, 0, 0);
  if (now < dueSince) return false; // jeszcze przed godziną raportu
  if (!lastReportAt) return true;
  return new Date(lastReportAt) < dueSince;
}

/** Ile godzin minęło od ostatniego raportu (drukarka blokuje sprzedaż po 48 h). */
export function hoursSinceReport(lastReportAt?: string | null): number | null {
  if (!lastReportAt) return null;
  return Math.floor((Date.now() - new Date(lastReportAt).getTime()) / 3_600_000);
}
