import { createHelius } from 'helius-sdk';

// Type for the Helius SDK client instance
export type HeliusClient = ReturnType<typeof createHelius>;

// Create and cache a single Helius client instance
let _client: HeliusClient | null = null;

export function getHeliusClient(apiKey: string): HeliusClient {
  if (!_client) {
    _client = createHelius({ apiKey });
    console.log('HeliusClient: ✅ Initialized Helius SDK');
  }
  return _client;
}

// Helper: derive RPC URL from API key (for any raw fetch needs)
export function heliusRpcUrl(apiKey: string): string {
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
}

// Helper: mask API key for logging
export function maskApiKey(apiKey: string): string {
  if (apiKey.length > 8) {
    return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
  }
  return '****';
}
