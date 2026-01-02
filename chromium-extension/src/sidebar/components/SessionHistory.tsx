import React, { useEffect, useState } from "react";
import { Modal, List, Button, Empty, Typography } from "antd";
import { DeleteOutlined, MessageOutlined } from "@ant-design/icons";
import { dbService } from "../../db/db-service";

const { Text } = Typography;

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionHistoryProps {
  visible: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  currentSessionId: string;
}

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  visible,
  onClose,
  onSelectSession,
  currentSessionId,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadSessions();
    }
  }, [visible]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const sessionList = await dbService.listSessions();
      setSessions(sessionList);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await dbService.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <Modal
      title="Session History"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
    >
      <List
        loading={loading}
        dataSource={sessions}
        locale={{
          emptyText: (
            <Empty
              description="No sessions yet"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        renderItem={(session) => (
          <List.Item
            key={session.id}
            className={`cursor-pointer hover:bg-gray-50 transition-colors !pl-2 ${
              session.id === currentSessionId ? "bg-blue-50" : ""
            }`}
            onClick={() => handleSelectSession(session.id)}
            actions={[
              <Button
                key="delete"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => handleDeleteSession(session.id, e)}
              />,
            ]}
          >
            <List.Item.Meta
              avatar={<MessageOutlined className="text-gray-400" />}
              title={
                <Text
                  strong={session.id === currentSessionId}
                  className="text-sm"
                >
                  {session.title}
                </Text>
              }
              description={
                <Text type="secondary" className="text-xs">
                  {formatDate(session.updatedAt)}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  );
};
