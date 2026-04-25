"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase, type AdminUserCreateBody, type Assistant } from "@/lib/api";
import styles from "./admin.module.css";
import { ThemeToggle } from "@/components/ThemeToggle";

interface UserProfile {
  id: string;
  email: string;
  role: "user" | "admin";
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

interface NoticeState {
  type: "success" | "error";
  message: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void>;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allAssistants, setAllAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTab] = useState<"users" | "assistants">("users");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userAssistants, setUserAssistants] = useState<Assistant[]>([]);
  const [loadingUserAssts, setLoadingUserAssts] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<AdminUserCreateBody>({
    email: "",
    password: "",
    full_name: "",
    role: "user",
  });

  async function loadAdminData() {
    const [allUsers, assts] = await Promise.all([
      api.users.list(),
      api.assistants.list("all"),
    ]);
    setUsers(allUsers);
    setAllAssistants(assts);
  }

  useEffect(() => {
    // Load cached profile
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("user_profile");
      if (cached) {
        try { setCurrentUser(JSON.parse(cached)); } catch(e) {}
      }
    }

    // Check if user is admin
    async function checkAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login");
          return;
        }

        const me = await api.users.me();
        const p = { ...me, ...me.profile };
        setCurrentUser(p);
        localStorage.setItem("user_profile", JSON.stringify(p));

        if (p.role !== "admin") {
          setError(`Tu rol actual es "${p.role}". Se requieren privilegios de administrador.`);
          return;
        }

        // Load all users and all assistants
        try {
          await loadAdminData();
        } catch (listErr: any) {
          console.error("Error al cargar datos:", listErr);
          setError(`Eres admin, pero no pudimos cargar los datos: ${listErr.message}`);
        }
      } catch (err: any) {
        console.error("Error en checkAdmin:", err);
        setError(`Error de conexión o permisos: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, [router]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await api.users.create(createUserForm);
      await loadAdminData();
      setShowCreateUser(false);
      setCreateUserForm({ email: "", password: "", full_name: "", role: "user" });
      setNotice({ type: "success", message: "Usuario creado correctamente." });
    } catch (err: any) {
      setNotice({ type: "error", message: `No se pudo crear el usuario: ${err.message}` });
    } finally {
      setCreatingUser(false);
    }
  }

  async function performDeleteUser(user: UserProfile) {
    try {
      await api.users.delete(user.id);
      await loadAdminData();
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
        setUserAssistants([]);
      }
      setNotice({ type: "success", message: "Usuario eliminado correctamente." });
    } catch (err: any) {
      setNotice({ type: "error", message: `No se pudo eliminar el usuario: ${err.message}` });
    }
  }

  function handleDeleteUser(user: UserProfile) {
    setConfirmDialog({
      title: "Eliminar usuario",
      message: `Vas a eliminar al usuario ${user.full_name || user.email} y todos sus datos. Esta accion es irreversible.`,
      confirmText: "Eliminar usuario",
      onConfirm: () => performDeleteUser(user),
    });
  }

  async function performDeleteAssistant(assistant: Assistant) {
    try {
      await api.assistants.delete(assistant.id);
      await loadAdminData();
      if (selectedUser) {
        const refreshed = await api.assistants.list(selectedUser.id);
        setUserAssistants(refreshed);
      }
      setNotice({ type: "success", message: "Asistente eliminado correctamente." });
    } catch (err: any) {
      setNotice({ type: "error", message: `No se pudo eliminar el asistente: ${err.message}` });
    }
  }

  function handleDeleteAssistant(assistant: Assistant) {
    setConfirmDialog({
      title: "Eliminar asistente",
      message: `Vas a eliminar el asistente \"${assistant.name}\". Esta accion es irreversible.`,
      confirmText: "Eliminar asistente",
      onConfirm: () => performDeleteAssistant(assistant),
    });
  }

  async function handleViewUserAssistants(user: UserProfile) {
    setSelectedUser(user);
    setLoadingUserAssts(true);
    try {
      const assts = await api.assistants.list(user.id);
      setUserAssistants(assts);
    } catch (err) {
      setNotice({ type: "error", message: "Error al cargar asistentes del usuario." });
    } finally {
      setLoadingUserAssts(false);
    }
  }

  async function handleConfirmAction() {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  function getUserLabelById(userId: string): string {
    const owner = users.find((u) => u.id === userId);
    if (!owner) return `Usuario no encontrado (${userId.slice(0, 8)}...)`;
    return `${owner.full_name || "Sin nombre"} · ${owner.email}`;
  }

  if (loading) return <div className={styles.loading}>Cargando panel de administración...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo} onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
            <span className={styles.logoMark}>✦</span>
            Panel Admin
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <ThemeToggle />
            {currentUser && (
              <span 
                style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--accent)", marginRight: "10px", cursor: "pointer" }}
                onClick={() => router.push("/profile")}
                title="Ver mi perfil"
              >
                {currentUser.full_name || currentUser.email}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")}>
              Volver
            </button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {notice && (
          <div className={`${styles.notice} ${notice.type === "success" ? styles.noticeSuccess : styles.noticeError}`}>
            <span>{notice.message}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>Cerrar</button>
          </div>
        )}

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <h3>Total Usuarios</h3>
            <p className={styles.statValue}>{users.length}</p>
          </div>
          <div className={styles.statCard}>
            <h3>Admins</h3>
            <p className={styles.statValue}>{users.filter(u => u.role === "admin").length}</p>
          </div>
          <div className={styles.statCard}>
            <h3>Asistentes Totales</h3>
            <p className={styles.statValue}>{allAssistants.length}</p>
          </div>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${tab === "users" ? styles.tabActive : ""}`} 
            onClick={() => setTab("users")}
          >
            Usuarios
          </button>
          <button 
            className={`${styles.tab} ${tab === "assistants" ? styles.tabActive : ""}`} 
            onClick={() => setTab("assistants")}
          >
            Todos los Asistentes
          </button>
        </div>

        {tab === "users" && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateUser(true)}>
              + Crear usuario
            </button>
          </div>
        )}

        {tab === "users" ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>ID</th>
                  <th>Última actividad</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {u.avatar_url ? <img src={u.avatar_url} alt="" /> : (u.full_name?.charAt(0) || u.email.charAt(0)).toUpperCase()}
                        </div>
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{u.full_name || "Sin nombre"}</span>
                          <span className={styles.userEmail}>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${u.role === "admin" ? styles.badgeAdmin : styles.badgeUser}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className={styles.mono}>{u.id.slice(0, 8)}...</td>
                    <td className={styles.date}>{new Date(u.updated_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleViewUserAssistants(u)}>
                          Ver Asistentes
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u)}>
                          Eliminar usuario
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asistente</th>
                  <th>Usuario vinculado</th>
                  <th>Instrucciones</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {allAssistants.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div className={styles.asstCell}>
                        <span className={styles.asstAvatar}>🤖</span>
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{a.name}</span>
                          <span className={styles.userEmail}>{a.description || "Sin descripción"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{getUserLabelById(a.user_id)}</span>
                        <span className={styles.userEmail}>ID: {a.user_id.slice(0, 13)}...</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.instrPreview} title={a.instructions}>
                        {a.instructions?.slice(0, 50)}...
                      </div>
                    </td>
                    <td className={styles.date}>{new Date(a.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAssistant(a)}>
                        Eliminar asistente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h2>Asistentes de {selectedUser.full_name || selectedUser.email}</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setSelectedUser(null)}>✕</button>
            </div>
            <div style={{ maxHeight: "400px", overflowY: "auto", padding: "1rem 0" }}>
              {loadingUserAssts ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>Cargando asistentes...</div>
              ) : userAssistants.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  Este usuario no tiene asistentes creados.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {userAssistants.map(a => (
                    <div key={a.id} style={{ 
                      padding: "1rem", 
                      background: "var(--bg-base)", 
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div className="text-xs text-muted">{a.description || "Sin descripción"}</div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <div className="text-xs text-muted">
                          {new Date(a.created_at).toLocaleDateString()}
                        </div>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAssistant(a)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSelectedUser(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showCreateUser && (
        <div className="modal-overlay" onClick={() => setShowCreateUser(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Crear nuevo usuario</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowCreateUser(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateUser}>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                required
                value={createUserForm.email}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
              />

              <label className="label" style={{ marginTop: "0.75rem" }}>Password</label>
              <input
                className="input"
                type="password"
                minLength={8}
                required
                value={createUserForm.password}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
              />

              <label className="label" style={{ marginTop: "0.75rem" }}>Nombre completo (opcional)</label>
              <input
                className="input"
                value={createUserForm.full_name || ""}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, full_name: e.target.value }))}
              />

              <label className="label" style={{ marginTop: "0.75rem" }}>Rol</label>
              <select
                className="input"
                value={createUserForm.role || "user"}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, role: e.target.value as "user" | "admin" }))}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              <div className="modal-footer" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateUser(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creatingUser}>
                  {creatingUser ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-overlay" onClick={() => !confirmLoading && setConfirmDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="modal-header">
              <h2>{confirmDialog.title}</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setConfirmDialog(null)} disabled={confirmLoading}>✕</button>
            </div>
            <div style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
              {confirmDialog.message}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDialog(null)} disabled={confirmLoading}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleConfirmAction} disabled={confirmLoading}>
                {confirmLoading ? "Procesando..." : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
