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

    // Check minimum liquidity
    const totalLiquidity = token.initialLiquidity.reserveNative;
    if (totalLiquidity < this.config.minLiquidity) {
      result.dropped = true;
      result.reasons.push('low_initial_liquidity');
      console.log(
        `PreFilterAgent: Token ${token.tokenAddress} dropped - low liquidity (${totalLiquidity.toFixed(2)} < ${this.config.minLiquidity.toFixed(2)})`
      );
      return result;
    }

    // Check for suspicious patterns in metadata
    if (this.hasSuspiciousMetadata(token)) {
      result.priority = 'low';
      result.reasons.push('suspicious_metadata');
      console.log(`PreFilterAgent: Token ${token.tokenAddress} marked low priority - suspicious metadata`);
    }

    // Check for very high initial liquidity (potential whale)
    if (totalLiquidity > 100000) {
      result.priority = 'high';
      result.reasons.push('high_initial_liquidity');
      console.log(
        `PreFilterAgent: Token ${token.tokenAddress} marked high priority - high liquidity (${totalLiquidity.toFixed(2)})`
      );
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
}
