/**
 * Esqueleto de /admin/chats: se ve mientras el servidor trae la bandeja y
 * también como fallback del <Suspense> que envuelve a <Bandeja> en page.tsx.
 * Mismo lenguaje que TableShell (bloques que laten dentro de una admin-card).
 */
export default function CargandoChats() {
  return (
    <div aria-busy="true">
      <header className="mb-5">
        <span className="t-brace">Operación</span>
        <h1 className="t-titulo mt-2.5 text-[clamp(28px,3vw,38px)]">Conversaciones</h1>
        <div className="mt-3 flex gap-1.5">
          {[112, 132, 52].map((ancho) => (
            <div key={ancho} className="h-7 animate-pulse rounded-full bg-bg-soft" style={{ width: ancho }} />
          ))}
        </div>
      </header>

      <div className="admin-card p-5">
        <p className="sr-only" role="status">
          Cargando conversaciones…
        </p>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-lg bg-bg-soft"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
