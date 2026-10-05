/**
 * Corrige el voseo rioplatense ("contame", "tenés", "querés") a la forma peruana ("cuéntame", "tienes", "quieres").
 * La clientela es peruana y el voseo suena ajeno; el modelo lo mete de vez en cuando aunque las instrucciones lo prohíben,
 * así que además se corrige en el código. Solo cambia palabras completas de una lista cerrada y conserva la mayúscula inicial.
 */
const FORMAS: Record<string, string> = {
  contame: "cuéntame", decime: "dime", avisame: "avísame", escribime: "escríbeme", llamame: "llámame",
  mandame: "mándame", pasame: "pásame", dejame: "déjame", ayudame: "ayúdame", mostrame: "muéstrame",
  recordame: "recuérdame", respondeme: "respóndeme", fijate: "fíjate", animate: "anímate", inscribite: "inscríbete",
  contanos: "cuéntanos", decinos: "dinos", avisanos: "avísanos", escribinos: "escríbenos",
  mirá: "mira", esperá: "espera", tomá: "toma", hacé: "haz", andá: "ve", pensá: "piensa", vení: "ven", contá: "cuenta",
  seguís: "sigues", tenés: "tienes", querés: "quieres", podés: "puedes", sabés: "sabes", sentís: "sientes",
  preferís: "prefieres", necesitás: "necesitas", decís: "dices", hacés: "haces", vivís: "vives", venís: "vienes",
  pensás: "piensas", trabajás: "trabajas", buscás: "buscas", llegás: "llegas", cobrás: "cobras", vendés: "vendes",
  sos: "eres", vos: "tú",
};

const PATRON = new RegExp(`(?<![\\p{L}])(${Object.keys(FORMAS).join("|")})(?![\\p{L}])`, "giu");

export function quitarVoseo(texto: string): string {
  return texto.replace(PATRON, (palabra) => {
    const cambio = FORMAS[palabra.toLowerCase()]!;
    const inicialMayuscula = palabra[0] === palabra[0]!.toUpperCase() && palabra[0] !== palabra[0]!.toLowerCase();
    return inicialMayuscula ? cambio[0]!.toUpperCase() + cambio.slice(1) : cambio;
  });
}
