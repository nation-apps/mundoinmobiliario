import type { Metadata } from "next";
import { CORREO_PRIVACIDAD, NEGOCIO_LEGAL, PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Condiciones del servicio" };

export default function Terminos() {
  return (
    <PaginaLegal titulo="Condiciones del servicio">
      <p>
        Al escribirnos por WhatsApp, Messenger o Instagram aceptas estas condiciones. El canal de mensajes de {NEGOCIO_LEGAL}
        sirve para informarte sobre nuestro seminario gratuito y nuestros programas de formación en inversión inmobiliaria.
      </p>

      <h2>Qué es y qué no es este servicio</h2>
      <ul>
        <li>Es un canal informativo y de atención. Parte de las respuestas las genera un asistente de inteligencia artificial.</li>
        <li>No es asesoría legal, fiscal, financiera ni de inversión personalizada.</li>
        <li>No garantizamos resultados ni rendimientos. Toda inversión implica riesgo.</li>
        <li>Los precios, fechas y condiciones de los programas los confirma una persona del equipo antes de cualquier pago.</li>
      </ul>

      <h2>Uso adecuado</h2>
      <p>
        Te pedimos no enviar contenido ilegal, ofensivo o que suplante a otras personas, y no compartir contraseñas ni datos de
        tarjetas por el chat. Podemos dejar de atender conversaciones que incumplan estas reglas.
      </p>

      <h2>Tus datos</h2>
      <p>
        El tratamiento de tus datos se explica en nuestra <a className="underline" href="/privacidad">política de privacidad</a>.
      </p>

      <h2>Cambios y contacto</h2>
      <p>
        Podemos actualizar estas condiciones y publicaremos la versión vigente en esta página. Para cualquier duda escríbenos a{" "}
        <a className="underline" href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>.
      </p>
    </PaginaLegal>
  );
}
