import {
  Agent,
  Log,
  LLMs,
  StreamCallbackMessage,
  OpenBrowserDialogue
} from "../../src/index";
import dotenv from "dotenv";
import {
  SimpleBrowserAgent,
  SimpleComputerAgent,
  SimpleFileAgent
} from "./agents";
import { ChatStreamCallbackMessage } from "../../src/types";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;

const llms: LLMs = {
  default: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL
    }
  }
};

async function run() {
  Log.setLevel(0);
  const chatCallback = {
    onMessage: async (message: ChatStreamCallbackMessage) => {
      if (message.type == "text" && !message.streamDone) {
        return;
      }
      if (message.type == "tool_streaming") {
        return;
      }
      console.log("chat message: ", JSON.stringify(message, null, 2));
    }
  };
  const taskCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      if (message.type == "workflow" && !message.streamDone) {
        return;
      }
      if (message.type == "text" && !message.streamDone) {
        return;
      }
      if (message.type == "tool_streaming") {
        return;
      }
      console.log("openbrowser message: ", JSON.stringify(message, null, 2));
    }
  };
  const agents: Agent[] = [
    new SimpleBrowserAgent(),
    new SimpleComputerAgent(),
    new SimpleFileAgent()
  ];
  const segmentedExecution: boolean = true;
  const dialogue = new OpenBrowserDialogue({
    llms,
    agents,
    segmentedExecution
  });
  const result1 = await dialogue.chat({
    user: "Hello",
    callback: {
      chatCallback,
      taskCallback
    }
  });
  console.log("=================>\nresult1: ", result1);
  const result2 = await dialogue.chat({
    user: "Search for information about Musk",
    callback: {
      chatCallback,
      taskCallback
    }
  });
  console.log("=================>\nresult2: ", result2);
  if (segmentedExecution) {
    const result3 = await dialogue.chat({
      user: "Modify the plan: search on X and focus on Tesla information",
      callback: {
        chatCallback,
        taskCallback
      }
    });
    console.log("=================>\nresult3: ", result3);
    const result4 = await dialogue.segmentedExecution({
      callback: {
        chatCallback,
        taskCallback
      }
    });
    console.log("=================>\nresult4: ", result4);
  }
}

test.only("dialogue", async () => {
  await run();
});
