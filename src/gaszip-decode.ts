/*
  Gas.zip deposit calldata decoder

  Input: hex calldata string (e.g. 0x0200...)
  Output: structured object describing the decoded payload, and a CLI that prints JSON.

  Encoding reference (from the user’s example):
  - 0x01: Self deposit (no destination bytes) + chain IDs (2 bytes each)
  - 0x02: EVM address (20 bytes) + chain IDs
  - 0x03: Base58-type address bytes (commonly Solana 32 bytes) + chain IDs
  - 0x04: MOVE/FUEL address (32 bytes) + chain IDs
  - 0x05: XRP address bytes (Ripple base58 alphabet) + chain IDs
  - 0x06: Initia bech32 (‘init’) bytes + chain IDs

  Chain IDs are encoded as a sequence of 2-byte big-endian shorts appended to the end, per encodeChainIds.
  Because the number of chains is variable, we parse from the tail in 2-byte chunks until what remains matches the
  expected address-length for the prefix (when fixed). For variable-length address types (03 and 05), we greedily
  consume trailing 2-byte values that correspond to known Gas.zip IDs and treat the remainder as address bytes.
*/

import bs58 from 'bs58'
import basex from 'base-x'
import { bech32 } from 'bech32'

export type GasZipDecoded = {
  type: 'SELF' | 'EVM' | 'BASE58' | 'MOVE' | 'XRP' | 'INITIA' | 'UNKNOWN'
  raw: `0x${string}`
  prefix: string
  destination?: {
    evm?: `0x${string}`
    move?: `0x${string}`
    base58?: string
    base58Hex?: `0x${string}`
    solanaLike?: boolean
    xrp?: string
    initia?: string
    initiaHex?: `0x${string}`
  }
  chainIds: Array<{ id: number; name?: string; nativeId?: number }>
  leftoversHex?: `0x${string}`
}

// Gas.zip outbound chains mapping (subset is fine to start; fill comprehensively from the provided table)
// Generated directly from the provided list.
const GASZIP_CHAINS: Record<number, { name: string; nativeId: number }> = {
  110: { name: 'Abstract', nativeId: 2741 },
  493: { name: 'Adventure Layer', nativeId: 9988 },
  261: { name: 'AILayer', nativeId: 2649 },
  297: { name: 'Aleph Zero EVM', nativeId: 41455 },
  233: { name: 'AlienX', nativeId: 10241024 },
  128: { name: 'Ancient8', nativeId: 888888888 },
  445: { name: 'Animechain', nativeId: 69000 },
  296: { name: 'ApeChain', nativeId: 33139 },
  401: { name: 'AppChain', nativeId: 466 },
  348: { name: 'Aptos', nativeId: 1000011 },
  53: { name: 'Arbitrum Nova', nativeId: 42170 },
  57: { name: 'Arbitrum One', nativeId: 42161 },
  40: { name: 'Astar', nativeId: 592 },
  62: { name: 'Aurora', nativeId: 1313161554 },
  15: { name: 'Avalanche', nativeId: 43114 },
  278: { name: 'B3', nativeId: 8333 },
  292: { name: 'Bahamut', nativeId: 5165 },
  54: { name: 'Base Mainnet', nativeId: 8453 },
  479: { name: 'Battle for Blockchain', nativeId: 3920262608331171 },
  24: { name: 'Beam', nativeId: 4337 },
  143: { name: 'Berachain', nativeId: 80094 },
  138: { name: 'BEVM', nativeId: 11501 },
  85: { name: 'BiFrost', nativeId: 3068 },
  147: { name: 'Bitlayer', nativeId: 200901 },
  494: { name: 'Bittensor EVM', nativeId: 964 },
  96: { name: 'Blast', nativeId: 81457 },
  150: { name: 'BOB', nativeId: 60808 },
  411: { name: 'Boba BNB', nativeId: 56288 },
  140: { name: 'Boba ETH', nativeId: 288 },
  496: { name: 'Botanix', nativeId: 3637 },
  14: { name: 'BSC Mainnet', nativeId: 56 },
  148: { name: 'B² Network', nativeId: 223 },
  126: { name: 'Callisto', nativeId: 820 },
  502: { name: 'CAMP', nativeId: 484 },
  21: { name: 'Celo', nativeId: 42220 },
  333: { name: 'CheeseChain', nativeId: 383353 },
  458: { name: 'Civitia', nativeId: 1000024 },
  357: { name: 'Codex', nativeId: 81224 },
  65: { name: 'ConFlux', nativeId: 1030 },
  498: { name: 'Converge', nativeId: 432 },
  416: { name: 'Conwai', nativeId: 668668 },
  34: { name: 'CoreDAO', nativeId: 1116 },
  391: { name: 'Corn', nativeId: 21000000 },
  36: { name: 'Cronos', nativeId: 25 },
  276: { name: 'Cronos zkEVM', nativeId: 388 },
  135: { name: 'Cyber', nativeId: 7560 },
  300: { name: 'DeBank', nativeId: 20240603 },
  133: { name: 'Degen', nativeId: 666666666 },
  365: { name: 'Derive', nativeId: 957 },
  63: { name: 'Dexalot', nativeId: 432204 },
  46: { name: 'Dogechain', nativeId: 2000 },
  134: { name: 'Dymension', nativeId: 1100 },
  459: { name: 'Echelon', nativeId: 1000025 },
  328: { name: 'Eclipse', nativeId: 1000002 },
  489: { name: 'EDU', nativeId: 41923 },
  474: { name: 'Embr', nativeId: 2598901095158506 },
  302: { name: 'Endurance', nativeId: 648 },
  142: { name: 'EOS EVM', nativeId: 17777 },
  255: { name: 'Ethereum', nativeId: 1 },
  346: { name: 'Etherlink', nativeId: 42793 },
  364: { name: 'Ethernity', nativeId: 183 },
  71: { name: 'ETHW', nativeId: 10001 },
  491: { name: 'Everclear', nativeId: 25327 },
  39: { name: 'EVMOS', nativeId: 9001 },
  403: { name: 'ExSat', nativeId: 7200 },
  20: { name: 'Fantom', nativeId: 250 },
  354: { name: 'Flame', nativeId: 253368190 },
  38: { name: 'Flare', nativeId: 14 },
  437: { name: 'Flow EVM', nativeId: 747 },
  304: { name: 'Fluence', nativeId: 9999999 },
  383: { name: 'Form', nativeId: 478 },
  267: { name: 'Forma', nativeId: 984122 },
  10: { name: 'Fraxtal', nativeId: 252 },
  339: { name: 'Fuel', nativeId: 1000006 },
  31: { name: 'Fuse', nativeId: 122 },
  431: { name: 'G7', nativeId: 2187 },
  16: { name: 'Gnosis', nativeId: 100 },
  440: { name: 'GOAT', nativeId: 2345 },
  240: { name: 'Gravity', nativeId: 1625 },
  247: { name: 'Ham', nativeId: 5112 },
  66: { name: 'Harmony', nativeId: 1666600000 },
  408: { name: 'Hashkey', nativeId: 177 },
  397: { name: 'Hemi', nativeId: 43111 },
  495: { name: 'Humanity', nativeId: 6985385 },
  501: { name: 'Humanode', nativeId: 5234 },
  132: { name: 'Hychain', nativeId: 2911 },
  291: { name: 'HyperCore', nativeId: 88778877 },
  430: { name: 'HyperEVM', nativeId: 999 },
  95: { name: 'Immutable zkEVM', nativeId: 13371 },
  480: { name: 'ING', nativeId: 2780922216980457 },
  456: { name: 'Initia', nativeId: 1000023 },
  78: { name: 'Injective EVM', nativeId: 2525 },
  392: { name: 'Ink', nativeId: 57073 },
  460: { name: 'INRT', nativeId: 1000026 },
  461: { name: 'Intergaze', nativeId: 1000027 },
  67: { name: 'IoTeX', nativeId: 4689 },
  33: { name: 'Kaia', nativeId: 8217 },
  485: { name: 'Katana', nativeId: 747474 },
  22: { name: 'Kava', nativeId: 2222 },
  90: { name: 'KCC', nativeId: 321 },
  478: { name: 'LayerEdge', nativeId: 4207 },
  442: { name: 'Lens', nativeId: 232 },
  79: { name: 'Lightlink', nativeId: 1890 },
  59: { name: 'Linea', nativeId: 59144 },
  238: { name: 'Lisk', nativeId: 1135 },
  87: { name: 'Lukso', nativeId: 42 },
  332: { name: 'Lumia Prism', nativeId: 994873017 },
  100: { name: 'Lumio', nativeId: 8866 },
  60: { name: 'Manta', nativeId: 169 },
  13: { name: 'Mantle Mainnet', nativeId: 5000 },
  294: { name: 'Matchain', nativeId: 698 },
  9: { name: 'Merlin', nativeId: 4200 },
  144: { name: 'Metal', nativeId: 1750 },
  26: { name: 'Meter', nativeId: 82 },
  30: { name: 'Metis', nativeId: 1088 },
  499: { name: 'Mezo', nativeId: 31612 },
  483: { name: 'MilkyWay', nativeId: 1000033 },
  407: { name: 'Mind', nativeId: 228 },
  253: { name: 'Mint', nativeId: 185 },
  503: { name: 'Mitosis', nativeId: 124816 },
  73: { name: 'Mode', nativeId: 34443 },
  28: { name: 'Moonbeam', nativeId: 1284 },
  29: { name: 'Moonriver', nativeId: 1285 },
  340: { name: 'Morph', nativeId: 2818 },
  97: { name: 'Muster Network', nativeId: 4078 },
  92: { name: 'Neon EVM', nativeId: 245022934 },
  477: { name: 'Nibiru', nativeId: 6900 },
  259: { name: 'Numbers', nativeId: 10507 },
  23: { name: 'Oasis Emerald', nativeId: 42262 },
  69: { name: 'Oasys', nativeId: 248 },
  490: { name: 'OEV API3', nativeId: 4913 },
  35: { name: 'OKX', nativeId: 66 },
  492: { name: 'Onyx', nativeId: 80888 },
  55: { name: 'OP Mainnet', nativeId: 10 },
  58: { name: 'opBNB', nativeId: 204 },
  236: { name: 'Optopia', nativeId: 62050 },
  74: { name: 'Orderly', nativeId: 291 },
  423: { name: 'Peaq', nativeId: 3338 },
  88: { name: 'PEGO', nativeId: 20201022 },
  422: { name: 'Phala', nativeId: 2035 },
  5: { name: 'PlatON', nativeId: 210425 },
  450: { name: 'Plume', nativeId: 98866 },
  17: { name: 'Polygon', nativeId: 137 },
  52: { name: 'Polygon zkEVM', nativeId: 1101 },
  367: { name: 'Polynomial', nativeId: 8008 },
  448: { name: 'Powerloom V2', nativeId: 7869 },
  378: { name: 'Prom', nativeId: 227 },
  98: { name: 'Proof of Play Apex', nativeId: 70700 },
  293: { name: 'Proof of Play Boss', nativeId: 70701 },
  12: { name: 'Pulsechain', nativeId: 369 },
  452: { name: 'R5 Testnet', nativeId: 337 },
  298: { name: 'Race', nativeId: 6805 },
  82: { name: 'Rari', nativeId: 1380012617 },
  482: { name: 'Rave', nativeId: 555110192329996 },
  149: { name: 'Redstone', nativeId: 690 },
  466: { name: 'Rena Nuwa', nativeId: 1000032 },
  234: { name: 'Reya', nativeId: 1729 },
  396: { name: 'River', nativeId: 550 },
  413: { name: 'Ronin', nativeId: 2020 },
  254: { name: 'Rootstock', nativeId: 30 },
  125: { name: 'RSS3', nativeId: 12553 },
  295: { name: 'Saakuru', nativeId: 7225878 },
  131: { name: 'Sanko', nativeId: 1996 },
  6: { name: 'SatoshiVM', nativeId: 3109 },
  246: { name: 'Sei', nativeId: 1329 },
  443: { name: 'Settlus', nativeId: 5371 },
  327: { name: 'Shape', nativeId: 360 },
  455: { name: 'zkCandy', nativeId: 320 },
  398: { name: 'Skate', nativeId: 5050 },
  287: { name: 'Snaxchain', nativeId: 2192 },
  245: { name: 'Solana', nativeId: 501474 },
  504: { name: 'Somnia', nativeId: 5031 },
  414: { name: 'Soneium', nativeId: 1868 },
  389: { name: 'Sonic', nativeId: 146 },
  410: { name: 'Soon Mainnet', nativeId: 1000020 },
  484: { name: 'Sophon', nativeId: 50104 },
  406: { name: 'Spotlight', nativeId: 10058111 },
  64: { name: 'Step', nativeId: 1234 },
  181: { name: 'Story', nativeId: 1514 },
  347: { name: 'Sui', nativeId: 1000010 },
  303: { name: 'Superposition', nativeId: 55244 },
  366: { name: 'Superseed', nativeId: 5330 },
  256: { name: 'Swan', nativeId: 254 },
  385: { name: 'Swell', nativeId: 1923 },
  19: { name: 'SX Network', nativeId: 416 },
  137: { name: 'Syndicate Frame', nativeId: 5101 },
  249: { name: 'Taiko', nativeId: 167000 },
  47: { name: 'Telos', nativeId: 40 },
  27: { name: 'Tenet', nativeId: 1559 },
  258: { name: 'ThunderCore', nativeId: 108 },
  75: { name: 'Tron', nativeId: 1000001 },
  394: { name: 'U2U Solaris', nativeId: 39 },
  362: { name: 'Unichain', nativeId: 130 },
  419: { name: 'UNIT0', nativeId: 88811 },
  488: { name: 'Vana', nativeId: 1480 },
  395: { name: 'Vanar', nativeId: 2040 },
  43: { name: 'Viction', nativeId: 88 },
  301: { name: 'Vizing', nativeId: 28518 },
  81: { name: 'Wemix', nativeId: 1111 },
  269: { name: 'WorldChain', nativeId: 480 },
  146: { name: 'X Layer', nativeId: 196 },
  77: { name: 'XAI', nativeId: 660279 },
  242: { name: 'XCHAIN', nativeId: 94524 },
  420: { name: 'XDC', nativeId: 50 },
  48: { name: 'XPLA', nativeId: 37 },
  377: { name: 'XRP', nativeId: 1000016 },
  487: { name: 'XRPL EVM', nativeId: 1440000 },
  239: { name: 'Xterio', nativeId: 2702128 },
  471: { name: 'Yominet EVM', nativeId: 428962654539583 },
  481: { name: 'Zaar', nativeId: 1335097526422335 },
  361: { name: 'ZERO', nativeId: 543210 },
  94: { name: 'Zeta', nativeId: 7000 },
  353: { name: 'Zircuit', nativeId: 48900 },
  50: { name: 'zkFair', nativeId: 42766 },
  136: { name: 'zkLink Nova', nativeId: 810180 },
  41: { name: 'zkScroll', nativeId: 534352 },
  51: { name: 'zkSync Era', nativeId: 324 },
  56: { name: 'Zora', nativeId: 7777777 },
}

const XRPL_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
const xrpb58 = basex(XRPL_ALPHABET)

function assertHex(input: string): asserts input is `0x${string}` {
  if (typeof input !== 'string' || !input.startsWith('0x') || input.length % 2 !== 0) {
    throw new Error('Expected 0x-prefixed even-length hex string')
  }
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (h.length % 2 !== 0) throw new Error('Invalid hex length')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function splitAddressAndChains(prefix: number, body: Uint8Array): { addressBytes: Uint8Array; chainIds: number[]; leftovers?: Uint8Array } {
  // Helper to get fixed address length by prefix (in bytes). Unknown for 03,05.
  const fixedLen = ((): number | null => {
    if (prefix === 0x01) return 0
    if (prefix === 0x02) return 20
    if (prefix === 0x04) return 32
    if (prefix === 0x06) return 20 // Initia bech32 typically 20 bytes
    return null // 03 (Base58-like), 05 (XRP) variable
  })()

  // If we know the fixed length, slice it and decode remaining as 2-byte chain IDs.
  if (fixedLen !== null) {
    if (body.length < fixedLen) throw new Error('Calldata too short for expected address length')
    const addressBytes = body.slice(0, fixedLen)
    const tail = body.slice(fixedLen)
    if (process.env.DEBUG_DECODER === '1') {
      // Debug lengths
      // eslint-disable-next-line no-console
      console.error('[debug] bodyLen=', body.length, 'fixedLen=', fixedLen, 'tailLen=', tail.length)
    }
    if (tail.length % 2 !== 0) throw new Error('Chain IDs tail must be a multiple of 2 bytes')
    const chainIds: number[] = []
    for (let i = 0; i < tail.length; i += 2) chainIds.push(readU16BE(tail, i))
    return { addressBytes, chainIds }
  }

  // Special case for 0x03 (Base58): if it looks like Solana (32 bytes) + 2-byte * n, parse deterministically.
  if (prefix === 0x03 && body.length >= 32 && (body.length - 32) % 2 === 0) {
    const addressBytes = body.slice(0, 32)
    const tail = body.slice(32)
    const chainIds: number[] = []
    for (let i = 0; i < tail.length; i += 2) chainIds.push(readU16BE(tail, i))
    return { addressBytes, chainIds }
  }

  // Variable-length address (03 non-32, 05 XRP): parse from tail as 2-byte chain IDs so long as they look valid,
  // leaving the remainder as address bytes.
  // Strategy: consume 2-byte groups while the value is in a sane range and (optionally) in known table.
  // Always leave at least 1 byte for address.
  let end = body.length
  const chainIdsRev: number[] = []
  while (end - 2 >= 1) {
    const val = readU16BE(body, end - 2)
    // Accept any 1..65535, but prefer known IDs; if unknown and we already have at least one ID, stop greedily.
    const isKnown = !!GASZIP_CHAINS[val]
    if (!isKnown && chainIdsRev.length > 0) break
    chainIdsRev.push(val)
    end -= 2
  }
  const addressBytes = body.slice(0, end)
  chainIdsRev.reverse()
  return { addressBytes, chainIds: chainIdsRev }
}

export function decodeGasZipCalldata(input: string): GasZipDecoded {
  assertHex(input)
  if (process.env.DEBUG_DECODER === '1') {
    // eslint-disable-next-line no-console
    console.error('[debug] inputLenHexChars=', input.length - 2)
  }
  const data = hexToBytes(input)
  if (data.length < 1) throw new Error('Empty calldata')
  const prefix = data[0]
  const body = data.slice(1)

  const { addressBytes, chainIds, leftovers } = splitAddressAndChains(prefix, body)

  const mappedChains = chainIds.map((id) => ({ id, name: GASZIP_CHAINS[id]?.name, nativeId: GASZIP_CHAINS[id]?.nativeId }))
  const base: Omit<GasZipDecoded, 'type'> = {
    raw: input as `0x${string}`,
    prefix: '0x' + prefix.toString(16).padStart(2, '0'),
    chainIds: mappedChains,
    leftoversHex: leftovers && leftovers.length ? bytesToHex(leftovers) : undefined,
    destination: {},
  }

  // 0x01: self-deposit
  if (prefix === 0x01) {
    return { ...base, type: 'SELF' }
  }

  // 0x02: EVM 20 bytes
  if (prefix === 0x02) {
    if (addressBytes.length !== 20) throw new Error('EVM address must be 20 bytes')
    const evm = bytesToHex(addressBytes)
    return { ...base, type: 'EVM', destination: { ...base.destination, evm } }
  }

  // 0x04: MOVE/FUEL 32 bytes hex
  if (prefix === 0x04) {
    if (addressBytes.length !== 32) throw new Error('MOVE/FUEL address must be 32 bytes')
    const move = bytesToHex(addressBytes)
    return { ...base, type: 'MOVE', destination: { ...base.destination, move } }
  }

  // 0x06: Initia bech32
  if (prefix === 0x06) {
    if (addressBytes.length !== 20) throw new Error('Initia address expected 20 bytes')
    const initiaHex = bytesToHex(addressBytes)
    let initia: string | undefined
    try {
      const words = bech32.toWords(addressBytes)
      initia = bech32.encode('init', words)
    } catch {
      /* fallthrough */
    }
    return { ...base, type: 'INITIA', destination: { ...base.destination, initia, initiaHex } }
  }

  // 0x03: Base58-type (Solana or other base58)
  if (prefix === 0x03) {
    const base58Hex = bytesToHex(addressBytes)
    let base58Str = ''
    try { base58Str = bs58.encode(addressBytes) } catch { /* ignore */ }
    const solanaLike = addressBytes.length === 32
    return { ...base, type: 'BASE58', destination: { ...base.destination, base58: base58Str, base58Hex, solanaLike } }
  }

  // 0x05: XRP (Ripple base58 alphabet)
  if (prefix === 0x05) {
    let xrp = ''
    try { xrp = xrpb58.encode(addressBytes) } catch { /* ignore */ }
    return { ...base, type: 'XRP', destination: { ...base.destination, xrp } }
  }

  // Unknown prefix: return raw
  return { ...base, type: 'UNKNOWN' }
}

// Simple CLI
// Usage: ts-node src/gaszip-decode.ts 0x0200....
// CLI main check (supports CJS and ESM)
const isMain = (typeof require !== 'undefined' && (require as any).main === module)
if (isMain) {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: ts-node src/gaszip-decode.ts <0x-calldata>')
    process.exit(1)
  }
  try {
    const decoded = decodeGasZipCalldata(arg)
    console.log(JSON.stringify(decoded, null, 2))
  } catch (e: any) {
    console.error('Decode error:', e?.message || e)
    process.exit(2)
  }
}
