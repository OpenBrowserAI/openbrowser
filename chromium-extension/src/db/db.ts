import { openDB, DBSchema, IDBPDatabase } from "idb";
import { OpenBrowserMessage } from "@openbrowser-ai/core/types";

// Database schema
interface ChatDB extends DBSchema {
  sessions: {
    key: string;
    value: {
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
    };
    indexes: {
      "by-updated": number;
    };
  };
  messages: {
    key: string;
    value: {
      id: string;
      sessionId: string;
      message: OpenBrowserMessage;
    };
    indexes: {
      "by-session": string;
    };
  };
}

const DB_NAME = "openbrowser-chat";
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ChatDB> | null = null;

// Initialize database
export async function initDB(): Promise<IDBPDatabase<ChatDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ChatDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create sessions store
      if (!db.objectStoreNames.contains("sessions")) {
        const sessionStore = db.createObjectStore("sessions", {
          keyPath: "id"
        });
        sessionStore.createIndex("by-updated", "updatedAt");
      }

      // Create messages store
      if (!db.objectStoreNames.contains("messages")) {
        const messageStore = db.createObjectStore("messages", {
          keyPath: "id"
        });
        messageStore.createIndex("by-session", "sessionId");
      }
    }
  });

  return dbInstance;
}

// Session operations
export async function createSession(id: string, title: string): Promise<void> {
  const db = await initDB();
  const now = Date.now();

  await db.add("sessions", {
    id,
    title,
    createdAt: now,
    updatedAt: now
  });
}

export async function getSession(id: string) {
  const db = await initDB();
  return await db.get("sessions", id);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await initDB();
  await db.delete("sessions", id);
}

export async function updateSessionTitle(
  id: string,
  title: string
): Promise<void> {
  const db = await initDB();
  const session = await db.get("sessions", id);
  if (!session) {
    throw new Error(`Session ${id} not found`);
  }
  session.title = title;
  await db.put("sessions", session);
}

export async function updateSessionTimestamp(id: string): Promise<void> {
  const db = await initDB();
  const session = await db.get("sessions", id);
  if (!session) {
    throw new Error(`Session ${id} not found`);
  }
  session.updatedAt = Date.now();
  await db.put("sessions", session);
}

export async function listSessions() {
  const db = await initDB();
  return await db.getAllFromIndex("sessions", "by-updated");
}

// Message operations
export async function saveMessages(
  sessionId: string,
  messages: OpenBrowserMessage[]
): Promise<void> {
  const db = await initDB();
  const tx = db.transaction("messages", "readwrite");

  for (const message of messages) {
    await tx.store.put({
      id: message.id,
      sessionId,
      message
    });
  }

  await tx.done;
}

export async function loadMessages(
  sessionId: string
): Promise<OpenBrowserMessage[]> {
  const db = await initDB();
  const records = await db.getAllFromIndex("messages", "by-session", sessionId);
  return records.map((record) => record.message);
}

export async function clearMessagesForSession(
  sessionId: string
): Promise<void> {
  const db = await initDB();
  const records = await db.getAllFromIndex("messages", "by-session", sessionId);

  const tx = db.transaction("messages", "readwrite");
  for (const record of records) {
    await tx.store.delete(record.id);
  }
  await tx.done;
}
