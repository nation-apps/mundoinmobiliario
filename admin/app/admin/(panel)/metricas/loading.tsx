/** Esqueleto de /admin/metricas en la primera carga (al cambiar de periodo se queda el tablero anterior, atenuado). */
export default function CargandoMetricas() {
  return (
    <div aria-busy="true">
      <header className="mb-6">
        <span className="t-brace">Rendimiento</span>
        <h1 className="t-titulo mt-2.5 text-[clamp(30px,3.4vw,42px)]">Métricas de chats</h1>
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-bg-soft" />
      </header>
      <p className="sr-only" role="status">
        Calculando las métricas…
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[1, 1, 1, 2, 1].map((ancho, i) => (
          <div key={i} className={`admin-card h-[136px] animate-pulse ${ancho === 2 ? "col-span-2" : ""}`} style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <div className="admin-card h-[320px] animate-pulse xl:col-span-2" />
        <div className="admin-card h-[320px] animate-pulse" />
      </div>
    </div>
  );
}
