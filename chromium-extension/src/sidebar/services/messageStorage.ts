import { Message } from "../types/messages";
import { STORAGE_CONFIG } from "../config/storage.config";

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

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORAGE_CONFIG.STORE_NAME)) {
          const objectStore = db.createObjectStore(STORAGE_CONFIG.STORE_NAME, {
            keyPath: "id",
            autoIncrement: false,
          });

          // Create index on timestamp for sorting and efficient deletion
          objectStore.createIndex("timestamp", "timestamp", { unique: false });
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
        [STORAGE_CONFIG.STORE_NAME],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.STORE_NAME);
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
   */
  async addMessage(message: Message): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.STORE_NAME],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.STORE_NAME);

      // Add timestamp to message for sorting
      const messageWithTimestamp = {
        ...message,
        timestamp: Date.now(),
      };

      // Add the new message
      const addRequest = objectStore.add(messageWithTimestamp);

      addRequest.onsuccess = () => {
        // Increment in-memory counter
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
   * Load all messages from database
   * Returns messages sorted by timestamp (oldest first)
   */
  async loadMessages(): Promise<Message[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(
        [STORAGE_CONFIG.STORE_NAME],
        "readonly"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const messages = request.result || [];

        // IMPORTANT: Sort by timestamp to ensure correct order
        // IndexedDB getAll() does NOT guarantee order
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Remove timestamp property (internal use only)
        const cleanMessages = messages.map(({ timestamp, ...msg }) => msg);

        resolve(cleanMessages as Message[]);
      };

      request.onerror = () => {
        console.error("Failed to load messages:", request.error);
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
        [STORAGE_CONFIG.STORE_NAME],
        "readwrite"
      );
      const objectStore = transaction.objectStore(STORAGE_CONFIG.STORE_NAME);
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
}

// Export singleton instance
export const messageStorage = new MessageStorageService();
