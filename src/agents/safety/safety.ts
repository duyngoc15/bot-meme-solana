import type { Config } from '../../config/config.js';
import type { PreFilteredToken, SafetyReport, SimulatedSellResult, OwnerControls } from '../../models/events.js';
import { SolanaRPCClient } from '../scanner/solana-rpc.js';

// OnChainSafetyAgent performs honeypot and safety checks
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

    const report: SafetyReport = {
      tokenAddress: token.token.tokenAddress,
      chain: token.token.chain,
      canBuy: true,
      canSell: true,
      honeypotScore: 0.0,
      liquidityLocked: true,
      ownerControls: { renounced: true, hasBlacklist: false, hasTransferHook: false },
      simulatedSell: { success: true, slippage: 0 },
      reasons: [],
      evaluatedAt: new Date(),
    };

    if (token.token.chain === 'solana') {
      await this.evaluateSolana(token, report);
    }

    // Calculate overall honeypot score
    report.honeypotScore = this.calculateHoneypotScore(report);

    console.log(
      `OnChainSafetyAgent: Token ${token.token.tokenAddress} - CanBuy: ${report.canBuy}, CanSell: ${report.canSell}, HoneypotScore: ${report.honeypotScore.toFixed(2)}`
    );

    return report;
  }

  // evaluateSolana performs safety checks for Solana
  private async evaluateSolana(token: PreFilteredToken, report: SafetyReport): Promise<void> {
    const address = token.token.tokenAddress;
    console.log(`OnChainSafetyAgent: Performing active Solana safety checks for ${address}`);

    try {
      // 1. Fetch parsed account info for the token mint
      const accountInfo = await this.rpcClient.getParsedAccountInfo(address);
      const parsedData = accountInfo?.value?.data?.parsed;

      if (!parsedData || parsedData.type !== 'mint') {
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push('invalid_mint_account');
        return;
      }

      const info = parsedData.info;
      const mintAuthority = info.mintAuthority;
      const freezeAuthority = info.freezeAuthority;

      // 2. Check mint authority status (renounced if null)
      const isRenounced = mintAuthority === null; // (nếu mintAuthority === null thì pass )
      report.ownerControls.renounced = isRenounced;
      if (!isRenounced) {
        report.reasons.push('mint_authority_active');
      }

      // 3. Check freeze authority status (revoked/disabled if null)
      const hasFreeze = freezeAuthority !== null;
      if (hasFreeze) {
        // If freeze authority is active, the creator can freeze wallets at any time (honeypot threat)
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push('freeze_authority_active');
        console.log(`OnChainSafetyAgent: Token ${address} has active freeze authority`);
        return;
      }

      // // 4. Token Age
      // const nowSec = Math.floor(Date.now() / 1000);
      // const tokenAgeSec = Math.max(0, nowSec - token.token.firstSeenTS);
      // console.log(`OnChainSafetyAgent: Token ${address} age: ${tokenAgeSec}s, mintAuthority: ${mintAuthority}, freezeAuthority: ${freezeAuthority}`);

      // // Log if the token is extremely new
      // if (tokenAgeSec < 60) {
      //   report.reasons.push('new_token_under_60s');
      // }

      // 5. Simulated Sell Result
      report.simulatedSell = this.simulateSell(token);

      if (!report.simulatedSell.success) {
        report.canBuy = false;
        report.canSell = false;
        report.reasons.push('simulate_sell_failed');
        return;
      }

    } catch (err) {
      console.error(`OnChainSafetyAgent: Error checking Solana safety for ${address}:`, err);
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
    // Nếu giá tăng X lần thì pool reserve thay đổi theo
    const netProfitAt25pct = this.calcNetProfit(
      reserveNativeAfterBuy,
      reserveTokenAfterBuy,
      tokenReceived,
      buyAmountSOL,
      1.25 // giá tăng 25%
    );

    const netProfitAt2x = this.calcNetProfit(
      reserveNativeAfterBuy,
      reserveTokenAfterBuy,
      tokenReceived,
      buyAmountSOL,
      2.0 // giá tăng 2x
    );

    console.log(
      `SimulateSell: buyAmount: ${buyAmountSOL} SOL, ` +
      `tokenReceived: ${tokenReceived.toFixed(0)}, ` +
      `solBack(no pump): ${solReceived.toFixed(4)} SOL, ` +
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

  // calculateHoneypotScore calculates an overall honeypot risk score (0-1)
  private calculateHoneypotScore(report: SafetyReport): number {
    let score = 0.0;

    // Cannot sell is a major red flag
    if (!report.canSell) score += 0.5;

    // Cannot buy is suspicious
    if (!report.canBuy) score += 0.3;

    // High slippage indicates potential issues
    if (report.simulatedSell.slippage > 0.10) score += 0.2;

    // Owner controls are risk factors
    if (!report.ownerControls.renounced) score += 0.1;
    if (report.ownerControls.hasBlacklist) score += 0.15;
    if (report.ownerControls.hasTransferHook) score += 0.1;
    if ((report.ownerControls.taxFee ?? 0) > 0.15) score += 0.1;

    // Liquidity not locked is a risk
    if (!report.liquidityLocked) score += 0.05;

    // Cap at 1.0
    if (score > 1.0) score = 1.0;

    return score;
  }

  // CanTrade checks if a token passes basic safety requirements
  canTrade(report: SafetyReport): boolean {
    return (
      report.canBuy &&
      report.canSell &&
      report.honeypotScore < this.config.maxHoneypotScore &&
      report.simulatedSell.slippage < this.config.maxSlippage
    );
  }
}
