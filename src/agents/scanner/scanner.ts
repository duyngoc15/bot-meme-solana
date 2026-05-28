import { EventEmitter } from 'events';
import type { Config } from '../../config/config.js';
import type { TokenFound } from '../../models/events.js';
import { MigrationWSClient, type MigrationEvent } from './migration-ws.js';
import type { ParsedMigration } from './migration-parser.js';
import { KNOWN_BASE_TOKENS } from './constants.js';

/**
 * ChainScannerAgent monitors pump.fun → Raydium migrations via dual-source
 * WebSocket listeners (primary: migration wrapper, fallback: Raydium AMM).
 *
 * Emits 'token' events with TokenFound payloads for the orchestrator pipeline.
 */
export class ChainScannerAgent extends EventEmitter {
  private config: Config;
  private wsClient: MigrationWSClient;
  private stopped: boolean = false;

  constructor(config: Config) {
    super();
    this.config = config;

    // Use raw WebSocket endpoints from config
    this.wsClient = new MigrationWSClient(
      config.solanaWsUrl,
      config.solanaRpcUrl,
    );
  }

  // Start begins scanning Solana chain via dual-source WebSocket
  async start(): Promise<void> {
    console.log('ChainScannerAgent: Starting chain monitoring (dual-source migration detection)...');

    // Listen for migration events from both sources
    this.wsClient.on('migration', (event: MigrationEvent) => {
      if (this.stopped) return;

      const token = this.migrationToTokenFound(event);
      if (token) {
        this.emitTokenFound(token);
      }
    });

    try {
      await this.wsClient.start();
    } catch (err) {
      console.log(`ChainScannerAgent: ❌ WebSocket connection failed: ${(err as Error).message}`);
      throw err;
    }

    console.log('ChainScannerAgent: Chain monitoring started (pump.fun migration detection)');
  }

  // Stop stops all scanning operations
  stop(): void {
    console.log('ChainScannerAgent: Stopping...');
    this.stopped = true;
    this.wsClient.stop();
    console.log('ChainScannerAgent: Stopped');
  }

  /**
   * Convert a ParsedMigration event into a TokenFound that the orchestrator
   * pipeline expects. The meme coin (baseMint) is always the new token;
   * quoteMint is always the paired base token (SOL).
   */
  private migrationToTokenFound(event: MigrationEvent): TokenFound | null {
    const { migration, signature, source } = event;

    // Determine which token is the NEW meme coin (the one NOT in KnownBaseTokens)
    let memeTokenAddress: string;
    let pairedWith: string;

    const baseIsKnown = migration.baseMint in KNOWN_BASE_TOKENS;
    const quoteIsKnown = migration.quoteMint in KNOWN_BASE_TOKENS;

    if (baseIsKnown && !quoteIsKnown) {
      // baseMint is SOL/USDC, quoteMint is the meme coin
      memeTokenAddress = migration.quoteMint;
      pairedWith = migration.baseMint;
    } else if (!baseIsKnown && quoteIsKnown) {
      // baseMint is the meme coin, quoteMint is SOL/USDC
      memeTokenAddress = migration.baseMint;
      pairedWith = migration.quoteMint;
    } else if (!baseIsKnown && !quoteIsKnown) {
      // Neither is known — treat baseMint as the meme coin
      memeTokenAddress = migration.baseMint;
      pairedWith = migration.quoteMint;
    } else {
      // Both are known base tokens — not a meme coin migration
      console.log(
        `ChainScannerAgent: Skipping migration ${signature.substring(0, 16)} — both tokens are known base tokens`
      );
      return null;
    }

    const pairedName = KNOWN_BASE_TOKENS[pairedWith] ?? 'UNKNOWN';

    // Convert raw amounts to human-readable using decimals
    const reserveToken = this.bigintToNumber(
      migration.poolBaseAmount,
      memeTokenAddress === migration.baseMint ? migration.baseMintDecimals : migration.quoteMintDecimals
    );
    const reserveNative = this.bigintToNumber(
      migration.poolQuoteAmount,
      pairedWith === migration.quoteMint ? migration.quoteMintDecimals : migration.baseMintDecimals
    );

    // Timestamp from migration event, or fallback to now
    const firstSeenTS = migration.timestamp > 0n
      ? Number(migration.timestamp)
      : Math.floor(Date.now() / 1000);

    return {
      chain: 'solana',
      tokenAddress: memeTokenAddress,
      firstSeenTS,
      creatorAddress: migration.creator,
      txHash: signature,
      initialLiquidity: {
        pair: `${memeTokenAddress}/${pairedWith}`,
        reserveToken,
        reserveNative,
      },
      metadata: {
        dex: 'raydium_amm_v4',
        paired_with: pairedWith,
        paired_name: pairedName,
        pool: migration.pool,
        lp_mint: migration.lpMint,
        source,
        base_decimals: String(migration.baseMintDecimals),
        quote_decimals: String(migration.quoteMintDecimals),
        pool_tx: signature,
      },
    };
  }

  // emitTokenFound sends a discovered token via event
  private emitTokenFound(token: TokenFound): void {
    console.log(`ChainScannerAgent: 🚀 Sending token ${token.tokenAddress} to pipeline (via ${token.metadata['source']})`);
    this.emit('token', token);
  }

  // bigintToNumber converts a raw token amount (bigint) to a human-readable number
  private bigintToNumber(amount: bigint, decimals: number): number {
    // For large amounts, use string division to avoid precision loss
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const remainder = amount % divisor;
    const fractionStr = remainder.toString().padStart(decimals, '0');
    return parseFloat(`${whole}.${fractionStr}`);
  }
}
