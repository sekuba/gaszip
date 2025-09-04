# Gas.zip Calldata Fetch + Decode (HyperSync)

```
           ________________
          /  ___   ___   /\
         /  /__/  /__/  /  \
        /________________/ /|
        |  |  |  |  |  | / |
        |  |  |  |  |  |/  |
        |  |  |  |  |  /|  |
        |  |  |  |  / / |  |   <- zipper teeth opening
        |  |  |  / / /  |  |
        |  |  / / / /   |  |
        |  /  / / /     |  |
        | /  / / /      |  |
        |/__/ /_/_______|  |
           \\  ||  //      |
            \\ || //       |
             \\||//        |
               \/          |
               /\          |
```
*zipper opening* - gpt-5 medium

For decoding deposits to gas.zip EOAs on all EVM chains.

Streams transactions from any EVM HyperSync endpoint, decodes Gas.zip calldatas, and writes a CSV with zip destinations.

Quick start
- `pnpm install`
- Run: `pnpm run fetch -- --url https://base.hypersync.xyz --from 35101229 --out data/decoded-from-35101229.csv --addr 0x391E7C679d29bD940d63be94AD22A25d25b5A604 --api-token XXXXYOURAPITOKENXXXXX`
- Optionally set `HYPERSYNC_API_TOKEN`, `HYPERSYNC_URL` in `.env`.

Options
- `--url <url>` or `HYPERSYNC_URL` ([supported networks](https://docs.envio.dev/docs/HyperSync/hyperrpc-supported-networks))
- `--api-token <token>` or `HYPERSYNC_API_TOKEN` (get from [envio.dev/app/api-tokens](https://envio.dev/app/api-tokens))
- `--addr <address>` (required)
- `--from <block>` (default 0), `--to <block>`
- `--out <file>` (default `data/decoded.csv`)
- `--limit <n>`

Scripts
- `pnpm run fetch` (uses `src/fetch-gaszip.ts`)
- `pnpm run decode -- <0xhex>` (one-off decode)

for validation, all-time deposits on base have been saved to [base-from-block-16989497.7z](data/base-from-block-16989497.7z). Transactions: 1727807, decoded: 1727671, [errors: 6](data/base-from-block-16989497-errors.csv)
