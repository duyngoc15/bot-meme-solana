import type {
  OwnerControls,
  HolderMetrics,
  LiquidityMetrics,
  SimulationMetrics,
  ScoreBreakdown,
  RiskDecision,
  RiskLevel,
} from '../../models/events.js';

// ── Token Risk Score ────────────────────────────────────────────
// Bắt đầu 100, trừ dần theo mức rủi ro
// Áp dụng cho CẢ SPL Token và Token-2022 (mint/freeze authority)
// Các rule Token-2022 only (pausable, defaultAccountState, mintCloseAuthority, transferFee)
// sẽ chỉ trừ điểm nếu extension thực sự tồn tại

export function calcTokenRiskScore(controls: OwnerControls): { score: number; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  // ── Shared rules (SPL Token + Token-2022) ──

  // Mint Authority
  if (!controls.mintAuthorityRevoked) {
    score -= 30;
    reasons.push('mint_authority_active:-30');
  }

  // Freeze Authority
  if (!controls.freezeAuthorityRevoked) {
    score -= 20;
    reasons.push('freeze_authority_active:-20');
  }

  // ── Token-2022 specific rules ──
  // Những rule này chỉ trừ điểm khi extension thực sự có
  // Đối với SPL Token cơ bản, tất cả flag = false/0, nên không bị trừ

  // Transfer Fee scoring (chỉ Token-2022 mới có transferFeeBps > 0)
  const feePct = controls.transferFeePercent;
  if (feePct > 0 && feePct <= 2) {
    score -= 5;
    reasons.push(`transfer_fee_${feePct.toFixed(1)}pct:-5`);
  } else if (feePct > 2 && feePct <= 5) {
    score -= 15;
    reasons.push(`transfer_fee_${feePct.toFixed(1)}pct:-15`);
  } else if (feePct > 5 && feePct <= 10) {
    score -= 30;
    reasons.push(`transfer_fee_${feePct.toFixed(1)}pct:-30`);
  }
  // > 10% đã bị REJECT bởi blocker rule, không cần scoring ở đây

  // Pausable (Token-2022 only)
  if (controls.isPausable) {
    score -= 25;
    reasons.push('pausable_extension:-25');
  }

  // DefaultAccountState = Frozen (Token-2022 only)
  if (controls.defaultAccountStateFrozen) {
    score -= 20;
    reasons.push('default_account_frozen:-20');
  }

  // MintCloseAuthority (Token-2022 only)
  if (controls.hasMintCloseAuthority) {
    score -= 10;
    reasons.push('mint_close_authority:-10');
  }

  return { score: Math.max(0, score), reasons };
}

// ── Holder + LP Score ───────────────────────────────────────────
// Bắt đầu 100, trừ/cộng theo holder concentration và liquidity

export interface HolderLPScoreResult {
  score: number;
  reasons: string[];
  blocked: boolean;        // true nếu gặp REJECT rule
  blockReasons: string[];
}

export function calcHolderLPScore(
  holder: HolderMetrics,
  lp: LiquidityMetrics
): HolderLPScoreResult {
  let score = 100;
  const reasons: string[] = [];
  const blockReasons: string[] = [];

  // ── Creator Holding ──
  const creatorPct = holder.creatorHoldingPct;
  if (creatorPct > 20) {
    blockReasons.push(`blocker:creator_holding_${creatorPct.toFixed(1)}pct`);
  } else if (creatorPct > 10) {
    score -= 25;
    reasons.push(`creator_holding_${creatorPct.toFixed(1)}pct:-25`);
  } else if (creatorPct > 5) {
    score -= 10;
    reasons.push(`creator_holding_${creatorPct.toFixed(1)}pct:-10`);
  } else if (creatorPct > 2) {
    score += 5;
    reasons.push(`creator_holding_${creatorPct.toFixed(1)}pct:+5`);
  } else {
    score += 10;
    reasons.push(`creator_holding_${creatorPct.toFixed(1)}pct:+10`);
  }

  // ── Top 10 Holders ──
  const top10Pct = holder.top10HoldingPct;
  if (top10Pct > 60) {
    score -= 30;
    reasons.push(`top10_holding_${top10Pct.toFixed(1)}pct:-30`);
  } else if (top10Pct > 40) {
    score -= 15;
    reasons.push(`top10_holding_${top10Pct.toFixed(1)}pct:-15`);
  } else if (top10Pct > 25) {
    // 0 points, neutral
    reasons.push(`top10_holding_${top10Pct.toFixed(1)}pct:0`);
  } else {
    score += 10;
    reasons.push(`top10_holding_${top10Pct.toFixed(1)}pct:+10`);
  }

  // ── Liquidity ──
  const lpUsd = lp.liquidityUsd;
  if (lpUsd < 5000) {
    blockReasons.push(`blocker:liquidity_${lpUsd.toFixed(0)}usd`);
  } else if (lpUsd < 20000) {
    score -= 20;
    reasons.push(`liquidity_${lpUsd.toFixed(0)}usd:-20`);
  } else if (lpUsd <= 50000) {
    // 0 points, neutral
    reasons.push(`liquidity_${lpUsd.toFixed(0)}usd:0`);
  } else {
    score += 10;
    reasons.push(`liquidity_${lpUsd.toFixed(0)}usd:+10`);
  }

  // ── LP Ownership ──
  if (lp.lpBurned) {
    score += 15;
    reasons.push('lp_burned:+15');
  } else if (lp.lpLocked) {
    score += 10;
    reasons.push('lp_locked:+10');
  }

  if (lp.creatorOwnsLP) {
    score -= 30;
    reasons.push('creator_owns_lp:-30');
  }

  return {
    score: Math.max(0, score),
    reasons,
    blocked: blockReasons.length > 0,
    blockReasons,
  };
}

// ── Simulation Score ────────────────────────────────────────────
// Bắt đầu 100, trừ/cộng theo round-trip loss

export interface SimulationScoreResult {
  score: number;
  reasons: string[];
  blocked: boolean;
  blockReasons: string[];
}

export function calcSimulationScore(sim: SimulationMetrics): SimulationScoreResult {
  let score = 100;
  const reasons: string[] = [];
  const blockReasons: string[] = [];

  if (!sim.buySuccess) {
    blockReasons.push('blocker:buy_simulation_failed');
    return { score: 0, reasons, blocked: true, blockReasons };
  }

  if (!sim.sellSuccess) {
    blockReasons.push('blocker:sell_simulation_failed');
    return { score: 0, reasons, blocked: true, blockReasons };
  }

  const loss = sim.roundTripLossPct;
  if (loss > 15) {
    blockReasons.push(`blocker:round_trip_loss_${loss.toFixed(1)}pct`);
  } else if (loss > 10) {
    score -= 10;
    reasons.push(`round_trip_loss_${loss.toFixed(1)}pct:-10`);
  } else if (loss > 5) {
    score += 5;
    reasons.push(`round_trip_loss_${loss.toFixed(1)}pct:+5`);
  } else {
    score += 15;
    reasons.push(`round_trip_loss_${loss.toFixed(1)}pct:+15`);
  }

  return {
    score: Math.max(0, score),
    reasons,
    blocked: blockReasons.length > 0,
    blockReasons,
  };
}

// ── Final Score Calculation ─────────────────────────────────────

export interface RiskScoreResult {
  finalScore: number;
  breakdown: ScoreBreakdown;
  decision: RiskDecision;
  riskLevel: RiskLevel;
  allReasons: string[];
}

export function calculateFinalRiskScore(
  simulationScore: number,
  tokenRiskScore: number,
  holderLPScore: number,
  momentumScore: number = 100   // default 100 if no momentum data available
): { finalScore: number; breakdown: ScoreBreakdown } {
  // FinalScore = 40% Simulation + 25% Token Risk + 25% Holder+LP + 10% Momentum
  const finalScore =
    0.40 * simulationScore +
    0.25 * tokenRiskScore +
    0.25 * holderLPScore +
    0.10 * momentumScore;

  return {
    finalScore: Math.round(finalScore * 100) / 100,
    breakdown: {
      simulation: simulationScore,
      tokenRisk: tokenRiskScore,
      holderAndLP: holderLPScore,
      momentum: momentumScore,
    },
  };
}

// ── Decision Engine ─────────────────────────────────────────────

export function determineDecision(score: number): RiskDecision {
  if (score >= 90) return 'STRONG_BUY';
  if (score >= 80) return 'BUY';
  if (score >= 70) return 'SMALL_POSITION';
  if (score >= 60) return 'WATCHLIST';
  return 'SKIP';
}

export function determineRiskLevel(
  controls: OwnerControls,
  sim: SimulationMetrics,
  holder: HolderMetrics,
  lp: LiquidityMetrics
): RiskLevel {
  // Safe mode: all conditions must be true for LOW risk
  const isLow =
    sim.buySuccess &&
    sim.sellSuccess &&
    !controls.hasTransferHook &&
    !controls.hasPermanentDelegate &&
    !controls.isNonTransferable &&
    controls.transferFeePercent <= 2 &&
    controls.mintAuthorityRevoked &&
    controls.freezeAuthorityRevoked &&
    holder.creatorHoldingPct < 5 &&
    holder.top10HoldingPct < 40 &&
    (lp.lpLocked || lp.lpBurned);

  if (isLow) return 'LOW';

  // HIGH risk if any major red flag
  const isHigh =
    !controls.mintAuthorityRevoked ||
    !controls.freezeAuthorityRevoked ||
    controls.hasTransferHook ||
    controls.hasPermanentDelegate ||
    controls.transferFeePercent > 5 ||
    holder.creatorHoldingPct > 10 ||
    holder.top10HoldingPct > 60;

  if (isHigh) return 'HIGH';

  return 'MEDIUM';
}
