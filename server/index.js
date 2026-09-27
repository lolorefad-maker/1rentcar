import { bootstrap } from './bootstrap.js';
import { config } from './config.js';

const { app, db, seeded } = await bootstrap(config);
if (seeded.cars > 0) console.log(`Seeded ${seeded.cars} vehicles from data/fleet.json`);

const server = app.listen(config.port, () => {
  console.log(`Server ready on http://localhost:${config.port}  (admin: /admin.html)`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  server.close();
  await db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
