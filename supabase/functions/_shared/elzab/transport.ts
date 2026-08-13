/**
 * Abstrakcja transportu — ta sama biblioteka protokołu działa w Deno (edge function)
 * i w Node (skrypty testowe na Macu). Implementacje: transport-deno.ts / scripts/elzab/transport-node.ts
 */

export interface ElzabTransport {
  /** Wysyła bajty do drukarki. */
  write(data: Uint8Array): Promise<void>;
  /**
   * Czeka na kolejną porcję danych. Zwraca `null` gdy drukarka zamknęła połączenie
   * i pusty bufor gdy minął `timeoutMs` (client sam pilnuje deadline'u komendy).
   */
  read(timeoutMs: number): Promise<Uint8Array | null>;
  close(): Promise<void>;
}

export interface TransportOptions {
  host: string;
  port: number;
  connectTimeoutMs: number;
}

export type TransportFactory = (opts: TransportOptions) => Promise<ElzabTransport>;
