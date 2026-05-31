import { heliusRpcUrl } from './helius-client.js';

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

export interface AccountInfo {
  context: { slot: number };
  value: {
    lamports: number;
    owner: string;
    executable: boolean;
    rentEpoch: number;
    data: {
      parsed: {
        info: {
          mintAuthority: string | null;
          freezeAuthority: string | null;
          supply: string;
          decimals: number;
          isInitialized: boolean;
          owner?: string;
          tokenAmount?: {
            amount: string;
            decimals: number;
            uiAmount: number | null;
          };
        };
        type: string;
      };
      program: string;
    };
  } | null;
}

export interface TokenLargestAccountsResponse {
  context: { slot: number; apiVersion?: string };
  value: Array<{
    address: string;
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  }>;
}

export interface TokenSupplyResponse {
  context: { slot: number; apiVersion?: string };
  value: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown | null;
  memo: string | null;
  confirmationStatus: string | null;
}

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

  // getParsedAccountInfo fetches parsed account data
  // Dùng cho: mint account (mintAuthority, freezeAuthority)
  //           token account/ATA (owner của holder)
  async getParsedAccountInfo(address: string): Promise<AccountInfo> {
    const result = await this.call('getAccountInfo', [
      address,
      { encoding: 'jsonParsed' },
    ]);
    return result as AccountInfo;
  }

  // getTokenLargestAccounts fetches top 20 largest token holders
  async getTokenLargestAccounts(mintAddress: string): Promise<TokenLargestAccountsResponse> {
    const result = await this.call('getTokenLargestAccounts', [
      mintAddress,
      { commitment: 'confirmed' },
    ]);
    return result as TokenLargestAccountsResponse;
  }

  // getTokenSupply fetches total supply of a token
  async getTokenSupply(mintAddress: string): Promise<TokenSupplyResponse> {
    const result = await this.call('getTokenSupply', [
      mintAddress,
      { commitment: 'confirmed' },
    ]);
    return result as TokenSupplyResponse;
  }

  // getSignaturesForAddress fetches transaction signatures for an address
  // Trả về newest first
  async getSignaturesForAddress(
    address: string,
    limit: number = 20,
  ): Promise<SignatureInfo[]> {
    const result = await this.call('getSignaturesForAddress', [
      address,
      { limit, commitment: 'confirmed' },
    ]);
    return result as SignatureInfo[];
  }

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
        if (attempt === maxRetries) throw new Error('Rate limit exceeded after max retries');
        const wait = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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