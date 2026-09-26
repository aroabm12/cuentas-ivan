export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, ensureSchema } from "../../../lib/db";
import { conManejoErrores } from "../../../lib/api-utils";

export const GET = conManejoErrores(async function GET() {
  await ensureSchema();
  const rows = await sql`SELECT clave, valor FROM config`;
  const config = {};
  for (const row of rows) config[row.clave] = Number(row.valor);
  return NextResponse.json(config);
});

export const PUT = conManejoErrores(async function PUT(request) {
  await ensureSchema();
  const body = await request.json();
  const permitido = ["saldo_inicial", "meta_min", "meta_max"];
  for (const clave of Object.keys(body)) {
    if (!permitido.includes(clave)) continue;
    await sql`
      INSERT INTO config (clave, valor) VALUES (${clave}, ${Number(body[clave])})
      ON CONFLICT (clave) DO UPDATE SET valor = ${Number(body[clave])}
    `;
  }
  return NextResponse.json({ ok: true });
});
