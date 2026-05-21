# Meme Coin Trading Bot 🚀

Automated trading system for Solana and Base meme coins with AI-powered strategy evaluation.

Built with **TypeScript & Node.js**!

## Features

- 🔍 Automated scanning of Solana and Base chains for new tokens
- 🛡️ Comprehensive honeypot detection and safety checks
- 📊 Win probability calculation (≥80% threshold)
- 💰 Automated trade execution with OKX Wallet SDK support
- ⚠️ Advanced risk management and circuit breakers
- 📈 Real-time metrics and monitoring via API
- 🎨 Web dashboard for monitoring and control
- 🔐 Security-first design with dry-run mode
- 📱 Multi-agent architecture for scalability

**[📖 See Trading Bot Documentation](TRADING_BOT.md)** | **[🏗️ Architecture Guide](ARCHITECTURE.md)**

## Tech Stack

- TypeScript 5.7+ / Node.js 18+
- HTTP server: Express.js
- WebSocket: ws
- Multi-agent architecture with EventEmitter

## Prerequisites

- Node.js 18 or higher
- Solana and Base RPC endpoints
- OKX Wallet SDK or private key (for live trading)
- API keys (CoinGecko, Twitter - optional)

## Quick Start

**⚠️ Start in Dry-Run Mode (Recommended)**

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env: ensure DRY_RUN=true, AUTO_EXECUTE=false

# 2. Install dependencies
npm install

# 3. Run trading bot (dev mode)
npm run dev
```

**Access the Dashboard:**
- Web Dashboard: http://localhost:8080
- Health: http://localhost:8080/api/health
- Status: http://localhost:8080/api/status
- Candidates: http://localhost:8080/api/candidates
- Metrics: http://localhost:8080/api/metrics

**📚 Complete Guide:** See [TRADING_BOT.md](TRADING_BOT.md) for comprehensive documentation.

## Web Dashboard

The trading bot includes a modern web dashboard for real-time monitoring and control:

**Features:**
- 📊 Real-time status overview
- 📈 Live metrics display (tokens found, filtered, candidates, trades)
- ⚠️ Risk management monitoring
- 🎯 Token candidate viewing
- 🔄 Auto-refresh every 5 seconds
- 📱 Responsive design

**Access:**
Simply navigate to http://localhost:8080 in your browser after starting the bot.

---

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-repo/ai-memecoin-trading-bot.git
cd ai-memecoin-trading-bot
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` file with your trading bot configuration (see [TRADING_BOT.md](TRADING_BOT.md) for details)

4. Install dependencies and run:
```bash
npm install
npm run dev
```

## Project Structure

```
ai-memecoin-trading-bot/
├── src/                       # TypeScript source code
│   ├── main.ts               # Entry point (Express server)
│   ├── config/               # Configuration management
│   │   └── config.ts
│   ├── models/               # Data models & interfaces
│   │   └── events.ts
│   ├── orchestrator/         # Orchestration logic
│   │   └── orchestrator.ts
│   └── agents/               # Trading agents
│       ├── scanner/          # Chain scanner (RPC + WebSocket)
│       ├── prefilter/        # Pre-filtering rules
│       ├── safety/           # Honeypot detection
│       ├── offchain/         # Off-chain data gathering
│       ├── strategy/         # Strategy evaluation
│       ├── listing/          # Candidate management
│       ├── execution/        # Trade execution
│       ├── risk/             # Risk management
│       └── telemetry/        # Metrics & monitoring
├── frontend/                  # Web dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── package.json               # Node.js dependencies
├── tsconfig.json              # TypeScript configuration
├── .env.example              # Example environment variables
├── .gitignore                # Git ignore rules
└── README.md                 # This file
```

## Development

### Running in Dev Mode (with auto-reload)

```bash
npm run dev
```

### Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Common Issues

1. **TypeScript errors:**
   - Make sure you have Node.js 18+ installed
   - Run `npm install` then try again

2. **Environment configuration:**
   - Check that all required environment variables are set in `.env`
   - See [TRADING_BOT.md](TRADING_BOT.md) for configuration details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Credits

Created for automated meme coin trading!

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Happy Trading! 🚀**