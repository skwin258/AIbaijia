# SK AI Baccarat Assistant Deployment

This project can run in two modes:

- Local or VPS Node.js server: `server.js`
- Cloudflare Workers with static assets: `worker/index.js`, `public/`, and `wrangler.jsonc`

## Local / VPS Environment

Create a `.env` file or set these environment variables on your host:

```env
PORT=3000
HOST=0.0.0.0
SUPERADMIN_USERNAME=koko85830
SUPERADMIN_PASSWORD=change-this-before-production
DATA_DIR=/app/data
```

Run:

```bash
npm ci
npm start
```

## GitHub Actions + Cloudflare Workers

The workflow at `.github/workflows/deploy-cloudflare.yml` deploys automatically when `main` is pushed, and can also be started manually from GitHub Actions.

### Required GitHub Secrets

Add these in GitHub:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
SUPERADMIN_PASSWORD
```

The Cloudflare API token needs permission to deploy Workers and manage Workers KV.

### What The Workflow Does

1. Checks out the repository.
2. Installs dependencies with `npm ci`.
3. Runs tests with `npm test`.
4. Finds or creates these Cloudflare KV namespaces:
   - `SK_DATA`
   - `SK_DATA_PREVIEW`
5. Writes the real KV IDs into `wrangler.jsonc` for the deployment run.
6. Syncs `SUPERADMIN_PASSWORD` as a Cloudflare Worker secret.
7. Deploys the Worker with Wrangler.

### Manual Cloudflare Deploy

After logging in locally with Wrangler:

```bash
npx wrangler login
npx wrangler kv namespace create SK_DATA
npx wrangler kv namespace create SK_DATA_PREVIEW
```

Copy the returned namespace IDs into `wrangler.jsonc`, then run:

```bash
npx wrangler secret put SUPERADMIN_PASSWORD
npm run deploy:cloudflare
```

## Production Checks

After deployment, verify:

- `/` opens the mobile assistant.
- `/admin.html` opens the admin panel.
- `/shortcut.html?token=...` opens a user shortcut.
- `/api/access/validate?token=...` returns access status.
- The site is served over HTTPS, which is required for stable iPhone Safari shortcut behavior.
