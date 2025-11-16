import React from "react";
import { UserMessage } from "../types/messages";

interface UserMessageBubbleProps {
  message: UserMessage;
}

export const UserMessageBubble: React.FC<UserMessageBubbleProps> = ({
  message,
}) => {
  return (
    <div className="message-group user">
      <div className="avatar user-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div className="message-content">
        <div className="user-text">{message.text}</div>
      </div>
    </div>
  );
};
