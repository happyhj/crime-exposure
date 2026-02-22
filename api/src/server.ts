import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { createCrimesRouter } from './routes/crimes.js';

const { Pool } = pg;

export interface AppConfig {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export function createApp(config: AppConfig) {
  const pool = new Pool(config.db);
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  // Routes
  app.use('/api/crimes', createCrimesRouter(pool));

  return { app, pool };
}

export function getAppConfig(): AppConfig {
  return {
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'crime_exposure',
      user: process.env.DB_USER ?? 'crime',
      password: process.env.DB_PASSWORD ?? 'crime_dev',
    },
  };
}
