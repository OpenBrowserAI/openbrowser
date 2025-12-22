import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Message } from "../types/messages";
import { STORAGE_CONFIG } from "../../../storage/config/storage.config";
import { sessionStorage } from "../../sessions/services/sessionStorage";

interface OpenBrowserDB extends DBSchema {
  messages: {
    key: string;
    value: Message;
    indexes: { timestamp: number; sessionId: string };
  };
  sessions: {
    key: string;
    value: {
      id: string;
      title: string;
      updatedAt: number;
    };
    indexes: { updatedAt: number };
  };
}

class MessageStorageService {
  private db: IDBPDatabase<OpenBrowserDB> | null = null;

  /**
   * Initialize IndexedDB database
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
   * Add a single message to the database
   * Updates session timestamp on every message
   */
  async addMessage(message: Message): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    // Update session timestamp (lightweight operation)
    if (message.sessionId) {
      await sessionStorage.updateSessionTimestamp(message.sessionId);
    }

    // Use put() to allow updating existing messages (handles duplicate saves gracefully)
    await this.db!.put(STORAGE_CONFIG.MESSAGES_STORE, message);
  }

  /**
   * Load messages by sessionId from database
   * Returns Message[] sorted by timestamp (oldest first)
   */
  async loadMessagesBySession(sessionId: string): Promise<Message[]> {
    if (!this.db) {
      await this.init();
    }

    const messages = await this.db!.getAllFromIndex(
      STORAGE_CONFIG.MESSAGES_STORE,
      "sessionId",
      sessionId
    );

    // Sort by timestamp to ensure chronological order (oldest first)
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return messages;
  }

  /**
   * Load messages by sessionId with pagination
   * Returns the most recent messages (newest first for pagination)
   * @param sessionId - The session ID to filter messages
   * @param limit - Number of messages to load (default 10)
   * @param beforeTimestamp - Load messages before this timestamp (for pagination)
   * @returns Object with messages array and hasMore flag
   */
  async loadMessagesBySessionPaginated(
    sessionId: string,
    limit: number = 10,
    beforeTimestamp?: number
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    if (!this.db) {
      await this.init();
    }

    const tx = this.db!.transaction(STORAGE_CONFIG.MESSAGES_STORE, "readonly");
    const index = tx.store.index("sessionId");

    const messages: Message[] = [];
    let cursor = await index.openCursor(IDBKeyRange.only(sessionId));

    // Collect all messages for this session
    const allMessages: Message[] = [];
    while (cursor) {
      allMessages.push(cursor.value);
      cursor = await cursor.continue();
    }

    // Sort by timestamp (newest first for easier pagination)
    allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Filter messages before the given timestamp if provided
    const filteredMessages = beforeTimestamp
      ? allMessages.filter((msg) => (msg.timestamp || 0) < beforeTimestamp)
      : allMessages;

    // Get the requested page
    const pageMessages = filteredMessages.slice(0, limit);
    const hasMore = filteredMessages.length > limit;

    // Reverse to return oldest first (chronological order for display)
    pageMessages.reverse();

    return { messages: pageMessages, hasMore };
  }

  /**
   * Get total message count for a session
   */
  async getMessageCountBySession(sessionId: string): Promise<number> {
    if (!this.db) {
      await this.init();
    }

    const tx = this.db!.transaction(STORAGE_CONFIG.MESSAGES_STORE, "readonly");
    const index = tx.store.index("sessionId");

    let count = 0;
    let cursor = await index.openCursor(IDBKeyRange.only(sessionId));

    while (cursor) {
      count++;
      cursor = await cursor.continue();
    }

    return count;
  }

  /**
   * Clear all messages from database
   * Useful for "Clear History" feature
   */
  async clearMessages(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    await this.db!.clear(STORAGE_CONFIG.MESSAGES_STORE);
  }

  /**
   * Clear messages for a specific session
   */
  async clearMessagesBySession(sessionId: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    const tx = this.db!.transaction(STORAGE_CONFIG.MESSAGES_STORE, "readwrite");
    const index = tx.store.index("sessionId");
    let cursor = await index.openCursor(IDBKeyRange.only(sessionId));

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  }
}

// Export singleton instance
export const messageStorage = new MessageStorageService();
