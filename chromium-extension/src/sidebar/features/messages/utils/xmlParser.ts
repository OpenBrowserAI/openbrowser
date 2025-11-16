import { WorkflowData } from "../types/messages";

export const parseWorkflowXML = (xml: string): WorkflowData | undefined => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const name = doc.querySelector("name")?.textContent || "";
    const thought = doc.querySelector("thought")?.textContent || "";
    const answer = doc.querySelector("answer")?.textContent || "";

    const agents: Array<{ name: string; task: string; nodes: string[] }> = [];
    doc.querySelectorAll("agent").forEach((agentNode) => {
      const agentName = agentNode.getAttribute("name") || "";
      const task = agentNode.querySelector("task")?.textContent || "";
      const nodes: string[] = [];

      agentNode.querySelectorAll("node").forEach((node) => {
        if (node.textContent) nodes.push(node.textContent);
      });

      agents.push({ name: agentName, task, nodes });
    });

    return { name, thought, agents, answer: answer || undefined };
  } catch (e) {
    console.error("Failed to parse XML", e);
    return undefined;
  }
};
