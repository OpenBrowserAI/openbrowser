import React from "react";

type SocaKitPanelProps = {
  steps: string[];
};

export const SocaKitPanel: React.FC<SocaKitPanelProps> = ({ steps }) => {
  return (
    <details className="soca-socakit mb-3">
      <summary className="text-xs font-medium text-theme-primary">
        SOCAkit 15 Steps
      </summary>
      <ol className="mt-2 text-xs text-theme-primary">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
};
