import type { Metadata } from "next";
import { ACTUALIZADO, CORREO_PRIVACIDAD, NEGOCIO_LEGAL, PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p>
        {NEGOCIO_LEGAL} ofrece formación y acompañamiento en inversión inmobiliaria. Esta política explica qué datos
        recibimos cuando nos escribes por WhatsApp, Messenger o Instagram, para qué los usamos y cómo puedes pedir que los
        eliminemos.
      </p>

      <h2>Qué datos recogemos</h2>
      <ul>
        <li>Tu número de WhatsApp o tu identificador en Messenger o Instagram, y el nombre de tu perfil.</li>
        <li>Los mensajes, imágenes y documentos que nos envías.</li>
        <li>Lo que tú nos cuentas: tu nombre, correo, experiencia invirtiendo, objetivo, capital disponible, plazo y país o ciudad.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Responder tus preguntas sobre el seminario gratuito y los programas.</li>
        <li>Que una persona de nuestro equipo continúe la conversación cuando lo pidas o cuando haga falta.</li>
        <li>Mantener un historial de la conversación para no repetirte preguntas.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para decisiones automatizadas que te afecten legalmente.</p>

      <h2>Quién más interviene</h2>
      <p>Para dar el servicio usamos proveedores que tratan los datos por nuestra cuenta:</p>
      <ul>
        <li>Meta (WhatsApp, Messenger e Instagram), que transporta los mensajes.</li>
        <li>Anthropic, cuyo asistente de inteligencia artificial redacta las respuestas automáticas a partir del texto de la conversación.</li>
        <li>Supabase y Railway, que alojan la base de datos y el servidor.</li>
      </ul>
      <p>
        Las respuestas automáticas las genera una inteligencia artificial. Si prefieres hablar con una persona, pídelo en el
        chat.
      </p>

      <h2>Cuánto tiempo los conservamos</h2>
      <p>
        Conservamos la conversación mientras mantengamos contacto contigo. Puedes pedir en cualquier momento que la
        eliminemos.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir acceso, corrección o eliminación de tus datos, y oponerte a que los tratemos. Para eliminarlos sigue las
        instrucciones de <a className="underline" href="/eliminar-datos">/eliminar-datos</a>, o escríbenos a{" "}
        <a className="underline" href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política publicaremos la nueva versión en esta página. Actualizada el {ACTUALIZADO}.</p>
    </PaginaLegal>
  );
}
