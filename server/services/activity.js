/** Audit trail: who changed what, so pricing or fleet surprises can be traced. */

export function logActivity(db, actor, { action, entity = '', entityId = '', summary = '' }) {
  return db
    .run('INSERT INTO activity (userId, userName, action, entity, entityId, summary) VALUES (?, ?, ?, ?, ?, ?)', [
      actor?.id ?? null,
      actor?.username ?? 'system',
      action,
      entity,
      String(entityId ?? ''),
      summary,
    ])
    .catch((err) => console.warn('activity log failed:', err.message));
}

export function listActivity(db, { limit = 200 } = {}) {
  return db.all('SELECT * FROM activity ORDER BY id DESC LIMIT ?', [Math.min(limit, 500)]);
}
