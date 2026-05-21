// Metrics holds telemetry metrics
export interface Metrics {
  tokensScanned: number;
  tokensFound: number;
  tokensFiltered: number;
  tokensDropped: number;
  safetyChecks: number;
  honeypotDetected: number;
  safeTokens: number;
  evaluations: number;
  candidatesListed: number;
  tradesExecuted: number;
  executionSuccess: number;
  executionFailed: number;
  simulationFailed: number;
  totalInvested: number;
  totalProfit: number;
  totalLoss: number;
  avgDecisionLatencyMs: number;
  avgExecutionTimeMs: number;
}

// TelemetryAgent handles metrics and monitoring
export class TelemetryAgent {
  private metrics: Metrics = {
    tokensScanned: 0, tokensFound: 0, tokensFiltered: 0, tokensDropped: 0,
    safetyChecks: 0, honeypotDetected: 0, safeTokens: 0,
    evaluations: 0, candidatesListed: 0, tradesExecuted: 0,
    executionSuccess: 0, executionFailed: 0, simulationFailed: 0,
    totalInvested: 0, totalProfit: 0, totalLoss: 0,
    avgDecisionLatencyMs: 0, avgExecutionTimeMs: 0,
  };

  recordTokenScanned(): void { this.metrics.tokensScanned++; }
  recordTokenFound(): void { this.metrics.tokensFound++; }

  recordTokenFiltered(dropped: boolean): void {
    this.metrics.tokensFiltered++;
    if (dropped) this.metrics.tokensDropped++;
  }

  recordSafetyCheck(isHoneypot: boolean, isSafe: boolean): void {
    this.metrics.safetyChecks++;
    if (isHoneypot) this.metrics.honeypotDetected++;
    if (isSafe) this.metrics.safeTokens++;
  }

  recordEvaluation(): void { this.metrics.evaluations++; }
  recordCandidateListed(): void { this.metrics.candidatesListed++; }

  recordExecution(success: boolean, amount: number): void {
    this.metrics.tradesExecuted++;
    if (success) { this.metrics.executionSuccess++; this.metrics.totalInvested += amount; }
    else this.metrics.executionFailed++;
  }

  recordSimulationFailure(): void { this.metrics.simulationFailed++; }

  recordProfit(profitLoss: number): void {
    if (profitLoss > 0) this.metrics.totalProfit += profitLoss;
    else this.metrics.totalLoss += -profitLoss;
  }

  recordDecisionLatency(durationMs: number): void {
    this.metrics.avgDecisionLatencyMs = (this.metrics.avgDecisionLatencyMs + durationMs) / 2;
  }

  recordExecutionTime(durationMs: number): void {
    this.metrics.avgExecutionTimeMs = (this.metrics.avgExecutionTimeMs + durationMs) / 2;
  }

  getMetrics(): Metrics { return { ...this.metrics }; }

  logMetrics(): void {
    const m = this.metrics;
    console.log('=== Telemetry Metrics ===');
    console.log(`Tokens Scanned: ${m.tokensScanned}, Found: ${m.tokensFound}`);
    console.log(`Tokens Filtered: ${m.tokensFiltered}, Dropped: ${m.tokensDropped}`);
    console.log(`Safety Checks: ${m.safetyChecks}, Honeypots: ${m.honeypotDetected}, Safe: ${m.safeTokens}`);
    console.log(`Evaluations: ${m.evaluations}, Candidates: ${m.candidatesListed}`);
    console.log(`Executions: ${m.tradesExecuted} (Success: ${m.executionSuccess}, Failed: ${m.executionFailed})`);
    console.log(`Financial: Invested: $${m.totalInvested.toFixed(2)}, Profit: $${m.totalProfit.toFixed(2)}, Loss: $${m.totalLoss.toFixed(2)}`);
    console.log(`Performance: Avg Decision: ${m.avgDecisionLatencyMs.toFixed(0)}ms, Avg Execution: ${m.avgExecutionTimeMs.toFixed(0)}ms`);
    console.log('========================');
  }

  startPeriodicLogging(intervalMs: number): NodeJS.Timeout {
    return setInterval(() => this.logMetrics(), intervalMs);
  }
}
