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
- Healthcheck: Railway probes `/api/health` automatically (configured in
  `railway.json`)

### Service 3: Cloud Web
- Add a service from the repo → **Root Directory**: `cloud/web`
- Railway builds `cloud/web/Dockerfile` (nginx serving the SPA, proxying /api)
- Variables:
  | Variable | Value |
  |---|---|
  | `VITE_API_URL` | the public API URL from service 2 |
- Settings → Networking → **Generate Domain**
- ⚠️ `VITE_API_URL` is baked at BUILD time — after changing it, redeploy the
  web service.

## 3. Desktop app

The Electron app connects to the cloud via **Settings → Debug tools → API URL**
(or the `Brandinbold_CLOUD_API_URL` env var). Set it to the Railway API URL
from step 2, restart the app, sign in with the account created on
`cloud-web` — profiles, groups, proxies and session archives sync automatically.

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
