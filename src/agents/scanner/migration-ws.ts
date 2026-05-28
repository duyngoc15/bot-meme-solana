/**
 * MigrationWSClient — Dual-source WebSocket listener for pump.fun → Raydium migrations.
 *
 * Source 1 (Primary):  Migration wrapper program — parses "Program data:" directly
 * Source 2 (Fallback): Raydium AMM program — detects "initialize2", verifies via RPC
 *
 * Both sources share a deduplication layer; each migration is emitted exactly once.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  MIGRATION_PROGRAM_ID,
  RAYDIUM_AMM_V4_PROGRAM_ID,
  MAX_SEEN_SIGNATURES_CACHE,
  RETRY_INTERVAL_MS,
  RECONNECT_DELAY_MS,
  WS_TIMEOUT_MS,
} from './constants.js';
import {
  parseMigrationFromLogs,
  parseMigrateInstruction,
  type ParsedMigration,
} from './migration-parser.js';

// ── Migration event emitted to scanner ─────────────────────────────────────────

export interface MigrationEvent {
  migration: ParsedMigration;
  signature: string;
  source: string;
}

// ── MigrationWSClient ──────────────────────────────────────────────────────────

export class MigrationWSClient extends EventEmitter {
  private wssEndpoint: string;
  private httpEndpoint: string;
  private stopped = false;

  // Deduplication: both sources share this set
  private seenSignatures = new Set<string>();

  // Signatures with truncated logs waiting for RPC fallback
  private retryQueue = new Set<string>();

  // WebSocket references for cleanup
  private primaryWs: WebSocket | null = null;
  private fallbackWs: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(wssEndpoint: string, httpEndpoint: string) {
    super();
    this.wssEndpoint = wssEndpoint;
    this.httpEndpoint = httpEndpoint;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start both WebSocket listeners and the retry worker.
   * Each listener auto-reconnects on disconnect.
   */
  async start(): Promise<void> {
    this.stopped = false;

    console.log('🚀 pump.fun → Raydium migration detector starting...');
    console.log(`   Primary  : migration wrapper ${MIGRATION_PROGRAM_ID}`);
    console.log(`   Fallback : Raydium AMM ${RAYDIUM_AMM_V4_PROGRAM_ID}`);
    console.log(`   RPC      : ${this.httpEndpoint.substring(0, 40)}...\n`);

    this.startRetryWorker();

    // Run both listeners concurrently; each auto-reconnects on disconnect
    // We don't await — they run as background loops
    this.startMigrationWrapperListener();
    this.startRaydiumListener();
  }

  /**
   * Stop all WebSocket connections and the retry worker.
   */
  stop(): void {
    this.stopped = true;

    if (this.primaryWs) {
      try { this.primaryWs.terminate(); } catch { /* ignore */ }
      this.primaryWs = null;
    }
    if (this.fallbackWs) {
      try { this.fallbackWs.terminate(); } catch { /* ignore */ }
      this.fallbackWs = null;
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }

    console.log('MigrationWS: Stopped all listeners');
  }

  // ── Deduplication ──────────────────────────────────────────────────────────

  private isDuplicate(signature: string): boolean {
    if (this.seenSignatures.has(signature)) return true;
    this.seenSignatures.add(signature);

    // Keep cache size bounded
    if (this.seenSignatures.size > MAX_SEEN_SIGNATURES_CACHE) {
      const firstKey = this.seenSignatures.values().next().value!;
      this.seenSignatures.delete(firstKey);
    }

    return false;
  }

  // ── Migration handler ──────────────────────────────────────────────────────

  private handleMigration(migration: ParsedMigration, signature: string, source: string): void {
    console.log(`\n[MIGRATION] ✅ Detected via ${source}`);
    console.log(`  signature : ${signature}`);
    console.log(`  baseMint  : ${migration.baseMint}`);
    console.log(`  quoteMint : ${migration.quoteMint}`);
    console.log(`  creator   : ${migration.creator}`);
    console.log(`  pool      : ${migration.pool}`);

    this.emit('migration', { migration, signature, source } as MigrationEvent);
  }

  // ── RPC fallback ───────────────────────────────────────────────────────────

  private async fetchTransactionFromRPC(signature: string): Promise<ParsedMigration | null> {
    try {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          { encoding: 'base64', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
        ],
      });

      const res = await fetch(this.httpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30000),
      });

      const json = (await res.json()) as any;
      const tx = json?.result;
      if (!tx) return null;

      // Verify this TX involves the migration wrapper program
      const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
      const involvesWrapper = accountKeys.includes(MIGRATION_PROGRAM_ID);
      if (!involvesWrapper) {
        console.log(`[FALLBACK] TX ${signature.substring(0, 16)}... does not involve migration wrapper, skipping`);
        return null;
      }

      // Try to find instruction data from the migration wrapper
      // Check top-level instructions first
      const instructions: any[] = tx.transaction?.message?.instructions ?? [];
      for (const ix of instructions) {
        const programIndex: number = ix.programIdIndex;
        if (accountKeys[programIndex] === MIGRATION_PROGRAM_ID) {
          const data = Buffer.from(ix.data, 'base64');
          const parsed = parseMigrateInstruction(data);
          if (parsed) return parsed;
        }
      }

      // Check inner instructions (CPI calls)
      const innerInstructions: any[] = tx.meta?.innerInstructions ?? [];
      for (const group of innerInstructions) {
        for (const ix of group.instructions) {
          const programIndex: number = ix.programIdIndex;
          if (accountKeys[programIndex] === MIGRATION_PROGRAM_ID) {
            const data = Buffer.from(ix.data, 'base64');
            const parsed = parseMigrateInstruction(data);
            if (parsed) return parsed;
          }
        }
      }

      console.warn(`[FALLBACK] Could not find migration instruction data in TX ${signature.substring(0, 16)}...`);
      return null;
    } catch (err) {
      console.error(`[FALLBACK] RPC fetch error for ${signature.substring(0, 16)}...:`, err);
      return null;
    }
  }

  // ── Retry worker ───────────────────────────────────────────────────────────

  private startRetryWorker(): void {
    this.retryTimer = setInterval(async () => {
      if (this.retryQueue.size === 0) return;

      console.log(`[RETRY] Processing ${this.retryQueue.size} truncated TX(s)...`);

      for (const sig of [...this.retryQueue]) {
        this.retryQueue.delete(sig);
        const migration = await this.fetchTransactionFromRPC(sig);
        if (migration) {
          this.handleMigration(migration, sig, 'RPC fallback (truncated logs)');
        }
      }
    }, RETRY_INTERVAL_MS);
  }

  // ── Source 1: Migration wrapper listener (primary) ─────────────────────────

  private async startMigrationWrapperListener(): Promise<void> {
    while (!this.stopped) {
      try {
        console.log('\n[PRIMARY] Connecting to WebSocket...');

        await new Promise<void>((resolve, reject) => {
          if (this.stopped) { resolve(); return; }

          const ws = new WebSocket(this.wssEndpoint);
          this.primaryWs = ws;
          let timeoutHandle: ReturnType<typeof setTimeout>;

          const resetTimeout = () => {
            clearTimeout(timeoutHandle);
            timeoutHandle = setTimeout(() => {
              console.warn('[PRIMARY] WS timeout, reconnecting...');
              ws.terminate();
            }, WS_TIMEOUT_MS);
          };

          ws.once('open', () => {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'logsSubscribe',
              params: [
                { mentions: [MIGRATION_PROGRAM_ID] },
                { commitment: 'processed' },
              ],
            }));
            console.log(`[PRIMARY] ✅ Subscribed to migration wrapper: ${MIGRATION_PROGRAM_ID}`);
            resetTimeout();
          });

          ws.on('message', (raw: WebSocket.RawData) => {
            resetTimeout();

            try {
              const data = JSON.parse(raw.toString());

              if (data.result !== undefined && data.id === 1) {
                console.log(`[PRIMARY] Subscription confirmed (id: ${data.result})`);
                return;
              }

              if (data.method !== 'logsNotification') return;

              const value = data.params?.result?.value as { signature?: string; logs?: string[] };
              const logs = value?.logs ?? [];
              const signature = value?.signature ?? '';

              if (!signature) return;
              if (this.isDuplicate(signature)) return;

              // Skip failed transactions
              const hasTxError = logs.some(
                (l: string) => l.includes('AnchorError thrown') || l.includes('Error')
              );
              if (hasTxError) return;

              // Must have migrate instruction
              if (!logs.some((l: string) => l.includes('Program log: Instruction: Migrate'))) return;

              // Skip already-migrated
              if (logs.some((l: string) => l.includes('Program log: Bonding curve already migrated'))) return;

              console.log(`[PRIMARY] 🔔 Migration TX detected: ${signature.substring(0, 16)}...`);

              const migration = parseMigrationFromLogs(logs);

              if (migration) {
                this.handleMigration(migration, signature, 'primary (logs)');
              } else {
                // Logs truncated — hand off to retry worker
                console.warn(`[PRIMARY] ⚠️  Truncated logs for ${signature.substring(0, 16)}..., queuing RPC fallback`);
                this.retryQueue.add(signature);
              }
            } catch (err) {
              console.error('[PRIMARY] Message processing error:', err);
            }
          });

          ws.on('error', (err) => { clearTimeout(timeoutHandle); reject(err); });
          ws.on('close', () => { clearTimeout(timeoutHandle); resolve(); });
        });
      } catch (err) {
        console.error('[PRIMARY] Connection error:', err);
      }

      if (this.stopped) break;
      console.log(`[PRIMARY] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      await this.sleep(RECONNECT_DELAY_MS);
    }
  }

  // ── Source 2: Raydium initialize2 listener (fallback/safety net) ───────────

  private async startRaydiumListener(): Promise<void> {
    while (!this.stopped) {
      try {
        console.log('\n[FALLBACK] Connecting to WebSocket...');

        await new Promise<void>((resolve, reject) => {
          if (this.stopped) { resolve(); return; }

          const ws = new WebSocket(this.wssEndpoint);
          this.fallbackWs = ws;
          let timeoutHandle: ReturnType<typeof setTimeout>;

          const resetTimeout = () => {
            clearTimeout(timeoutHandle);
            timeoutHandle = setTimeout(() => {
              console.warn('[FALLBACK] WS timeout, reconnecting...');
              ws.terminate();
            }, WS_TIMEOUT_MS);
          };

          ws.once('open', () => {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'logsSubscribe',
              params: [
                { mentions: [RAYDIUM_AMM_V4_PROGRAM_ID] },
                { commitment: 'processed' },
              ],
            }));
            console.log(`[FALLBACK] ✅ Subscribed to Raydium AMM: ${RAYDIUM_AMM_V4_PROGRAM_ID}`);
            resetTimeout();
          });

          ws.on('message', (raw: WebSocket.RawData) => {
            resetTimeout();

            try {
              const data = JSON.parse(raw.toString());

              if (data.result !== undefined && data.id === 2) {
                console.log(`[FALLBACK] Subscription confirmed (id: ${data.result})`);
                return;
              }

              if (data.method !== 'logsNotification') return;

              const value = data.params?.result?.value as { signature?: string; logs?: string[] };
              const logs = value?.logs ?? [];
              const signature = value?.signature ?? '';

              if (!signature) return;

              // Only care about pool creation (initialize2)
              const isPoolCreation = logs.some(
                (l: string) => l.includes('initialize2') || l.includes('Initialize2')
              );
              if (!isPoolCreation) return;

              // Already handled by primary listener? skip
              if (this.isDuplicate(signature)) {
                console.log(`[FALLBACK] Skipping duplicate: ${signature.substring(0, 16)}...`);
                return;
              }

              // Also skip if already in retry queue (primary already queued it)
              if (this.retryQueue.has(signature)) return;

              console.log(`[FALLBACK] 🔔 Raydium pool creation detected: ${signature.substring(0, 16)}..., verifying...`);

              // Fetch full TX and verify it's from pump.fun migration wrapper
              this.fetchTransactionFromRPC(signature).then(migration => {
                if (migration) {
                  this.handleMigration(migration, signature, 'fallback (Raydium initialize2 + RPC verify)');
                }
              });
            } catch (err) {
              console.error('[FALLBACK] Message processing error:', err);
            }
          });

          ws.on('error', (err) => { clearTimeout(timeoutHandle); reject(err); });
          ws.on('close', () => { clearTimeout(timeoutHandle); resolve(); });
        });
      } catch (err) {
        console.error('[FALLBACK] Connection error:', err);
      }

      if (this.stopped) break;
      console.log(`[FALLBACK] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      await this.sleep(RECONNECT_DELAY_MS);
    }
  }

  // ── Util ───────────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
