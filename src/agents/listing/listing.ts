import { EventEmitter } from 'events';
import type { TokenFound, SafetyReport, OffChainMetrics, StrategyDecision, CandidateToken } from '../../models/events.js';

// CandidateListingAgent manages the candidate token queue
export class CandidateListingAgent extends EventEmitter {
  private candidates: Map<string, CandidateToken> = new Map();

  // AddCandidate adds a token to the candidate list
  addCandidate(token: TokenFound, safety: SafetyReport, offchain: OffChainMetrics, decision: StrategyDecision): CandidateToken {
    const candidate: CandidateToken = {
      token, safetyReport: safety, offChainMetrics: offchain, strategyDecision: decision,
      listedAt: new Date(), status: 'pending',
    };
    this.candidates.set(token.tokenAddress, candidate);
    console.log(`CandidateListingAgent: Added candidate ${token.tokenAddress} - WinProb: ${decision.winProbability.toFixed(2)}, Action: ${decision.action}`);
    this.emit('candidate', candidate);
    return candidate;
  }

  getCandidate(tokenAddress: string): CandidateToken | undefined {
    return this.candidates.get(tokenAddress);
  }

  getAllCandidates(): CandidateToken[] {
    return Array.from(this.candidates.values());
  }

  getPendingCandidates(): CandidateToken[] {
    return Array.from(this.candidates.values()).filter(c => c.status === 'pending');
  }

  updateStatus(tokenAddress: string, status: CandidateToken['status']): void {
    const candidate = this.candidates.get(tokenAddress);
    if (candidate) {
      candidate.status = status;
      console.log(`CandidateListingAgent: Updated ${tokenAddress} status to ${status}`);
    }
  }

  getCandidateCount(): number {
    return this.candidates.size;
  }
}
