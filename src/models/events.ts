// Chain represents supported blockchain networks
export type Chain = 'solana' | 'base';

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

// SafetyReport from OnChainSafetyAgent
export interface SafetyReport {
  tokenAddress: string;
  chain: Chain;
  canBuy: boolean;
  canSell: boolean;
  honeypotScore: number; // 0..1
  liquidityLocked: boolean;
  ownerControls: OwnerControls;
  simulatedSell: SimulatedSellResult;
  reasons: string[];
  evaluatedAt: Date;
}

// OwnerControls details
export interface OwnerControls {
  renounced: boolean;
  hasBlacklist: boolean;
  maxTxLimit?: number;
  taxFee?: number;
  hasTransferHook: boolean;
}

// SimulatedSellResult details
export interface SimulatedSellResult {
  success: boolean;
  slippage: number;          // price impact khi bán
  priceImpactBuy?: number;   // price impact khi mua
  solReceivedNoPump?: number; // SOL nhận được nếu giá không đổi
  netProfitAt25pct?: number; // net profit nếu giá tăng 25%
  netProfitAt2x?: number;    // net profit nếu giá tăng 2x
}

// OffChainMetrics from OffChainDataAgent
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

// StrategyDecision from StrategyEvaluatorAgent
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

// CandidateToken for listing queue
export interface CandidateToken {
  token: TokenFound;
  safetyReport: SafetyReport;
  offChainMetrics: OffChainMetrics;
  strategyDecision: StrategyDecision;
  listedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
}

// ExecutionResult from ExecutionAgent
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

// RiskControl parameters and state
export interface RiskControl {
  singlePositionPct: number; // max % of balance per trade
  totalExposurePct: number; // max % of total balance exposed
  dailyLossLimit: number; // max daily loss in USD
  currentExposure: number; // current total exposure
  dailyLoss: number; // current daily loss
  tradingHalted: boolean; // circuit breaker status
  lastResetTime: Date;
}
