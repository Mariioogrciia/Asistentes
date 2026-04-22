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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Check if user is admin
    async function checkAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login");
          return;
        }

        const me = await api.users.me();
        setCurrentUser(me);

        if (me.role !== "admin") {
          setError(`Tu rol actual es "${me.role}". Se requieren privilegios de administrador.`);
          return;
        }

        // Load all users
        try {
          const allUsers = await api.auth.listUsers();
          setUsers(allUsers);
        } catch (listErr: any) {
          console.error("Error al listar usuarios:", listErr);
          setError(`Eres admin, pero no pudimos cargar la lista: ${listErr.message}`);
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
        </div>

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
                    <button className="btn btn-ghost btn-sm" title="Ver asistentes">
                      🔍 Ver Asistentes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
