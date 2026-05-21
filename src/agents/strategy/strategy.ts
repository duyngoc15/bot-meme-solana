import type { Config } from '../../config/config.js';
import type { PreFilteredToken, SafetyReport, OffChainMetrics, StrategyDecision } from '../../models/events.js';

export class StrategyEvaluatorAgent {
  private config: Config;
  constructor(config: Config) { this.config = config; }

  evaluate(safety: SafetyReport, offchain: OffChainMetrics, token: PreFilteredToken): StrategyDecision {
    console.log(`StrategyEvaluatorAgent: Evaluating token ${token.token.tokenAddress}`);
    const decision: StrategyDecision = {
      tokenAddress: token.token.tokenAddress, chain: token.token.chain,
      winProbability: 0, expectedROI: 0, expectedROIStd: 0, confidence: 'low',
      action: 'skip', suggestedAmountUSD: 0, stopLossPct: 0, takeProfitPct: 0,
      timeHorizonMinutes: 0, evaluatedAt: new Date(), rationale: [],
    };
    decision.winProbability = this.calcWinProb(safety, offchain, token);
    const [roi, std] = this.calcROI(offchain, token);
    decision.expectedROI = roi; decision.expectedROIStd = std;
    decision.confidence = this.calcConfidence(safety, offchain, decision.winProbability);
    decision.action = this.calcAction(decision);
    decision.suggestedAmountUSD = this.calcPositionSize(decision);
    decision.stopLossPct = decision.confidence === 'high' ? 0.20 : decision.confidence === 'medium' ? 0.15 : 0.10;
    let tp = decision.expectedROI * 1.5; tp = Math.max(0.20, Math.min(1.00, tp));
    decision.takeProfitPct = Math.round(tp * 100) / 100;
    decision.timeHorizonMinutes = decision.confidence === 'high' ? 60 : decision.confidence === 'medium' ? 30 : 15;
    console.log(`StrategyEvaluatorAgent: Token ${token.token.tokenAddress} - WinProb: ${decision.winProbability.toFixed(2)}, Action: ${decision.action}, Confidence: ${decision.confidence}`);
    return decision;
  }

  private calcWinProb(safety: SafetyReport, offchain: OffChainMetrics, token: PreFilteredToken): number {
    let p = 0.5;
    if (safety.canBuy && safety.canSell) { p += 0.15; token.reasons.push('can_trade'); } else return 0;
    if (safety.honeypotScore < 0.1) { p += 0.10; token.reasons.push('low_honeypot_score'); }
    else if (safety.honeypotScore > this.config.maxHoneypotScore) { p -= 0.20; token.reasons.push('high_honeypot_score'); }
    if (safety.liquidityLocked) { p += 0.08; token.reasons.push('liquidity_locked'); }
    if (safety.ownerControls.renounced) { p += 0.07; token.reasons.push('owner_renounced'); }
    if (!safety.ownerControls.hasBlacklist && !safety.ownerControls.hasTransferHook) { p += 0.05; token.reasons.push('no_transfer_restrictions'); }
    if (offchain.volume24hDEX >= this.config.minVolumeDEX) { p += 0.10; token.reasons.push('good_dex_volume'); }
    let mentions = 0; for (const c of Object.values(offchain.socialMentions)) mentions += c;
    if (mentions > 50) { p += 0.08; token.reasons.push('social_activity'); }
    if (offchain.velocity === 'rising') { p += 0.07; token.reasons.push('rising_velocity'); } else if (offchain.velocity === 'falling') p -= 0.10;
    const total = token.token.initialLiquidity.reserveNative + token.token.initialLiquidity.reserveToken;
    const ratio = total > 0 ? token.token.initialLiquidity.reserveNative / total : 0;
    if (ratio < 0.3 || ratio > 0.7) { token.reasons.push('liquidity_imbalance'); p -= 0.05; }
    if (token.priority === 'high') p += 0.05; else if (token.priority === 'low') p -= 0.05;
    return Math.max(0, Math.min(1, p));
  }

  private calcROI(offchain: OffChainMetrics, token: PreFilteredToken): [number, number] {
    let roi = 0.15;
    if (offchain.volume24hDEX > this.config.minVolumeDEX * 2) roi += 0.10;
    if (token.token.initialLiquidity.reserveNative > this.config.minLiquidity * 2) roi += 0.08;
    if (offchain.velocity === 'rising') roi += 0.12;
    return [roi, 0.25];
  }

  private calcConfidence(safety: SafetyReport, offchain: OffChainMetrics, wp: number): 'high' | 'medium' | 'low' {
    if (wp >= 0.85 && safety.honeypotScore < 0.1 && offchain.volume24hDEX > this.config.minVolumeDEX) return 'high';
    if (wp >= 0.70 && safety.honeypotScore < 0.2) return 'medium';
    return 'low';
  }

  private calcAction(d: StrategyDecision): 'list' | 'buy' | 'monitor' | 'skip' {
    if (d.winProbability >= this.config.winProbabilityThreshold && d.confidence !== 'low') return this.config.autoExecute ? 'buy' : 'list';
    if (d.winProbability >= 0.60) return 'monitor';
    return 'skip';
  }

  private calcPositionSize(d: StrategyDecision): number {
    const max = this.config.accountBalance * this.config.singlePositionPct;
    const mult = d.confidence === 'high' ? 1.0 : d.confidence === 'medium' ? 0.7 : 0.4;
    return Math.round(Math.max(100, max * mult) * 100) / 100;
  }
}
