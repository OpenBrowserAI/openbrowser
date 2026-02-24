import React from "react";
import { Alert, Button, Space, Typography } from "antd";

const { Text } = Typography;

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class SidebarErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown) {
    // Keep a breadcrumb in DevTools while avoiding noisy stack dumping in UI.
    console.error("sidebar_render_error", error);
  }

  private resetPanelState = async () => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const keysToRemove = [
          "socaPromptBuddySettings",
          "socaPromptBuddyLibraryV1",
          "socaOpenBrowserToolsConfig"
        ];
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.warn("sidebar_reset_state_failed", error);
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen w-full flex items-center justify-center px-4"
          style={{
            background: "var(--chrome-bg-primary)",
            color: "var(--chrome-text-primary)"
          }}
        >
          <div style={{ width: "100%", maxWidth: 440 }}>
            <Alert
              type="error"
              showIcon
              message="OpenBrowser panel failed to render"
              description={
                <Space direction="vertical" size={8}>
                  <Text>
                    The panel hit a runtime error. You can reload or reset local
                    panel state.
                  </Text>
                  <Text code>{this.state.message || "unknown_error"}</Text>
                </Space>
              }
            />
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" onClick={() => window.location.reload()}>
                Reload panel
              </Button>
              <Button onClick={this.resetPanelState}>Reset panel state</Button>
            </Space>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
