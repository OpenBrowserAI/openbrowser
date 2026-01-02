import { OpenBrowserMessage } from "@openbrowser-ai/core/types";
import * as db from "./db";

/**
 * High-level DB service with business logic
 */
export class DBService {
  /**
   * Save messages to a session (after agent completes)
   * - Automatically creates session if it doesn't exist (from first user message)
   * - Updates session timestamp
   */
  async saveMessages(
    sessionId: string,
    messages: OpenBrowserMessage[]
  ): Promise<void> {
    // Check if session exists
    const session = await db.getSession(sessionId);

    if (!session) {
      // Auto-create session from first user message
      const firstUserMessage = messages.find((m) => m.role === "user");
      if (firstUserMessage) {
        const textPart = firstUserMessage.content.find(
          (p: any) => p.type === "text"
        );
        const title = textPart
          ? (textPart as any).text.slice(0, 50).trim()
          : "New Chat";
        await db.createSession(sessionId, title);
      }
    } else {
      // Update session timestamp
      await db.updateSessionTimestamp(sessionId);
    }

    // Save messages
    await db.saveMessages(sessionId, messages);
  }

  /**
   * Load all messages for a session (sorted by timestamp)
   */
  async loadMessages(sessionId: string): Promise<OpenBrowserMessage[]> {
    const messages = await db.loadMessages(sessionId);
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string, title: string): Promise<void> {
    await db.createSession(sessionId, title);
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string) {
    return await db.getSession(sessionId);
  }

  /**
   * List all sessions (most recent first)
   */
  async listSessions() {
    const sessions = await db.listSessions();
    return sessions.reverse();
  }

  /**
   * Delete a session and all its messages (cascade)
   */
  async deleteSession(sessionId: string): Promise<void> {
    // cascade delete messages before deleting session
    await db.clearMessagesForSession(sessionId);
    await db.deleteSession(sessionId);
  }

  /**
   * Clear all messages in a session (keep session)
   */
  async clearSessionMessages(sessionId: string): Promise<void> {
    await db.clearMessagesForSession(sessionId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    try {
      await db.updateSessionTitle(sessionId, title);
    } catch (error) {
      console.error("Failed to update session title:", error);
      throw error;
    }
  }
}

// Singleton instance
export const dbService = new DBService();
