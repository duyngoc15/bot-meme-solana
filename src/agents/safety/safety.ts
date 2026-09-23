import type { Config } from '../../config/config.js';
import type {
  PreFilteredToken, SafetyReport, SimulatedSellResult,
  OwnerControls, HolderMetrics, LiquidityMetrics, SimulationMetrics,
} from '../../models/events.js';
import { SolanaRPCClient } from '../scanner/solana-rpc.js';
import { checkTopHolderConcentration } from './checkTopHolder.js';
import { parseToken2022Extensions, applyToken2022Extensions, checkBlockerRules } from './token2022-checker.js';
import {
  calcTokenRiskScore, calcHolderLPScore, calcSimulationScore,
  calculateFinalRiskScore, determineDecision, determineRiskLevel,
} from './risk-scorer.js';

// ── Default values ──────────────────────────────────────────────

function defaultOwnerControls(): OwnerControls {
  return {
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    hasTransferHook: false,
    hasPermanentDelegate: false,
    isPausable: false,
    hasMintCloseAuthority: false,
    isNonTransferable: false,
    defaultAccountStateFrozen: false,
    transferFeeBps: 0,
    transferFeePercent: 0,
  };
}

function defaultReport(token: PreFilteredToken): SafetyReport {
  return {
    tokenAddress: token.token.tokenAddress,
    chain: token.token.chain,
    riskScore: 0,
    riskDecision: 'SKIP',
    riskLevel: 'HIGH',
    canBuy: false,
    canSell: false,
    tokenProgram: 'spl-token',
    ownerControls: defaultOwnerControls(),
    token2022Extensions: [],
    holderMetrics: { creatorHoldingPct: 0, top10HoldingPct: 0, holderCount: 0 },
    liquidityMetrics: { liquidityUsd: 0, lpLocked: false, lpBurned: false, creatorOwnsLP: false },
    simulationMetrics: { buySuccess: false, sellSuccess: false, roundTripLossPct: 100 },
    simulatedSell: { success: false, slippage: 1.0 },
    scoreBreakdown: { simulation: 0, tokenRisk: 0, holderAndLP: 0, momentum: 0 },
    reasons: [],
    evaluatedAt: new Date(),
  };
}

// ── OnChainSafetyAgent ─────────────────────────────────────────

export class OnChainSafetyAgent {
  private config: Config;
  private rpcClient: SolanaRPCClient;

  constructor(config: Config) {
    this.config = config;
    this.rpcClient = new SolanaRPCClient(config.heliusApiKey);
  }

  // Evaluate performs comprehensive safety checks on a token
  async evaluate(token: PreFilteredToken): Promise<SafetyReport> {
    console.log(`OnChainSafetyAgent: Evaluating token ${token.token.tokenAddress} on ${token.token.chain}`);

    const report = defaultReport(token);

    if (token.token.chain === 'solana') {
      await this.evaluateSolana(token, report);
    }

    console.log(
      `OnChainSafetyAgent: Token ${token.token.tokenAddress} - ` +
      `Program: ${report.tokenProgram}, ` +
      `Score: ${report.riskScore}, Decision: ${report.riskDecision}, ` +
      `Risk: ${report.riskLevel}, CanTrade: ${this.canTrade(report)}`
    );

    return report;
  }

  // evaluateSolana performs safety checks for Solana tokens
  // Phân biệt rõ giữa SPL Token cơ bản và Token-2022
  private async evaluateSolana(token: PreFilteredToken, report: SafetyReport): Promise<void> {
    const address = token.token.tokenAddress;
    console.log(`OnChainSafetyAgent: Performing Solana safety checks for ${address}`);

    try {
      // ── Step 1: Fetch parsed account info ─────────────────────
      const accountInfo = await this.rpcClient.getParsedAccountInfo(address);
      const parsedData = accountInfo?.value?.data?.parsed;
      const program = accountInfo?.value?.data?.program;

      if (!parsedData || parsedData.type !== 'mint') {
        report.reasons.push('invalid_mint_account');
        report.riskDecision = 'REJECT';
        return;
      }

      const info = parsedData.info;

      // ── Step 2: Xác định loại token program ───────────────────
      // Solana RPC trả về 'spl-token' hoặc 'spl-token-2022'
      const isToken2022 = program === 'spl-token-2022';
      report.tokenProgram = isToken2022 ? 'spl-token-2022' : 'spl-token';

      console.log(`OnChainSafetyAgent: Token ${address} is ${report.tokenProgram}`);

      // ── Step 3: Check mint/freeze authority (cả 2 loại token) ─
      const mintAuthority = info.mintAuthority;
      const freezeAuthority = info.freezeAuthority;

      report.ownerControls.mintAuthorityRevoked = mintAuthority === null;
      report.ownerControls.freezeAuthorityRevoked = freezeAuthority === null;

      // ── Step 4: Token-2022 specific extensions ────────────────
      // CHỈ parse extensions nếu đây là Token-2022
      // SPL Token cơ bản KHÔNG có extensions, ownerControls giữ giá trị mặc định (an toàn)
      if (isToken2022) {
        console.log(`OnChainSafetyAgent: Parsing Token-2022 extensions for ${address}`);

        const rawExtensions = info.extensions;
        const parsedExtensions = parseToken2022Extensions(rawExtensions);
        report.token2022Extensions = parsedExtensions;

        // Apply extension data to ownerControls
        applyToken2022Extensions(parsedExtensions, report.ownerControls);

        const criticalExts = parsedExtensions.filter(e => e.critical);
        if (criticalExts.length > 0) {
          console.log(
            `OnChainSafetyAgent: Token-2022 critical extensions found: ` +
            criticalExts.map(e => e.name).join(', ')
          );
        }
      }

      // ── Step 5: Blocker check (cả 2 loại token) ──────────────
      // Chạy simulateSell trước để có kết quả cho blocker check
      report.simulatedSell = this.simulateSell(token);

      const blockerResult = checkBlockerRules(
        report.ownerControls,
        report.simulatedSell.success
      );

      if (blockerResult.blocked) {
        report.riskDecision = 'REJECT';
        report.riskScore = 0;
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push(...blockerResult.reasons);
        console.log(`OnChainSafetyAgent: Token ${address} REJECTED by blocker: ${blockerResult.reasons.join(', ')}`);
        return;
      }

      // ── Step 6: Simulation Metrics ────────────────────────────
      const roundTripLossPct = report.simulatedSell.success
        ? ((this.config.buyAmountSol - (report.simulatedSell.solReceivedNoPump ?? 0)) / this.config.buyAmountSol) * 100
        : 100;

      report.simulatedSell.roundTripLossPct = roundTripLossPct;

      report.simulationMetrics = {
        buySuccess: report.simulatedSell.success,
        sellSuccess: report.simulatedSell.success,
        roundTripLossPct,
      };

      // ── Step 7: Holder concentration check ────────────────────
      const holderCheck = await checkTopHolderConcentration(token, this.rpcClient, 'pre-buy');

      if (holderCheck.shouldDrop) {
        report.riskDecision = 'REJECT';
        report.riskScore = 0;
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push(...holderCheck.reasons);
        console.log(`OnChainSafetyAgent: Token ${address} REJECTED by holder check: ${holderCheck.reasons.join(', ')}`);
        return;
      }

      if (holderCheck.reasons.length > 0) {
        report.reasons.push(...holderCheck.reasons);
      }

      // ── Step 8: Build metrics for scoring ─────────────────────
      report.holderMetrics = {
        creatorHoldingPct: holderCheck.creatorHolding,
        top10HoldingPct: holderCheck.top5Percent, // using top5 as proxy for top10
        holderCount: holderCheck.holderCount,
      };

      // Liquidity metrics from initial liquidity data
      // reserveNative is in SOL; rough USD estimate (using SOL ≈ $150 as a reasonable default)
      const solPrice = 150; // TODO: fetch real SOL price from off-chain agent
      const liquidityUsd = token.token.initialLiquidity.reserveNative * solPrice * 2;
      report.liquidityMetrics = {
        liquidityUsd,
        lpLocked: false,    // TODO: check LP lock status from on-chain data
        lpBurned: false,     // TODO: check LP burn status from on-chain data
        creatorOwnsLP: false, // TODO: check LP ownership
      };

      // ── Step 9: Calculate risk scores ─────────────────────────
      // Token Risk Score (cả SPL Token và Token-2022 đều đi qua đây,
      // nhưng Token-2022 flags chỉ trừ điểm khi extension thực sự tồn tại)
      const tokenRisk = calcTokenRiskScore(report.ownerControls);
      report.reasons.push(...tokenRisk.reasons);

      // Holder + LP Score
      const holderLP = calcHolderLPScore(report.holderMetrics, report.liquidityMetrics);
      report.reasons.push(...holderLP.reasons);

      // Check blocker rules from holder/LP scoring
      if (holderLP.blocked) {
        report.riskDecision = 'REJECT';
        report.riskScore = 0;
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push(...holderLP.blockReasons);
        console.log(`OnChainSafetyAgent: Token ${address} REJECTED by holder/LP blocker: ${holderLP.blockReasons.join(', ')}`);
        return;
      }

      // Simulation Score
      const simScore = calcSimulationScore(report.simulationMetrics);
      report.reasons.push(...simScore.reasons);

      if (simScore.blocked) {
        report.riskDecision = 'REJECT';
        report.riskScore = 0;
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push(...simScore.blockReasons);
        console.log(`OnChainSafetyAgent: Token ${address} REJECTED by simulation blocker: ${simScore.blockReasons.join(', ')}`);
        return;
      }

      // ── Step 10: Final Score ──────────────────────────────────
      // Momentum score: default 100 (off-chain agent will provide real data later)
      const momentumScore = 100;

      const { finalScore, breakdown } = calculateFinalRiskScore(
        simScore.score,
        tokenRisk.score,
        holderLP.score,
        momentumScore
      );

      report.riskScore = finalScore;
      report.scoreBreakdown = breakdown;
      report.riskDecision = determineDecision(finalScore);
      report.riskLevel = determineRiskLevel(
        report.ownerControls,
        report.simulationMetrics,
        report.holderMetrics,
        report.liquidityMetrics
      );

      // Set legacy compat fields
      const tradeable = report.riskDecision !== 'REJECT' && report.riskDecision !== 'SKIP';
      report.canBuy = tradeable;
      report.canSell = tradeable;

      console.log(
        `OnChainSafetyAgent: Token ${address} scoring complete - ` +
        `Sim: ${breakdown.simulation}, TokenRisk: ${breakdown.tokenRisk}, ` +
        `Holder+LP: ${breakdown.holderAndLP}, Momentum: ${breakdown.momentum} → ` +
        `Final: ${finalScore.toFixed(1)}, Decision: ${report.riskDecision}`
      );

    } catch (err) {
      console.error(`OnChainSafetyAgent: Error checking Solana safety for ${address}:`, err);
      report.riskDecision = 'REJECT';
      report.riskScore = 0;
      report.canBuy = false;
      report.canSell = false;
      report.reasons.push('rpc_safety_check_failed');
    }
  }

  // simulateSell performs local AMM calculation (x*y=k) for Raydium AMM v4
  // Simulates full round-trip: buy → sell to check real price impact
  private simulateSell(token: PreFilteredToken): SimulatedSellResult {
    const { reserveNative, reserveToken } = token.token.initialLiquidity;
    const buyAmountSOL = this.config.buyAmountSol;
    const RAYDIUM_FEE = 0.0025; // 0.25%

    // === Bước 1: Simulate BUY ===
    // Tính số token nhận được sau khi bỏ buyAmountSOL vào pool
    // Trừ fee trước khi tính amount out
    const solInAfterFee = buyAmountSOL * (1 - RAYDIUM_FEE);
    const k = reserveNative * reserveToken;
    const newReserveNative = reserveNative + solInAfterFee;
    const newReserveToken = k / newReserveNative;
    const tokenReceived = reserveToken - newReserveToken;

    if (tokenReceived <= 0) {
      return { success: false, slippage: 1.0 };
    }

    // Price impact khi mua
    const spotPriceBefore = reserveNative / reserveToken; // SOL per token
    const avgBuyPrice = buyAmountSOL / tokenReceived;
    const priceImpactBuy = (avgBuyPrice - spotPriceBefore) / spotPriceBefore;

    // === Bước 2: Simulate SELL ===
    // Pool state sau khi bạn mua xong
    const reserveNativeAfterBuy = newReserveNative;
    const reserveTokenAfterBuy = newReserveToken;

    // Bán toàn bộ token nhận được
    const tokenInAfterFee = tokenReceived * (1 - RAYDIUM_FEE);
    const k2 = reserveNativeAfterBuy * reserveTokenAfterBuy;
    const newReserveTokenAfterSell = reserveTokenAfterBuy + tokenInAfterFee;
    const newReserveNativeAfterSell = k2 / newReserveTokenAfterSell;
    const solReceived = reserveNativeAfterBuy - newReserveNativeAfterSell;

    if (solReceived <= 0) {
      return { success: false, slippage: 1.0 };
    }

    // Price impact khi bán
    const spotPriceAfterBuy = reserveNativeAfterBuy / reserveTokenAfterBuy;
    const avgSellPrice = solReceived / tokenReceived;
    const priceImpactSell = (spotPriceAfterBuy - avgSellPrice) / spotPriceAfterBuy;

    // === Bước 3: Tính net profit tại các scenarios ===
    const netProfitAt25pct = this.calcNetProfit(
      reserveNativeAfterBuy, reserveTokenAfterBuy, tokenReceived, buyAmountSOL, 1.25
    );
    const netProfitAt2x = this.calcNetProfit(
      reserveNativeAfterBuy, reserveTokenAfterBuy, tokenReceived, buyAmountSOL, 2.0
    );

    // Round-trip loss percentage
    const roundTripLossPct = ((buyAmountSOL - solReceived) / buyAmountSOL) * 100;

    console.log(
      `SimulateSell: buyAmount: ${buyAmountSOL} SOL, ` +
      `tokenReceived: ${tokenReceived.toFixed(0)}, ` +
      `solBack(no pump): ${solReceived.toFixed(4)} SOL, ` +
      `roundTripLoss: ${roundTripLossPct.toFixed(2)}%, ` +
      `netAt25pct: ${netProfitAt25pct.toFixed(4)} SOL, ` +
      `netAt2x: ${netProfitAt2x.toFixed(4)} SOL`
    );

    return {
      success: true,
      slippage: priceImpactSell,
      priceImpactBuy,
      solReceivedNoPump: solReceived,
      netProfitAt25pct,
      netProfitAt2x,
      roundTripLossPct,
    };
  }

  // calcNetProfit tính net profit tại 1 mức giá cụ thể
  private calcNetProfit(
    reserveNative: number,
    reserveToken: number,
    tokenAmount: number,
    buyAmountSOL: number,
    priceMultiplier: number
  ): number {
    const RAYDIUM_FEE = 0.0025;

    // Pool state sau khi giá tăng priceMultiplier lần
    // Giá tăng → reserveNative tăng, reserveToken giảm (k không đổi)
    const newReserveNative = reserveNative * priceMultiplier;
    const newReserveToken = reserveToken / priceMultiplier;

    // Simulate bán tokenAmount vào pool mới
    const tokenInAfterFee = tokenAmount * (1 - RAYDIUM_FEE);
    const k = newReserveNative * newReserveToken;
    const reserveTokenAfterSell = newReserveToken + tokenInAfterFee;
    const reserveNativeAfterSell = k / reserveTokenAfterSell;
    const solReceived = newReserveNative - reserveNativeAfterSell;

    // Net profit = SOL nhận được - SOL bỏ vào
    return solReceived - buyAmountSOL;
  }

  // canTrade checks if a token passes safety requirements based on risk decision
  canTrade(report: SafetyReport): boolean {
    return (
      report.riskDecision !== 'REJECT' &&
      report.riskDecision !== 'SKIP' &&
      report.riskDecision !== 'WATCHLIST'
    );
  }
}
