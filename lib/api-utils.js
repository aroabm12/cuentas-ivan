import { NextResponse } from "next/server";

// Envuelve un handler de ruta para que, si algo falla (base de datos,
// consulta SQL, lo que sea), la respuesta incluya el mensaje de error
// real en vez de devolver un 500 en blanco. Así se puede ver el motivo
// directamente en la app, sin tener que mirar los logs de Vercel.
export function conManejoErrores(handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: err && err.message ? err.message : String(err) },
        { status: 500 }
      );
    }
  };
}
