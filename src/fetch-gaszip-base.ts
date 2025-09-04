/*
  Fetch all transaction calldatas to a specific contract on Base using HyperSync,
  decode them with gaszip decoder, and write results to CSV.

  Usage examples:
    - HYPERSYNC_BEARER_TOKEN=... pnpm run fetch:base
    - pnpm run fetch:base -- --from 0 --to 0           # stream full chain (to=0 means latest)
    - pnpm run fetch:base -- --out data/decoded.csv    # custom output path
    - pnpm run fetch:base -- --addr 0x391E7C679d29bD940d63be94AD22A25d25b5A604
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
  token?: string
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
    else if (a === '--token') args.token = argv[++i]
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
  const { from, to, out, addr, token, limit } = parseArgs(process.argv.slice(2))

  const CONTRACT = (addr || '0x391E7C679d29bD940d63be94AD22A25d25b5A604').toLowerCase()
  const OUTPUT = out || 'data/decoded-base.csv'
  const FROM_BLOCK = Number.isFinite(from) ? (from as number) : 0
  const TO_BLOCK = Number.isFinite(to) ? (to as number) : undefined

  const client = HypersyncClient.new({
    url: 'https://base.hypersync.xyz',
    bearerToken: token || process.env.HYPERSYNC_BEARER_TOKEN,
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
      transaction: ['block_number', 'transaction_index', 'hash', 'from', 'to', 'input'],
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
  for (;;) {
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
            `Stopped early at limit=${limit}. Wrote ${OUTPUT}. Transactions: ${total - 1}, decoded: ${decodedOk}, errors: ${decodedErr}`,
          )
          await stream.close()
          return
        }
        const input: string = (tx as any).input || '0x'
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
      ;(query as any).fromBlock = res.nextBlock
    }
  }

  outStream.end()
  // eslint-disable-next-line no-console
  console.log(
    `Done. Wrote ${OUTPUT}. Transactions: ${total}, decoded: ${decodedOk}, errors: ${decodedErr}`,
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err)
  process.exit(1)
})
