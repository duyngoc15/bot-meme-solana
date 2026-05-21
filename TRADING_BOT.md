# Meme Coin Trading Bot

A sophisticated automated trading system for scanning and trading newly issued meme coins on Solana and Base chains with comprehensive risk management and honeypot detection.

## Overview

This trading bot implements a multi-agent architecture that:
- Continuously monitors Solana and Base chains for new token creation
- Performs comprehensive safety checks (honeypot detection, buy/sell simulation)
- Gathers off-chain metrics (DEX/CEX volume, social media signals)
- Evaluates trading opportunities using strategy algorithms
- Executes trades when win probability ≥ 80% (configurable)
- Implements robust risk management and circuit breakers

## Architecture

### Agent System

The bot consists of 9 specialized agents working together:

1. **ChainScannerAgent** - Monitors on-chain events for new token creation
2. **PreFilterAgent** - Applies basic filtering rules (blacklist, liquidity checks)
3. **OnChainSafetyAgent** - Performs honeypot detection and buy/sell simulation
4. **OffChainDataAgent** - Gathers trading volume and social metrics
5. **StrategyEvaluatorAgent** - Calculates win probability and recommends actions
6. **CandidateListingAgent** - Manages queue of trading candidates
7. **ExecutionAgent** - Executes trades via OKX Wallet SDK or private key
8. **RiskManagerAgent** - Enforces position limits and circuit breakers
9. **TelemetryAgent** - Tracks metrics and performance

## Quick Start

### Prerequisites

- Node.js 18 or higher
- Access to Solana and Base RPC nodes
- OKX Wallet SDK or private key (for live trading)

### Installation

```bash
git clone https://github.com/your-repo/ai-memecoin-trading-bot.git
cd ai-memecoin-trading-bot
npm install
```

### Running in Dry-Run Mode (Recommended First)

```bash
# Edit .env and ensure:
# DRY_RUN=true
# AUTO_EXECUTE=false

npm run dev
```

### Running with Auto-Execution

⚠️ **WARNING**: Only use with small amounts you can afford to lose!

```bash
# Edit .env:
# DRY_RUN=false
# AUTO_EXECUTE=true
# ACCOUNT_BALANCE=1000

npm run dev
```

## Configuration

### Essential Settings

```bash
# General
DRY_RUN=true                    # Test mode (no real trades)
AUTO_EXECUTE=false              # Auto-execute trades

# Strategy
WIN_PROBABILITY_THRESHOLD=0.80  # Minimum 80% win probability
MIN_VOLUME_DEX=10000.0          # Minimum DEX volume
MIN_LIQUIDITY=5000.0            # Minimum initial liquidity
MAX_HONEYPOT_SCORE=0.2          # Maximum honeypot risk (0-1)

# Risk Management
SINGLE_POSITION_PCT=0.01        # Max 1% per trade
TOTAL_EXPOSURE_PCT=0.05         # Max 5% total exposure
DAILY_LOSS_LIMIT=500.0          # Daily loss limit (USD)
ACCOUNT_BALANCE=10000.0         # Your account balance
```

## API Endpoints

The trading bot exposes a REST API on port 8080:

- `GET /api/health` — Health check
- `GET /api/status` — System status with metrics summary
- `GET /api/candidates` — List of token candidates
- `GET /api/metrics` — Detailed metrics
- `GET /api/risk` — Risk management status
- `POST /api/risk/resume` — Resume trading after halt

## Safety Features

### Honeypot Detection
1. **Simulated Buy/Sell** - Tests if token can actually be sold
2. **Transfer Restrictions** - Checks for blacklist/whitelist mechanisms
3. **Owner Controls** - Verifies if owner is renounced
4. **Tax Analysis** - Detects excessive transaction taxes
5. **Liquidity Lock** - Confirms liquidity is locked
6. **Slippage Check** - Ensures slippage is within acceptable range

### Risk Management
1. **Position Limits** — Single: 1%, Total: 5% (configurable)
2. **Circuit Breaker** — Auto-halts on daily loss limit
3. **Daily Reset** — Loss counters reset every 24 hours

## Testing

```bash
# Build check (TypeScript compilation)
npm run build

# Run in dry-run mode
npm run dev
```

## Development

### Adding New Chains

1. Add chain type to `src/models/events.ts`
2. Implement scanner in `src/agents/scanner/`
3. Implement safety checks in `src/agents/safety/`
4. Implement execution in `src/agents/execution/`
5. Add configuration in `src/config/`

### Extending Strategy

Modify `src/agents/strategy/strategy.ts`:
- Add new factors to win probability
- Adjust confidence calculation
- Customize position sizing

## License

MIT License - See LICENSE file

---

**Remember**: Always start in dry-run mode and only trade with amounts you can afford to lose!
