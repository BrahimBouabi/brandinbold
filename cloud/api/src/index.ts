import Fastify from 'fastify'
import cors from '@fastify/cors'

/**
 * Brandinbold Cloud API — TASK 10 Étape 2.1 scaffold.
 * Real endpoints (auth, profiles/proxies/groups sync, session archives)
 * land in Étape 2.2. Everything routes under /api for Railway.
 */
const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

app.get('/api/health', async () => ({
  alive: true,
  app: 'Brandinbold Cloud API',
  version: '0.1.0'
}))

const port = Number(process.env.PORT ?? 8787)
await app.listen({ port, host: '0.0.0.0' })
console.log(`Brandinbold Cloud API listening on :${port}`)
