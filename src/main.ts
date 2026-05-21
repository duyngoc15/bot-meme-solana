import express from 'express';
import cors from 'cors';
import { loadConfig } from './config/config.js';
import { Orchestrator } from './orchestrator/orchestrator.js';

console.log('Meme Coin Trading Bot - Starting...');

// Load configuration from env
const config = loadConfig();

// Create orchestrator - core of the bot
const orch = new Orchestrator(config);

// Start orchestrator in background
orch.start();

// Start API server
const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/status', (_req, res) => {
  const telemetry = orch.getTelemetry();
  const metrics = telemetry.getMetrics();
  const risk = orch.getRisk();
  const riskStatus = risk.getStatus();
  const listing = orch.getListing();

  res.json({
    status: 'running',
    candidate_count: listing.getCandidateCount(),
    trading_halted: riskStatus.tradingHalted,
    metrics: {
      tokens_found: metrics.tokensFound,
      tokens_filtered: metrics.tokensFiltered,
      candidates: metrics.candidatesListed,
      executions: metrics.tradesExecuted,
    },
  });
});

app.get('/api/candidates', (_req, res) => {
  const listing = orch.getListing();
  const candidates = listing.getAllCandidates();
  res.json({ count: candidates.length, candidates });
});

app.get('/api/metrics', (_req, res) => {
  const telemetry = orch.getTelemetry();
  res.json(telemetry.getMetrics());
});

app.get('/api/risk', (_req, res) => {
  const risk = orch.getRisk();
  res.json(risk.getStatus());
});

app.post('/api/risk/resume', (_req, res) => {
  const risk = orch.getRisk();
  risk.resumeTrading();
  res.json({ status: 'ok', message: 'Trading resumed' });
});

// Serve frontend static files
app.use(express.static('./frontend'));

// Start server
const port = 8080;
const server = app.listen(port, () => {
  console.log(`API server listening on :${port}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down server...');
  orch.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force close after 30 seconds
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
