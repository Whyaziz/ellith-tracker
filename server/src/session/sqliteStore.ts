import session from 'express-session';
import type Database from 'better-sqlite3';

export class BetterSqlite3SessionStore extends session.Store {
  private db: Database.Database;
  private getStmt: Database.Statement;
  private setStmt: Database.Statement;
  private destroyStmt: Database.Statement;
  private touchStmt: Database.Statement;

  constructor(db: Database.Database) {
    super();
    this.db = db;

    // Create sessions table if not existing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);

    this.getStmt = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?');
    this.setStmt = this.db.prepare(`
      INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
    `);
    this.destroyStmt = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?');

    // Periodically clean up expired sessions (every 15 minutes)
    const cleanupInterval = setInterval(() => {
      try {
        this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
      } catch {
        // Ignore background pruning errors
      }
    }, 15 * 60 * 1000);

    cleanupInterval.unref();
  }

  get = (sid: string, callback: (err?: any, session?: session.SessionData | null) => void) => {
    try {
      const row = this.getStmt.get(sid) as { sess: string; expired: number } | undefined;
      if (!row) return callback(null, null);
      if (Date.now() > row.expired) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  };

  set = (sid: string, sess: session.SessionData, callback?: (err?: any) => void) => {
    try {
      const maxAge = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000; // 7 days default
      const expired = Date.now() + maxAge;
      this.setStmt.run(sid, JSON.stringify(sess), expired);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  };

  destroy = (sid: string, callback?: (err?: any) => void) => {
    try {
      this.destroyStmt.run(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  };

  touch = (sid: string, sess: session.SessionData, callback?: (err?: any) => void) => {
    try {
      const maxAge = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      this.touchStmt.run(expired, sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  };
}
