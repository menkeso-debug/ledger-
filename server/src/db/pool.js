import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  // Railway internal Postgres (postgres.railway.internal) doesn't need SSL.
  // For external connections set PGSSL=true; certificates are fully verified.
  ssl: process.env.PGSSL === 'true' ? true : undefined,
});

export const q = (text, params) => pool.query(text, params);
