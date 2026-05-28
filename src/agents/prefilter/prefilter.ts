import type { Config } from '../../config/config.js';
import type { TokenFound, PreFilteredToken } from '../../models/events.js';

// PreFilterAgent performs basic filtering on discovered tokens
export class PreFilterAgent {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  // Filter applies pre-filtering rules to a token
  filter(token: TokenFound): PreFilteredToken {
    const result: PreFilteredToken = {
      token,
      priority: 'medium',
      dropped: false,
      reasons: [],
    };

    // Check blacklisted tokens
    if (this.isBlacklistedToken(token.tokenAddress)) {
      result.dropped = true;
      result.reasons.push('token_blacklisted');
      console.log(`PreFilterAgent: Token ${token.tokenAddress} dropped - blacklisted`);
      return result;
    }

    // Check blacklisted creators
    if (this.isBlacklistedCreator(token.creatorAddress)) {
      result.dropped = true;
      result.reasons.push('creator_blacklisted');
      console.log(`PreFilterAgent: Token ${token.tokenAddress} dropped - creator blacklisted`);
      return result;
    }

    // Check whitelisted tokens (high priority)
    if (this.isWhitelistedToken(token.tokenAddress)) {
      result.priority = 'high';
      result.reasons.push('token_whitelisted');
      console.log(`PreFilterAgent: Token ${token.tokenAddress} marked high priority - whitelisted`);
      return result;
    }

    // Check liquidity
    if (this.isLiquidityInsufficient(token, result)) {
      return result;
    }

    // Check for suspicious patterns in metadata
    // Check for suspicious patterns in metadata
    if (this.hasSuspiciousMetadata(token)) {
      result.dropped = true;
      result.reasons.push('suspicious_metadata');
      console.log(`PreFilterAgent: Token ${token.tokenAddress} dropped - suspicious metadata`);
      return result;
    }

    return result;
  }

  // isBlacklistedToken checks if token is in blacklist
  private isBlacklistedToken(address: string): boolean {
    return this.config.blacklistedTokens.some(
      blacklisted => blacklisted.toLowerCase() === address.toLowerCase()
    );
  }

  // isBlacklistedCreator checks if creator is in blacklist
  private isBlacklistedCreator(address: string): boolean {
    return this.config.blacklistedCreators.some(
      blacklisted => blacklisted.toLowerCase() === address.toLowerCase()
    );
  }

  // isWhitelistedToken checks if token is in whitelist
  private isWhitelistedToken(address: string): boolean {
    return this.config.whitelistedTokens.some(
      whitelisted => whitelisted.toLowerCase() === address.toLowerCase()
    );
  }

  // hasSuspiciousMetadata checks for suspicious patterns in token metadata
  private hasSuspiciousMetadata(token: TokenFound): boolean {
    const suspiciousWords = [
      'test', 'scam', 'rug', 'fake', 'honeypot',
      'xxx', 'pump', 'dump', 'bot',
    ];

    for (const [key, value] of Object.entries(token.metadata)) {
      const lowerKey = key.toLowerCase();
      const lowerValue = value.toLowerCase();

      for (const word of suspiciousWords) {
        if (lowerKey.includes(word) || lowerValue.includes(word)) {
          return true;
        }
      }
    }

    return false;
  }

  // isLiquidityInsufficient checks liquidity conditions for Pump.fun migrated tokens
  // Returns true if token should be dropped
  private isLiquidityInsufficient(token: TokenFound, result: PreFilteredToken): boolean {
    const solReserve = token.initialLiquidity.reserveNative;
    const buyAmountSol = this.config.buyAmountSol;
    const ageSeconds = (Date.now() - token.firstSeenTS * 1000) / 1000;

    // 1. Reserve bất thường - pool không đúng chuẩn migrate Pump.fun
    if (solReserve < this.config.minLiquidity) {
      result.dropped = true;
      result.reasons.push('abnormal_sol_reserve');
      console.log(
        `PreFilterAgent: Token ${token.tokenAddress} dropped - abnormal reserve (${solReserve.toFixed(2)} SOL < 50 SOL)`
      );
      return true;
    }

    // 2. Price impact quá cao - tự làm hại mình khi mua
    const priceImpact = buyAmountSol / solReserve;
    if (priceImpact > 0.03) {
      result.dropped = true;
      result.reasons.push('price_impact_too_high');
      console.log(
        `PreFilterAgent: Token ${token.tokenAddress} dropped - price impact too high (${(priceImpact * 100).toFixed(2)}% > 3%)`
      );
      return true;
    }

    // 3. Detect quá trễ - cơ hội đã qua (thời gian này sẽ được xem xét lại)
    if (ageSeconds > 300) {
      result.dropped = true;
      result.reasons.push('detected_too_late');
      console.log(
        `PreFilterAgent: Token ${token.tokenAddress} dropped - detected too late (${ageSeconds.toFixed(0)}s > 300s)`
      );
      return true;
    }

    console.log(
      `PreFilterAgent: Token ${token.tokenAddress} passed liquidity check - reserve: ${solReserve.toFixed(2)} SOL, priceImpact: ${(priceImpact * 100).toFixed(2)}%, age: ${ageSeconds.toFixed(0)}s`
    );
    return false;
  }
}
