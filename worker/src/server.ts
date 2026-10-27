import { routeAgentRequest } from "agents";
import { Investigator } from "./investigator";

export { Investigator };

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    // The Cloudflare asset handler serves the TanStack SPA for `/` and all
    // client-side routes. Keep API and Agent routes in this Worker handler.
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "khoji-fraud-agent",
        model: env.OPENAI_MODEL || "gpt-6-luna",
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        databaseConfigured: Boolean(env.AGENT_DB?.connectionString && env.AGENT_WRITER_DB?.connectionString),
      });
    }
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;
    // Let the asset handler serve the SPA entry point for client-side routes
    // such as `/chats`; the Worker only owns API, health, and agent requests.
    if (request.method === "GET" || request.method === "HEAD") {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
