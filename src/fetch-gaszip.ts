/*
  Fetch all transaction calldatas to a specific contract on any EVM chain via HyperSync,
  decode them with the Gas.zip decoder, and write results to CSV.

  Examples:
    - HYPERSYNC_API_TOKEN=... HYPERSYNC_URL=https://<chain>.hypersync.xyz pnpm run fetch
    - pnpm run fetch -- --url https://<chain>.hypersync.xyz --from 0 --out data/out.csv \
        --addr 0x391E7C679d29bD940d63be94AD22A25d25b5A604
*/

import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { HypersyncClient, JoinMode, type Query } from '@envio-dev/hypersync-client'
import { decodeGasZipCalldata } from './gaszip-decode'

type CliArgs = {
  from?: number
  to?: number
  out?: string
  addr?: string
  url?: string
  apiToken?: string
  limit?: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = Number(argv[++i])
    else if (a === '--to') args.to = Number(argv[++i])
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--addr') args.addr = argv[++i]
    else if (a === '--url') args.url = argv[++i]
    else if (a === '--api-token') args.apiToken = argv[++i]
    // Backwards compat aliases
    else if (a === '--token') (args as any).apiToken = argv[++i]
    else if (a === '--limit') args.limit = Number(argv[++i])
  }
  return args
}

function csvEscape(val: any): string {
  const s = val === undefined || val === null ? '' : String(val)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function ensureDir(path: string) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function main() {
  const { from, to, out, addr, url, apiToken, limit } = parseArgs(process.argv.slice(2))

  const CONTRACT = (addr || '0x391E7C679d29bD940d63be94AD22A25d25b5A604').toLowerCase()
  const OUTPUT = out || 'data/decoded.csv'
  const FROM_BLOCK = Number.isFinite(from) ? (from as number) : 0
  const TO_BLOCK = Number.isFinite(to) ? (to as number) : undefined

  const URL = url || process.env.HYPERSYNC_URL
  if (!URL) throw new Error('Missing HyperSync URL. Provide --url or HYPERSYNC_URL env var')

  const client = HypersyncClient.new({
    url: URL,
    bearerToken: apiToken || process.env.HYPERSYNC_API_TOKEN,
  })

  const query: Query = {
    fromBlock: FROM_BLOCK,
    ...(TO_BLOCK ? { toBlock: TO_BLOCK } : {}),
    transactions: [
      {
        to: [CONTRACT],
      },
    ],
    fieldSelection: {
      // Use snake_case names in selection; response uses camelCase fields
      block: ['number', 'timestamp'],
      transaction: [
        'block_number',
        'transaction_index',
        'hash',
        'from',
        'to',
        'input',
        'value',
      ],
    },
    // Use default join so we get the containing blocks (for timestamps)
    joinMode: JoinMode.Default,
  }

  ensureDir(OUTPUT)
  const outStream = createWriteStream(OUTPUT, { flags: 'w' })
  const header = [
    'block_number',
    'timestamp',
    'tx_index',
    'tx_hash',
    'from',
    'to',
    'input',
    'value_wei',
    'value_eth',
    'decode_type',
    'prefix',
    'dest_evm',
    'dest_move',
    'dest_base58',
    'dest_base58_hex',
    'dest_solana_like',
    'dest_xrp',
    'dest_initia',
    'dest_initia_hex',
    'chain_ids',
    'decode_error',
  ]
  outStream.write(header.join(',') + '\n')

  let total = 0
  let decodedOk = 0
  let decodedErr = 0

  const stream = await client.stream(query, {})
  let totalValueWei: bigint = 0n
  const formatEth = (wei?: bigint): string => {
    if (wei === undefined) return ''
    const base = 10n ** 18n
    const whole = wei / base
    const frac = wei % base
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '')
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString()
  }
  for (; ;) {
    const res = await stream.recv()
    if (!res) break

    const blocksByNumber = new Map<number, { number: number; timestamp?: string | number }>()
    if (res.data?.blocks) {
      for (const b of res.data.blocks) {
        blocksByNumber.set(Number((b as any).number), { number: Number((b as any).number), timestamp: (b as any).timestamp })
      }
    }

    if (res.data?.transactions?.length) {
      for (const tx of res.data.transactions) {
        total++
        if (limit && total > limit) {
          outStream.end()
          console.log(
            `Stopped early at limit=${limit}. Wrote ${OUTPUT}. Transactions: ${total - 1}, decoded: ${decodedOk}, errors: ${decodedErr}, cumulative_value_eth: ${formatEth(totalValueWei)}`,
          )
          await stream.close()
          return
        }
        const input: string = (tx as any).input || '0x'

        // Value
        const toHex = (v: any): string | undefined => (typeof v === 'string' ? v : undefined)
        const hexToBigInt = (v?: string): bigint | undefined => {
          if (!v) return undefined
          try { return BigInt(v) } catch { return undefined }
        }

        const valueWei = hexToBigInt(toHex((tx as any).value))
        if (valueWei !== undefined) totalValueWei += valueWei
        let decType = ''
        let prefix = ''
        let dest_evm = ''
        let dest_move = ''
        let dest_base58 = ''
        let dest_base58_hex = ''
        let dest_solana_like = ''
        let dest_xrp = ''
        let dest_initia = ''
        let dest_initia_hex = ''
        let chain_ids = ''
        let decode_error = ''

        if (input && input !== '0x') {
          try {
            const d = decodeGasZipCalldata(input)
            decType = d.type
            prefix = d.prefix
            dest_evm = d.destination?.evm || ''
            dest_move = d.destination?.move || ''
            dest_base58 = d.destination?.base58 || ''
            dest_base58_hex = d.destination?.base58Hex || ''
            dest_solana_like = d.destination?.solanaLike ? 'true' : ''
            dest_xrp = d.destination?.xrp || ''
            dest_initia = d.destination?.initia || ''
            dest_initia_hex = d.destination?.initiaHex || ''
            chain_ids = JSON.stringify(d.chainIds)
            decodedOk++
          } catch (e: any) {
            decType = 'DECODE_ERROR'
            decode_error = e?.message || String(e)
            decodedErr++
          }
        }

        const bn = Number((tx as any).blockNumber)
        const blk = blocksByNumber.get(bn)
        const tsRaw = blk?.timestamp
        const tsOut = typeof tsRaw === 'string' && tsRaw.startsWith('0x') ? parseInt(tsRaw, 16).toString() : (tsRaw ?? '').toString()
        const row = [
          bn,
          tsOut,
          (tx as any).transactionIndex,
          (tx as any).hash,
          (tx as any).from,
          (tx as any).to,
          input,
          valueWei?.toString() ?? '',
          formatEth(valueWei),
          decType,
          prefix,
          dest_evm,
          dest_move,
          dest_base58,
          dest_base58_hex,
          dest_solana_like,
          dest_xrp,
          dest_initia,
          dest_initia_hex,
          chain_ids,
          decode_error,
        ]
          .map(csvEscape)
          .join(',')
        outStream.write(row + '\n')
      }
    }

    if (res.nextBlock) {
      // advance starting block for subsequent pages
      ; (query as any).fromBlock = res.nextBlock
    }
  }

  outStream.end()
  // eslint-disable-next-line no-console
  console.log(
    `Done. Wrote ${OUTPUT}. Transactions: ${total}, decoded: ${decodedOk}, errors: ${decodedErr}, cumulative_value_eth: ${formatEth(totalValueWei)}`,
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err)
  process.exit(1)
})
