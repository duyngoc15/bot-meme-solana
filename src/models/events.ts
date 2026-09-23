// Chain represents supported blockchain networks
export type Chain = 'solana' | 'base';

// Risk decision levels from the scoring engine
export type RiskDecision = 'STRONG_BUY' | 'BUY' | 'SMALL_POSITION' | 'WATCHLIST' | 'SKIP' | 'REJECT';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// TokenFound event from ChainScannerAgent
export interface TokenFound {
  chain: Chain;
  tokenAddress: string;
  firstSeenTS: number;
  creatorAddress: string;
  initialLiquidity: InitialLiquidity;
  txHash: string;
  metadata: Record<string, string>;
}

// InitialLiquidity details
export interface InitialLiquidity {
  pair: string;
  reserveToken: number;
  reserveNative: number;
}

// PreFilteredToken event after basic filtering
export interface PreFilteredToken {
  token: TokenFound;
  priority: 'high' | 'medium' | 'low';
  dropped: boolean;
  reasons: string[];
}

// ── Token-2022 Extension Info ───────────────────────────────────

export interface Token2022ExtensionInfo {
  name: string;
  critical: boolean;   // true = this extension affects safety scoring
  state: Record<string, any>;
}

// ── Safety Metrics ──────────────────────────────────────────────

// OwnerControls - shared between SPL Token and Token-2022
export interface OwnerControls {
  // Basic authorities (both SPL Token & Token-2022)
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;

  // Token-2022 specific flags
  hasTransferHook: boolean;
  hasPermanentDelegate: boolean;
  isPausable: boolean;
  hasMintCloseAuthority: boolean;
  isNonTransferable: boolean;
  defaultAccountStateFrozen: boolean;
  transferFeeBps: number;       // basis points (0-10000), 0 for SPL Token
  transferFeePercent: number;   // 0.0 - 100.0, 0 for SPL Token
}

// Holder metrics for scoring
export interface HolderMetrics {
  creatorHoldingPct: number;
  top10HoldingPct: number;
  holderCount: number;
}

// Liquidity metrics for scoring
export interface LiquidityMetrics {
  liquidityUsd: number;
  lpLocked: boolean;
  lpBurned: boolean;
  creatorOwnsLP: boolean;
}

// Simulation metrics for scoring
export interface SimulationMetrics {
  buySuccess: boolean;
  sellSuccess: boolean;
  roundTripLossPct: number;     // % loss from buy→sell round trip
}

// SimulatedSellResult details (AMM math calculation)
export interface SimulatedSellResult {
  success: boolean;
  slippage: number;              // price impact khi bán
  priceImpactBuy?: number;       // price impact khi mua
  solReceivedNoPump?: number;    // SOL nhận được nếu giá không đổi
  netProfitAt25pct?: number;     // net profit nếu giá tăng 25%
  netProfitAt2x?: number;        // net profit nếu giá tăng 2x
  roundTripLossPct?: number;     // % loss from buy→sell
}

// Score breakdown by category
export interface ScoreBreakdown {
  simulation: number;      // raw score before weighting
  tokenRisk: number;       // raw score before weighting
  holderAndLP: number;     // raw score before weighting
  momentum: number;        // raw score before weighting
}

// ── SafetyReport ────────────────────────────────────────────────

export interface SafetyReport {
  tokenAddress: string;
  chain: Chain;

  // New risk scoring system (0-100, higher = safer)
  riskScore: number;
  riskDecision: RiskDecision;
  riskLevel: RiskLevel;

  // Legacy compat fields
  canBuy: boolean;
  canSell: boolean;

  // Token program type: distinguishes SPL Token from Token-2022
  tokenProgram: 'spl-token' | 'spl-token-2022';

  // Detailed breakdowns
  ownerControls: OwnerControls;
  token2022Extensions: Token2022ExtensionInfo[];  // empty [] for basic SPL Token
  holderMetrics: HolderMetrics;
  liquidityMetrics: LiquidityMetrics;
  simulationMetrics: SimulationMetrics;
  simulatedSell: SimulatedSellResult;

  // Score breakdown by category
  scoreBreakdown: ScoreBreakdown;

  reasons: string[];
  evaluatedAt: Date;
}

// ── OffChainMetrics ─────────────────────────────────────────────

export interface OffChainMetrics {
  tokenAddress: string;
  volume24hCEX: number;
  volume24hDEX: number;
  socialMentions: Record<string, number>; // twitter, telegram, reddit
  velocity: 'rising' | 'stable' | 'falling';
  priceOnCEX?: number;
  priceOnDEX?: number;
  marketCap?: number;
  evaluatedAt: Date;
}

// ── StrategyDecision ────────────────────────────────────────────

export interface StrategyDecision {
  tokenAddress: string;
  chain: Chain;
  winProbability: number; // 0..1
  expectedROI: number; // mean ROI
  expectedROIStd: number; // std deviation
  confidence: 'high' | 'medium' | 'low';
  action: 'list' | 'buy' | 'monitor' | 'skip';
  suggestedAmountUSD: number;
  stopLossPct: number;
  takeProfitPct: number;
  timeHorizonMinutes: number;
  evaluatedAt: Date;
  rationale: string[];
}

// ── CandidateToken ──────────────────────────────────────────────

export interface CandidateToken {
  token: TokenFound;
  safetyReport: SafetyReport;
  offChainMetrics: OffChainMetrics;
  strategyDecision: StrategyDecision;
  listedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
}

// ── ExecutionResult ─────────────────────────────────────────────

export interface ExecutionResult {
  tokenAddress: string;
  chain: Chain;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: number;
  slippageActual?: number;
  amountUSD: number;
  timestamp: Date;
  error?: string;
}

// ── RiskControl ─────────────────────────────────────────────────

export interface RiskControl {
  singlePositionPct: number; // max % of balance per trade
  totalExposurePct: number; // max % of total balance exposed
  dailyLossLimit: number; // max daily loss in USD
  currentExposure: number; // current total exposure
  dailyLoss: number; // current daily loss
  tradingHalted: boolean; // circuit breaker status
  lastResetTime: Date;
}
