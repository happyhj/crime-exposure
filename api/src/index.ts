import { createApp, getAppConfig } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const config = getAppConfig();
const { app, pool } = createApp(config);

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await pool.end();
  process.exit(0);
});
