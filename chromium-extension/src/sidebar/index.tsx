import { createRoot } from "react-dom/client";
import React from "react";
import { AppRun } from "./components/AppRun";

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppRun />
  </React.StrictMode>
);
