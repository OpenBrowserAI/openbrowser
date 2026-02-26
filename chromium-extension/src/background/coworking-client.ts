import { getBridgeConfig, getBridgeToken, resolveSocaBridgeConnection } from "./bridge-client";

let coworkingWs: WebSocket | null = null;
let heartbeatTimer: any = null;

export async function connectCoworkingSocket() {
  if (coworkingWs) return;

  try {
    const { bridgeBaseURL, token } = await resolveSocaBridgeConnection();
    const base = new URL(bridgeBaseURL.replace(/\/+$/, "") + "/");
    
    // Construct ws/wss URL
    const wsProtocol = base.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = new URL("/soca/bridge/coworking", `${wsProtocol}//${base.host}`);

    coworkingWs = new WebSocket(wsUrl.toString());

    coworkingWs.onopen = () => {
      console.log("SOCA Coworking Bridge connected.");
      
      // Keep MV3 worker alive and connection active
      heartbeatTimer = setInterval(() => {
        if (coworkingWs?.readyState === WebSocket.OPEN) {
          coworkingWs.send(JSON.stringify({ type: "ping" }));
        }
      }, 20000); // 20 seconds
    };

    coworkingWs.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") return;
        
        // Handle incoming task
        if (data.action) {
          console.log("Received coworking task:", data);
          
          // Here we would route the task to content.js via chrome.scripting or chrome.tabs.sendMessage
          // Currently, we just find the active tab and send a message.
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.id) {
            // For now, let's just log it or execute a simple visual cursor injection.
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: (task) => {
                console.log("SOCA Bridge Coworking Task Executing:", task);
                // Simple placeholder visual feedback
                let cursor = document.getElementById('soca-cowork-cursor');
                if (!cursor) {
                  cursor = document.createElement('div');
                  cursor.id = 'soca-cowork-cursor';
                  cursor.style.position = 'fixed';
                  cursor.style.zIndex = '999999';
                  cursor.style.width = '20px';
                  cursor.style.height = '20px';
                  cursor.style.borderRadius = '50%';
                  cursor.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
                  cursor.style.pointerEvents = 'none';
                  cursor.style.transition = 'all 0.3s ease';
                  document.body.appendChild(cursor);
                }
                
                // If it's a click with a target
                if (task.target) {
                  const el = document.querySelector(task.target) as HTMLElement;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    cursor.style.left = (rect.left + rect.width / 2) + 'px';
                    cursor.style.top = (rect.top + rect.height / 2) + 'px';
                    
                    if (task.action === 'click') {
                      setTimeout(() => {
                        el.click();
                        cursor!.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
                        setTimeout(() => cursor!.style.backgroundColor = 'rgba(255, 0, 0, 0.5)', 500);
                      }, 500);
                    } else if (task.action === 'type' && el instanceof HTMLInputElement) {
                      setTimeout(() => {
                        el.value = task.value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                      }, 500);
                    }
                  }
                }
              },
              args: [data]
            });
          }
        }
      } catch (err) {
        console.error("Coworking message error:", err);
      }
    };

    coworkingWs.onclose = () => {
      console.log("SOCA Coworking Bridge disconnected. Reconnecting in 5s...");
      clearInterval(heartbeatTimer);
      coworkingWs = null;
      setTimeout(connectCoworkingSocket, 5000);
    };

    coworkingWs.onerror = (err) => {
      console.error("SOCA Coworking Bridge WS error:", err);
      coworkingWs?.close();
    };

  } catch (err) {
    console.error("Failed to connect coworking socket:", err);
    setTimeout(connectCoworkingSocket, 10000);
  }
}
