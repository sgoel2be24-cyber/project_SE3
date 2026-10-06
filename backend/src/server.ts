import { createApp } from './app';
import { config } from './config';
import { getPool } from './db/pool';

const db = getPool();
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`[FoodBridge] Backend listening on http://localhost:${config.port}`);
  console.log(`[FoodBridge] Database: ${config.databaseUrl.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`[FoodBridge] Matcher: ${config.matcherUrl} (strategy: ${config.matching.strategy})`);
  if (config.jwtSecret.includes('dev-secret')) {
    console.log('[FoodBridge] WARNING: using the development JWT secret. Set JWT_SECRET in real deployments.');
  }
});
