import { StrictMode, memo, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import "streamdown/styles.css";
import "./styles.css";
import { ActivityGroup } from "./agent-activity";
import { groupParts, normalizeParts, type AgentPart, type MessagePart, type ToolActivity } from "./message-parts";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
  reasoning?: string;
  tools?: ToolActivity[];
  parts?: MessagePart[];
};

type Chat = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Message[];
};

const liveAgentEnabled = import.meta.env.VITE_KHOJI_LIVE !== "false";
const chatStorageKey = "khoji-chat-history-v2";
const defaultAgentHost = window.location.host;

const demoChats: Chat[] = [
  {
    id: "velocity-review",
    title: "AC-2048 velocity review",
    updatedAt: "2 min ago",
    messages: [
      {
        id: "velocity-1",
        role: "assistant",
        time: "10:42 AM",
        content:
          "## High-risk activity found\n\nAC-2048 shows **12 transfers worth ₹4.8L in 18 minutes**. Eight payments landed just below the ₹1L reporting threshold, and two came from a device first seen today.\n\nThe pattern is more consistent with coordinated splitting than payroll: the payees are unrelated, there is no matching salary history, and the account has never transacted at this hour before. **Confidence: high.**",
      },
      {
        id: "velocity-2",
        role: "user",
        time: "10:44 AM",
        content: "Could this still be a legitimate festival surge? Show me the evidence trail.",
      },
      {
        id: "velocity-3",
        role: "assistant",
        time: "10:44 AM",
        content:
          "The evidence trail has three independent signals:\n\n- **Velocity:** 8 payments in 11 minutes\n- **Device change:** 2 attempts from a new device\n- **Network links:** 3 payees overlap with another flagged account\n\n```mermaid\ngraph LR\n  A[AC-2048] --> B[8 rapid payments]\n  A --> C[New device]\n  A --> D[3 linked payees]\n  B --> E[High risk]\n  C --> E\n  D --> E\n```\n\nI recommend enhanced verification before outgoing transfers resume.",
      },
    ],
  },
  {
    id: "weekly-review",
    title: "Weekly risk review",
    updatedAt: "Yesterday",
    messages: [
      {
        id: "weekly-1",
        role: "user",
        time: "Yesterday",
        content: "What changed in the risk queue this week?",
      },
      {
        id: "weekly-2",
        role: "assistant",
        time: "Yesterday",
        content:
          "The queue is smaller but more concentrated. High-risk cases fell from 11 to 8, while the share with a device-change signal increased from 42% to 63%.\n\n| Signal | Cases | Change |\n| --- | ---: | ---: |\n| Velocity | 18 | +4 |\n| Device change | 14 | +6 |\n| Impossible travel | 7 | -2 |\n\nThat makes device review the best next investment for the team.",
      },
    ],
  },
];

const seedChats: Chat[] = liveAgentEnabled
  ? [{ id: crypto.randomUUID(), title: "New chat", updatedAt: "Just now", messages: [] }]
  : demoChats;

function usePersistentChats() {
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const stored = window.localStorage.getItem(chatStorageKey);
      return stored ? (JSON.parse(stored) as Chat[]) : seedChats;
    } catch {
      return seedChats;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(chatStorageKey, JSON.stringify(chats));
  }, [chats]);

  return [chats, setChats] as const;
}

function useLiveInvestigator(name: string) {
  const agent = useAgent({
    agent: "Investigator",
    name: name || "new-investigation",
    host: import.meta.env.VITE_KHOJI_AGENT_HOST || defaultAgentHost,
    protocol: (import.meta.env.VITE_KHOJI_AGENT_HOST || defaultAgentHost).includes("workers.dev") ? "wss" : window.location.protocol === "https:" ? "wss" : "ws",
  });
  const chat = useAgentChat({ agent, resume: true });
  const messages: Message[] = chat.messages.map((message) => {
    const parts = message.parts as AgentPart[];
    return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: parts.filter((part) => part.type === "text").map((part) => part.text).join(""),
    parts: normalizeParts(parts),
    time: "Live",
    };
  });
  return { ...chat, messages, agentName: name };
}

function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}>
        <div className="brand-row">
          <Link to="/" className="brand" onClick={() => setMobileNav(false)}>
            <span className="brand-mark">K</span>
            <span>khoji</span>
          </Link>
          <button className="icon-button sidebar-collapse" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}>
            <X size={17} />
          </button>
        </div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">F</span>
          <span className="workspace-copy"><strong>Fincrime ops</strong></span>
          <ChevronDown size={14} />
        </button>
        <nav className="nav-list">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "nav-link active" }} className="nav-link" onClick={() => setMobileNav(false)}>
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </Link>
          <Link to="/chats" activeProps={{ className: "nav-link active" }} className="nav-link" onClick={() => setMobileNav(false)}>
            <MessageSquare size={16} />
            <span>Chats</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="profile-row"><span className="profile-avatar">SR</span><span><strong>Sasmit Rao</strong><small>Analyst</small></span><span className="profile-status" /></div>
        </div>
      </aside>
      <main className="main-content">
        <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={18} /></button>
        <Outlet />
      </main>
    </div>
  );
}

function DashboardPage() {
  return (
    <div className="page-shell dashboard-page">
      <section className="page-intro"><div><h1>Overview</h1></div><Link to="/chats" className="button primary"><MessageSquare size={15} /> New investigation</Link></section>
      <section className="metric-grid">
        <MetricCard label="Cases reviewed" value="128" detail="Last 7 days" change="+18%" tone="positive" />
        <MetricCard label="High-risk cases" value="8" detail="Open" change="2 fewer" tone="neutral" />
        <MetricCard label="Median review time" value="3m 42s" detail="Median" change="42s faster" tone="positive" />
        <MetricCard label="Signals confirmed" value="91.8%" detail="Resolved cases" change="+4.2%" tone="positive" />
      </section>
      <section className="dashboard-grid">
        <div className="panel queue-panel"><PanelHeader icon={<FileText size={15} />} title="Cases" action={<Link to="/chats" className="panel-link">Review <ArrowUpRight size={14} /></Link>} />
          <div className="queue-list"><QueueItem account="AC-2048" title="Velocity spike" summary="12 transfers · ₹4.8L · 3 signals" risk="87" signal="High risk" /><QueueItem account="AC-7712" title="Impossible travel" summary="Mumbai → London · 41 min" risk="72" signal="Review" /><QueueItem account="AC-1183" title="New device cluster" summary="4 payees share one device" risk="64" signal="Review" /><QueueItem account="AC-9901" title="Dormant account activity" summary="First transaction in 9 days" risk="38" signal="Monitor" /></div>
        </div>
        <div className="panel insight-panel"><PanelHeader icon={<Sparkles size={15} />} title="Signals" />
          <div className="bar-chart" aria-label="Risk signals by category"><SignalBar label="Velocity" value={78} color="purple" /><SignalBar label="Device change" value={63} color="blue" /><SignalBar label="Network links" value={46} color="green" /><SignalBar label="Impossible travel" value={31} color="orange" /></div>
        </div>
      </section>
      <section className="panel activity-panel-wide"><PanelHeader icon={<Check size={15} />} title="Recent decisions" />
        <div className="activity-table"><ActivityRow account="AC-5531" action="Closed as legitimate" owner="Maya S." time="12 min ago" /><ActivityRow account="AC-1207" action="Requested enhanced verification" owner="Sasmit Rao" time="28 min ago" /><ActivityRow account="AC-6610" action="Escalated to compliance" owner="Nikhil P." time="1 hr ago" /></div>
      </section>
      <p className="data-note">Demo data</p>
    </div>
  );
}

function ChatsPage() {
  return liveAgentEnabled ? <LiveChatsPage /> : <ChatsPageContent liveChat={null} />;
}

function LiveChatsPage() {
  const [storedChats] = usePersistentChats();
  const [activeChatId, setActiveChatId] = useState(storedChats[0]?.id ?? "new-investigation");
  const liveChat = useLiveInvestigator(activeChatId);
  return <ChatsPageContent liveChat={liveChat} onChatSelected={setActiveChatId} />;
}

function ChatsPageContent({ liveChat, onChatSelected }: { liveChat: ReturnType<typeof useLiveInvestigator> | null; onChatSelected?: (id: string) => void }) {
  const [chats, setChats] = usePersistentChats();
  const [selectedId, setSelectedId] = useState(chats[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0];
  const visibleMessages = liveChat ? liveChat.agentName === selected?.id ? liveChat.messages : [] : selected?.messages ?? [];

  useEffect(() => {
    if (!selected && chats[0]) setSelectedId(chats[0].id);
  }, [chats, selected]);

  useEffect(() => {
    if (selected?.id) onChatSelected?.(selected.id);
  }, [onChatSelected, selected?.id]);

  const createChat = useCallback(() => {
    const chat: Chat = { id: `chat-${Date.now()}`, title: "New chat", updatedAt: "Just now", messages: [] };
    setChats((items) => [chat, ...items]);
    setSelectedId(chat.id);
    setDraft("");
  }, [setChats]);

  const deleteChat = useCallback((id: string) => {
    setChats((items) => items.filter((chat) => chat.id !== id));
    if (selectedId === id) {
      const next = chats.find((chat) => chat.id !== id);
      setSelectedId(next?.id ?? "");
      setDraft("");
    }
  }, [chats, selectedId, setChats]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !selected || liveChat?.isStreaming || (liveChat && liveChat.agentName !== selected.id)) return;
    if (liveChat) {
      setChats((items) => items.map((chat) => chat.id === selected.id ? { ...chat, title: chat.messages.length === 0 ? titleFromMessage(text) : chat.title, updatedAt: "Just now" } : chat));
      void liveChat.sendMessage({ text });
      setDraft("");
      return;
    }
    const userMessage: Message = { id: `message-${Date.now()}`, role: "user", content: text, time: "Just now" };
    const assistantMessage: Message = { id: `reply-${Date.now()}`, role: "assistant", content: buildReply(text), time: "Just now" };
    setChats((items) => items.map((chat) => chat.id === selected.id ? { ...chat, title: chat.messages.length === 0 ? titleFromMessage(text) : chat.title, updatedAt: "Just now", messages: [...chat.messages, userMessage, assistantMessage] } : chat));
    setDraft("");
  }, [draft, liveChat, selected, setChats]);

  const handlePrompt = useCallback((prompt: string) => setDraft(prompt), []);

  return <div className="page-shell chats-page">
    <section className="chat-workspace panel">
      <ChatSidebar chats={chats} selectedId={selected?.id ?? ""} onSelect={setSelectedId} onCreate={createChat} onDelete={deleteChat} />
      <ChatThread selected={selected} visibleMessages={visibleMessages} liveChat={liveChat} draft={draft} onDraftChange={setDraft} onPrompt={handlePrompt} onSend={sendMessage} />
    </section>
  </div>;
}

type ChatSidebarProps = {
  chats: Chat[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
};

const ChatSidebar = memo(function ChatSidebar({ chats, selectedId, onSelect, onCreate, onDelete }: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const visibleChats = useMemo(() => chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase())), [chats, search]);

  return <aside className="chat-list"><div className="chat-list-header"><strong>Chats</strong><button className="icon-button" aria-label="Create chat" onClick={onCreate}><Plus size={16} /></button></div><label className="chat-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" /></label><div className="chat-items">{visibleChats.map((chat) => <div className={`chat-item-wrap ${chat.id === selectedId ? "selected" : ""}`} key={chat.id}><button className="chat-item" onClick={() => onSelect(chat.id)}><span className="chat-item-icon"><MessageSquare size={14} /></span><span className="chat-item-copy"><strong>{chat.title}</strong><small>{chat.updatedAt}</small></span></button><button className="chat-delete" aria-label={`Delete ${chat.title}`} title="Delete conversation" onClick={() => onDelete(chat.id)}><Trash2 size={13} /></button></div>)}{visibleChats.length === 0 && <p className="empty-search">No matching chats.</p>}</div></aside>;
});

type ChatThreadProps = {
  selected?: Chat;
  visibleMessages: Message[];
  liveChat: ReturnType<typeof useLiveInvestigator> | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onPrompt: (prompt: string) => void;
  onSend: () => void;
};

const ChatThread = memo(function ChatThread({ selected, visibleMessages, liveChat, draft, onDraftChange, onPrompt, onSend }: ChatThreadProps) {
  if (!selected) return <div className="chat-thread"><EmptyChat onPrompt={onPrompt} /></div>;
  return <div className="chat-thread"><div className="chat-thread-header"><div><span className="thread-status"><span /> {liveChat ? "GPT-6 Luna" : "Demo"}</span><h2>{selected.title}</h2></div></div><div className="message-scroll">{visibleMessages.length === 0 ? <EmptyChat onPrompt={onPrompt} /> : visibleMessages.map((message, index) => <ChatMessage key={message.id} message={message} streaming={Boolean(liveChat?.isStreaming && index === visibleMessages.length - 1 && message.role === "assistant")} />)}</div>{(liveChat?.connectionError || liveChat?.error) && <div className="agent-error" role="alert">{liveChat.error?.message || "Connection failed. Retry."}</div>}{liveChat?.isStreaming && <div className="agent-progress"><span className="progress-dot" /><span>Investigating…</span></div>}<form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}><div className="composer-box"><textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Ask Khoji…" rows={2} /><button className="send-button" aria-label="Send message" disabled={Boolean(liveChat?.isStreaming || (liveChat && liveChat.agentName !== selected.id))} type="submit"><Send size={16} /></button></div></form></div>;
});

function MetricCard({ label, value, detail, change, tone }: { label: string; value: string; detail: string; change: string; tone: "positive" | "neutral" }) { return <div className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><div className="metric-footer"><span>{detail}</span><span className={`metric-change ${tone}`}>{change}</span></div></div>; }
function PanelHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) { return <div className="panel-header"><div className="panel-title"><span className="panel-header-icon">{icon}</span><h2>{title}</h2></div>{action}</div>; }
function QueueItem({ account, title, summary, risk, signal }: { account: string; title: string; summary: string; risk: string; signal: string }) { return <div className="queue-item"><span className="case-avatar">{account.slice(-2)}</span><div className="queue-copy"><strong>{account} · {title}</strong><span>{summary}</span></div><span className={`risk-label ${Number(risk) > 75 ? "high" : Number(risk) > 50 ? "medium" : "low"}`}>{signal} <b>{risk}</b></span><Link to="/chats" className="row-arrow" aria-label={`Open ${account}`}><ArrowUpRight size={15} /></Link></div>; }
function SignalBar({ label, value, color }: { label: string; value: number; color: string }) { return <div className="signal-bar"><div><span>{label}</span><b>{value}%</b></div><div className="signal-track"><span className={color} style={{ width: `${value}%` }} /></div></div>; }
function ActivityRow({ account, action, owner, time }: { account: string; action: string; owner: string; time: string }) { return <div className="activity-row"><span className="activity-check"><Check size={13} /></span><strong>{account}</strong><span className="activity-action">{action}</span><span className="activity-owner">{owner}</span><time>{time}</time></div>; }
function ChatMessage({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  // Older locally saved conversations use the previous content/tools shape.
  const parts: MessagePart[] = message.parts ?? [
    ...(message.reasoning ? [{ kind: "reasoning" as const, text: message.reasoning }] : []),
    ...(message.tools ?? []).map((tool) => ({ kind: "tool" as const, tool })),
    ...(message.content ? [{ kind: "text" as const, text: message.content }] : []),
  ];
  return <article className={`chat-message ${message.role}`}>
    <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={14} /> : "SR"}</div>
    <div className="message-content">
      <div className="message-meta"><strong>{message.role === "assistant" ? "Khoji" : "You"}</strong>{message.time !== "Live" && <time>{message.time}</time>}</div>
      <div className="message-timeline">{groupParts(parts).map((group) => group.kind === "activity"
        ? <ActivityGroup key={group.key} parts={group.parts} streaming={streaming} />
        : <div className="message-markdown" key={group.key}><Streamdown plugins={{ code, mermaid }} shikiTheme={["github-light", "github-dark"]}>{group.text}</Streamdown></div>)}</div>
    </div>
  </article>;
}

function EmptyChat({ onPrompt }: { onPrompt: (prompt: string) => void }) { return <div className="empty-chat"><span className="empty-icon"><Sparkles size={21} /></span><h3>Investigate</h3><div className="prompt-grid"><button onClick={() => onPrompt("Investigate the highest-risk account in the latest dataset window.")}>Find risky accounts <ArrowUpRight size={14} /></button><button onClick={() => onPrompt("Show the five most recent transactions.")}>Recent transactions <ArrowUpRight size={14} /></button></div></div>; }

function titleFromMessage(text: string) { return text.length > 34 ? `${text.slice(0, 34)}…` : text; }
function buildReply(text: string) { const normalized = text.toLowerCase(); if (normalized.includes("ac-2048") || normalized.includes("velocity")) return "AC-2048 is high risk (87/100). The evidence is **transaction velocity**, a **new device**, and **three linked payees**.\n\nI would pause outgoing transfers and request enhanced verification while the account owner confirms the device change."; if (normalized.includes("highest") || normalized.includes("risk")) return "The current queue has four cases needing review. **AC-2048** is the highest at 87/100, followed by **AC-7712** at 72/100. The most common signal across the high-risk set is a device change."; return "Demo mode. Enable live chat to query the database."; }

const rootRoute = createRootRoute({ component: AppShell });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage });
const chatsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/chats", component: ChatsPage });
const routeTree = rootRoute.addChildren([dashboardRoute, chatsRoute]);
const router = createRouter({ routeTree });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }

createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
