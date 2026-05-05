import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

interface ComposerContextValue {
  canSend: boolean;
  height: number;
  isPending: boolean;
  isStreaming: boolean;
  onChangeText: (text: string) => void;
  onSend: () => void;
  setHeight: (height: number) => void;
  value: string;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

interface ComposerProviderProps {
  children: ReactNode;
  isPending: boolean;
  isStreaming: boolean;
  onChangeText: (text: string) => void;
  onSend: () => void;
  value: string;
}

export function ComposerProvider({
  children,
  isPending,
  isStreaming,
  onChangeText,
  onSend,
  value,
}: ComposerProviderProps) {
  const [height, setHeight] = useState(0);
  const canSend = !!value.trim() && !isPending && !isStreaming;

  return (
    <ComposerContext.Provider
      value={{
        canSend,
        height,
        isPending,
        isStreaming,
        onChangeText,
        onSend,
        setHeight,
        value,
      }}
    >
      {children}
    </ComposerContext.Provider>
  );
}

export function useComposer(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (!ctx) {
    throw new Error("useComposer must be used within a ComposerProvider");
  }
  return ctx;
}
