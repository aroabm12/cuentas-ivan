export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, ensureSchema } from "../../../lib/db";
import { conManejoErrores } from "../../../lib/api-utils";

export const GET = conManejoErrores(async function GET() {
  await ensureSchema();
  const rows = await sql`
    SELECT id, concepto, importe, dia FROM ingresos_fijos ORDER BY orden ASC, id ASC
  `;
  return NextResponse.json({ ingresosFijos: rows });
});

export const POST = conManejoErrores(async function POST(request) {
  await ensureSchema();
  const { concepto, importe, dia } = await request.json();
  if (!concepto) {
    return NextResponse.json({ error: "Falta concepto" }, { status: 400 });
  }
  const [{ max }] = await sql`SELECT COALESCE(MAX(orden), -1) AS max FROM ingresos_fijos`;
  const [row] = await sql`
    INSERT INTO ingresos_fijos (concepto, importe, dia, orden)
    VALUES (${concepto}, ${Number(importe) || 0}, ${dia || ""}, ${max + 1})
    RETURNING id, concepto, importe, dia
  `;
  return NextResponse.json({ ingresoFijo: row });
});

export const PUT = conManejoErrores(async function PUT(request) {
  await ensureSchema();
  const { id, concepto, importe, dia } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const [row] = await sql`
    UPDATE ingresos_fijos
    SET concepto = ${concepto}, importe = ${Number(importe) || 0}, dia = ${dia || ""}
    WHERE id = ${id}
    RETURNING id, concepto, importe, dia
  `;
  return NextResponse.json({ ingresoFijo: row });
});

export const DELETE = conManejoErrores(async function DELETE(request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  await sql`DELETE FROM ingresos_fijos WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
});
