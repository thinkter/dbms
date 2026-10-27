import { useId, useState } from "react";
import { Activity, Check, ChevronRight, CircleAlert, Database, GitBranch, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { toolStatus, type MessagePart, type ToolActivity } from "./message-parts";

type ActivityPart = Exclude<MessagePart, { kind: "text" }>;
const labels: Record<string, string> = {
  schema_describe: "Schema", sql_query: "SQL", workspace_triage: "Find accounts",
  investigate_account: "Account activity", rules_run: "Fraud signals", ml_score: "Risk score",
  stats_benford: "Amount distribution", stats_bursts: "Bursts", geo_travel_check: "Travel",
  graph_expand: "Payment graph", case_create: "Create case", case_update: "Update case",
  alert_create: "Create alert", action_propose: "Propose action", monitor_schedule: "Schedule review",
};

export function ActivityGroup({ parts, streaming }: { parts: ActivityPart[]; streaming: boolean }) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const id = useId();
  const tools = parts.flatMap((part) => part.kind === "tool" ? [part.tool] : []);
  const failed = tools.some((tool) => toolStatus(tool.state) === "failed");
  const waiting = tools.some((tool) => toolStatus(tool.state) === "approval");
  const active = streaming && (tools.some((tool) => toolStatus(tool.state) === "running") || parts.some((part) => part.kind === "reasoning" && part.streaming));
  const open = expanded ?? (active || failed || waiting);
  const label = waiting ? "Approval needed" : active ? "Investigating" : failed ? "Errors" : "Checks";
  return <section className={`work-group ${active ? "is-active" : ""}`} aria-label="Checks">
    <button className="work-group-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setExpanded(!open)}>
      {active ? <LoaderCircle className="work-spin" size={14} /> : failed ? <CircleAlert className="work-failed" size={14} /> : <Sparkles size={14} />}
      <span>{label}</span><span className="work-count">{tools.length ? `${tools.length}` : "Notes"}</span><ChevronRight className={open ? "work-chevron is-open" : "work-chevron"} size={13} />
    </button>
    {open && <div className="work-group-body" id={id}>{parts.map((part, index) => part.kind === "tool"
      ? <ToolRow key={part.tool.id ?? index} tool={part.tool} streaming={streaming} />
      : <details className="work-notes" key={index}><summary><Sparkles size={13} /><span>Notes</span><ChevronRight size={12} /></summary><div>{part.text}</div></details>)}</div>}
  </section>;
}

function ToolRow({ tool, streaming }: { tool: ToolActivity; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const status = toolStatus(tool.state);
  const statusText = status === "running" ? streaming ? "Running" : "Incomplete" : status === "approval" ? "Approval" : status === "denied" ? "Declined" : status === "failed" ? "Failed" : "Done";
  const Icon = /sql|schema|account/.test(tool.name) ? Database : /graph/.test(tool.name) ? GitBranch : /rules|action|alert/.test(tool.name) ? ShieldCheck : Activity;
  const hasDetails = tool.input !== undefined || tool.output !== undefined || Boolean(tool.errorText);
  const resultRows = isRecord(tool.output) ? tool.output.rows : tool.output;
  const rows = Array.isArray(resultRows) && resultRows.every(isRecord) ? resultRows : null;
  const rowCount = isRecord(tool.output) && typeof tool.output.rowCount === "number" ? tool.output.rowCount : rows?.length;
  const command = isRecord(tool.output) && typeof tool.output.command === "string" ? tool.output.command : "";
  return <div className={`work-entry ${status === "failed" ? "has-error" : ""}`}>
    <button className="work-row" type="button" disabled={!hasDetails} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Icon className="work-tool-icon" size={14} /><span className="work-label">{labels[tool.name] ?? tool.name.replace(/[_-]+/g, " ")}</span>
      <span className={`work-status ${status}`}>{status === "running" && streaming ? <LoaderCircle className="work-spin" size={11} /> : status === "complete" ? <Check size={11} /> : status === "failed" ? <CircleAlert size={11} /> : status === "denied" ? <X size={11} /> : null}{statusText}</span>
      <ChevronRight className={open ? "work-chevron is-open" : "work-chevron"} size={12} />
    </button>
    {!open && <div className="work-preview">{preview(tool)}</div>}
    {open && <div className="work-detail" id={id}>
      {tool.input !== undefined && <div className="work-detail-section"><div className="work-detail-heading"><span>{tool.name === "sql_query" ? "SQL" : "Input"}</span></div><pre>{isRecord(tool.input) && typeof tool.input.sql === "string" ? tool.input.sql : formatValue(tool.input)}</pre></div>}
      {tool.errorText && <div className="work-error" role="alert"><CircleAlert size={14} /><span>{tool.errorText}</span></div>}
      {tool.output !== undefined && <div className="work-detail-section"><div className="work-detail-heading"><span>Result</span>{rowCount !== undefined && <span>{rowCount} {command && command !== "SELECT" ? "affected" : "rows"}{isRecord(tool.output) && tool.output.truncated ? ` · showing ${rows?.length ?? 0}` : ""}</span>}</div>{rows ? <ResultTable rows={rows} /> : <pre>{formatValue(tool.output)}</pre>}</div>}
      {tool.output === undefined && !tool.errorText && <div className="work-output-pending">{status === "approval" ? "Awaiting approval" : status === "denied" ? "Declined" : streaming ? "Running…" : "No result"}</div>}
    </div>}
  </div>;
}

function preview(tool: ToolActivity) {
  if (tool.errorText) return tool.errorText;
  if (isRecord(tool.input)) {
    if (typeof tool.input.sql === "string") return tool.input.sql.replace(/\s+/g, " ").trim();
    return Object.entries(tool.input).slice(0, 3).map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
  }
  return tool.input === undefined ? "" : formatValue(tool.input);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function formatValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
  return text.length > 12000 ? `${text.slice(0, 12000)}\n…truncated` : text;
}
function cell(value: unknown) { return value == null ? "NULL" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const [page, setPage] = useState(0);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  if (!rows.length) return <p className="work-empty">No rows</p>;
  return <div className="result-table-wrap"><div className="result-table-scroll"><table className="result-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(current * 10, (current + 1) * 10).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{cell(row[column])}</td>)}</tr>)}</tbody></table></div><div className="result-table-footer"><span>{rows.length} rows · {columns.length} columns</span>{pages > 1 && <div><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next</button></div>}</div></div>;
}
