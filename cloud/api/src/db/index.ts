import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://brandinbold:brandinbold@localhost:5432/brandinbold',
  max: 10
})

export const db = drizzle(pool, { schema })
