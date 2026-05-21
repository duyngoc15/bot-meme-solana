// Raydium AMM V4 Program ID — most meme coins create liquidity pools here
export const RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

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
