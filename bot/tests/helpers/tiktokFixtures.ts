import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/tiktok");

/** Texto crudo tal como llegaría por la red (para firmar sobre los bytes exactos). */
export function fixtureTiktokCrudo(nombre: string): string {
  return readFileSync(join(FIXTURES_DIR, nombre), "utf8");
}

export function fixtureTiktok<T = Record<string, unknown>>(nombre: string): T {
  return JSON.parse(fixtureTiktokCrudo(nombre)) as T;
}

/** Una Response de fetch con el cuerpo de un fixture (sobre `{ code, data }` de TikTok). */
export function respuestaTiktok(nombre: string): Response {
  const cuerpo = fixtureTiktok(nombre);
  return { ok: true, status: 200, json: async () => cuerpo } as Response;
}
