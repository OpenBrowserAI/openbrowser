import { Message } from "../types/messages";
import { STORAGE_CONFIG } from "../config/storage.config";
import { sessionStorage } from "./sessionStorage";

class MessageStorageService {
  private db: IDBDatabase | null = null;
  private messageCount: number = 0; // Keep count in memory to avoid repeated queries

  /**
   * Initialize IndexedDB database and load message count
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        STORAGE_CONFIG.DB_NAME,
        STORAGE_CONFIG.DB_VERSION
      );

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = async () => {
        this.db = request.result;

        // Load message count once at initialization
        this.messageCount = await this.getMessageCount();

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;

        let messagesStore: IDBObjectStore;

        // Create messages object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORAGE_CONFIG.MESSAGES_STORE)) {
          messagesStore = db.createObjectStore(STORAGE_CONFIG.MESSAGES_STORE, {
            keyPath: "id",
            autoIncrement: false,
          });
        }
        if (db.objectStoreNames.contains(STORAGE_CONFIG.MESSAGES_STORE) && !messagesStore) {
          // Get existing object store from transaction
          messagesStore = transaction!.objectStore(STORAGE_CONFIG.MESSAGES_STORE);
        }

        // Create timestamp index if it doesn't exist
        if (!messagesStore.indexNames.contains("timestamp")) {
          messagesStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // Create sessionId index if it doesn't exist
        if (!messagesStore.indexNames.contains("sessionId")) {
          messagesStore.createIndex("sessionId", "sessionId", { unique: false });
        }

        // Create sessions object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORAGE_CONFIG.SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(STORAGE_CONFIG.SESSIONS_STORE, {
            keyPath: "id",
            autoIncrement: false,
          });
          // Create index for updatedAt to easily find latest session
          sessionsStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
    });
  }

  /**
   * Get current message count from database
   * Only called once during init
   */
  private async getMessageCount(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(0);
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.MESSAGES_STORE],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.MESSAGES_STORE);
      const request = objectStore.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("Failed to get message count:", request.error);
        resolve(0); // Default to 0 on error
      };
    });
  }

  /**
   * Add a single message to the database
   * Automatically removes oldest message if limit exceeded
   * Uses in-memory counter for efficiency
   * Also upserts the session (creates if doesn't exist, updates if exists)
   */
  async addMessage(message: Message): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    // Upsert session in DB (create if doesn't exist, update updatedAt if exists)
    if (message.sessionId) {
      await sessionStorage.upsertSession(message.sessionId);
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.MESSAGES_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.MESSAGES_STORE);

      // Use put() to allow updating existing messages (handles duplicate saves gracefully)
      // This prevents errors when nested setState causes duplicate save attempts
      const addRequest = objectStore.put(message);

      addRequest.onsuccess = () => {
        // Increment in-memory counter (only if it's a new message)
        this.messageCount++;

        // Check if we exceeded the limit
        if (this.messageCount > STORAGE_CONFIG.MAX_MESSAGES) {
          // Delete the oldest message
          const index = objectStore.index("timestamp");
          const cursorRequest = index.openCursor(); // Opens cursor at oldest (first)

          cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              cursor.delete(); // Delete oldest message
              this.messageCount--; // Decrement counter
            }
          };
        }
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error("Failed to add message:", transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Load messages by sessionId from database
   * Returns Message[] sorted by timestamp (oldest first)
   */
  async loadMessagesBySession(sessionId: string): Promise<Message[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.MESSAGES_STORE],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.MESSAGES_STORE);
      const index = objectStore.index("sessionId");
      const request = index.getAll(sessionId);

      request.onsuccess = () => {
        const messages = request.result || [];
        // Sort by timestamp to ensure chronological order (oldest first)
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        resolve(messages as Message[]);
      };

      request.onerror = () => {
        console.error("Failed to load messages by session:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all messages from database
   * Useful for "Clear History" feature
   */
  async clearMessages(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.MESSAGES_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.MESSAGES_STORE);
      const request = objectStore.clear();

      request.onsuccess = () => {
        // Reset in-memory counter
        this.messageCount = 0;
        resolve();
      };

      request.onerror = () => {
        console.error("Failed to clear messages:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear messages for a specific session
   */
  async clearMessagesBySession(sessionId: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.MESSAGES_STORE],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.MESSAGES_STORE);
      const index = objectStore.index("sessionId");
      const request = index.openCursor(IDBKeyRange.only(sessionId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          this.messageCount--;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error("Failed to clear messages by session:", transaction.error);
        reject(transaction.error);
      };
    });
  }

}

// Export singleton instance
export const messageStorage = new MessageStorageService();
