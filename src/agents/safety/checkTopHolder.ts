import type { PreFilteredToken } from '../../models/events.js';
import type { SolanaRPCClient } from '../scanner/solana-rpc.js';

// ── Types ──────────────────────────────────────────────────────

export interface HolderInfo {
    tokenAccount: string;
    owner: string;
    amount: bigint;
    percent: number;
}

export interface HolderCheckResult {
    shouldDrop: boolean;
    reasons: string[];
    top1Percent: number;
    top5Percent: number;
    holderCount: number;
    creatorHolding: number;
    earlyBuyerCount: number;
    earlySellerCount: number;
    activityCount: number;
}

// ── Helper: build drop result ──────────────────────────────────
function buildDropResult(
    reasons: string[],
    extra?: Partial<HolderCheckResult>
): HolderCheckResult {
    return {
        shouldDrop: true,
        reasons,
        top1Percent: extra?.top1Percent ?? 0,
        top5Percent: extra?.top5Percent ?? 0,
        holderCount: extra?.holderCount ?? 0,
        creatorHolding: extra?.creatorHolding ?? 0,
        earlyBuyerCount: extra?.earlyBuyerCount ?? 0,
        earlySellerCount: extra?.earlySellerCount ?? 0,
        activityCount: extra?.activityCount ?? 0,
    };
}

// ── Helper: fetch owner của nhiều token accounts song song ─────
async function fetchTokenAccountOwners(
    tokenAccounts: string[],
    rpcClient: SolanaRPCClient
): Promise<string[]> {
    const results = await Promise.all(
        tokenAccounts.map(async (account) => {
            try {
                const info = await rpcClient.getParsedAccountInfo(account);
                return info?.value?.data?.parsed?.info?.owner ?? 'unknown';
            } catch {
                return 'unknown';
            }
        })
    );
    return results;
}

// ── Main method ────────────────────────────────────────────────
export async function checkTopHolderConcentration(
    token: PreFilteredToken,
    rpcClient: SolanaRPCClient
): Promise<HolderCheckResult> {
    const mintAddress = token.token.tokenAddress;
    const creatorAddress = token.token.creatorAddress;
    const migrateTS = token.token.firstSeenTS;
    const lpMint = token.token.metadata['lp_mint'] ?? '';
    const poolAddress = token.token.metadata['pool'] ?? '';

    const EXCLUDE_ADDRESSES = new Set([
        lpMint,
        poolAddress,
        '11111111111111111111111111111111',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ].filter(Boolean));

    try {
        // ── Step 1: Fetch % concentration + supply song song ──────
        const [largestAccounts, supplyInfo] = await Promise.all([
            rpcClient.getTokenLargestAccounts(mintAddress),
            rpcClient.getTokenSupply(mintAddress),
        ]);

        const totalSupply = BigInt(supplyInfo.value.amount);
        if (totalSupply === 0n) {
            return buildDropResult(['zero_supply']);
        }

        // Filter pool/lp accounts
        const filtered = largestAccounts.value.filter(
            acc => !EXCLUDE_ADDRESSES.has(acc.address)
        );

        if (filtered.length === 0) {
            return buildDropResult(['no_real_holders']);
        }

        // Tính % từng account
        const holderPercents = filtered.map(acc => ({
            tokenAccount: acc.address,
            amount: BigInt(acc.amount),
            percent: Number((BigInt(acc.amount) * 10000n) / totalSupply) / 100,
        }));

        const top1Percent = holderPercents[0]?.percent ?? 0;
        const top5Percent = holderPercents
            .slice(0, 5)
            .reduce((sum, h) => sum + h.percent, 0);
        const holderCount = filtered.length;

        console.log(
            `HolderCheck: ${mintAddress.substring(0, 16)}... ` +
            `top1: ${top1Percent.toFixed(2)}%, ` +
            `top5: ${top5Percent.toFixed(2)}%, ` +
            `holders: ${holderCount}`
        );

        // Hard drop by %
        if (top1Percent > 20) {
            return buildDropResult(
                [`top1_holder_${top1Percent.toFixed(1)}pct`],
                { top1Percent, top5Percent, holderCount }
            );
        }
        if (top5Percent > 50) {
            return buildDropResult(
                [`top5_holders_${top5Percent.toFixed(1)}pct`],
                { top1Percent, top5Percent, holderCount }
            );
        }
        if (holderCount < 5) {
            return buildDropResult(
                ['insufficient_holder_count'],
                { top1Percent, top5Percent, holderCount }
            );
        }

        // ── Step 2: Fetch owner của top 10 accounts ───────────────
        const top10 = holderPercents.slice(0, 10);
        const owners = await fetchTokenAccountOwners(
            top10.map(h => h.tokenAccount),
            rpcClient
        );

        const holderInfos: HolderInfo[] = top10.map((h, i) => ({
            tokenAccount: h.tokenAccount,
            owner: owners[i] ?? 'unknown',
            amount: h.amount,
            percent: h.percent,
        }));

        // Check creator holding
        const creatorHolding = holderInfos
            .filter(h => h.owner === creatorAddress)
            .reduce((sum, h) => sum + h.percent, 0);

        if (creatorHolding > 5) {
            return buildDropResult(
                [`creator_holding_${creatorHolding.toFixed(1)}pct`],
                { top1Percent, top5Percent, holderCount, creatorHolding }
            );
        }

        // ── Step 3: Fetch transactions song song ──────────────────
        // Dùng ATA thay vì owner wallet để tránh false positive:
        //   - ATA chỉ chứa tx liên quan đúng token này
        //   - Loại bỏ false positive từ SOL transfer, swap token khác
        const topHolderATAs = holderInfos
            .slice(0, 5)
            .map(h => h.tokenAccount)
            .filter(a => a !== '');

        const [mintSigs, ...holderSigs] = await Promise.all([
            rpcClient.getSignaturesForAddress(mintAddress, 30),
            ...topHolderATAs.map(ata =>
                rpcClient.getSignaturesForAddress(ata, 10)
            ),
        ]);

        // ── Step 3a: Early bundle check ───────────────────────────
        // Tìm migration slot làm baseline để detect coordinated bundle
        const migrationSlot = mintSigs.find(
            s => s.blockTime !== null && Math.abs(s.blockTime - migrateTS) < 5
        )?.slot ?? 0;

        let earlyBuyerCount = 0;
        if (migrationSlot === 0) {
            // Không tìm được slot → có thể RPC chưa index kịp hoặc blockTime lệch
            // Skip early bundle check, không drop — tránh bỏ lỡ token tốt
            console.warn(
                `HolderCheck: Migration slot not found for ${mintAddress.substring(0, 16)}... ` +
                `(migrateTS: ${migrateTS}) — skipping early bundle check`
            );
        } else {
            const earlyBuyers = mintSigs.filter(sig =>
                sig.err === null &&
                sig.slot > migrationSlot &&
                sig.slot - migrationSlot <= 3
            );
            earlyBuyerCount = earlyBuyers.length;

            console.log(
                `HolderCheck: Early buyers in first 3 blocks: ${earlyBuyerCount} ` +
                `(migrationSlot: ${migrationSlot})`
            );

            if (earlyBuyerCount > 3) {
                return buildDropResult(
                    [`early_bundle_${earlyBuyerCount}_buyers`],
                    { top1Percent, top5Percent, holderCount, creatorHolding, earlyBuyerCount }
                );
            }
        }

        // ── Step 3b: Early sell check ─────────────────────────────
        // Check ATA của top holders có tx trong 2 phút đầu không
        // Dùng ATA → chỉ tx của token này, không có false positive
        const twoMinutesAfterMigrate = migrateTS + 120;
        const earlySellerCount = holderSigs.filter(sigs =>
            sigs.some(sig =>
                sig.err === null &&
                sig.blockTime !== null &&
                sig.blockTime >= migrateTS &&
                sig.blockTime <= twoMinutesAfterMigrate
            )
        ).length;

        console.log(
            `HolderCheck: Top holders with activity in first 2 minutes: ${earlySellerCount}`
        );

        if (earlySellerCount >= 2) {
            return buildDropResult(
                [`early_sell_${earlySellerCount}_holders`],
                { top1Percent, top5Percent, holderCount, creatorHolding, earlyBuyerCount, earlySellerCount }
            );
        }

        // ── Step 3c: Activity trend in first 60s ─────────────────
        const activityCount = mintSigs.filter(sig =>
            sig.err === null &&
            sig.blockTime !== null &&
            sig.blockTime >= migrateTS &&
            sig.blockTime <= migrateTS + 60
        ).length;

        console.log(
            `HolderCheck: Activity in first 60s: ${activityCount} txs`
        );

        // ── Tổng hợp warnings ─────────────────────────────────────
        const reasons: string[] = [];

        if (migrationSlot === 0) {
            reasons.push('migration_slot_not_found');
        }
        if (creatorHolding > 0) {
            reasons.push(`creator_holding_warning_${creatorHolding.toFixed(1)}pct`);
        }
        if (top1Percent > 10) {
            reasons.push(`top1_warning_${top1Percent.toFixed(1)}pct`);
        }
        if (top5Percent > 35) {
            reasons.push(`top5_warning_${top5Percent.toFixed(1)}pct`);
        }
        if (holderCount < 15) {
            reasons.push('low_holder_count');
        }
        if (earlySellerCount === 1) {
            reasons.push('one_early_seller_warning');
        }
        if (activityCount < 3) {
            reasons.push('low_early_activity');
        }

        return {
            shouldDrop: false,
            reasons,
            top1Percent,
            top5Percent,
            holderCount,
            creatorHolding,
            earlyBuyerCount,
            earlySellerCount,
            activityCount,
        };

    } catch (err) {
        console.error(`HolderCheck: RPC error for ${mintAddress}:`, err);
        return {
            shouldDrop: false,
            reasons: ['holder_check_rpc_failed'],
            top1Percent: 0,
            top5Percent: 0,
            holderCount: 0,
            creatorHolding: 0,
            earlyBuyerCount: 0,
            earlySellerCount: 0,
            activityCount: 0,
        };
    }
}