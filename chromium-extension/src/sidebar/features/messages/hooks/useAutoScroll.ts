import { useRef, useEffect, DependencyList } from "react";

export const useAutoScroll = (dependencies: DependencyList) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, dependencies);

  return messagesEndRef;
};
