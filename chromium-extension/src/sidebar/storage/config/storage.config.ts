export const STORAGE_CONFIG = {
  // IndexedDB Database Configuration
  DB_NAME: "OpenBrowserMessages",
  MESSAGES_STORE: "messages",
  SESSIONS_STORE: "sessions",
  DB_VERSION: 3, // Incremented to add sessions store

  // Message Limit Configuration
  MAX_MESSAGES: 500, // Keep only last 500 messages
} as const;
