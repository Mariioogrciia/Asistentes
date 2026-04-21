"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Assistant, type Conversation, type Document, type Message } from "@/lib/api";
import styles from "./page.module.css";

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<"chat" | "docs">("chat");
  const [loading, setLoading] = useState(true);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  useEffect(() => {
    Promise.all([
      api.assistants.get(id),
      api.conversations.list(id),
      api.documents.list(id),
    ]).then(([asst, convs, docs]) => {
      setAssistant(asst);
      setConversations(convs);
      setDocuments(docs);
      if (convs.length > 0) {
        setActiveConv(convs[0]);
        api.conversations.messages(convs[0].id).then(setMessages);
      }
    }).catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleNewConversation() {
    const conv = await api.conversations.create(id);
    setConversations(prev => [conv, ...prev]);
    setActiveConv(conv);
    setMessages([]);
  }

  async function handleSelectConv(conv: Conversation) {
    setActiveConv(conv);
    const msgs = await api.conversations.messages(conv.id);
    setMessages(msgs);
  }

  if (loading) return <PageLoader />;
  if (!assistant) return null;

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")} title="Volver">
            ← Volver
          </button>
          <div className={styles.assistantInfo}>
            <div className={styles.sidebarAvatar}>{assistant.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className={styles.sidebarName}>{assistant.name}</div>
              {assistant.description && <div className="text-xs text-muted truncate">{assistant.description}</div>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "chat" ? styles.tabActive : ""}`} onClick={() => setTab("chat")}>
            💬 Chat
          </button>
          <button className={`${styles.tab} ${tab === "docs" ? styles.tabActive : ""}`} onClick={() => setTab("docs")}>
            📄 Docs {documents.length > 0 && <span className={styles.tabBadge}>{documents.length}</span>}
          </button>
        </div>

        {/* Sidebar content */}
        {tab === "chat" ? (
          <ConversationList
            conversations={conversations}
            active={activeConv}
            onSelect={handleSelectConv}
            onNew={handleNewConversation}
          />
        ) : (
          <DocumentsPanel
            assistantId={id}
            documents={documents}
            onChange={setDocuments}
            onDeleteRequest={setDocToDelete}
          />
        )}
      </aside>

      {/* Main chat area */}
      <main className={styles.chatArea}>
        {activeConv ? (
          <ChatPanel
            conversation={activeConv}
            messages={messages}
            onNewMessage={(msg) => setMessages(prev => [...prev, msg])}
            onUpdateLastMessage={(content) =>
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m))
            }
          />
        ) : (
          <div className="empty" style={{ flex: 1 }}>
            <div className="empty-icon">💬</div>
            <h3>Sin conversación activa</h3>
            <p>Crea una nueva conversación para empezar a chatear.</p>
            <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={handleNewConversation}>
              Nueva conversación
            </button>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <DeleteConfirmModal
          document={docToDelete}
          onClose={() => setDocToDelete(null)}
          onConfirm={async () => {
            const docId = docToDelete.id;
            setDocToDelete(null);
            try {
              await api.documents.delete(id, docId);
              setDocuments(prev => prev.filter(d => d.id !== docId));
            } catch (err) {
              alert("Error al eliminar el documento.");
            }
          }}
        />
      )}
    </div>
  );
}

// ── ConversationList ───────────────────────────────────────────────────────────
function ConversationList({
  conversations, active, onSelect, onNew,
}: {
  conversations: Conversation[];
  active: Conversation | null;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
}) {
  return (
    <div className={styles.convList}>
      <button className="btn btn-primary w-full" style={{ marginBottom: "0.75rem" }} onClick={onNew}>
        + Nueva conversación
      </button>
      {conversations.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "0.5rem" }}>Sin conversaciones</p>
      ) : conversations.map(c => (
        <button
          key={c.id}
          className={`${styles.convItem} ${active?.id === c.id ? styles.convItemActive : ""}`}
          onClick={() => onSelect(c)}
        >
          <span className={styles.convTitle}>{c.title || "Nueva conversación"}</span>
          <span className="text-xs text-muted">
            {new Date(c.updated_at).toLocaleDateString("es-ES")}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── ChatPanel ──────────────────────────────────────────────────────────────────
function ChatPanel({
  conversation, messages, onNewMessage, onUpdateLastMessage,
}: {
  conversation: Conversation;
  messages: Message[];
  onNewMessage: (m: Message) => void;
  onUpdateLastMessage: (content: string) => void;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");

    // Optimistic user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "user",
      content,
      sources: [],
      created_at: new Date().toISOString(),
    };
    onNewMessage(userMsg);

    // Placeholder assistant message
    const asstMsg: Message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      role: "assistant",
      content: "",
      sources: [],
      created_at: new Date().toISOString(),
    };
    onNewMessage(asstMsg);
    setStreaming(true);

    try {
      const res = await api.conversations.sendMessage(conversation.id, content);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]" || data === "[ERROR]") break;
          accumulated += data.replace(/\\n/g, "\n");
          onUpdateLastMessage(accumulated);
        }
      }
    } catch {
      onUpdateLastMessage("⚠️ Error al conectar con el asistente.");
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <h3>{conversation.title || "Nueva conversación"}</h3>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className="empty" style={{ marginTop: "4rem" }}>
            <div className="empty-icon">✨</div>
            <h3>¡Empieza a chatear!</h3>
            <p>Pregunta cualquier cosa sobre los documentos de este asistente.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} isLastStreaming={streaming && i === messages.length - 1} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={`input ${styles.chatInput}`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
          rows={1}
          disabled={streaming}
          style={{ resize: "none", overflowY: "auto", maxHeight: "120px" }}
        />
        <button
          className={`btn btn-primary ${styles.sendBtn}`}
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          title="Enviar"
        >
          {streaming ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: "#fff" }} /> : "↑"}
        </button>
      </div>
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────────
function MessageBubble({ message, isLastStreaming }: { message: Message; isLastStreaming: boolean }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant} anim-fadeinup`}>
      <div className={styles.bubbleAvatar}>{isUser ? "👤" : "✦"}</div>
      <div className={styles.bubbleContent}>
        {isLastStreaming && message.content === "" ? (
          <div className="dot-pulse"><span /><span /><span /></div>
        ) : (
          <div className={styles.bubbleText}>
            {message.content.split("\n").map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </div>
        )}
        {message.sources.length > 0 && (
          <div className={styles.sources}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.75rem" }}
              onClick={() => setShowSources(!showSources)}
            >
              📎 {message.sources.length} fuente{message.sources.length > 1 ? "s" : ""}
              {showSources ? " ▲" : " ▼"}
            </button>
            {showSources && message.sources.map((s, i) => (
              <div key={i} className={styles.sourceItem}>
                <div className={styles.sourceScore}>
                  {Math.round(s.similarity * 100)}% relevante
                </div>
                <p className={styles.sourceText}>{s.content.slice(0, 200)}…</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DocumentsPanel ─────────────────────────────────────────────────────────────
function DocumentsPanel({
  assistantId, documents, onChange, onDeleteRequest,
}: {
  assistantId: string;
  documents: Document[];
  onChange: (docs: Document[]) => void;
  onDeleteRequest: (doc: Document) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const doc = await api.documents.upload(assistantId, file);
      onChange([doc, ...documents]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(doc: Document) {
    onDeleteRequest(doc);
  }

  return (
    <div className={styles.docsPanel}>
      <input ref={fileRef} type="file" className="sr-only" id="file-upload" accept=".pdf,.docx,.pptx,.txt,.md" onChange={handleUpload} />
      <label
        htmlFor="file-upload"
        className={`${styles.uploadZone} ${uploading ? styles.uploadZoneUploading : ""}`}
      >
        {uploading ? (
          <><span className="spinner" /> Procesando documento…</>
        ) : (
          <>
            <span className={styles.uploadIcon}>⬆️</span>
            <span className={styles.uploadText}>Subir documento</span>
            <span className="text-xs text-muted">PDF, DOCX, PPTX, TXT, MD</span>
          </>
        )}
      </label>
      {uploadError && <p className="text-xs" style={{ color: "var(--error)", padding: "0.25rem 0" }}>{uploadError}</p>}

      <div className={styles.docList}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted" style={{ padding: "0.5rem" }}>Sin documentos todavía</p>
        ) : documents.map(doc => (
          <div key={doc.id} className={styles.docItem}>
            <span className={styles.docIcon}>{fileIcon(doc.file_type)}</span>
            <div className={styles.docInfo}>
              <span className={`${styles.docName} truncate`} title={doc.filename}>{doc.filename}</span>
              <div className={styles.docMeta}>
                <span className={`badge badge-${doc.status}`}>
                  {doc.status === "processing" && <span className="spinner" style={{width:10,height:10}} />}
                  {doc.status}
                </span>
                {doc.chunk_count > 0 && (
                  <span className="text-xs text-muted">{doc.chunk_count} chunks</span>
                )}
              </div>
            </div>
            <button className="btn btn-icon btn-danger btn-sm" onClick={() => handleDelete(doc)} title="Eliminar">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function fileIcon(type: string): string {
  const icons: Record<string, string> = { pdf: "📕", docx: "📘", pptx: "📙", txt: "📄", md: "📝" };
  return icons[type] ?? "📄";
}

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh" }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  );
}

function DeleteConfirmModal({
  document, onClose, onConfirm,
}: {
  document: Document;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)" }}>¿Eliminar documento?</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar <strong>{document.filename}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
            Esta acción es irreversible y borrará el archivo del Storage y todos sus datos de la base de datos.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Eliminar definitivamente
          </button>
        </div>
      </div>
    </div>
  );
}
