import { EventEmitter } from 'events';
import type { HeliusClient } from './helius-client.js';
import { RAYDIUM_FEE_ACCOUNT } from './constants.js';

// WSLogNotification represents a logsSubscribe notification
export interface WSLogNotification {
  signature: string;
  logs: string[];
  err: unknown;
}

// SolanaWSClient handles WebSocket subscription via Helius SDK
// Pattern: plan = await logsNotifications() → iter = await plan.subscribe({ abortSignal }) → for await (const n of iter)
export class SolanaWSClient extends EventEmitter {
  private helius: HeliusClient;
  private done: boolean = false;
  private abortController: AbortController | null = null;

  constructor(helius: HeliusClient) {
    super();
    this.helius = helius;
  }

  // Connect subscribes to Raydium logs via Helius SDK WebSocket
  async connect(): Promise<void> {
    console.log('SolanaWS: Connecting via Helius SDK WebSocket...');

    try {
      // Step 1: Create subscription plan
      const plan = await this.helius.ws.logsNotifications(
        { mentions: [RAYDIUM_FEE_ACCOUNT as any] },
        { commitment: 'confirmed' as any },
      );

      // Step 2: Subscribe with AbortController for cleanup
      this.abortController = new AbortController();
      const logs = await plan.subscribe({ abortSignal: this.abortController.signal });

      console.log('SolanaWS: ✅ Subscribed to Raydium logs via Helius SDK');

      // Step 3: Process notifications in background (non-blocking)
      this.processNotifications(logs);
    } catch (err) {
      throw new Error(`Helius WS subscription failed: ${(err as Error).message}`);
    }
  }

  // processNotifications iterates the AsyncIterable from helius-sdk
  private async processNotifications(logs: AsyncIterable<any>): Promise<void> {
    try {
      for await (const notification of logs) {
        if (this.done) break;

        // helius-sdk / @solana/kit format: { context: { slot }, value: { signature, err, logs } }
        const value = notification?.value ?? notification;

        // Skip failed transactions
        if (value.err !== null && value.err !== undefined) continue;

        const wsNotification: WSLogNotification = {
          signature: String(value.signature ?? ''),
          logs: Array.isArray(value.logs) ? value.logs : [],
          err: value.err,
        };

        if (wsNotification.signature) {
          this.emit('notification', wsNotification);
        }
      }
    } catch (err) {
      if (this.done) return; // Expected abort
      const msg = (err as Error).message || '';
      if (msg.includes('abort') || msg.includes('AbortError')) return; // Expected abort

      console.log(`SolanaWS: Stream error: ${msg}`);
      this.scheduleReconnect();
    }
  }

  // scheduleReconnect retries the connection with exponential backoff
  private async scheduleReconnect(): Promise<void> {
    const maxRetries = 10;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.done) return;

      const waitTime = Math.min(attempt * 2000, 30000);
      console.log(`SolanaWS: Reconnecting in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      try {
        await this.connect();
        console.log('SolanaWS: ✅ Reconnected successfully!');
        return;
      } catch (err) {
        console.log(`SolanaWS: Reconnect failed: ${(err as Error).message}`);
      }
    }

    console.log('SolanaWS: ❌ Failed to reconnect after maximum retries');
  }

  // Close closes the WebSocket connection via Helius SDK
  close(): void {
    this.done = true;

    try {
      // Abort the subscription iterator
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }

      // Close the underlying WebSocket
      this.helius.ws.close();
    } catch {
      // Ignore errors during close
    }

    console.log('SolanaWS: Connection closed via Helius SDK');
  }
}
