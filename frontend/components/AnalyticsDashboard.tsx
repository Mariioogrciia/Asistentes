import React from "react";
import styles from "./AnalyticsDashboard.module.css";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: number;
    isUp: boolean;
  };
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend }) => (
  <div className={styles.statCard}>
    <div className={styles.statIcon}>{icon}</div>
    <div className={styles.statContent}>
      <h3 className={styles.statTitle}>{title}</h3>
      <div className={styles.statValue}>{value}</div>
      {subtitle && <div className={styles.statSubtitle}>{subtitle}</div>}
      {trend && (
        <div className={`${styles.trend} ${trend.isUp ? styles.trendUp : styles.trendDown}`}>
          {trend.isUp ? "↑" : "↓"} {trend.value}%
        </div>
      )}
    </div>
  </div>
);

interface BarChartProps {
  data: { name: string; count?: number; hits?: number }[];
  title: string;
  labelKey: string;
  valueKey: string;
}

const BarChart: React.FC<BarChartProps> = ({ data, title, labelKey, valueKey }) => {
  const max = Math.max(...data.map(d => (d as any)[valueKey] as number), 1);
  
  return (
    <div className={styles.chartContainer}>
      <h3 className={styles.chartTitle}>{title}</h3>
      <div className={styles.chartList}>
        {data.length === 0 ? (
          <div className={styles.noData}>No hay datos suficientes</div>
        ) : (
          data.map((item, i) => {
            const val = (item as any)[valueKey] as number;
            const percentage = (val / max) * 100;
            return (
              <div key={i} className={styles.barItem}>
                <div className={styles.barHeader}>
                  <span className={styles.barLabel}>{(item as any)[labelKey]}</span>
                  <span className={styles.barValue}>{val.toLocaleString()}</span>
                </div>
                <div className={styles.barWrapper}>
                  <div 
                    className={styles.barFill} 
                    style={{ width: `${percentage}%`, transitionDelay: `${i * 100}ms` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

interface AnalyticsDashboardProps {
  isAdmin?: boolean;
  data: any; // UserStats or AdminStats
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ isAdmin, data }) => {
  if (!data) return <div className={styles.loading}>Cargando analíticas...</div>;

  return (
    <div className={styles.dashboard}>
      <div className={styles.statsGrid}>
        {isAdmin ? (
          <>
            <StatCard 
              title="Usuarios Totales" 
              value={data.total_users} 
              icon="👥" 
            />
            <StatCard 
              title="Mensajes Totales" 
              value={data.total_messages.toLocaleString()} 
              icon="💬" 
            />
            <StatCard 
              title="Tokens Estimados" 
              value={data.total_tokens_estimated.toLocaleString()} 
              subtitle="Basado en caracteres"
              icon="🪙" 
            />
            <StatCard 
              title="Documentos" 
              value={data.total_documents} 
              icon="📄" 
            />
          </>
        ) : (
          <>
            <StatCard 
              title="Mensajes Enviados" 
              value={data.total_messages.toLocaleString()} 
              icon="💬" 
            />
            <StatCard 
              title="Tokens Gastados" 
              value={data.estimated_tokens.toLocaleString()} 
              subtitle="Uso aproximado"
              icon="🪙" 
            />
            <StatCard 
              title="Asistentes Activos" 
              value={data.active_assistants} 
              icon="🤖" 
            />
          </>
        )}
      </div>

      <div className={styles.chartsGrid}>
        <BarChart 
          title={isAdmin ? "Asistentes más Populares" : "Actividad por Asistente"} 
          data={isAdmin ? data.popular_assistants : data.activity_by_assistant} 
          labelKey="name" 
          valueKey={isAdmin ? "count" : "count"}
        />
        <BarChart 
          title={isAdmin ? "Documentos más Consultados (Global)" : "Mis Documentos más Consultados"} 
          data={isAdmin ? data.top_global_documents : data.top_documents} 
          labelKey="name" 
          valueKey="hits"
        />
      </div>

      {/* Ratings table — admin only */}
      {isAdmin && data.assistant_ratings && data.assistant_ratings.length > 0 && (
        <div className={styles.ratingsContainer}>
          <h3 className={styles.chartTitle}>Valoración de Asistentes</h3>
          <div className={styles.ratingsTable}>
            <div className={styles.ratingsHeader}>
              <span>Asistente</span>
              <span style={{ textAlign: "center" }}>👍</span>
              <span style={{ textAlign: "center" }}>👎</span>
              <span style={{ textAlign: "center" }}>Satisfacción</span>
            </div>
            {data.assistant_ratings.map((r: any, i: number) => (
              <div key={i} className={styles.ratingsRow}>
                <span className={styles.ratingsName}>{r.name}</span>
                <span className={styles.ratingsUp}>+{r.up}</span>
                <span className={styles.ratingsDown}>-{r.down}</span>
                <div className={styles.scoreCell}>
                  <div className={styles.scoreBar}>
                    <div
                      className={styles.scoreFill}
                      style={{
                        width: `${r.score}%`,
                        background: r.score >= 70
                          ? "var(--success)"
                          : r.score >= 40
                          ? "var(--warning)"
                          : "var(--error)",
                      }}
                    />
                  </div>
                  <span className={styles.scoreLabel}>{r.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
