// Configuration
const API_BASE_URL = 'http://localhost:8080/api';
const REFRESH_INTERVAL = 5000; // 5 seconds

// State
let refreshIntervalId = null;
let lastUpdate = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Meme Coin Trading Bot Dashboard initialized');
    
    // Set up event listeners
    document.getElementById('refresh-candidates').addEventListener('click', loadCandidates);
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Initial load
    loadAllData();
});

// Auto-refresh functionality
function startAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    
    refreshIntervalId = setInterval(() => {
        loadAllData();
    }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadStatus(),
        loadMetrics(),
        loadRisk(),
        loadCandidates()
    ]);
    
    updateLastUpdateTime();
}

// Update last update time
function updateLastUpdateTime() {
    const now = new Date();
    lastUpdate = now;
    document.getElementById('last-update').textContent = `Last update: ${now.toLocaleTimeString()}`;
}

// Load status
async function loadStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        if (!response.ok) throw new Error('Failed to load status');
        
        const data = await response.json();
        
        // Update connection status
        updateConnectionStatus(true);
        
        // Update status values
        document.getElementById('system-status').textContent = data.status || 'Unknown';
        
        const tradingStatus = data.trading_halted ? 'Halted' : 'Active';
        const statusElement = document.getElementById('trading-status');
        statusElement.textContent = tradingStatus;
        statusElement.className = data.trading_halted ? 'status-value status-halted' : 'status-value status-running';
        
        document.getElementById('candidate-count').textContent = data.candidate_count || 0;
        document.getElementById('tokens-found').textContent = data.metrics?.tokens_found || 0;
        
    } catch (error) {
        console.error('Error loading status:', error);
        updateConnectionStatus(false);
    }
}

// Load metrics
async function loadMetrics() {
    try {
        const response = await fetch(`${API_BASE_URL}/metrics`);
        if (!response.ok) throw new Error('Failed to load metrics');
        
        const data = await response.json();
        
        document.getElementById('metric-tokens-found').textContent = data.tokens_found || 0;
        document.getElementById('metric-tokens-filtered').textContent = data.tokens_filtered || 0;
        document.getElementById('metric-candidates').textContent = data.candidates_listed || 0;
        document.getElementById('metric-executions').textContent = data.trades_executed || 0;
        
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

// Load risk status
async function loadRisk() {
    try {
        const response = await fetch(`${API_BASE_URL}/risk`);
        if (!response.ok) throw new Error('Failed to load risk status');
        
        const data = await response.json();
        
        const riskContent = document.getElementById('risk-content');
        
        let html = '<div class="risk-grid">';
        
        html += createRiskItem('Trading Halted', data.trading_halted ? 'Yes' : 'No');
        html += createRiskItem('Circuit Breaker', data.circuit_breaker_triggered ? 'Triggered' : 'Normal');
        html += createRiskItem('Loss Today', `$${(data.loss_today || 0).toFixed(2)}`);
        html += createRiskItem('Daily Loss Limit', `$${(data.daily_loss_limit || 0).toFixed(2)}`);
        html += createRiskItem('Total Exposure', `${((data.total_exposure_pct || 0) * 100).toFixed(2)}%`);
        html += createRiskItem('Max Exposure', `${((data.max_exposure_pct || 0) * 100).toFixed(2)}%`);
        
        html += '</div>';
        
        if (data.trading_halted) {
            html += `
                <div class="risk-halted">
                    <div class="risk-halted-text">⚠️ Trading is currently halted</div>
                    <button id="resume-trading-btn" class="btn btn-success">Resume Trading</button>
                </div>
            `;
        }
        
        riskContent.innerHTML = html;
        
        // Add event listener for resume button if present
        const resumeBtn = document.getElementById('resume-trading-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', resumeTrading);
        }
        
    } catch (error) {
        console.error('Error loading risk status:', error);
        document.getElementById('risk-content').innerHTML = '<div class="risk-info">Failed to load risk data</div>';
    }
}

// Create risk item HTML
function createRiskItem(label, value) {
    return `
        <div class="risk-item">
            <div class="risk-label">${label}</div>
            <div class="risk-value">${value}</div>
        </div>
    `;
}

// Resume trading
async function resumeTrading() {
    try {
        const response = await fetch(`${API_BASE_URL}/risk/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Failed to resume trading');
        
        const data = await response.json();
        console.log('Trading resumed:', data);
        
        // Reload data to reflect changes
        await loadAllData();
        
    } catch (error) {
        console.error('Error resuming trading:', error);
        alert('Failed to resume trading. Please try again.');
    }
}

// Load candidates
async function loadCandidates() {
    try {
        const response = await fetch(`${API_BASE_URL}/candidates`);
        if (!response.ok) throw new Error('Failed to load candidates');
        
        const data = await response.json();
        
        const candidatesList = document.getElementById('candidates-list');
        
        if (!data.candidates || data.candidates.length === 0) {
            candidatesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-text">No token candidates found yet</div>
                </div>
            `;
            return;
        }
        
        let html = '';
        data.candidates.forEach(candidate => {
            html += createCandidateCard(candidate);
        });
        
        candidatesList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading candidates:', error);
        document.getElementById('candidates-list').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-text">Failed to load candidates</div>
            </div>
        `;
    }
}

// Create candidate card HTML
function createCandidateCard(candidate) {
    return `
        <div class="candidate-card">
            <div class="candidate-header">
                <div class="candidate-title">${candidate.symbol || 'Unknown'}</div>
                <div class="candidate-chain">${candidate.chain || 'Unknown'}</div>
            </div>
            <div class="candidate-address">Address: ${candidate.address || 'N/A'}</div>
            <div class="candidate-details">
                ${createDetailItem('Win Probability', `${((candidate.win_probability || 0) * 100).toFixed(1)}%`)}
                ${createDetailItem('Action', candidate.action || 'N/A')}
                ${createDetailItem('Confidence', candidate.confidence || 'N/A')}
                ${createDetailItem('Honeypot Score', `${((candidate.honeypot_score || 0) * 100).toFixed(1)}%`)}
                ${createDetailItem('Volume 24h', `$${formatNumber(candidate.volume_24h || 0)}`)}
                ${createDetailItem('Liquidity', `$${formatNumber(candidate.liquidity || 0)}`)}
                ${createDetailItem('Price', `$${(candidate.price || 0).toFixed(8)}`)}
                ${createDetailItem('Position Size', `$${(candidate.position_size || 0).toFixed(2)}`)}
            </div>
        </div>
    `;
}

// Create detail item HTML
function createDetailItem(label, value) {
    return `
        <div class="detail-item">
            <div class="detail-label">${label}</div>
            <div class="detail-value">${value}</div>
        </div>
    `;
}

// Update connection status
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (connected) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'status-badge connected';
    } else {
        statusElement.textContent = 'Disconnected';
        statusElement.className = 'status-badge disconnected';
    }
}

// Format number with commas
function formatNumber(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
