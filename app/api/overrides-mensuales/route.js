export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, ensureSchema } from "../../../lib/db";
import { conManejoErrores } from "../../../lib/api-utils";

export const GET = conManejoErrores(async function GET() {
  await ensureSchema();
  const rows = await sql`SELECT anio_mes, ingresos_previstos FROM overrides_mensuales`;
  return NextResponse.json({ overrides: rows });
});

export const PUT = conManejoErrores(async function PUT(request) {
  await ensureSchema();
  const { anioMes, ingresosPrevistos } = await request.json();
  if (!anioMes) {
    return NextResponse.json({ error: "Falta anioMes" }, { status: 400 });
  }
  await sql`
    INSERT INTO overrides_mensuales (anio_mes, ingresos_previstos)
    VALUES (${anioMes}, ${Number(ingresosPrevistos)})
    ON CONFLICT (anio_mes) DO UPDATE SET ingresos_previstos = ${Number(ingresosPrevistos)}
  `;
  return NextResponse.json({ ok: true });
});

export const DELETE = conManejoErrores(async function DELETE(request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const anioMes = searchParams.get("anioMes");
  if (!anioMes) {
    return NextResponse.json({ error: "Falta anioMes" }, { status: 400 });
  }
  await sql`DELETE FROM overrides_mensuales WHERE anio_mes = ${anioMes}`;
  return NextResponse.json({ ok: true });
});
