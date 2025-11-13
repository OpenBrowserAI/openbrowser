import { STORAGE_CONFIG } from "../config/storage.config";
import { messageStorage } from "./messageStorage";

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

class SessionStorageService {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB connection (reuse same DB as messages)
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        STORAGE_CONFIG.DB_NAME,
        STORAGE_CONFIG.DB_VERSION
      );

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        console.error("Failed to open database:", request.error);
        reject(request.error);
      };
    });
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

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.SESSIONS_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
      const request = objectStore.add(session);

      transaction.oncomplete = () => {
        resolve(session);
      };

      transaction.onerror = () => {
        console.error("Failed to create session:", transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Update session's updatedAt timestamp
   */
  async updateSession(sessionId: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.SESSIONS_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
      const getRequest = objectStore.get(sessionId);

      getRequest.onsuccess = () => {
        const session = getRequest.result as Session;
        if (session) {
          session.updatedAt = Date.now();
          objectStore.put(session);
        }
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error("Failed to update session:", transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Upsert session - Update updatedAt if exists, create if doesn't exist
   */
  async upsertSession(sessionId: string, title?: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.SESSIONS_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
      const getRequest = objectStore.get(sessionId);

      getRequest.onsuccess = () => {
        const existingSession = getRequest.result as Session;

        if (existingSession) {
          // Session exists - update updatedAt
          existingSession.updatedAt = Date.now();
          objectStore.put(existingSession);
          return;
        }
        // Session doesn't exist - create it
        const newSession: Session = {
          id: sessionId,
          title: title || sessionId,
          updatedAt: Date.now(),
        };
        objectStore.add(newSession);
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error("Failed to upsert session:", transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get the latest session (by updatedAt)
   * Returns null if no sessions exist
   */
  async getLatestSession(): Promise<Session | null> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.SESSIONS_STORE],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
      const index = objectStore.index("updatedAt");

      // Open cursor in reverse order (newest first)
      const request = index.openCursor(null, "prev");

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value as Session);
          return;
        }
        resolve(null);
      };

      request.onerror = () => {
        console.error("Failed to get latest session:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all sessions sorted by updatedAt (newest first)
   */
  async getAllSessions(): Promise<Session[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.SESSIONS_STORE],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const sessions = request.result || [];
        // Sort by updatedAt (newest first)
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(sessions as Session[]);
      };

      request.onerror = () => {
        console.error("Failed to get all sessions:", request.error);
        reject(request.error);
      };
    });
  }


  /**
   * Delete a session and all its messages
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      // Clear all messages for this session
      await messageStorage.clearMessagesBySession(sessionId);

      // Delete the session from DB
      if (!this.db) {
        await this.init();
      }

      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        const transaction = this.db.transaction(
          [STORAGE_CONFIG.SESSIONS_STORE],
          "readwrite"
        );
        const objectStore = transaction.objectStore(STORAGE_CONFIG.SESSIONS_STORE);
        objectStore.delete(sessionId);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("Failed to delete session:", transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[SESSION] Failed to delete session:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const sessionStorage = new SessionStorageService();
