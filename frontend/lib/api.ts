import { createClient } from "@supabase/supabase-js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// Initialize Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 
      "Content-Type": "application/json", 
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...init?.headers 
    },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  
  // Handle empty responses (like 204 No Content)
  if (res.status === 204) return {} as T;
  
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
    delete: (id: string) => req(`/assistants/${id}/delete`, { method: "POST" }),
  },

  documents: {
    list: (assistantId: string) =>
      req<Document[]>(`/assistants/${assistantId}/documents/`),
    upload: async (assistantId: string, file: File) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const form = new FormData();
      form.append("file", file);
      return fetch(`${API_BASE}/assistants/${assistantId}/documents/`, {
        method: "POST",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: form,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Document>;
      });
    },
    delete: (assistantId: string, documentId: string) =>
      req<void>(`/assistants/${assistantId}/documents/${documentId}`, {
        method: "DELETE",
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
    sendMessage: async (conversationId: string, content: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      return fetch(`${API_BASE}/conversations/${conversationId}/messages/`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });
    },
    delete: (conversationId: string) =>
      req<void>(`/conversations/${conversationId}`, { method: "DELETE" }),
  },

  users: {
    me: () => req<any>("/users/me"),
    updateProfile: (body: { full_name?: string; avatar_url?: string }) =>
      req<any>("/users/me", { method: "PUT", body: JSON.stringify(body) }),
  },

  auth: {
    getUser: () => supabase.auth.getUser(),
    signOut: () => supabase.auth.signOut(),
    listUsers: () => req<any[]>("/users/"),
  }
};
