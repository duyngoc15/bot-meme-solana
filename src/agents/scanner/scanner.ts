import { EventEmitter } from 'events';
import type { Config } from '../../config/config.js';
import type { TokenFound } from '../../models/events.js';
import { getHeliusClient, maskApiKey } from './helius-client.js';
import { SolanaRPCClient, type TransactionResult } from './solana-rpc.js';
import { SolanaWSClient, type WSLogNotification } from './solana-ws.js';
import {
  RAYDIUM_AMM_V4_PROGRAM_ID,
  KNOWN_BASE_TOKENS,
  RAYDIUM_COIN_MINT_INDEX,
  RAYDIUM_QUOTE_MINT_INDEX,
  RAYDIUM_COIN_VAULT_INDEX,
  RAYDIUM_QUOTE_VAULT_INDEX,
  RAYDIUM_AMM_ID_INDEX,
  MAX_SEEN_SIGNATURES_CACHE,
} from './constants.js';

// ChainScannerAgent monitors on-chain events for new tokens
export class ChainScannerAgent extends EventEmitter {
  private config: Config;
  private rpcClient: SolanaRPCClient;
  private wsClient: SolanaWSClient;
  private seenSignatures: Set<string> = new Set();
  private stopped: boolean = false;

  constructor(config: Config) {
    super();
    this.config = config;

    // Initialize via Helius SDK
    const apiKey = config.heliusApiKey;
    const helius = getHeliusClient(apiKey);
    this.rpcClient = new SolanaRPCClient(apiKey);
    this.wsClient = new SolanaWSClient(helius);
  }

  // Start begins scanning Solana chain via WebSocket
  async start(): Promise<void> {
    console.log('ChainScannerAgent: Starting chain monitoring (WebSocket mode)...');

    try {
      await this.wsClient.connect();
      this.listenWebSocket();
    } catch (err) {
      console.log(`ChainScannerAgent: ❌ WebSocket connection failed: ${(err as Error).message}`);
      throw err;
    }

    console.log('ChainScannerAgent: Chain monitoring started');
  }

  // Stop stops all scanning operations
  stop(): void {
    console.log('ChainScannerAgent: Stopping...');
    this.stopped = true;
    this.wsClient.close();
    console.log('ChainScannerAgent: Stopped');
  }

  // listenWebSocket listens for real-time Raydium pool creation events via WebSocket
  private listenWebSocket(): void {
    console.log('ChainScannerAgent: 🔌 WebSocket listener started (real-time mode)');

    this.wsClient.on('notification', (notification: WSLogNotification) => {
      if (this.stopped) return;

      // Deduplication check
      if (this.seenSignatures.has(notification.signature)) return;
      this.seenSignatures.add(notification.signature);

      if (this.seenSignatures.size > MAX_SEEN_SIGNATURES_CACHE) {
        this.cleanupSeenSignatures();
      }

      // Quick check: do the logs contain "initialize2"?
      const isPoolCreation = notification.logs.some(
        log => log.includes('initialize2') || log.includes('Initialize2')
      );

      if (!isPoolCreation) return;

      // It's a pool creation! Fetch full TX details via HTTP RPC
      console.log(
        `ChainScannerAgent: 🔔 WebSocket: New pool creation detected (sig: ${notification.signature.substring(0, 16)}...)`
      );

      this.processSignature(notification.signature);
    });
  }

  // processSignature fetches full transaction and extracts token info
  private async processSignature(signature: string): Promise<void> {
    try {
      const tx = await this.rpcClient.getTransaction(signature);
      if (!tx || !tx.transaction) return;

      // Check if this TX has an error in meta
      if (tx.meta?.err) return;

      // Double-check: verify initialize2 in full TX logs
      if (!this.isPoolCreationTx(tx)) return;

      // Parse the token mints from the transaction
      const token = this.extractTokenFromTx(tx, signature);
      if (token) {
        this.emitTokenFound(token);
      }
    } catch (err) {
      console.log(
        `ChainScannerAgent: Error fetching TX ${signature.substring(0, 16)}: ${(err as Error).message}`
      );
    }
  }



  // isPoolCreationTx checks if the transaction logs contain signs of a new pool creation
  private isPoolCreationTx(tx: TransactionResult): boolean {
    if (!tx.meta?.logMessages) return false;

    return tx.meta.logMessages.some(
      log => log.includes('initialize2') || log.includes('Initialize2')
    );
  }

  // extractTokenFromTx extracts the new meme coin token address from a Raydium pool creation TX
  private extractTokenFromTx(tx: TransactionResult, txSignature: string): TokenFound | null {
    if (!tx.transaction) return null;

    const accountKeys = tx.transaction.message.accountKeys;

    // Find the Raydium AMM instruction
    for (const ix of tx.transaction.message.instructions) {
      if (ix.programIdIndex >= accountKeys.length) continue;

      const programID = accountKeys[ix.programIdIndex];
      if (programID !== RAYDIUM_AMM_V4_PROGRAM_ID) continue;

      // Need at least 10 accounts for initialize2 (indices 0-9)
      if (ix.accounts.length <= RAYDIUM_QUOTE_MINT_INDEX) continue;

      // Extract coin mint (index 8) and quote mint (index 9)
      const coinMintIdx = ix.accounts[RAYDIUM_COIN_MINT_INDEX];
      const quoteMintIdx = ix.accounts[RAYDIUM_QUOTE_MINT_INDEX];

      if (coinMintIdx >= accountKeys.length || quoteMintIdx >= accountKeys.length) continue;

      const coinMint = accountKeys[coinMintIdx];
      const quoteMint = accountKeys[quoteMintIdx];

      // Determine which token is the NEW meme coin (the one NOT in KnownBaseTokens)
      let memeTokenAddress: string;
      let pairedWith: string;

      const coinIsKnown = coinMint in KNOWN_BASE_TOKENS;
      const quoteIsKnown = quoteMint in KNOWN_BASE_TOKENS;

      if (coinIsKnown && !quoteIsKnown) {
        memeTokenAddress = quoteMint;
        pairedWith = coinMint;
      } else if (!coinIsKnown && quoteIsKnown) {
        memeTokenAddress = coinMint;
        pairedWith = quoteMint;
      } else if (!coinIsKnown && !quoteIsKnown) {
        memeTokenAddress = coinMint;
        pairedWith = quoteMint;
      } else {
        console.log(
          `ChainScannerAgent: Skipping pool ${txSignature.substring(0, 16)} — both tokens are known base tokens`
        );
        return null;
      }

      // Extract AMM ID (pool address) if available
      let ammId = '';
      if (
        RAYDIUM_AMM_ID_INDEX < ix.accounts.length &&
        ix.accounts[RAYDIUM_AMM_ID_INDEX] < accountKeys.length
      ) {
        ammId = accountKeys[ix.accounts[RAYDIUM_AMM_ID_INDEX]];
      }

      // Determine creator address (first signer in the TX)
      let creatorAddress = '';
      if (tx.transaction.signatures.length > 0 && accountKeys.length > 0) {
        creatorAddress = accountKeys[0];
      }

      // Build the timestamp
      const firstSeenTS = tx.blockTime ?? Math.floor(Date.now() / 1000);

      // Get the paired token name for metadata
      const pairedName = KNOWN_BASE_TOKENS[pairedWith] ?? 'UNKNOWN';

      // Extract initial liquidity amounts from PostTokenBalances
      let reserveToken = 0;
      let reserveNative = 0;

      if (tx.meta?.postTokenBalances) {
        let coinVaultAccountIdx = -1;
        let pcVaultAccountIdx = -1;

        if (RAYDIUM_COIN_VAULT_INDEX < ix.accounts.length) {
          coinVaultAccountIdx = ix.accounts[RAYDIUM_COIN_VAULT_INDEX];
        }
        if (RAYDIUM_QUOTE_VAULT_INDEX < ix.accounts.length) {
          pcVaultAccountIdx = ix.accounts[RAYDIUM_QUOTE_VAULT_INDEX];
        }

        for (const balance of tx.meta.postTokenBalances) {
          if (
            balance.accountIndex === coinVaultAccountIdx &&
            balance.uiTokenAmount.uiAmount != null
          ) {
            if (coinMint === memeTokenAddress) {
              reserveToken = balance.uiTokenAmount.uiAmount;
            } else {
              reserveNative = balance.uiTokenAmount.uiAmount;
            }
          } else if (
            balance.accountIndex === pcVaultAccountIdx &&
            balance.uiTokenAmount.uiAmount != null
          ) {
            if (quoteMint === memeTokenAddress) {
              reserveToken = balance.uiTokenAmount.uiAmount;
            } else {
              reserveNative = balance.uiTokenAmount.uiAmount;
            }
          }
        }
      }

      return {
        chain: 'solana',
        tokenAddress: memeTokenAddress,
        firstSeenTS,
        creatorAddress,
        txHash: txSignature,
        initialLiquidity: {
          pair: `${memeTokenAddress}/${pairedWith}`,
          reserveToken,
          reserveNative,
        },
        metadata: {
          dex: 'raydium_amm_v4',
          paired_with: pairedWith,
          paired_name: pairedName,
          amm_id: ammId,
          pool_tx: txSignature,
        },
      };
    }

    return null;
  }

  // emitTokenFound sends a discovered token via event
  private emitTokenFound(token: TokenFound): void {
    console.log(`ChainScannerAgent: Sending token ${token.tokenAddress} to pipeline`);
    this.emit('token', token);
  }

  // cleanupSeenSignatures removes old entries from the dedup cache
  private cleanupSeenSignatures(): void {
    const entries = Array.from(this.seenSignatures);
    const keepCount = Math.floor(MAX_SEEN_SIGNATURES_CACHE / 2);
    this.seenSignatures = new Set(entries.slice(entries.length - keepCount));
    console.log(`ChainScannerAgent: Cleaned up seen signatures cache (kept ${this.seenSignatures.size})`);
  }
}
