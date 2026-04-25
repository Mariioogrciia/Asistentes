"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, supabase } from "@/lib/api";
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

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allAssistants, setAllAssistants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTab] = useState<"users" | "assistants">("users");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userAssistants, setUserAssistants] = useState<any[]>([]);
  const [loadingUserAssts, setLoadingUserAssts] = useState(false);

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
          const [allUsers, assts] = await Promise.all([
            api.auth.listUsers(),
            api.assistants.list("all")
          ]);
          setUsers(allUsers);
          setAllAssistants(assts);
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

  async function handleViewUserAssistants(user: UserProfile) {
    setSelectedUser(user);
    setLoadingUserAssts(true);
    try {
      const assts = await api.assistants.list(user.id);
      setUserAssistants(assts);
    } catch (err) {
      alert("Error al cargar asistentes del usuario");
    } finally {
      setLoadingUserAssts(false);
    }
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
                      <button className="btn btn-ghost btn-sm" onClick={() => handleViewUserAssistants(u)}>
                        🔍 Ver Asistentes
                      </button>
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
                  <th>Propietario (User ID)</th>
                  <th>Instrucciones</th>
                  <th>Creado</th>
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
                    <td className={styles.mono}>{a.user_id?.slice(0, 13) || "---"}...</td>
                    <td>
                      <div className={styles.instrPreview} title={a.instructions}>
                        {a.instructions?.slice(0, 50)}...
                      </div>
                    </td>
                    <td className={styles.date}>{new Date(a.created_at).toLocaleDateString()}</td>
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
                      <div className="text-xs text-muted">
                        {new Date(a.created_at).toLocaleDateString()}
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
    </main>
  );
}
