import type React from "react";
import { createContext, use, useState } from "react";

export interface Model {
  id: string;
  label: string;
  subtitle?: string;
}

interface ModelContextValue {
  extendedThinking: boolean;
  models: readonly Model[];
  selectedModel: string;
  setExtendedThinking: (value: boolean) => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({
  children,
  models,
}: {
  children: React.ReactNode;
  models: readonly Model[];
}) {
  const [extendedThinking, setExtendedThinking] = useState(true);
  const selectedModel = "sonnet-4.6";

  return (
    <ModelContext
      value={{ extendedThinking, models, selectedModel, setExtendedThinking }}
    >
      {children}
    </ModelContext>
  );
}

export function useModel() {
  const context = use(ModelContext);
  if (!context) {
    throw new Error("useModel must be used within a ModelProvider");
  }
  return context;
}
