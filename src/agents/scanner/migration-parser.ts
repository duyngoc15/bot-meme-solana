import bs58 from 'bs58';

// ── Types ──────────────────────────────────────────────────────────────────────

type FieldType = 'publicKey' | 'u64' | 'i64' | 'u16' | 'u8';

interface FieldDef {
  name: string;
  type: FieldType;
}

/**
 * ParsedMigration represents the fully decoded data from a pump.fun → Raydium
 * migration event emitted by the migration wrapper program.
 */
export interface ParsedMigration {
  timestamp: bigint;
  index: number;
  creator: string;
  baseMint: string;
  quoteMint: string;
  baseMintDecimals: number;
  quoteMintDecimals: number;
  baseAmountIn: bigint;
  quoteAmountIn: bigint;
  poolBaseAmount: bigint;
  poolQuoteAmount: bigint;
  minimumLiquidity: bigint;
  initialLiquidity: bigint;
  lpTokenAmountOut: bigint;
  poolBump: number;
  pool: string;
  lpMint: string;
  userBaseTokenAccount: string;
  userQuoteTokenAccount: string;
}

// ── Field definitions (Anchor instruction layout) ──────────────────────────────

const FIELDS: FieldDef[] = [
  { name: 'timestamp',            type: 'i64'       },
  { name: 'index',                type: 'u16'       },
  { name: 'creator',              type: 'publicKey' },
  { name: 'baseMint',             type: 'publicKey' },
  { name: 'quoteMint',            type: 'publicKey' },
  { name: 'baseMintDecimals',     type: 'u8'        },
  { name: 'quoteMintDecimals',    type: 'u8'        },
  { name: 'baseAmountIn',         type: 'u64'       },
  { name: 'quoteAmountIn',        type: 'u64'       },
  { name: 'poolBaseAmount',       type: 'u64'       },
  { name: 'poolQuoteAmount',      type: 'u64'       },
  { name: 'minimumLiquidity',     type: 'u64'       },
  { name: 'initialLiquidity',     type: 'u64'       },
  { name: 'lpTokenAmountOut',     type: 'u64'       },
  { name: 'poolBump',             type: 'u8'        },
  { name: 'pool',                 type: 'publicKey' },
  { name: 'lpMint',               type: 'publicKey' },
  { name: 'userBaseTokenAccount', type: 'publicKey' },
  { name: 'userQuoteTokenAccount',type: 'publicKey' },
];

// ── Binary parser ──────────────────────────────────────────────────────────────

/**
 * Parses raw instruction data from the migration wrapper program.
 * Skips the 8-byte Anchor discriminator, then reads fields sequentially.
 */
export function parseMigrateInstruction(data: Buffer): ParsedMigration | null {
  if (data.length < 8) {
    console.error(`[PARSER] Data too short: ${data.length} bytes`);
    return null;
  }

  let offset = 8; // skip 8-byte Anchor discriminator
  const parsed: Record<string, unknown> = {};

  try {
    for (const { name, type } of FIELDS) {
      switch (type) {
        case 'publicKey':
          parsed[name] = bs58.encode(data.subarray(offset, offset + 32));
          offset += 32;
          break;
        case 'u64':
          parsed[name] = data.readBigUInt64LE(offset);
          offset += 8;
          break;
        case 'i64':
          parsed[name] = data.readBigInt64LE(offset);
          offset += 8;
          break;
        case 'u16':
          parsed[name] = data.readUInt16LE(offset);
          offset += 2;
          break;
        case 'u8':
          parsed[name] = data.readUInt8(offset);
          offset += 1;
          break;
      }
    }
    return parsed as unknown as ParsedMigration;
  } catch (err) {
    console.error(`[PARSER] Parse failed at offset ${offset}:`, err);
    return null;
  }
}

// ── Log-level parser ───────────────────────────────────────────────────────────

/**
 * Scans transaction logs for "Program data:" entries and attempts to parse
 * migration event data. Returns the first successful parse, or null.
 */
export function parseMigrationFromLogs(logs: string[]): ParsedMigration | null {
  for (const log of logs) {
    if (!log.startsWith('Program data:')) continue;
    try {
      const b64 = log.split(': ')[1];
      const data = Buffer.from(b64, 'base64');
      const parsed = parseMigrateInstruction(data);
      if (parsed) return parsed;
    } catch {
      // continue to next log line
    }
  }
  return null;
}
