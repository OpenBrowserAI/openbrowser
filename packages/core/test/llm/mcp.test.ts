import Log from "../../src/common/log";
import { sleep } from "../../src/common/utils";
import { SimpleSseMcpClient } from "../../src/mcp";

async function testSseMCP() {
  Log.setLevel(0);
  let sseUrl = "http://localhost:8083/sse";
  let mcpClient = new SimpleSseMcpClient(sseUrl);
  await mcpClient.connect();
  let tools = await mcpClient.listTools({
    taskId: "1",
    nodeId: "1",
    environment: "browser",
    agent_name: "Browser",
    prompt: "Search for Hong Kong AI development jobs",
    browser_url: "https://www.linkedin.com/jobs/",
    params: {},
  });
  console.log("listTools: \n", JSON.stringify(tools, null, 2));
  let toolResult = await mcpClient.callTool({
    name: tools[0].name,
    arguments: {},
  });
  console.log(
    `callTool - ${tools[0].name}: \n`,
    JSON.stringify(toolResult, null, 2)
  );
  await sleep(2000);
  mcpClient.close();
  await sleep(5000);
}

test.only("mcp", async () => {
  await testSseMCP();
});
