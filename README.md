# Gas.zip Calldata Fetch + Decode (HyperSync)

For gas.zip EOAs on EVM chains

Stream transactions from any EVM HyperSync endpoint, decode Gas.zip calldatas, and write a CSV with zip destinations.

Quick start
- `pnpm install`
- Run: `pnpm run fetch -- --url https://base.hypersync.xyz --from 35101229 --out data/decoded-from-35101229.csv --addr 0x391E7C679d29bD940d63be94AD22A25d25b5A604 --api-token XXXXYOURAPITOKENXXXXX`
- Optionally set `HYPERSYNC_API_TOKEN`, `HYPERSYNC_URL` in `.env`.

Options
- `--url <url>` or `HYPERSYNC_URL`
- `--api-token <token>` or `HYPERSYNC_API_TOKEN`
- `--addr <address>` (required)
- `--from <block>` (default 0), `--to <block>`
- `--out <file>` (default `data/decoded.csv`)
- `--limit <n>`

Scripts
- `pnpm run fetch` (uses `src/fetch-gaszip.ts`)
- `pnpm run decode -- <0xhex>` (one-off decode)

for validation, all transactions on base have been saved to [base-from-block-16989497.7z](data/base-from-block-16989497.7z). Transactions: 1727807, decoded: 1727671, [errors: 6](data/base-from-block-16989497-errors.csv)