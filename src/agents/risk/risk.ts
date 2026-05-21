import type { Config } from '../../config/config.js';
import type { StrategyDecision, ExecutionResult, RiskControl } from '../../models/events.js';

// RiskManagerAgent manages risk controls and circuit breakers
export class RiskManagerAgent {
  private config: Config;
  private control: RiskControl;

  constructor(config: Config) {
    this.config = config;
    this.control = {
      singlePositionPct: config.singlePositionPct,
      totalExposurePct: config.totalExposurePct,
      dailyLossLimit: config.dailyLossLimit,
      currentExposure: 0, dailyLoss: 0, tradingHalted: false,
      lastResetTime: new Date(),
    };
  }

  canExecute(decision: StrategyDecision): { allowed: boolean; reason: string } {
    if (this.control.tradingHalted) return { allowed: false, reason: 'trading_halted' };
    const maxSingle = this.config.accountBalance * this.config.singlePositionPct;
    if (decision.suggestedAmountUSD > maxSingle) {
      console.log(`RiskManager: Trade rejected - exceeds single position limit (${decision.suggestedAmountUSD.toFixed(2)} > ${maxSingle.toFixed(2)})`);
      return { allowed: false, reason: 'exceeds_single_position_limit' };
    }
    const maxTotal = this.config.accountBalance * this.config.totalExposurePct;
    if (this.control.currentExposure + decision.suggestedAmountUSD > maxTotal) {
      console.log(`RiskManager: Trade rejected - exceeds total exposure limit`);
      return { allowed: false, reason: 'exceeds_total_exposure_limit' };
    }
    if (this.control.dailyLoss >= this.config.dailyLossLimit) {
      console.log(`RiskManager: Trade rejected - daily loss limit reached (${this.control.dailyLoss.toFixed(2)})`);
      this.haltTrading();
      return { allowed: false, reason: 'daily_loss_limit_reached' };
    }
    console.log(`RiskManager: Trade approved for ${decision.tokenAddress} (${decision.suggestedAmountUSD.toFixed(2)} USD)`);
    return { allowed: true, reason: '' };
  }

  recordExecution(result: ExecutionResult): void {
    if (result.status === 'confirmed') {
      this.control.currentExposure += result.amountUSD;
      console.log(`RiskManager: Recorded execution - Current exposure: ${this.control.currentExposure.toFixed(2)} USD`);
    }
  }

  recordProfit(profitLoss: number): void {
    if (profitLoss < 0) {
      this.control.dailyLoss += -profitLoss;
      console.log(`RiskManager: Recorded loss of ${(-profitLoss).toFixed(2)} - Daily loss: ${this.control.dailyLoss.toFixed(2)}`);
      if (this.control.dailyLoss >= this.config.dailyLossLimit) this.haltTrading();
    } else {
      console.log(`RiskManager: Recorded profit of ${profitLoss.toFixed(2)}`);
    }
  }

  releaseExposure(amount: number): void {
    this.control.currentExposure = Math.max(0, this.control.currentExposure - amount);
    console.log(`RiskManager: Released exposure - Current exposure: ${this.control.currentExposure.toFixed(2)} USD`);
  }

  private haltTrading(): void {
    this.control.tradingHalted = true;
    console.log('RiskManager: CIRCUIT BREAKER TRIGGERED - Trading halted!');
  }

  resumeTrading(): void {
    this.control.tradingHalted = false;
    console.log('RiskManager: Trading resumed');
  }

  resetDaily(): void {
    this.control.dailyLoss = 0;
    this.control.lastResetTime = new Date();
    console.log('RiskManager: Daily counters reset');
  }

  checkDailyReset(): void {
    const elapsed = Date.now() - this.control.lastResetTime.getTime();
    if (elapsed > 24 * 60 * 60 * 1000) this.resetDaily();
  }

  getStatus(): RiskControl {
    return { ...this.control, lastResetTime: new Date(this.control.lastResetTime) };
  }
}
