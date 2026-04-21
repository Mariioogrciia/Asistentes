"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Assistant } from "@/lib/api";
import styles from "./page.module.css";

// ── SVG icon set ───────────────────────────────────────────────────────────────

function IconFiles() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconLogoMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l1.6 4.9H15L10.7 9.6l1.6 4.9L8 11.9l-4.3 2.6 1.6-4.9L1 6.4h5.4z" fill="currentColor" opacity="0.9"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

function IconRobot() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <path d="M12 11V7"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M8 15h1M15 15h1"/>
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}


// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantToDelete, setAssistantToDelete] = useState<Assistant | null>(null);

  useEffect(() => {
    api.assistants.list()
      .then(setAssistants)
      .catch(() => setError("No se puede conectar con el servidor. ¿Está el backend activo?"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className={styles.main}>
      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>
              <IconLogoMark />
            </div>
            RAG Assistants
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <IconPlus />
            Nuevo asistente
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            V2.0 · Ya disponible
          </div>

          <h1 className={styles.heroTitle}>
            Tus documentos,<br />
            <span className={styles.heroTitleAccent}>convertidos en IA</span>
          </h1>

          <p className={styles.heroSubtitle}>
            Crea asistentes inteligentes sobre tus propios archivos. Sube PDFs, Word o Markdown y chatea con ellos al instante usando búsqueda vectorial avanzada.
          </p>

          <div className={styles.heroActions}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                if (assistants.length === 0) setShowModal(true);
                else document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Comenzar ahora
            </button>
            <a
              href="https://github.com/Mariioogrciia/Asistentes"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-lg"
            >
              Ver en GitHub
            </a>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────── */}
        <div className={styles.divider} />

        <p className={styles.featuresLabel}>Cómo funciona</p>

        <section className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}><IconFiles /></div>
            <h3 className={styles.featureTitle}>Ingesta de documentos</h3>
            <p className={styles.featureDesc}>PDFs, DOCX, PPTX y Markdown. Tu base de conocimiento centralizada, lista para ser consultada.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}><IconSearch /></div>
            <h3 className={styles.featureTitle}>Búsqueda semántica</h3>
            <p className={styles.featureDesc}>Motor RAG con embeddings vectoriales para encontrar respuestas precisas en milisegundos.</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap}><IconChat /></div>
            <h3 className={styles.featureTitle}>Chat con streaming</h3>
            <p className={styles.featureDesc}>Conversaciones fluidas en tiempo real. Ves cómo el modelo genera cada palabra mientras responde.</p>
          </div>
        </section>

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        <section id="dashboard" className={styles.dashboardSection}>
          <div className={styles.dashboardHeader}>
            <div className={styles.dashboardTitleGroup}>
              <span className={styles.dashboardTitle}>Tus asistentes</span>
              {!loading && !error && assistants.length > 0 && (
                <span className={styles.dashboardSubtitle}>{assistants.length} asistente{assistants.length !== 1 ? "s" : ""} configurado{assistants.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(true)}>
              <IconPlus />
              Nuevo
            </button>
          </div>

          {loading ? (
            <div className={styles.loadingGrid}>
              {[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}
            </div>
          ) : error ? (
            <div className={styles.emptyDash}>
              <div className={styles.emptyDashIcon} style={{ color: "var(--error)" }}>
                <IconWarning />
              </div>
              <h3 style={{ color: "var(--error)" }}>Sin conexión con el servidor</h3>
              <p>{error}</p>
            </div>
          ) : assistants.length === 0 ? (
            <div className={styles.emptyDash}>
              <div className={styles.emptyDashIcon}>
                <IconRobot />
              </div>
              <h3>Sin asistentes todavía</h3>
              <p>Crea tu primer asistente para empezar a chatear con tus documentos.</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: "0.75rem" }}
                onClick={() => setShowModal(true)}
              >
                <IconPlus /> Crear asistente
              </button>
            </div>
          ) : (
            <div className={styles.grid}>
              {assistants.map((a, i) => (
                <AssistantCard
                  key={a.id}
                  assistant={a}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => router.push(`/assistants/${a.id}`)}
                  onDeleteRequest={() => setAssistantToDelete(a)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <CreateAssistantModal
          onClose={() => setShowModal(false)}
          onCreated={(a) => {
            setAssistants(prev => [a, ...prev]);
            setShowModal(false);
            router.push(`/assistants/${a.id}`);
          }}
        />
      )}
      {assistantToDelete && (
        <DeleteAssistantModal
          assistant={assistantToDelete}
          onClose={() => setAssistantToDelete(null)}
          onConfirm={async () => {
            const id = assistantToDelete.id;
            setAssistantToDelete(null);
            try {
              await api.assistants.delete(id);
              setAssistants(prev => prev.filter(x => x.id !== id));
            } catch {
              alert("Error al eliminar el asistente.");
            }
          }}
        />
      )}
    </main>
  );
}

// ── AssistantCard ──────────────────────────────────────────────────────────────

function AssistantCard({
  assistant,
  style,
  onClick,
  onDeleteRequest,
}: {
  assistant: Assistant;
  style?: React.CSSProperties;
  onClick: () => void;
  onDeleteRequest: () => void;
}) {
  return (
    <div
      className={`card ${styles.assistantCard} anim-fadeinup`}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <div className={styles.cardTop}>
        <div className={styles.avatar}>
          {assistant.name.charAt(0).toUpperCase()}
        </div>
        <button
          className={`btn btn-icon btn-danger btn-sm ${styles.deleteBtn}`}
          onClick={e => { e.stopPropagation(); onDeleteRequest(); }}
          title="Eliminar asistente"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{assistant.name}</h3>
        {assistant.description && (
          <p className={`${styles.cardDesc} truncate`}>{assistant.description}</p>
        )}
      </div>

      <div className={styles.cardFooter}>
        <span className="text-xs text-muted">
          {new Date(assistant.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span className={styles.chatBtn}>
          Chat <span className={styles.chatArrow}>→</span>
        </span>
      </div>
    </div>
  );
}

// ── CreateAssistantModal ───────────────────────────────────────────────────────

function CreateAssistantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (a: Assistant) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(
    "Eres un asistente útil y preciso. Responde siempre basándote en los documentos proporcionados. Si no encuentras la información en los documentos, indícalo claramente."
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) return;
    setLoading(true);
    setError("");
    try {
      const a = await api.assistants.create({ name, description: description || undefined, instructions });
      onCreated(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nuevo asistente</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="field">
            <label htmlFor="name">Nombre *</label>
            <input id="name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Asistente Legal" required />
          </div>
          <div className="field">
            <label htmlFor="desc">Descripción <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span></label>
            <input id="desc" className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="¿Para qué sirve este asistente?" />
          </div>
          <div className="field">
            <label htmlFor="instr">System prompt *</label>
            <textarea id="instr" className="textarea" value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} required />
          </div>
          {error && <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? <><span className="spinner" /> Creando...</> : "Crear asistente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DeleteAssistantModal ───────────────────────────────────────────────────────

function DeleteAssistantModal({
  assistant, onClose, onConfirm,
}: {
  assistant: Assistant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "420px" }}>
        <div className="modal-header">
          <h2 style={{ color: "var(--error)", fontSize: "1.0625rem" }}>Eliminar asistente</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={isDeleting}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <p className="text-sm">
            Estás a punto de eliminar <strong style={{ color: "var(--text-primary)" }}>{assistant.name}</strong>.
          </p>
          <p className="text-sm" style={{ marginTop: "0.625rem", color: "var(--text-muted)" }}>
            Esta acción es <strong style={{ color: "var(--error)" }}>irreversible</strong>. Se borrarán todos sus documentos del Storage, las conversaciones y la configuración.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={isDeleting}>Cancelar</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? <><span className="spinner" /> Eliminando...</> : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
