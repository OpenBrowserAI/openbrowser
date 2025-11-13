import React from "react";
import { Session } from "../services/sessionStorage";

interface SessionsListProps {
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onNewSession: () => void;
}

export const SessionsList: React.FC<SessionsListProps> = ({
  sessions,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}) => {
  return (
    <div className="sessions-list">
      <div className="sessions-header">
        <span>Sessions</span>
        <button
          onClick={onNewSession}
          className="new-session-btn"
          title="New session"
        >
          ➕
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className="sessions-empty">No sessions found</div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className="session-card"
          >
            <div className="session-info">
              <div className="session-title">{session.title}</div>
              <div className="session-date">
                {new Date(session.updatedAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={(e) => onDeleteSession(session.id, e)}
              className="session-delete-btn"
              title="Delete session"
            >
              🗑️
            </button>
          </div>
        ))
      )}
    </div>
  );
};
