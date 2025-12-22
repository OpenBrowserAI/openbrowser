import { openDB, DBSchema, IDBPDatabase } from "idb";
import { STORAGE_CONFIG } from "../../../storage/config/storage.config";
import { messageStorage } from "../../messages/services/messageStorage";

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface OpenBrowserDB extends DBSchema {
  messages: {
    key: string;
    value: {
      id: string;
      type: string;
      timestamp: number;
      sessionId: string;
      [key: string]: string | number | boolean | object | undefined;
    };
    indexes: { timestamp: number; sessionId: string };
  };
  sessions: {
    key: string;
    value: Session;
    indexes: { updatedAt: number };
  };
}

class SessionStorageService {
  private db: IDBPDatabase<OpenBrowserDB> | null = null;

  /**
   * Initialize IndexedDB connection (reuse same DB as messages)
   */
  async init(): Promise<void> {
    this.db = await openDB<OpenBrowserDB>(
      STORAGE_CONFIG.DB_NAME,
      STORAGE_CONFIG.DB_VERSION,
      {
        upgrade(db) {
          // Create messages object store if it doesn't exist
          if (!db.objectStoreNames.contains(STORAGE_CONFIG.MESSAGES_STORE)) {
            const messagesStore = db.createObjectStore(STORAGE_CONFIG.MESSAGES_STORE, {
              keyPath: "id",
            });
            messagesStore.createIndex("timestamp", "timestamp", { unique: false });
            messagesStore.createIndex("sessionId", "sessionId", { unique: false });
          }

          // Create sessions object store if it doesn't exist
          if (!db.objectStoreNames.contains(STORAGE_CONFIG.SESSIONS_STORE)) {
            const sessionsStore = db.createObjectStore(STORAGE_CONFIG.SESSIONS_STORE, {
              keyPath: "id",
            });
            sessionsStore.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        },
      }
    );
  }

  /**
   * Create a new session
   */
  async createSession(title?: string): Promise<Session> {
    if (!this.db) {
      await this.init();
    }

    const sessionId = `session-${Date.now()}`;
    const session: Session = {
      id: sessionId,
      title: title || sessionId,
      updatedAt: Date.now(),
    };

    await this.db!.add(STORAGE_CONFIG.SESSIONS_STORE, session);
    return session;
  }

  /**
   * Update session's updatedAt timestamp
   * Creates session if it doesn't exist (for backward compatibility)
   */
  async updateSession(sessionId: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    const session = await this.db!.get(STORAGE_CONFIG.SESSIONS_STORE, sessionId);
    if (session) {
      session.updatedAt = Date.now();
      await this.db!.put(STORAGE_CONFIG.SESSIONS_STORE, session);
    } else {
      // Create session if it doesn't exist
      const newSession: Session = {
        id: sessionId,
        title: sessionId,
        updatedAt: Date.now(),
      };
      await this.db!.add(STORAGE_CONFIG.SESSIONS_STORE, newSession);
    }
  }

  /**
   * Update session's updatedAt timestamp only (lightweight)
   * Assumes session already exists
   */
  async updateSessionTimestamp(sessionId: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    const session = await this.db!.get(STORAGE_CONFIG.SESSIONS_STORE, sessionId);
    if (session) {
      session.updatedAt = Date.now();
      await this.db!.put(STORAGE_CONFIG.SESSIONS_STORE, session);
    }
  }

  /**
   * Upsert session - Update updatedAt if exists, create with title if doesn't exist
   * Note: Title is ONLY set when creating a new session, never updated for existing sessions
   */
  async upsertSession(sessionId: string, title?: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    const existingSession = await this.db!.get(STORAGE_CONFIG.SESSIONS_STORE, sessionId);

    if (existingSession) {
      // Session exists - only update updatedAt, DO NOT update title
      existingSession.updatedAt = Date.now();
      await this.db!.put(STORAGE_CONFIG.SESSIONS_STORE, existingSession);
    } else {
      // Session doesn't exist - create it with the provided title
      const newSession: Session = {
        id: sessionId,
        title: title || sessionId,
        updatedAt: Date.now(),
      };
      await this.db!.add(STORAGE_CONFIG.SESSIONS_STORE, newSession);
    }
  }

  /**
   * Get the latest session (by updatedAt)
   * Returns null if no sessions exist
   */
  async getLatestSession(): Promise<Session | null> {
    if (!this.db) {
      await this.init();
    }

    const tx = this.db!.transaction(STORAGE_CONFIG.SESSIONS_STORE, "readonly");
    const index = tx.store.index("updatedAt");

    // Open cursor in reverse order (newest first)
    const cursor = await index.openCursor(null, "prev");

    if (cursor) {
      return cursor.value;
    }

    return null;
  }

  /**
   * Get all sessions sorted by updatedAt (newest first)
   */
  async getAllSessions(): Promise<Session[]> {
    if (!this.db) {
      await this.init();
    }

    const sessions = await this.db!.getAll(STORAGE_CONFIG.SESSIONS_STORE);
    // Sort by updatedAt (newest first)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  }

  /**
   * Delete a session and all its messages
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Clear all messages for this session
    await messageStorage.clearMessagesBySession(sessionId);

    // Delete the session from DB
    if (!this.db) {
      await this.init();
    }

    await this.db!.delete(STORAGE_CONFIG.SESSIONS_STORE, sessionId);
  }
}

// Export singleton instance
export const sessionStorage = new SessionStorageService();
