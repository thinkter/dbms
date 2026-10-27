export type ToolActivity = {
  id?: string;
  name: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string; streaming?: boolean }
  | { kind: "tool"; tool: ToolActivity };

export type AgentPart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

// Keep the wire order: commentary, tool, commentary, tool, conclusion.
export function normalizeParts(parts: AgentPart[]): MessagePart[] {
  return parts.flatMap((part): MessagePart[] => {
    if (part.type === "text" && part.text) return [{ kind: "text", text: part.text }];
    if (part.type === "reasoning" && part.text) return [{ kind: "reasoning", text: part.text, streaming: part.state === "streaming" }];
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      return [{ kind: "tool", tool: {
        id: part.toolCallId,
        name: part.type === "dynamic-tool" ? part.toolName ?? "tool" : part.type.slice(5),
        state: part.state ?? "input-streaming",
        input: part.input,
        output: part.output,
        errorText: part.errorText,
      } }];
    }
    return [];
  });
}

export function toolStatus(state: string) {
  if (["output-available", "done"].includes(state)) return "complete";
  if (["output-error", "error"].includes(state)) return "failed";
  if (state === "output-denied") return "denied";
  if (state === "approval-requested") return "approval";
  return "running";
}

export function groupParts(parts: MessagePart[]) {
  const groups: Array<{ kind: "text"; text: string; key: number } | { kind: "activity"; parts: Exclude<MessagePart, { kind: "text" }>[]; key: number }> = [];
  parts.forEach((part, index) => {
    const previous = groups.at(-1);
    if (part.kind === "text") groups.push({ ...part, key: index });
    else if (previous?.kind === "activity") previous.parts.push(part);
    else groups.push({ kind: "activity", parts: [part], key: index });
  });
  return groups;
}
