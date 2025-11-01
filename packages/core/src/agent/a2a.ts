import { Agent } from "./base";

export interface IA2aClient {
  listAgents(taskPrompt: string): Promise<Agent[]>;
}

export class A2aClient {
  // TODO A2A: https://www.a2aprotocol.net/zh
}