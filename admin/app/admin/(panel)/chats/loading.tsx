/**
 * Esqueleto de /admin/chats: se ve mientras el servidor trae la bandeja y
 * también como fallback del <Suspense> que envuelve a <Bandeja> en page.tsx.
 * Mismo lenguaje que TableShell (bloques que laten dentro de una admin-card).
 */
export default function CargandoChats() {
  return (
    <div aria-busy="true">
      <header className="mb-5">
        <span className="t-brace block">Operación</span>
        <h1 className="t-display mt-2 text-[clamp(26px,3vw,36px)] leading-none">
          Conversaciones
        </h1>
      </header>

      <div className="admin-card p-5">
        <p className="sr-only" role="status">
          Cargando conversaciones…
        </p>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse bg-bg-soft"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
