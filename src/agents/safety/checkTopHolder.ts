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
    if (tokenAccounts.length === 0) return [];
    try {
        const response = await rpcClient.getMultipleAccounts(tokenAccounts);
        return response.value.map(acc => {
            if (!acc) return 'unknown';
            const owner = (acc.data as any)?.parsed?.info?.owner;
            return typeof owner === 'string' ? owner : 'unknown';
        });
    } catch (err) {
        console.warn('HolderCheck: getMultipleAccounts failed, falling back to individual calls:', err);
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
}

// ── Main method ────────────────────────────────────────────────
// mode: 'pre-buy'    → delay 3s, check nhanh (concentration, bundle, creator) để mua sớm
//       'monitoring'  → không delay, check đầy đủ (early sell, organic trend) để giám sát sau mua
export async function checkTopHolderConcentration(
    token: PreFilteredToken,
    rpcClient: SolanaRPCClient,
    mode: 'pre-buy' | 'monitoring' = 'pre-buy'
): Promise<HolderCheckResult> {
    const mintAddress = token.token.tokenAddress;
    const creatorAddress = token.token.creatorAddress;
    const migrateTS = token.token.firstSeenTS;
    const lpMint = token.token.metadata['lp_mint'] ?? '';
    const poolAddress = token.token.metadata['pool'] ?? '';

    // ── Delay/Sleep để gom đủ transactions cho bundle check ────
    const nowSec = Math.floor(Date.now() / 1000);
    const age = nowSec - migrateTS;
    if (mode === 'pre-buy') {
        // Pre-buy: chỉ cần 3s để RPC ghi nhận block 1-3 (mỗi block ~400ms)
        const PRE_BUY_DELAY = 3;
        if (age < PRE_BUY_DELAY) {
            const delayMs = (PRE_BUY_DELAY - age) * 1000;
            console.log(`HolderCheck [pre-buy]: Token ${mintAddress.substring(0, 16)}... is ${age}s old. Sleeping ${delayMs}ms to collect block 1-3 data...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    // Monitoring mode: không delay, data đã đủ

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

        // Fetch owners cho toàn bộ largest accounts để lọc pool chính xác
        const rawAccounts = largestAccounts.value;
        const rawOwners = await fetchTokenAccountOwners(
            rawAccounts.map(acc => acc.address),
            rpcClient
        );

        const EXCLUDE_OWNERS = new Set([
            '5Q52156xR2Ju1ALt3ZY1m8GfvgpGGd16FBio9CGLCwcx', // Raydium Authority V4
            '675kPX9MHTjS2zt1qAx1xee1Fy2yaAiJ6t6bAc33GLS7', // Raydium AMM Program
            '6EF8rrect5CQwVmPMiW47Zx7t1HE9nmXTywu2R39157', // Pump.fun Program
            '11111111111111111111111111111111',             // System Program / Burn Address
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // Token Program
            poolAddress,
            lpMint,
        ].filter(Boolean));

        // Lọc bỏ pool accounts dựa trên ví Owner của tài khoản đó
        const filteredHolders = rawAccounts.map((acc, idx) => ({
            tokenAccount: acc.address,
            owner: rawOwners[idx] ?? 'unknown',
            amount: BigInt(acc.amount),
            percent: Number((BigInt(acc.amount) * 10000n) / totalSupply) / 100,
        })).filter(h => 
            !EXCLUDE_OWNERS.has(h.tokenAccount) && 
            !EXCLUDE_OWNERS.has(h.owner)
        );

        if (filteredHolders.length === 0) {
            return buildDropResult(['no_real_holders']);
        }

        const top1Percent = filteredHolders[0]?.percent ?? 0;
        const top5Percent = filteredHolders
            .slice(0, 5)
            .reduce((sum, h) => sum + h.percent, 0);
        const holderCount = filteredHolders.length;

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

        // Check "Số holder thật có tăng lên hay không":
        // Nếu số holder thật hiện tại (đã lọc pool và creator) <= 2 -> LOẠI (không tăng)
        const realHoldersCount = filteredHolders.filter(h => h.owner !== creatorAddress).length;
        if (realHoldersCount <= 2) {
            return buildDropResult(
                ['holder_count_not_increasing'],
                { top1Percent, top5Percent, holderCount }
            );
        }

        if (realHoldersCount < 5) {
            return buildDropResult(
                ['insufficient_holder_count'],
                { top1Percent, top5Percent, holderCount }
            );
        }

        // ── Step 2: Lấy thông tin top 10 holders ──────────────────
        // (Chúng ta đã fetch owner ở Step 1 rồi, nên chỉ việc slice)
        const holderInfos: HolderInfo[] = filteredHolders.slice(0, 10);

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
        // Pre-buy: chỉ cần fetch mint signatures để check bundle block 1-3
        // Monitoring: fetch thêm holder signatures để check early sell
        const topHolderATAs = holderInfos
            .slice(0, 5)
            .map(h => h.tokenAccount)
            .filter(a => a !== '');

        let mintSigs: Awaited<ReturnType<typeof rpcClient.getSignaturesForAddress>>;
        let holderSigs: Awaited<ReturnType<typeof rpcClient.getSignaturesForAddress>>[] = [];

        if (mode === 'monitoring') {
            // Monitoring: fetch cả mint + holder signatures song song
            const [_mintSigs, ..._holderSigs] = await Promise.all([
                rpcClient.getSignaturesForAddress(mintAddress, 100),
                ...topHolderATAs.map(ata =>
                    rpcClient.getSignaturesForAddress(ata, 10)
                ),
            ]);
            mintSigs = _mintSigs;
            holderSigs = _holderSigs;
        } else {
            // Pre-buy: chỉ fetch mint signatures (nhanh hơn, ít RPC calls)
            mintSigs = await rpcClient.getSignaturesForAddress(mintAddress, 50);
        }

        // Tìm migration slot làm baseline để detect coordinated bundle
        const migrationTx = mintSigs.find(
            s => s.blockTime !== null && Math.abs(s.blockTime - migrateTS) < 5
        );
        const migrationSlot = migrationTx?.slot ?? 0;

        let earlyBuyerCount = 0;
        let block1Buyers = new Set<string>();
        let block1To3Buyers = new Set<string>();

        if (migrationSlot === 0) {
            console.warn(
                `HolderCheck: Migration slot not found for ${mintAddress.substring(0, 16)}... ` +
                `(migrateTS: ${migrateTS}) — skipping early bundle check`
            );
        } else {
            // Lọc các transactions trong block 1 - 3
            const earlySigs = mintSigs.filter(sig =>
                sig.err === null &&
                sig.slot >= migrationSlot &&
                sig.slot - migrationSlot <= 3
            );

            // Fetch details cho các early transactions này (tối đa 15 txs để tránh rate limit)
            const earlyTxsDetails = await Promise.all(
                earlySigs.slice(0, 15).map(sig => rpcClient.getTransaction(sig.signature))
            );

            for (const txDetail of earlyTxsDetails) {
                if (!txDetail || !txDetail.transaction || txDetail.meta?.err) continue;
                const accountKeys = txDetail.transaction.message.accountKeys;
                const signer = accountKeys[0];
                if (!signer || signer === creatorAddress || EXCLUDE_OWNERS.has(signer)) continue;

                const slot = txDetail.slot;

                // Xác thực xem transaction này có thực sự là MUA token không (số dư token tăng)
                const preBalance = txDetail.meta?.preTokenBalances?.find(b => b.mint === mintAddress && b.owner === signer);
                const postBalance = txDetail.meta?.postTokenBalances?.find(b => b.mint === mintAddress && b.owner === signer);
                const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : 0n;
                const postAmount = postBalance ? BigInt(postBalance.uiTokenAmount.amount) : 0n;

                if (postAmount > preAmount) {
                    if (slot === migrationSlot || slot - migrationSlot === 1) {
                        block1Buyers.add(signer);
                    }
                    if (slot - migrationSlot <= 3) {
                        block1To3Buyers.add(signer);
                    }
                }
            }

            earlyBuyerCount = block1To3Buyers.size;

            console.log(
                `HolderCheck: Unique early buyers in first 3 blocks: ${earlyBuyerCount} ` +
                `(migrationSlot: ${migrationSlot}, block 1 unique buyers: ${block1Buyers.size})`
            );

            // Có ví mua trong block đầu tiên mà trên 3 ví là loại (Bundle)
            if (block1Buyers.size > 3) {
                return buildDropResult(
                    [`early_bundle_${block1Buyers.size}_buyers_block_1`],
                    { top1Percent, top5Percent, holderCount, creatorHolding, earlyBuyerCount: block1Buyers.size }
                );
            }
        }

        // ── Step 3b: Early sell check (chỉ chạy ở monitoring mode) ──
        // Pre-buy: bỏ qua vì chưa đủ thời gian để top holder kịp bán
        // Monitoring: check top holders có bán trong 2 phút đầu không
        let earlySellerCount = 0;
        let activityCount = 0;

        if (mode === 'monitoring') {
            const twoMinutesAfterMigrate = migrateTS + 120;
            const earlySellsByTopHolders: Array<{ owner: string, signature: string }> = [];

            for (let i = 0; i < holderInfos.slice(0, 5).length; i++) {
                const holder = holderInfos[i];
                const sigs = holderSigs[i] ?? [];
                const earlySigsOfHolder = sigs.filter(sig =>
                    sig.err === null &&
                    sig.blockTime !== null &&
                    sig.blockTime >= migrateTS &&
                    sig.blockTime <= twoMinutesAfterMigrate
                );

                if (earlySigsOfHolder.length > 0) {
                    const txDetails = await Promise.all(
                        earlySigsOfHolder.slice(0, 3).map(sig => rpcClient.getTransaction(sig.signature))
                    );

                    for (const txDetail of txDetails) {
                        if (!txDetail || !txDetail.transaction || txDetail.meta?.err) continue;

                        const accountKeys = txDetail.transaction.message.accountKeys;
                        const accountIdx = accountKeys.indexOf(holder.tokenAccount);
                        if (accountIdx === -1) continue;

                        const preBalance = txDetail.meta?.preTokenBalances?.find(b => b.accountIndex === accountIdx && b.mint === mintAddress);
                        const postBalance = txDetail.meta?.postTokenBalances?.find(b => b.accountIndex === accountIdx && b.mint === mintAddress);

                        const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : 0n;
                        const postAmount = postBalance ? BigInt(postBalance.uiTokenAmount.amount) : 0n;

                        if (postAmount < preAmount) {
                            earlySellsByTopHolders.push({
                                owner: holder.owner,
                                signature: txDetail.transaction.signatures[0],
                            });
                            break; // Đã xác định holder này bán, dừng check tx khác của họ
                        }
                    }
                }
            }

            earlySellerCount = earlySellsByTopHolders.length;
            console.log(
                `HolderCheck [monitoring]: Top holders confirmed selling in first 2 minutes: ${earlySellerCount}`
            );

            if (earlySellerCount >= 1) {
                return buildDropResult(
                    [`early_sell_by_top_holder_${earlySellsByTopHolders[0].owner.substring(0, 8)}`],
                    { top1Percent, top5Percent, holderCount, creatorHolding, earlyBuyerCount, earlySellerCount }
                );
            }

            // ── Step 3c: Holder count trend (30s đầu) ─────────────────
            // Lấy transactions của token trong 30s đầu
            const txsInFirst30s = mintSigs.filter(sig =>
                sig.err === null &&
                sig.blockTime !== null &&
                sig.blockTime >= migrateTS &&
                sig.blockTime <= migrateTS + 30
            );

            // Số holder thật có tăng lên hay không:
            // Đếm số lượng organic transactions mua mới sau block 3 trong 30s đầu
            const organicTxsIn30s = txsInFirst30s.filter(sig => 
                migrationSlot > 0 && sig.slot - migrationSlot > 3
            );

            activityCount = txsInFirst30s.length;
            console.log(
                `HolderCheck [monitoring]: Total transactions in first 30s: ${activityCount}, organic txs after block 3: ${organicTxsIn30s.length}`
            );

            if (organicTxsIn30s.length === 0) {
                return buildDropResult(
                    ['no_organic_buyers_in_30s'],
                    { top1Percent, top5Percent, holderCount, creatorHolding, earlyBuyerCount, earlySellerCount, activityCount }
                );
            }
        }

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

        // Kiểm tra xem có insider (mua block 1-3) nào nằm trong top 5 holders không để warning
        const top5Owners = holderInfos.slice(0, 5).map(h => h.owner);
        const topHoldersWhoAreInsiders = top5Owners.filter(owner => block1To3Buyers.has(owner));
        if (topHoldersWhoAreInsiders.length > 0) {
            reasons.push(`insiders_in_top_holders_${topHoldersWhoAreInsiders.length}`);
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