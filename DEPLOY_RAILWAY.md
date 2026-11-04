# Deploy Brandinbold Cloud on Railway

Railway builds each service from its Dockerfile — PostgreSQL, migrations and
env vars are provisioned automatically. Total time: ~10 minutes.

## 1. Push to GitHub

```bash
cd "/Users/brahimbouabi/Documents/REVERSE ENGEN/rea-app"
git remote add origin https://github.com/<your-account>/brandinbold.git
git push -u origin main
```

The repo is already a clean git repository (`main` branch, .gitignore blocks
node_modules, DMGs, versions/, engine-bundle and env files).

## 2. Create the Railway project

1. Go to [railway.com](https://railway.com) → **New Project**
2. Choose **Deploy from GitHub repo** → select `brandinbold`
3. Railway proposes the services — create **three**:

### Service 1: PostgreSQL
- New Project → **Provision PostgreSQL** (one click, no config)
- Note the `DATABASE_URL` it exposes in the Variables tab

### Service 2: Cloud API
- Add a service from the repo → **Root Directory**: `cloud/api`
- Railway builds `cloud/api/Dockerfile` (node:22-alpine, self-migrating boot)
- Variables to set:
  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | `${{PostgreSQL.DATABASE_URL}}` (reference to service 1) |
  | `JWT_SECRET` | `openssl rand -base64 48` output |
  | `PORT` | leave empty — Railway injects it |
- Settings → Networking → **Generate Domain** → note the public URL
  (e.g. `https://brandinbold-api.up.railway.app`)
- Settings → **Config-as-code path**: `/cloud/api/railway.json` (Railway does
  NOT follow the root directory for this file — the path must be absolute).
  It sets the healthcheck `/api/health` and start command `node dist/index.cjs`.

### Service 3: Cloud Web
- Add a service from the repo → **Root Directory**: `cloud/web`
- Railway builds `cloud/web/Dockerfile` (nginx serving the SPA on Railway's
  `$PORT`; the SPA calls the API directly via `VITE_API_URL`, no proxy)
- Settings → **Config-as-code path**: `/cloud/web/railway.json`
- Variables:
  | Variable | Value |
  |---|---|
  | `VITE_API_URL` | the public API URL from service 2 |
- Settings → Networking → **Generate Domain**
- ⚠️ `VITE_API_URL` is baked at BUILD time — after changing it, redeploy the
  web service.

## 3. Desktop app

Set the server in the Electron app via **Settings → Debug tools → Cloud
server** or **Server settings…** on the sign-in screen: paste the Railway API
URL, click **Test** (probes `/api/health`), then **Save** — no restart needed.
Changing server signs you out of the previous one. The env var
`BRANDINBOLD_CLOUD_API_URL` overrides the setting (field becomes read-only).
Sign in with the account created on `cloud-web` — profiles, groups, proxies and
session archives sync automatically.

## 4. Verify

```bash
curl https://<your-api-domain>/api/health
# → {"alive":true,"app":"Brandinbold Cloud API","version":"0.1.0"}
```

Register on the web landing page, then sign in inside the desktop app —
the sync starts automatically.

## 5. Fat DMG offline build (no Railway needed)

```bash
npm run package:offline
# → release/Brandinbold-0.1.0-arm64-offline.dmg (1.4 GB, engine bundled,
#   zero network on first install)
```

## Costs

Railway pricing is usage-based. A minimal stack (Postgres + API + Web) runs
for ~$5–10/month at hobby traffic. The Postgres volume is the main cost.
