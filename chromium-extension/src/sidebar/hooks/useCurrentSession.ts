import { useState, useEffect } from "react";
import { sessionStorage, Session } from "../services/sessionStorage";

/**
 * Hook to manage current session in React state (NO chrome.storage)
 * On mount: Load latest session from IndexedDB or create new one
 */
export function useCurrentSession() {
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showSessions, setShowSessions] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        // Get latest session from IndexedDB (by updatedAt)
        const latestSession = await sessionStorage.getLatestSession();

        if (latestSession) {
          setCurrentSessionId(latestSession.id);
          return;
        }
        // No session exists, create new one
        const newSessionId = `session-${Date.now()}`;
        setCurrentSessionId(newSessionId);
      } catch (error) {
        const fallbackId = `session-${Date.now()}`;
        setCurrentSessionId(fallbackId);
      }
    };

    initSession();
  }, []);

  // Start a new session
  const startNewSession = () => {
    const newSessionId = `session-${Date.now()}`;
    setCurrentSessionId(newSessionId);
  };

  // Select an existing session
  const selectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  // Load all sessions from IndexedDB
  const loadAllSessions = async () => {
    const allSessions = await sessionStorage.getAllSessions();
    setSessions(allSessions);
  };

  // Delete a session
  const deleteSession = async (sessionId: string) => {
    // Delete the session and its messages
    await sessionStorage.deleteSession(sessionId);

    // Reload sessions list
    await loadAllSessions();

    // If deleted current session, switch to another or create new
    if (sessionId === currentSessionId) {
      const allSessions = await sessionStorage.getAllSessions();
      if (allSessions.length > 0) {
        // Switch to the first available session
        selectSession(allSessions[0].id);
        return;
      }
      // No sessions left, create a new one
      startNewSession();
    }
  };

  // Handler: New session
  const handleNewSession = (clearMessages: () => void) => {
    startNewSession();
    clearMessages();
    setShowSessions(false);
  };

  // Handler: Toggle sessions list
  const handleToggleSessions = async () => {
    if (!showSessions) {
      await loadAllSessions();
    }
    setShowSessions(!showSessions);
  };

  // Handler: Select session
  const handleSelectSession = (sessionId: string) => {
    selectSession(sessionId);
    setShowSessions(false);
    // Note: Don't clear messages here - useMessageHandler will automatically
    // reload messages when currentSessionId changes
  };

  // Handler: Delete session
  const handleDeleteSession = async (sessionId: string, clearMessages: () => void) => {
    await deleteSession(sessionId);

    if (sessionId === currentSessionId) {
      clearMessages();
      setShowSessions(false);
    }
  };

  return {
    currentSessionId,
    sessions,
    showSessions,
    handleNewSession,
    handleToggleSessions,
    handleSelectSession,
    handleDeleteSession,
  };
}
