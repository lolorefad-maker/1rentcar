import { createApp } from './app.js';
import { openDatabase } from './db/index.js';
import { migrate } from './db/schema.js';
import { seed } from './db/seed.js';
import { createMediaLibrary } from './lib/media.js';
import { ensureAdminPassword } from './services/auth.js';

/** Opens + migrates + seeds the database and assembles the app. Shared by the server and the tests. */
export async function bootstrap(config) {
  const db = openDatabase(config.dbPath);
  await migrate(db);
  const seeded = await seed(db, {
    fleetFile: config.fleetSeedFile,
    manifestFile: config.mediaManifestFile,
    contentFile: config.siteContentFile,
  });
  await ensureAdminPassword(db);

  const media = createMediaLibrary(config.publicDir);
  await media.refresh();

  return { app: createApp({ db, config, media }), db, media, seeded };
}
