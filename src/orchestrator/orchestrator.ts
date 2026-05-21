import fs from 'fs';
import type { Config } from '../config/config.js';
import type { TokenFound, CandidateToken } from '../models/events.js';
import { ChainScannerAgent } from '../agents/scanner/scanner.js';
import { PreFilterAgent } from '../agents/prefilter/prefilter.js';
import { OnChainSafetyAgent } from '../agents/safety/safety.js';
import { OffChainDataAgent } from '../agents/offchain/offchain.js';
import { StrategyEvaluatorAgent } from '../agents/strategy/strategy.js';
import { CandidateListingAgent } from '../agents/listing/listing.js';
import { ExecutionAgent } from '../agents/execution/execution.js';
import { RiskManagerAgent } from '../agents/risk/risk.js';
import { TelemetryAgent } from '../agents/telemetry/telemetry.js';

// Orchestrator coordinates all agents
export class Orchestrator {
  private config: Config;
  private scanner: ChainScannerAgent;
  private prefilter: PreFilterAgent;
  private safety: OnChainSafetyAgent;
  private offchain: OffChainDataAgent;
  private strategy: StrategyEvaluatorAgent;
  private listing: CandidateListingAgent;
  private execution: ExecutionAgent;
  private risk: RiskManagerAgent;
  private telemetry: TelemetryAgent;
  private telemetryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(config: Config) {
    this.config = config;
    this.scanner = new ChainScannerAgent(config);
    this.prefilter = new PreFilterAgent(config);
    this.safety = new OnChainSafetyAgent(config);
    this.offchain = new OffChainDataAgent(config);
    this.strategy = new StrategyEvaluatorAgent(config);
    this.listing = new CandidateListingAgent();
    this.execution = new ExecutionAgent(config);
    this.risk = new RiskManagerAgent(config);
    this.telemetry = new TelemetryAgent();
  }

  // Start starts the orchestration
  async start(): Promise<void> {
    console.log('Orchestrator: Starting meme coin trading bot...');
    console.log(`Orchestrator: DryRun=${this.config.dryRun}, AutoExecute=${this.config.autoExecute}`);

    // Start periodic telemetry logging
    this.telemetryTimer = this.telemetry.startPeriodicLogging(30000);

    // Listen for tokens from scanner
    this.scanner.on('token', (token: TokenFound) => {
      if (!this.stopped) this.processToken(token);
    });

    // Listen for candidates from listing
    this.listing.on('candidate', (candidate: CandidateToken) => {
      if (!this.stopped && this.config.autoExecute && candidate.strategyDecision.action === 'buy') {
        this.executeCandidate(candidate);
      }
    });

    // Start chain scanner
    await this.scanner.start();
    console.log('Orchestrator: Token processing pipeline started');
  }

  // Stop stops the orchestration
  stop(): void {
    this.stopped = true;
    this.scanner.stop();
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    console.log('Orchestrator: Shutting down...');
  }

  // processToken processes a single token through the entire pipeline
  private async processToken(token: TokenFound): Promise<void> {
    const startTime = Date.now();
    console.log(`Orchestrator: Processing token ${token.tokenAddress} on ${token.chain}`);
    this.telemetry.recordTokenFound();

    // Step 1: Pre-filtering
    const prefiltered = this.prefilter.filter(token);
    this.telemetry.recordTokenFiltered(prefiltered.dropped);
    if (prefiltered.dropped) {
      console.log(`Orchestrator: Token ${token.tokenAddress} dropped by pre-filter`);
      return;
    }

    // Step 2: Safety evaluation
    let safetyReport;
    try {
      safetyReport = await this.safety.evaluate(prefiltered);
    } catch (err) {
      console.log(`Orchestrator: Safety evaluation failed for ${token.tokenAddress}: ${(err as Error).message}`);
      return;
    }

    const isHoneypot = safetyReport.honeypotScore >= this.config.maxHoneypotScore;
    const isSafe = this.safety.canTrade(safetyReport);
    this.telemetry.recordSafetyCheck(isHoneypot, isSafe);
    if (!isSafe) {
      console.log(`Orchestrator: Token ${token.tokenAddress} failed safety check (honeypot score: ${safetyReport.honeypotScore.toFixed(2)})`);
      return;
    }

    // Step 3: Off-chain data gathering
    let offchainMetrics;
    try {
      offchainMetrics = await this.offchain.gather(prefiltered);
    } catch (err) {
      console.log(`Orchestrator: Off-chain data gathering failed for ${token.tokenAddress}: ${(err as Error).message}`);
      return;
    }

    // Step 4: Strategy evaluation
    const decision = this.strategy.evaluate(safetyReport, offchainMetrics, prefiltered);
    this.telemetry.recordEvaluation();
    this.telemetry.recordDecisionLatency(Date.now() - startTime);

    console.log(`Orchestrator: Token ${token.tokenAddress} - WinProb: ${decision.winProbability.toFixed(2)}, Action: ${decision.action}, Confidence: ${decision.confidence}`);

    // Log token if it meets basic requirements
    if (decision.action !== 'skip') {
      console.log(`Orchestrator: 🚀 MEME COIN ĐẠT YÊU CẦU: ${token.tokenAddress} (Action: ${decision.action})`);
      this.logTokenToFile(token, decision.action);
    }

    // Step 5: Check if should list/execute
    if (decision.action === 'list' || decision.action === 'buy') {
      const candidate = this.listing.addCandidate(token, safetyReport, offchainMetrics, decision);
      this.telemetry.recordCandidateListed();
      console.log(`Orchestrator: Token ${token.tokenAddress} added to candidate list`);
      if (decision.action === 'buy' && this.config.autoExecute) {
        console.log(`Orchestrator: Token ${candidate.token.tokenAddress} queued for execution`);
      }
    } else {
      console.log(`Orchestrator: Token ${token.tokenAddress} action: ${decision.action} - not listing`);
    }
  }

  // executeCandidate executes a trade for a candidate
  private async executeCandidate(candidate: CandidateToken): Promise<void> {
    const startTime = Date.now();
    console.log(`Orchestrator: Executing candidate ${candidate.token.tokenAddress}`);

    this.risk.checkDailyReset();
    const { allowed, reason } = this.risk.canExecute(candidate.strategyDecision);
    if (!allowed) {
      console.log(`Orchestrator: Execution blocked by risk manager: ${reason}`);
      this.listing.updateStatus(candidate.token.tokenAddress, 'rejected');
      return;
    }

    // Simulate first if not in dry run
    if (!this.config.dryRun) {
      try {
        const success = await this.execution.simulate(candidate);
        if (!success) {
          console.log(`Orchestrator: Simulation failed for ${candidate.token.tokenAddress}`);
          this.telemetry.recordSimulationFailure();
          this.listing.updateStatus(candidate.token.tokenAddress, 'rejected');
          return;
        }
      } catch {
        this.telemetry.recordSimulationFailure();
        this.listing.updateStatus(candidate.token.tokenAddress, 'rejected');
        return;
      }
    }

    // Execute trade
    try {
      const result = await this.execution.execute(candidate);
      this.telemetry.recordExecutionTime(Date.now() - startTime);

      if (result.status === 'confirmed') {
        console.log(`Orchestrator: Execution successful for ${candidate.token.tokenAddress} - TX: ${result.txHash}`);
        this.telemetry.recordExecution(true, result.amountUSD);
        this.risk.recordExecution(result);
        this.listing.updateStatus(candidate.token.tokenAddress, 'executed');
      } else {
        console.log(`Orchestrator: Execution status ${result.status} for ${candidate.token.tokenAddress}`);
        this.telemetry.recordExecution(false, 0);
        this.listing.updateStatus(candidate.token.tokenAddress, 'failed');
      }
    } catch (err) {
      console.log(`Orchestrator: Execution failed for ${candidate.token.tokenAddress}: ${(err as Error).message}`);
      this.telemetry.recordExecution(false, 0);
      this.listing.updateStatus(candidate.token.tokenAddress, 'failed');
    }
  }

  // logTokenToFile appends the discovered token info to a local log file
  private logTokenToFile(token: TokenFound, action: string): void {
    try {
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const dex = token.metadata['dex'] ?? '';
      const pairedName = token.metadata['paired_name'] ?? '';
      const poolTx = token.metadata['pool_tx'] ?? '';
      const logLine = `[${timestamp}] Chain: ${token.chain} | DEX: ${dex} | Token: ${token.tokenAddress} | Paired: ${pairedName} | Action: ${action} | TX: ${poolTx}\n`;
      fs.appendFileSync('found_tokens.log', logLine);
    } catch (err) {
      console.log(`Orchestrator: Failed to write to found_tokens.log: ${(err as Error).message}`);
    }
  }

  // Getters for API handlers
  getTelemetry(): TelemetryAgent { return this.telemetry; }
  getListing(): CandidateListingAgent { return this.listing; }
  getRisk(): RiskManagerAgent { return this.risk; }
}
