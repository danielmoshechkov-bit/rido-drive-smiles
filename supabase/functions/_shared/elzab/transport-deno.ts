/**
 * Transport TCP dla Deno (Supabase edge functions).
 *
 * Uwaga: czytanie odbywa się w jednej pętli w tle i trafia do kolejki — dzięki temu
 * timeout na `read()` nie „gubi" bajtów (przerwany odczyt w Deno nadal by je pochłonął).
 */

import { ElzabConnectionError } from './errors.ts';
import type { ElzabTransport, TransportOptions } from './transport.ts';

declare const Deno: {
  connect(options: { hostname: string; port: number; transport?: 'tcp' }): Promise<{
    read(p: Uint8Array): Promise<number | null>;
    write(p: Uint8Array): Promise<number>;
    close(): void;
  }>;
};

export async function createDenoTransport(opts: TransportOptions): Promise<ElzabTransport> {
  let conn: Awaited<ReturnType<typeof Deno.connect>>;
  try {
    conn = await withTimeout(
      Deno.connect({ hostname: opts.host, port: opts.port, transport: 'tcp' }),
      opts.connectTimeoutMs,
      () => {
        throw new Error(`connect timeout ${opts.connectTimeoutMs} ms`);
      },
    );
  } catch (error) {
    throw new ElzabConnectionError(opts.host, opts.port, error);
  }

  const queue: Uint8Array[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;

  // Kolejka oczekujących zamiast pojedynczego `notify` — czytelniejsza i bez pułapek
  // zawężania typów w domknięciu pętli odczytu.
  const wakeAll = () => {
    while (waiters.length) waiters.shift()!();
  };

  (async () => {
    const buf = new Uint8Array(4096);
    try {
      while (true) {
        const n = await conn.read(buf);
        if (n === null) break;
        queue.push(buf.slice(0, n));
        wakeAll();
      }
    } catch {
      // połączenie zamknięte/zerwane — sygnalizujemy przez `closed`
    } finally {
      closed = true;
      wakeAll();
    }
  })();

  return {
    async write(data: Uint8Array) {
      let offset = 0;
      while (offset < data.length) {
        offset += await conn.write(data.subarray(offset));
      }
    },

    async read(timeoutMs: number): Promise<Uint8Array | null> {
      if (queue.length) return queue.shift()!;
      if (closed) return null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          const index = waiters.indexOf(wake);
          if (index >= 0) waiters.splice(index, 1);
          resolve();
        }, timeoutMs);
        const wake = () => {
          clearTimeout(timer);
          resolve();
        };
        waiters.push(wake);
      });
      if (queue.length) return queue.shift()!;
      return closed ? null : new Uint8Array();
    },

    async close() {
      closed = true;
      try {
        conn.close();
      } catch {
        // już zamknięte
      }
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => never): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout();
          } catch (error) {
            reject(error);
          }
        }, ms) as unknown as number;
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
