import type { Token2022ExtensionInfo, OwnerControls } from '../../models/events.js';

// ── Critical extensions that affect safety scoring ──────────────
const CRITICAL_EXTENSIONS = new Set([
  'transferHook',
  'transferFeeConfig',
  'permanentDelegate',
  'pausable',
  'nonTransferable',
  'defaultAccountState',
  'mintCloseAuthority',
]);

// ── Informational extensions (no scoring, analytics only) ───────
// MetadataPointer, TokenMetadata, GroupPointer, Group, GroupMember,
// ImmutableOwner, MemoTransfer, ScaledUiAmount, InterestBearingConfig,
// ConfidentialTransfer, CpiGuard

// ── TransferHook whitelist ──────────────────────────────────────
// Hiện tại chưa có hook program nào đáng tin trên Solana memecoin market.
// Tất cả TransferHook sẽ bị REJECT.
// Có thể mở rộng bằng config trong tương lai.
const TRANSFER_HOOK_WHITELIST = new Set<string>([
  // Thêm trusted hook program IDs ở đây khi cần
]);

// ── Parse Token-2022 extensions from parsed account info ────────

export function parseToken2022Extensions(
  extensions: Array<{ extension: string; state: Record<string, any> }> | undefined
): Token2022ExtensionInfo[] {
  if (!extensions || extensions.length === 0) return [];

  return extensions.map(ext => ({
    name: ext.extension,
    critical: CRITICAL_EXTENSIONS.has(ext.extension),
    state: ext.state ?? {},
  }));
}

// ── Extract OwnerControls from Token-2022 extensions ────────────
// Bổ sung thông tin từ extensions vào OwnerControls đã có mint/freeze authority

export function applyToken2022Extensions(
  extensions: Token2022ExtensionInfo[],
  ownerControls: OwnerControls
): void {
  for (const ext of extensions) {
    switch (ext.name) {
      case 'transferHook': {
        // TransferHook: check if hook program is in whitelist
        const hookProgram = ext.state?.authority ?? ext.state?.programId ?? '';
        const isWhitelisted = TRANSFER_HOOK_WHITELIST.has(hookProgram);
        ownerControls.hasTransferHook = !isWhitelisted;
        break;
      }

      case 'transferFeeConfig': {
        // TransferFeeConfig: extract fee basis points
        // Solana stores current and upcoming fee epochs
        const newerEpoch = ext.state?.newerTransferFee ?? ext.state?.transferFeeConfigAuthority ?? {};
        const olderEpoch = ext.state?.olderTransferFee ?? {};
        // Use the higher of current/upcoming fees (worst case)
        const newerBps = newerEpoch?.transferFeeBasisPoints ?? 0;
        const olderBps = olderEpoch?.transferFeeBasisPoints ?? 0;
        const feeBps = Math.max(
          typeof newerBps === 'number' ? newerBps : parseInt(newerBps, 10) || 0,
          typeof olderBps === 'number' ? olderBps : parseInt(olderBps, 10) || 0
        );
        ownerControls.transferFeeBps = feeBps;
        ownerControls.transferFeePercent = feeBps / 100; // 100 bps = 1%
        break;
      }

      case 'permanentDelegate': {
        ownerControls.hasPermanentDelegate = true;
        break;
      }

      case 'pausable': {
        ownerControls.isPausable = true;
        break;
      }

      case 'nonTransferable': {
        ownerControls.isNonTransferable = true;
        break;
      }

      case 'defaultAccountState': {
        // If default state is 'frozen' (value 1), new holders' accounts start frozen
        const accountState = ext.state?.state ?? ext.state?.accountState;
        ownerControls.defaultAccountStateFrozen =
          accountState === 'frozen' || accountState === 1;
        break;
      }

      case 'mintCloseAuthority': {
        ownerControls.hasMintCloseAuthority = true;
        break;
      }
    }
  }
}

// ── Blocker Check: REJECT immediately if any critical rule triggers ──

export interface BlockerCheckResult {
  blocked: boolean;
  reasons: string[];
}

export function checkBlockerRules(
  ownerControls: OwnerControls,
  simulateSellSuccess: boolean
): BlockerCheckResult {
  const reasons: string[] = [];

  // BLOCKER 1: NonTransferable → token không thể transfer
  if (ownerControls.isNonTransferable) {
    reasons.push('blocker:non_transferable');
  }

  // BLOCKER 2: TransferHook (ngoài whitelist) → có thể chặn sell, blacklist, anti-bot
  if (ownerControls.hasTransferHook) {
    reasons.push('blocker:transfer_hook_active');
  }

  // BLOCKER 3: PermanentDelegate → delegate có thể burn/transfer token holder
  if (ownerControls.hasPermanentDelegate) {
    reasons.push('blocker:permanent_delegate_active');
  }

  // BLOCKER 4: Transfer Fee > 10%
  if (ownerControls.transferFeeBps > 1000) {
    reasons.push(`blocker:transfer_fee_${ownerControls.transferFeePercent.toFixed(1)}pct`);
  }

  // BLOCKER 5: Simulate Sell Failed
  if (!simulateSellSuccess) {
    reasons.push('blocker:simulate_sell_failed');
  }

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}
