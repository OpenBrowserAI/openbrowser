import {
  parseWorkflow,
  buildAgentRootXml,
  buildSimpleAgentWorkflow,
} from "../../src/common/xml";

test.only("workflowXml", () => {
  const xml = `<root>
  <name>AI Daily Morning Report</name>
  <thought>OK, the user needs to collect the latest AI news every morning, summarize it, and send it to a WeChat group named "AI Daily Morning Report" This requires automation, including the steps of data collection, processing, and distribution.</thought>
  <agents>
    <agent name="Browser">
      <task>Search for the latest updates on AI</task>
      <nodes>
        <node>Open Google</node>
        <node>Search for the latest updates on AI</node>
        <forEach items="list">
          <node>View Details</node>
        </forEach>
        <node output="summaryInfo">Summarize search information</node>
      </nodes>
    </agent>
    <agent name="Computer">
      <task>Send a message to the WeChat group chat "AI Daily Morning Report"</task>
      <nodes>
        <node>Open WeChat</node>
        <node>Search for the "AI Daily Morning Report" chat group</node>
        <node input="summaryInfo">Send summary message`;
  let workflow = parseWorkflow("test1", xml, false);
  console.log(JSON.stringify(workflow, null, 2));
});

test.only("agentXml", () => {
  const xml = `<agent name="Browser">
  <task>The current Agent needs to complete the task</task>
  <nodes>
    <node>Complete the corresponding step nodes of the task</node>
    <node output="variable name">...</node>
    <node input="variable name">...</node>
    <forEach items="list">
      <node>forEach step node</node>
    </forEach>
    <watch event="dom" loop="true">
      <description>Monitor task description</description>
      <trigger>
        <node>Trigger step node</node>
        <node>...</node>
      </trigger>
    </watch>
  </nodes>
</agent>`;
  let agentXml = buildAgentRootXml(xml, "user main task", (nodeId, node) => {
    node.setAttribute("status", "todo");
  });
  console.log(agentXml);
});

test.only("buildWorkflow", () => {
  const workflow = buildSimpleAgentWorkflow({
    taskId: "test",
    name: "Test workflow",
    agentName: "Browser",
    task: "Open google",
  });
  console.log("workflow: \n", JSON.stringify(workflow, null, 2));
});
