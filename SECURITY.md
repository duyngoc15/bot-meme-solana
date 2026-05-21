# Security Warnings and Best Practices

## ⚠️ CRITICAL WARNINGS

### Financial Risk
- **Cryptocurrency trading carries EXTREME risk of loss**
- **Meme coins are HIGHLY speculative and volatile**
- **You can lose 100% of your investment**
- **Only trade with money you can afford to lose completely**
- **Past performance does NOT guarantee future results**

### Software Disclaimer
- This is EXPERIMENTAL software
- NO WARRANTIES of any kind
- USE AT YOUR OWN RISK
- Authors are NOT responsible for any losses
- This is NOT financial advice

## Security Best Practices

### 1. Private Key Management

**❌ NEVER:**
- Commit private keys to Git
- Store private keys in plain text
- Share private keys with anyone
- Use production keys in development

**✅ ALWAYS:**
- Use environment variables
- Consider hardware wallets
- Use KMS (AWS KMS, GCP KMS, HashiCorp Vault)
- Use OKX Wallet SDK when possible
- Rotate keys regularly

**Example - Secure Key Loading:**
```typescript
// Load from environment variable
const privateKey = process.env.PRIVATE_KEY;

// Or use KMS
// const privateKey = await kms.getSecret('trading-bot-key');
```

### 2. Testing Before Production

**Required Testing Steps:**

1. **Dry-Run Mode (Minimum 24 hours)**
   ```bash
   DRY_RUN=true
   AUTO_EXECUTE=false
   ```

2. **Testnet Testing**
   - Use Solana devnet
   - Use Base testnet

3. **Small Amount Testing**
   ```bash
   ACCOUNT_BALANCE=100
   SINGLE_POSITION_PCT=0.05
   DAILY_LOSS_LIMIT=10
   ```

### 3. Configuration Security

**Environment Variables:**
```bash
# ✅ Good - Use .env file (add to .gitignore)
cp .env.example .env

# ❌ Bad - Hard-coded in code
const privateKey = "0x123..." // NEVER DO THIS
```

### 4. Access Control

**API Security:**
```typescript
// Add authentication to API endpoints
app.use('/api/risk/resume', requireAdmin);
```

**Network Security:**
- Run behind firewall
- Use VPN for remote access
- Enable HTTPS for API
- Restrict API access by IP

### 5. Monitoring and Alerts

**Set Up Alerts For:**
- Circuit breaker triggered
- Execution failures > 3 in a row
- RPC connection issues
- Daily loss approaching limit

### 6. Audit Trail

**Required Logging:**
```typescript
console.log(`TRADE_EXECUTED: token=${token}, amount=${amount}, tx=${txHash}`);
console.log(`SAFETY_CHECK: token=${token}, honeypot_score=${score}`);
console.log(`RISK_CHECK: exposure=${exposure}, limit=${limit}`);
```

## Emergency Procedures

### Stop Trading Immediately
```bash
# Option 1: API call
curl -X POST http://localhost:8080/api/risk/halt

# Option 2: Kill process
# Ctrl+C in terminal

# Option 3: Kill by process
pkill -f "node dist/main"
```

### Check System Status
```bash
curl http://localhost:8080/api/metrics
curl http://localhost:8080/api/risk
curl http://localhost:8080/api/candidates
```

## Recommended Setup

### Development
```bash
DRY_RUN=true
AUTO_EXECUTE=false
ACCOUNT_BALANCE=10000
```

### Production (start small)
```bash
DRY_RUN=false
AUTO_EXECUTE=true
ACCOUNT_BALANCE=1000
SINGLE_POSITION_PCT=0.01
DAILY_LOSS_LIMIT=50
```

---

**Last Updated:** 2026-05-19
**Review Schedule:** Monthly security review recommended
