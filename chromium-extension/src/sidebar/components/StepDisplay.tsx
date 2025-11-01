import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ParsedStep } from "../utils/textParser";

interface StepDisplayProps {
  step: ParsedStep;
}

export const StepDisplay: React.FC<StepDisplayProps> = ({ step }) => {
  return (
    <div className="step-item">
      <div className="step-header">
        <span className="step-number">STEP {step.stepNumber}</span>
        <span className="step-title">{step.title}</span>
      </div>
      {step.description && (
        <div className="step-description markdown-content">
          <Markdown remarkPlugins={[remarkGfm]}>{step.description}</Markdown>
        </div>
      )}
    </div>
  );
};
