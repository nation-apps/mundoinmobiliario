/** Esqueleto de /admin/embudo mientras el servidor trae las conversaciones. */
export default function CargandoEmbudo() {
  return (
    <div aria-busy="true">
      <header className="mb-7">
        <span className="t-brace">Operación</span>
        <h1 className="t-titulo mt-2.5 text-[clamp(30px,3.4vw,42px)]">Embudo comercial</h1>
      </header>
      <p className="sr-only" role="status">
        Cargando el embudo…
      </p>
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-[300px] shrink-0 rounded-2xl border border-line bg-bg-soft/50 p-3">
            <div className="mb-3 h-5 w-28 animate-pulse rounded bg-bg-soft" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="mb-2 h-24 animate-pulse rounded-xl bg-porcelain" style={{ animationDelay: `${(i + j) * 70}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
