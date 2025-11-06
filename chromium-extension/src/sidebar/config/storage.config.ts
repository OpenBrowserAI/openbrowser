export const STORAGE_CONFIG = {
  // IndexedDB Database Configuration
  DB_NAME: "OpenBrowserMessages",
  STORE_NAME: "messages",
  DB_VERSION: 1,

  // Message Limit Configuration
  MAX_MESSAGES: 500, // Keep only last 500 messages
} as const;
