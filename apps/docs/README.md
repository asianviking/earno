# earno docs (Vocs)

Local dev (from repo root):

```sh
pnpm --filter earno-docs dev
```

Build:

```sh
pnpm --filter earno-docs build
```

## Deploy (Vercel)

Recommended: create a **separate** Vercel project for docs.

- Root directory: `apps/docs`
- Build command: `pnpm build`
- Output directory: `dist`
- Domain: `docs.earno.sh`
