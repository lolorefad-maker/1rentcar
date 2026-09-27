import sqlite3 from 'sqlite3';

/**
 * Thin promise wrapper around a single sqlite3 connection.
 * `run` resolves with { id, changes } (lastID / changes of the statement).
 */
export function openDatabase(file) {
  const raw = new sqlite3.Database(file);

  const db = {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.run(sql, params, function onDone(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        raw.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        raw.exec(sql, (err) => (err ? reject(err) : resolve()));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        raw.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };

  return db;
}
