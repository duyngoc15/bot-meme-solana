import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Config holds all application configuration
export interface Config {
  // General settings
  dryRun: boolean;
  autoExecute: boolean;

  // Helius API key (used by helius-sdk)
  heliusApiKey: string;

  // Chain settings
  solanaRpcUrl: string;
  solanaWsUrl: string;
  baseRpcUrl: string;
  baseWsUrl: string;


  // Strategy thresholds
  winProbabilityThreshold: number;
  minVolumeDEX: number;
  minLiquidity: number;
  maxHoneypotScore: number;
  maxSlippage: number;

  // Risk management
  singlePositionPct: number;
  totalExposurePct: number;
  dailyLossLimit: number;
  accountBalance: number;
  buyAmountSol: number;      // Fixed SOL amount to spend per trade

  // Execution settings
  maxSimulateRetries: number;
  simulateTimeoutMs: number;
  confirmationsWait: number;

  // Time windows (ms)
  observationWindow5m: number;
  observationWindow15m: number;
  observationWindow1h: number;
  defaultTimeWindowMs: number;

  // API settings
  coinGeckoApiKey: string;
  okxApiKey: string;
  okxApiSecret: string;
  okxApiPassphrase: string;
  twitterApiKey: string;

  // Wallet settings
  useOkxWallet: boolean;
  privateKey: string; // Use with caution - prefer KMS

  // Database settings
  databaseUrl: string;

  // Telemetry
  prometheusPort: number;
  logLevel: string;

  // Blacklist/Whitelist
  blacklistedTokens: string[];
  blacklistedCreators: string[];
  whitelistedTokens: string[];
}

// Helper functions
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value) {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value) {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
}

function getEnvList(key: string): string[] {
  const value = process.env[key];
  if (value && value.trim() !== '') {
    return value.split(',').map(s => s.trim());
  }
  return [];
}

// LoadConfig loads configuration from environment variables
export function loadConfig(): Config {
  return {
    // General
    dryRun: getEnvBool('DRY_RUN', true),
    autoExecute: getEnvBool('AUTO_EXECUTE', false),

    // Helius API key
    heliusApiKey: getEnv('HELIUS_API_KEY', ''),

    // Chain settings
    solanaRpcUrl: getEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
    solanaWsUrl: getEnv('SOLANA_WS_URL', 'wss://api.mainnet-beta.solana.com'),
    baseRpcUrl: getEnv('BASE_RPC_URL', 'https://mainnet.base.org'),
    baseWsUrl: getEnv('BASE_WS_URL', 'wss://mainnet.base.org'),


    // Strategy thresholds
    winProbabilityThreshold: getEnvFloat('WIN_PROBABILITY_THRESHOLD', 0.80),
    minVolumeDEX: getEnvFloat('MIN_VOLUME_DEX', 10000.0),
    minLiquidity: getEnvFloat('MIN_LIQUIDITY', 5000.0),
    maxHoneypotScore: getEnvFloat('MAX_HONEYPOT_SCORE', 0.2),
    maxSlippage: getEnvFloat('MAX_SLIPPAGE', 0.05),

    // Risk management
    singlePositionPct: getEnvFloat('SINGLE_POSITION_PCT', 0.01),
    totalExposurePct: getEnvFloat('TOTAL_EXPOSURE_PCT', 0.05),
    dailyLossLimit: getEnvFloat('DAILY_LOSS_LIMIT', 500.0),
    accountBalance: getEnvFloat('ACCOUNT_BALANCE', 50.0),
    buyAmountSol: getEnvFloat('BUY_AMOUNT_SOL', 0.1),

    // Execution
    maxSimulateRetries: getEnvInt('MAX_SIMULATE_RETRIES', 3),
    simulateTimeoutMs: getEnvInt('SIMULATE_TIMEOUT_SEC', 30) * 1000,
    confirmationsWait: getEnvInt('CONFIRMATIONS_WAIT', 2),

    // Time windows
    observationWindow5m: 5 * 60 * 1000,
    observationWindow15m: 15 * 60 * 1000,
    observationWindow1h: 60 * 60 * 1000,
    defaultTimeWindowMs: getEnvInt('DEFAULT_TIME_WINDOW_MIN', 15) * 60 * 1000,

    // API settings
    coinGeckoApiKey: getEnv('COINGECKO_API_KEY', ''),
    okxApiKey: getEnv('OKX_API_KEY', ''),
    okxApiSecret: getEnv('OKX_API_SECRET', ''),
    okxApiPassphrase: getEnv('OKX_API_PASSPHRASE', ''),
    twitterApiKey: getEnv('TWITTER_API_KEY', ''),

    // Wallet
    useOkxWallet: getEnvBool('USE_OKX_WALLET', true),
    privateKey: getEnv('PRIVATE_KEY', ''),

    // Database
    databaseUrl: getEnv('DATABASE_URL', 'sqlite://./meme_bot.db'),

    // Telemetry
    prometheusPort: getEnvInt('PROMETHEUS_PORT', 9090),
    logLevel: getEnv('LOG_LEVEL', 'info'),

    // Blacklist/Whitelist
    blacklistedTokens: getEnvList('BLACKLISTED_TOKENS'),
    blacklistedCreators: getEnvList('BLACKLISTED_CREATORS'),
    whitelistedTokens: getEnvList('WHITELISTED_TOKENS'),
  };
}
