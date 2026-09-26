export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql, ensureSchema } from "../../../lib/db";
import { conManejoErrores } from "../../../lib/api-utils";

export const GET = conManejoErrores(async function GET() {
  await ensureSchema();
  const rows = await sql`
    SELECT id, concepto, importe FROM presupuesto_variable ORDER BY orden ASC, id ASC
  `;
  return NextResponse.json({ presupuestoVariable: rows });
});

export const POST = conManejoErrores(async function POST(request) {
  await ensureSchema();
  const { concepto, importe } = await request.json();
  if (!concepto) {
    return NextResponse.json({ error: "Falta concepto" }, { status: 400 });
  }
  const [{ max }] = await sql`SELECT COALESCE(MAX(orden), -1) AS max FROM presupuesto_variable`;
  const [row] = await sql`
    INSERT INTO presupuesto_variable (concepto, importe, orden)
    VALUES (${concepto}, ${Number(importe) || 0}, ${max + 1})
    RETURNING id, concepto, importe
  `;
  return NextResponse.json({ categoria: row });
});

export const PUT = conManejoErrores(async function PUT(request) {
  await ensureSchema();
  const { id, concepto, importe } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const [row] = await sql`
    UPDATE presupuesto_variable
    SET concepto = ${concepto}, importe = ${Number(importe) || 0}
    WHERE id = ${id}
    RETURNING id, concepto, importe
  `;
  return NextResponse.json({ categoria: row });
});

export const DELETE = conManejoErrores(async function DELETE(request) {
  await ensureSchema();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  await sql`DELETE FROM presupuesto_variable WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
});
