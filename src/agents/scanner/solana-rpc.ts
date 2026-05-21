import type { HeliusClient } from './helius-client.js';
import { heliusRpcUrl } from './helius-client.js';

// --- Transaction types (kept for our Raydium parsing logic) ---

export interface TransactionResult {
  slot: number;
  blockTime?: number;
  transaction?: TransactionData;
  meta?: TransactionMeta;
}

export interface TransactionData {
  message: TransactionMessage;
  signatures: string[];
}

export interface TransactionMessage {
  accountKeys: string[];
  instructions: TransactionInstruction[];
}

export interface TransactionInstruction {
  programIdIndex: number;
  accounts: number[];
  data: string;
}

export interface TransactionMeta {
  err?: unknown;
  logMessages?: string[];
  innerInstructions?: InnerInstructionSet[];
  preTokenBalances?: TokenBalance[];
  postTokenBalances?: TokenBalance[];
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: UiTokenAmount;
}

export interface UiTokenAmount {
  amount: string;
  decimals: number;
  uiAmount?: number | null;
  uiAmountString: string;
}

export interface InnerInstructionSet {
  index: number;
  instructions: TransactionInstruction[];
}



// SolanaRPCClient uses Helius SDK's RPC endpoint for JSON-RPC calls
export class SolanaRPCClient {
  private rpcUrl: string;
  private requestId: number = 0;

  constructor(apiKey: string) {
    this.rpcUrl = heliusRpcUrl(apiKey);
  }



  // getTransaction fetches full transaction details
  async getTransaction(signature: string): Promise<TransactionResult | null> {
    const result = await this.call('getTransaction', [
      signature,
      { encoding: 'json', maxSupportedTransactionVersion: 0 },
    ]);
    return result === null ? null : (result as TransactionResult);
  }

  // call performs a JSON-RPC call with retry logic
  private async call(method: string, params: unknown[]): Promise<unknown> {
    this.requestId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id: this.requestId, method, params });

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (resp.status === 429) {
        const wait = (attempt + 1) * 2000;
        console.log(`SolanaRPC: Rate limited, retrying in ${wait}ms (${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (resp.status !== 200) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      const rpc = await resp.json() as { result?: unknown; error?: { code: number; message: string } };
      if (rpc.error) throw new Error(`RPC error ${rpc.error.code}: ${rpc.error.message}`);
      return rpc.result;
    }

    throw new Error('max retries exceeded');
  }
}
