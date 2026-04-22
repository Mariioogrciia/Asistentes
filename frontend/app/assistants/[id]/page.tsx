"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Assistant, type Conversation, type Document, type Message, supabase } from "@/lib/api";
import styles from "./page.module.css";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GalaxyBackground } from "@/components/GalaxyBackground";

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
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [avatar, setAvatar] = useState("✦");
  const [drawer, setDrawer] = useState<"none" | "history" | "docs">("none");
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (id && typeof window !== "undefined") {
      setAvatar(localStorage.getItem(`avatar_${id}`) || "✦");
    }
  }, [id]);

  useEffect(() => {
    // Load cached profile
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("user_profile");
      if (cached) {
        try { setProfile(JSON.parse(cached)); } catch(e) {}
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      } else {
        // Load data
        Promise.all([
          api.assistants.get(id),
          api.conversations.list(id),
          api.documents.list(id),
          api.users.me(),
        ]).then(([asst, convs, docs, me]) => {
          setAssistant(asst);
          setConversations(convs);
          setDocuments(docs);
          const p = { ...me, ...me.profile };
          setProfile(p);
          localStorage.setItem("user_profile", JSON.stringify(p));
          if (convs.length > 0) {
            setActiveConv(convs[0]);
            api.conversations.messages(convs[0].id).then(setMessages);
          }
        }).catch(() => router.push("/"))
          .finally(() => setLoading(false));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        api.users.me().then(me => {
          const p = { ...me, ...me.profile };
          setProfile(p);
          localStorage.setItem("user_profile", JSON.stringify(p));
        });
      } else {
        router.push("/login");
        localStorage.removeItem("user_profile");
      }
    });

    return () => subscription.unsubscribe();
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
      {/* Dynamic Ambient Background */}
      <div className={styles.ambientBg} />

      {/* Top Floating Navbar (The "Dynamic Island") */}
      <header className={styles.topNav}>
        <div className={styles.navLeft}>
          <button className="btn btn-icon btn-ghost" onClick={() => router.push("/")} title="Volver al Inicio">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div className={styles.navAssistant}>
            <div className={styles.navAvatar}>{avatar}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className={styles.navName}>{assistant.name}</span>
              <span className={styles.navStatus}>Online</span>
            </div>
          </div>
        </div>
        
        <div className={styles.navRight}>
          <button className={`btn btn-ghost ${drawer === "history" ? styles.navActive : ""}`} onClick={() => setDrawer(d => d === "history" ? "none" : "history")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span className={styles.navText}>Historial</span>
          </button>
          <button className={`btn btn-ghost ${drawer === "docs" ? styles.navActive : ""}`} onClick={() => setDrawer(d => d === "docs" ? "none" : "docs")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span className={styles.navText}>Docs ({documents.length})</span>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={() => setShowSettings(true)} title="Ajustes">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <div className={styles.navUser} onClick={() => router.push("/profile")} style={{ cursor: "pointer" }} title="Ver mi perfil">
            <span className={styles.userName}>
              {profile?.full_name || profile?.email || "..."}
            </span>
          </div>
          <div style={{ marginLeft: "0.5rem" }}><ThemeToggle /></div>
        </div>
      </header>

      {/* Floating Drawers overlay */}
      {drawer !== "none" && (
        <div className={styles.drawerOverlay} onClick={() => setDrawer("none")}>
          <div className={`${styles.drawer} ${styles.reveal}`} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h3 className={styles.drawerTitle}>{drawer === "history" ? "Historial de Chat" : "Base de Conocimiento"}</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setDrawer("none")}>✕</button>
            </div>
            {drawer === "history" ? (
              <ConversationList conversations={conversations} active={activeConv} onSelect={(c) => { handleSelectConv(c); setDrawer("none"); }} onNew={() => { handleNewConversation(); setDrawer("none"); }} onDelete={(c) => setConvToDelete(c)} />
            ) : (
              <DocumentsPanel assistantId={id} documents={documents} onChange={setDocuments} onDeleteRequest={setDocToDelete} />
            )}
          </div>
        </div>
      )}

      {/* Main Chat Canvas */}
      <main className={styles.chatCanvas}>
        {activeConv ? (
          <ChatPanel conversation={activeConv} messages={messages} onNewMessage={(msg) => setMessages(prev => [...prev, msg])} onUpdateLastMessage={(content) => setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m))} />
        ) : (
          <div className={styles.emptyCanvas}>
            <div className={styles.emptyCanvasIcon}>✨</div>
            <h2>Lienzo en blanco</h2>
            <p className="text-muted">Inicia una nueva exploración con {assistant.name}</p>
            <button className={`${styles.glowingBtn} mt-6`} onClick={handleNewConversation}>Comenzar</button>
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

      {/* Conversation Delete Confirmation Modal */}
      {convToDelete && (
        <DeleteConversationModal
          conversation={convToDelete}
          onClose={() => setConvToDelete(null)}
          onConfirm={async () => {
            const cId = convToDelete.id;
            setConvToDelete(null);
            try {
              await api.conversations.delete(cId);
              setConversations(prev => prev.filter(c => c.id !== cId));
              if (activeConv?.id === cId) {
                setActiveConv(null);
                setMessages([]);
              }
            } catch (err) {
              alert("Error al eliminar la conversación.");
            }
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <EditAssistantModal
          assistant={assistant}
          avatar={avatar}
          onClose={() => setShowSettings(false)}
          onUpdated={(updatedAsst, updatedAvatar) => {
            setAssistant(updatedAsst);
            setAvatar(updatedAvatar);
            localStorage.setItem(`avatar_${id}`, updatedAvatar);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

// ── ConversationList ───────────────────────────────────────────────────────────
function ConversationList({
  conversations, active, onSelect, onNew, onDelete
}: {
  conversations: Conversation[];
  active: Conversation | null;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
  onDelete: (c: Conversation) => void;
}) {
  return (
    <div className={styles.convList}>
      <button className="btn btn-primary w-full" style={{ marginBottom: "0.75rem" }} onClick={onNew}>
        + Nueva conversación
      </button>
      {conversations.length === 0 ? (
        <p className="text-sm text-muted" style={{ padding: "0.5rem" }}>Sin conversaciones</p>
      ) : conversations.map(c => (
        <div key={c.id} className={styles.convItemWrapper}>
          <button
            className={`${styles.convItem} ${active?.id === c.id ? styles.convItemActive : ""}`}
            onClick={() => onSelect(c)}
          >
            <span className={styles.convTitle}>{c.title || "Nueva conversación"}</span>
            <span className="text-xs text-muted">
              {new Date(c.updated_at).toLocaleDateString("es-ES")}
            </span>
          </button>
          <button
            className={styles.convDeleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(c); }}
            title="Eliminar conversación"
          >
            ✕
          </button>
        </div>
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
    // Evita el comportamiento de "subir iterativamente" o saltos durante el streaming
    bottomRef.current?.scrollIntoView({ 
      behavior: streaming ? "auto" : "smooth",
      block: "end"
    });
  }, [messages, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    const tx = textareaRef.current;
    if (!tx) return;
    tx.style.height = "auto";
    tx.style.height = `${tx.scrollHeight}px`;
  }, [input]);

  async function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

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
          <MessageBubble key={msg.id} message={msg} isLastStreaming={streaming && i === messages.length - 1} assistantAvatar={localStorage.getItem(`avatar_${conversation.assistant_id}`) || "✦"} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputContainer}>
          <textarea
            ref={textareaRef}
            className={`input ${styles.chatInput}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={1}
            disabled={streaming}
            style={{ 
              resize: "none", 
              overflowY: "auto", 
              maxHeight: "80px",
              height: "auto",
              minHeight: "24px"
            }}
          />
          <button
            className={`btn ${styles.sendBtn}`}
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            title="Enviar"
          >
            {streaming ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: "currentColor" }} /> : "↑"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Node Stream (No classic bubbles) ──────────────────────────────────────────
function MessageBubble({ message, isLastStreaming, assistantAvatar }: { message: Message; isLastStreaming: boolean; assistantAvatar: string }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`${styles.nodeGroup} ${isUser ? styles.nodeUser : styles.nodeAssistant}`}>
      {!isUser && (
        <div className={styles.nodeAvatarCol}>
          <div className={styles.nodeAvatar}>{assistantAvatar}</div>
          <div className={styles.nodeLine} />
        </div>
      )}
      <div className={styles.nodeContentPane}>
        {isUser && <div className={styles.nodeUserLabel}>Tú</div>}
        {isLastStreaming && message.content === "" ? (
          <div className="dot-pulse"><span /><span /><span /></div>
        ) : (
          <div className={styles.nodeContent}>
            {message.content.split("\n").map((line, i) => (
              <span key={i} style={{ display: 'block', minHeight: line.trim() ? "auto" : "1em" }}>{line}</span>
            ))}
          </div>
        )}
        {message.sources.length > 0 && (
          <div className={styles.nodeSources}>
            <button
              className={styles.sourceToggle}
              onClick={() => setShowSources(!showSources)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span>Fuentes ({message.sources.length})</span>
              {showSources ? "▲" : "▼"}
            </button>
            {showSources && message.sources.map((s, i) => (
              <div key={i} className={styles.sourceNodeItem}>
                <div className={styles.sourceScore}>Ref: {Math.round(s.similarity * 100)}%</div>
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

function DeleteConversationModal({
  conversation, onClose, onConfirm,
}: {
  conversation: Conversation;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)" }}>¿Eliminar conversación?</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar <strong>{conversation.title || "esta conversación"}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
            Se borrarán todos los mensajes de forma permanente en la base de datos.
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

function EditAssistantModal({
  assistant, avatar, onClose, onUpdated
}: {
  assistant: Assistant;
  avatar: string;
  onClose: () => void;
  onUpdated: (asst: Assistant, avatar: string) => void;
}) {
  const [name, setName] = useState(assistant.name);
  const [desc, setDesc] = useState(assistant.description || "");
  const [inst, setInst] = useState(assistant.instructions);
  const [localAvatar, setLocalAvatar] = useState(avatar);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.assistants.update(assistant.id, {
        name,
        description: desc,
        instructions: inst
      });
      onUpdated(updated, localAvatar);
    } catch (err) {
      alert("Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  const PRESET_AVATARS = [
    "✦", "🤖", "🧠", "✨", "🚀", "💡", "🔮", "👽", "🦉", "⚖️", "💼", "📚",
    "⚽", "🏀", "🎾", "🏎️", "🚗", "✈️", "🚢", "🦁", "🐼", "🌿", "🌊",
    "🛠️", "💻", "📱", "🔋", "🎨", "🎭", "🎸", "📷", "🍕", "☕", "🌍", "🔥"
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="modal-header">
          <h2>Ajustes del Asistente</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}>Avatar</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {PRESET_AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setLocalAvatar(a)}
                  style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    fontSize: "1.5rem", background: localAvatar === a ? "var(--bg-active)" : "var(--bg-surface)",
                    border: localAvatar === a ? "2px solid var(--accent)" : "1px solid var(--border)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                    color: "var(--avatar-icon)"
                  }}
                >
                  {a}
                </button>
              ))}
            </div>

            <label className="label">Nombre</label>
            <input required className="input" value={name} onChange={e => setName(e.target.value)} />
            
            <label className="label" style={{ marginTop: "1rem" }}>Descripción corta</label>
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)} />

            <label className="label" style={{ marginTop: "1rem" }}>Instrucciones del Sistema</label>
            <textarea required className="input" rows={4} value={inst} onChange={e => setInst(e.target.value)} style={{ resize: "vertical" }} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
