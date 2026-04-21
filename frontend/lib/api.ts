/** Typed API client for the RAG Assistants backend. */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Assistant {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  assistant_id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  size_bytes: number | null;
  chunk_count: number;
  status: "processing" | "ready" | "error";
  created_at: string;
}

export interface Conversation {
  id: string;
  assistant_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
}

export interface Source {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Assistants ────────────────────────────────────────────────────────────────

export const api = {
  assistants: {
    list: () => req<Assistant[]>("/assistants/"),
    create: (body: { name: string; description?: string; instructions: string }) =>
      req<Assistant>("/assistants/", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => req<Assistant>(`/assistants/${id}`),
    update: (id: string, body: Partial<{ name: string; description: string; instructions: string }>) =>
      req<Assistant>(`/assistants/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      fetch(`${API_BASE}/assistants/${id}`, { method: "DELETE" })
        .then(r => { if (!r.ok) throw new Error("Error al eliminar"); }),
  },

  documents: {
    list: (assistantId: string) =>
      req<Document[]>(`/assistants/${assistantId}/documents/`),
    upload: (assistantId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return fetch(`${API_BASE}/assistants/${assistantId}/documents/`, {
        method: "POST",
        body: form,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Document>;
      });
    },
    delete: (assistantId: string, documentId: string) =>
      fetch(`${API_BASE}/assistants/${assistantId}/documents/${documentId}`, {
        method: "DELETE",
      }).then(r => {
        if (!r.ok) throw new Error("Error al eliminar el documento");
      }),
  },

  conversations: {
    list: (assistantId: string) =>
      req<Conversation[]>(`/assistants/${assistantId}/conversations/`),
    create: (assistantId: string, title?: string) =>
      req<Conversation>(`/assistants/${assistantId}/conversations/`, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    messages: (conversationId: string) =>
      req<Message[]>(`/conversations/${conversationId}/messages/`),
    /** Returns a ReadableStream for SSE. */
    sendMessage: (conversationId: string, content: string) =>
      fetch(`${API_BASE}/conversations/${conversationId}/messages/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    delete: (conversationId: string) =>
      fetch(`${API_BASE}/conversations/${conversationId}`, { method: "DELETE" })
        .then(r => { if (!r.ok) throw new Error("Error al eliminar la conversación"); }),
  },
};
