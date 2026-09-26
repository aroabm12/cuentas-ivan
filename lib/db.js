import { neon } from "@neondatabase/serverless";

// Vercel inyecta esta variable automáticamente cuando conectas
// la integración de Neon Postgres desde la pestaña "Storage".
// Se crea de forma perezosa (no al cargar el módulo) para que
// `next build` no falle si la variable aún no existe en ese momento.
let _sql = null;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "Falta DATABASE_URL. Conecta la base de datos Neon desde la pestaña Storage de tu proyecto en Vercel."
      );
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
export function sql(...args) {
  return getSql()(...args);
}
sql.query = (...args) => getSql().query(...args);
sql.transaction = (...args) => getSql().transaction(...args);

let ready = false;

const GASTOS_FIJOS_INICIALES = [
  ["Gimnasio", 35.0, "1"],
  ["Claude", 10.0, "11"],
  ["Pagar a Aroa", 100.0, "1"],
];

const INGRESOS_FIJOS_INICIALES = [];

const PRESUPUESTO_VARIABLE_INICIAL = [
  ["Ocio", 0],
  ["Restaurantes", 0],
  ["Deporte", 0],
  ["Imprevistos", 30],
];

// Crea las tablas y los datos iniciales la primera vez que se
// necesitan. No hace falta ejecutar nada a mano.
//
// Como la app hace varias peticiones a la vez al cargar (movimientos,
// gastos fijos, ingresos fijos...), es posible que dos peticiones
// intenten crear las tablas casi al mismo tiempo. "CREATE TABLE IF
// NOT EXISTS" normalmente lo evita, pero bajo mucha concurrencia
// puede dar igualmente un error de "ya existe" — por eso ese error
// concreto se ignora a propósito (no es un fallo real).
async function creaTablaSiHaceFalta(sql, sentenciaSQL) {
  try {
    await sql.query(sentenciaSQL);
  } catch (err) {
    const yaExiste =
      err && (err.code === "42P07" || (err.code === "23505" && err.constraint === "pg_type_typname_nsp_index"));
    if (!yaExiste) throw err;
  }
}

export async function ensureSchema() {
  if (ready) return;
  const sql = getSql();

  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS movimientos (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      concepto TEXT NOT NULL,
      gasto NUMERIC(10,2) NOT NULL DEFAULT 0,
      ingreso NUMERIC(10,2) NOT NULL DEFAULT 0,
      creado_en TIMESTAMP NOT NULL DEFAULT now()
    )`
  );
  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor NUMERIC(10,2) NOT NULL
    )`
  );
  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS gastos_fijos (
      id SERIAL PRIMARY KEY,
      concepto TEXT NOT NULL,
      importe NUMERIC(10,2) NOT NULL DEFAULT 0,
      dia TEXT NOT NULL DEFAULT '',
      orden INT NOT NULL DEFAULT 0
    )`
  );
  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS ingresos_fijos (
      id SERIAL PRIMARY KEY,
      concepto TEXT NOT NULL,
      importe NUMERIC(10,2) NOT NULL DEFAULT 0,
      dia TEXT NOT NULL DEFAULT '',
      orden INT NOT NULL DEFAULT 0
    )`
  );
  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS presupuesto_variable (
      id SERIAL PRIMARY KEY,
      concepto TEXT NOT NULL,
      importe NUMERIC(10,2) NOT NULL DEFAULT 0,
      orden INT NOT NULL DEFAULT 0
    )`
  );

  await creaTablaSiHaceFalta(
    sql,
    `CREATE TABLE IF NOT EXISTS overrides_mensuales (
      anio_mes TEXT PRIMARY KEY,
      ingresos_previstos NUMERIC(10,2)
    )`
  );

  await sql`INSERT INTO config (clave, valor) VALUES ('saldo_inicial', 0) ON CONFLICT (clave) DO NOTHING;`;
  await sql`INSERT INTO config (clave, valor) VALUES ('meta_min', 450) ON CONFLICT (clave) DO NOTHING;`;
  await sql`INSERT INTO config (clave, valor) VALUES ('meta_max', 500) ON CONFLICT (clave) DO NOTHING;`;

  async function sembrar(tabla, filas, conDia) {
    const [{ count }] = await sql.query(`SELECT COUNT(*)::int AS count FROM ${tabla}`);
    if (count > 0) return;
    for (let i = 0; i < filas.length; i++) {
      if (conDia) {
        const [concepto, importe, dia] = filas[i];
        await sql.query(
          `INSERT INTO ${tabla} (concepto, importe, dia, orden) VALUES ($1, $2, $3, $4)`,
          [concepto, importe, dia, i]
        );
      } else {
        const [concepto, importe] = filas[i];
        await sql.query(
          `INSERT INTO ${tabla} (concepto, importe, orden) VALUES ($1, $2, $3)`,
          [concepto, importe, i]
        );
      }
    }
  }

  await sembrar("gastos_fijos", GASTOS_FIJOS_INICIALES, true);
  await sembrar("ingresos_fijos", INGRESOS_FIJOS_INICIALES, true);
  await sembrar("presupuesto_variable", PRESUPUESTO_VARIABLE_INICIAL, false);

  // Añade la columna de categoría si la tabla ya existía de antes
  // (usuarios que ya tenían movimientos guardados sin esto).
  await creaTablaSiHaceFalta(sql, `ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS categoria_id INTEGER`);

  ready = true;
}
