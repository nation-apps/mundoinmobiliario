/** Esqueleto de /admin/calendario mientras el servidor trae la sesión. */
export default function CargandoCalendario() {
  return (
    <div aria-busy="true">
      <header className="mb-7">
        <span className="t-brace">Operación</span>
        <h1 className="t-titulo mt-2.5 text-[clamp(30px,3.4vw,42px)]">Calendario</h1>
      </header>
      <p className="sr-only" role="status">
        Cargando el calendario…
      </p>
      <div className="admin-card h-[480px] animate-pulse bg-porcelain" />
    </div>
  );
}
