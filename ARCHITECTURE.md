# Trading Bot Architecture

## System Design

The meme coin trading bot uses a multi-agent architecture where each agent has a specific responsibility. Agents communicate via EventEmitter events and async/await patterns.

## Agents Overview

### 1. ChainScannerAgent
**Purpose**: Monitor blockchain networks for new token creation events

**Responsibilities**:
- Subscribe to Solana and Base RPC/WebSocket endpoints
- Monitor token factory contracts (Uniswap, Raydium, Orca)
- Parse transaction logs for new token mints
- Extract initial liquidity and creator information
- Emit `TokenFound` events

**Output**: `TokenFound` events via EventEmitter

### 2. PreFilterAgent
**Purpose**: Apply fast, simple rules to filter out obvious junk tokens

**Responsibilities**:
- Check blacklisted token addresses
- Check blacklisted creator addresses
- Check whitelisted token addresses
- Validate minimum initial liquidity
- Detect suspicious metadata patterns
- Assign priority (high/medium/low)

**Output**: `PreFilteredToken` with priority and drop status

### 3. OnChainSafetyAgent
**Purpose**: Perform comprehensive on-chain safety analysis (honeypot detection)

**Responsibilities**:
- Simulate buy transaction
- Simulate sell transaction
- Detect transfer restrictions (blacklist, hooks)
- Check owner controls (renounced, permissions)
- Analyze tax fees
- Verify liquidity lock status
- Calculate honeypot risk score (0-1)

**Output**: `SafetyReport` with can_buy/can_sell flags and score

**Key Metrics**:
- `canBuy`: Can tokens be purchased
- `canSell`: Can tokens be sold (critical for honeypot detection)
- `honeypotScore`: Overall risk score (0 = safe, 1 = definite honeypot)
- `slippage`: Expected slippage on sell

### 4. OffChainDataAgent
**Purpose**: Gather trading volume and social media signals

**Responsibilities**:
- Query DEX aggregators for trading volume
- Query CEX APIs for listed tokens
- Fetch social media mentions (Twitter, Telegram, Reddit)
- Calculate price from DEX and CEX
- Determine velocity trend (rising/stable/falling)

**Output**: `OffChainMetrics` with volume, social, and price data

### 5. StrategyEvaluatorAgent
**Purpose**: Calculate win probability and recommend trading actions

**Algorithm**:
```
Base Win Probability = 50%

Safety Adjustments:
  + Can buy & sell: +15%
  + Low honeypot score (<0.1): +10%
  + Liquidity locked: +8%
  + Owner renounced: +7%
  + No restrictions: +5%

Volume Adjustments:
  + Good DEX volume: +10%
  + Social activity: +8%

Momentum Adjustments:
  + Rising velocity: +7%
  - Falling velocity: -10%

Final Win Probability = clamp(sum, 0, 1)

Action:
  if winProb >= 0.80 and autoExecute: BUY
  if winProb >= 0.80: LIST
  if winProb >= 0.60: MONITOR
  else: SKIP
```

### 6. CandidateListingAgent
**Purpose**: Manage queue of trading candidates

**Output**: Candidate events via EventEmitter

### 7. ExecutionAgent
**Purpose**: Execute trades on blockchain

**Chain-Specific**:
- **Base (EVM)**: Use router contracts, manage gas/nonce
- **Solana**: Use swap programs, manage token accounts

### 8. RiskManagerAgent
**Purpose**: Enforce risk controls and circuit breakers

**Limits**:
- Single position: `amount <= balance * singlePositionPct`
- Total exposure: `total <= balance * totalExposurePct`
- Daily loss: `loss <= dailyLossLimit`

### 9. TelemetryAgent
**Purpose**: Track metrics and performance

**Metrics**:
- Scanning: tokens scanned/found
- Filtering: tokens filtered/dropped
- Safety: checks performed, honeypots detected
- Strategy: evaluations, candidates listed
- Execution: trades executed, success/failure
- Financial: invested, profit, loss
- Performance: latency, execution time

## Data Flow

```
┌─────────────────┐
│ Blockchain      │
│ (Solana/Base)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ChainScanner    │ ───► TokenFound
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PreFilter       │ ───► PreFilteredToken
└────────┬────────┘
         │
         ├──────────────┐
         ▼              ▼
┌─────────────┐  ┌──────────────┐
│ OnChain     │  │ OffChain     │
│ Safety      │  │ Data         │
└──────┬──────┘  └──────┬───────┘
       │                │
       └────────┬───────┘
                ▼
       ┌─────────────────┐
       │ Strategy        │
       │ Evaluator       │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Candidate       │
       │ Listing         │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Risk            │ ◄── Approve/Reject
       │ Manager         │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Execution       │ ───► ExecutionResult
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Telemetry       │ ───► Metrics/Logs
       └─────────────────┘
```

## Orchestrator

The `Orchestrator` coordinates all agents:

1. Initializes all agents
2. Starts ChainScannerAgent
3. Processes tokens through pipeline
4. Manages execution queue
5. Handles graceful shutdown

**Pipeline Processing**:
```typescript
scanner.on('token', async (token) => {
  const filtered = prefilter.filter(token);
  const safety = await safety.evaluate(filtered);
  const offchain = await offchain.gather(filtered);
  const decision = strategy.evaluate(safety, offchain, filtered);

  if (decision.action === 'list' || decision.action === 'buy') {
    listing.addCandidate(token, safety, offchain, decision);
    // listing emits 'candidate' event → orchestrator executes if approved
  }
});
```

## Concurrency Model

- **Node.js single-threaded event loop** — no mutexes needed
- Scanner listens via WebSocket events (EventEmitter)
- Token processing is async (Promise-based pipeline)
- Execution queue processed via EventEmitter listeners
- `Set<string>` for deduplication (no locks needed)
- `setInterval` for periodic telemetry logging

## Configuration

All agents use a shared `Config` object:
- Loaded from environment variables via `dotenv`
- TypeScript interface with full type safety
- Sensible defaults for all parameters

## Error Handling

- Each agent handles its own errors
- Errors logged but don't crash system
- Failed tokens dropped from pipeline
- Telemetry tracks failure rates
- Circuit breaker for excessive failures

## Security

1. **Private Key Protection** — env vars or KMS, OKX Wallet SDK preferred
2. **RPC Rate Limiting** — exponential backoff, provider fallback
3. **Input Validation** — validate all on-chain data
4. **Audit Trail** — log all decisions and trades
