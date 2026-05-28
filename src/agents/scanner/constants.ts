// Raydium AMM V4 Program ID — most meme coins create liquidity pools here
export const RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// pump.fun → Raydium migration wrapper program
export const MIGRATION_PROGRAM_ID = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

// WebSocket timing constants
export const RETRY_INTERVAL_MS = 2_000;       // Retry worker poll interval for truncated-log fallback
export const RECONNECT_DELAY_MS = 5_000;      // Delay before reconnecting a dropped WS
export const WS_TIMEOUT_MS = 60_000;          // Kill WS if no message received within this window

// Raydium Fee Account - exclusively used during pool creation (initialize2).
// WebSocket subscribes to this address to filter out swap noise and detect new pools.
export const RAYDIUM_FEE_ACCOUNT = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';

// Known base/quote tokens to exclude when identifying the "new" meme coin
// in a Raydium pool pair. The meme coin is the token that is NOT one of these.
export const KNOWN_BASE_TOKENS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL (Wrapped)',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': 'stSOL',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
};

// Raydium initialize2 instruction — accounts layout:
// Index 8 = AMM Coin Mint (Base token mint)
// Index 9 = AMM PC Mint (Quote token mint)
// Index 10 = AMM Coin Vault
// Index 11 = AMM PC Vault
export const RAYDIUM_COIN_MINT_INDEX = 8;
export const RAYDIUM_QUOTE_MINT_INDEX = 9;
export const RAYDIUM_COIN_VAULT_INDEX = 10;
export const RAYDIUM_QUOTE_VAULT_INDEX = 11;
export const RAYDIUM_AMM_ID_INDEX = 4;

// Scanner limits
export const MAX_SEEN_SIGNATURES_CACHE = 10000; // Max dedup cache size before cleanup
