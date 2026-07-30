/**
 * Transport TCP dla Node.js — używany wyłącznie przez lokalne skrypty testowe.
 * Produkcja (edge function) korzysta z transport-deno.ts. Logika protokołu jest wspólna.
 */

import net from 'node:net';
import { ElzabConnectionError } from '../../supabase/functions/_shared/elzab/errors.ts';
import type { ElzabTransport, TransportOptions } from '../../supabase/functions/_shared/elzab/transport.ts';

export function createNodeTransport(opts: TransportOptions): Promise<ElzabTransport> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const queue: Uint8Array[] = [];
    let closed = false;
    let notify: (() => void) | null = null;

    const connectTimer = setTimeout(() => {
      socket.destroy();
      reject(new ElzabConnectionError(opts.host, opts.port, `connect timeout ${opts.connectTimeoutMs} ms`));
    }, opts.connectTimeoutMs);

    socket.on('data', (chunk: Buffer) => {
      queue.push(new Uint8Array(chunk));
      notify?.();
    });
    socket.on('close', () => {
      closed = true;
      notify?.();
    });
    socket.on('error', (error) => {
      closed = true;
      notify?.();
      clearTimeout(connectTimer);
      reject(new ElzabConnectionError(opts.host, opts.port, error));
    });

    socket.connect(opts.port, opts.host, () => {
      clearTimeout(connectTimer);
      socket.setNoDelay(true);
      resolve({
        write(data: Uint8Array) {
          return new Promise<void>((res, rej) => {
            socket.write(Buffer.from(data), (error) => (error ? rej(error) : res()));
          });
        },

        async read(timeoutMs: number): Promise<Uint8Array | null> {
          if (queue.length) return queue.shift()!;
          if (closed) return null;
          await new Promise<void>((res) => {
            const timer = setTimeout(() => {
              notify = null;
              res();
            }, timeoutMs);
            notify = () => {
              clearTimeout(timer);
              notify = null;
              res();
            };
          });
          if (queue.length) return queue.shift()!;
          return closed ? null : new Uint8Array();
        },

        async close() {
          closed = true;
          socket.destroy();
        },
      });
    });
  });
}
