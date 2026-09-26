"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

function money(n) {
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function mismoMes(fechaStr, ref) {
  const d = new Date(fechaStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// Comprueba si un campo "día" (p.ej. "1", "1-5", "26", "variable") coincide
// con el día del mes de hoy. Los días aproximados/variables no se marcan
// automáticamente como "hoy" porque no se puede saber con certeza.
function diaEsHoy(diaStr, diaHoy) {
  if (!diaStr) return false;
  const limpio = diaStr.trim();
  if (/^\d+$/.test(limpio)) {
    return Number(limpio) === diaHoy;
  }
  const rango = limpio.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rango) {
    const [, a, b] = rango;
    return diaHoy >= Number(a) && diaHoy <= Number(b);
  }
  return false;
}

// Para emparejar un movimiento con una categoría variable usamos la
// primera palabra del nombre de la categoría (p.ej. "Comida / supermercado"
// -> "comida"), porque el concepto que escribes suele ser más corto.
function palabraClave(concepto) {
  return concepto.split("/")[0].split(" y ")[0].trim().toLowerCase();
}

export default function Home() {
  const hoy = useMemo(() => new Date(), []);
  const [mesSeleccionado, setMesSeleccionado] = useState(() => new Date());
  const [movimientos, setMovimientos] = useState([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [config, setConfig] = useState({ meta_min: 450, meta_max: 500 });
  const [gastosFijos, setGastosFijos] = useState([]);
  const [ingresosFijos, setIngresosFijos] = useState([]);
  const [presupuestoVariable, setPresupuestoVariable] = useState([]);
  const [overridesMensuales, setOverridesMensuales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [nuevoSaldoInicial, setNuevoSaldoInicial] = useState("");
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaMinInput, setMetaMinInput] = useState("");
  const [metaMaxInput, setMetaMaxInput] = useState("");

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [tipo, setTipo] = useState("gasto");
  const [categoriaId, setCategoriaId] = useState("");
  const [movEditandoId, setMovEditandoId] = useState(null);
  const [categoriaAbiertaId, setCategoriaAbiertaId] = useState(null);

  const [mostrarGestion, setMostrarGestion] = useState(false);
  const [nuevoGF, setNuevoGF] = useState({ concepto: "", importe: "", dia: "" });
  const [mostrarGestionIng, setMostrarGestionIng] = useState(false);
  const [nuevoIF, setNuevoIF] = useState({ concepto: "", importe: "", dia: "" });
  const [mostrarGestionVar, setMostrarGestionVar] = useState(false);
  const [nuevaCat, setNuevaCat] = useState({ concepto: "", importe: "" });
  const [mostrarTodosMovs, setMostrarTodosMovs] = useState(false);
  const [error, setError] = useState("");
  const [editandoIngPrevistos, setEditandoIngPrevistos] = useState(false);
  const [ingPrevistosInput, setIngPrevistosInput] = useState("");

  async function cargarTodo() {
    setLoading(true);
    setError("");
    try {
      const [rMov, rCfg, rGF, rIF, rVar, rOv] = await Promise.all([
        fetch("/api/movimientos"),
        fetch("/api/config"),
        fetch("/api/gastos-fijos"),
        fetch("/api/ingresos-fijos"),
        fetch("/api/presupuesto-variable"),
        fetch("/api/overrides-mensuales"),
      ]);
      for (const r of [rMov, rCfg, rGF, rIF, rVar, rOv]) {
        if (!r.ok) throw new Error(`Error ${r.status} cargando datos`);
      }
      const dMov = await rMov.json();
      const dCfg = await rCfg.json();
      const dGF = await rGF.json();
      const dIF = await rIF.json();
      const dVar = await rVar.json();
      const dOv = await rOv.json();
      setMovimientos(dMov.movimientos);
      setSaldoInicial(dMov.saldoInicial);
      setConfig(dCfg);
      setGastosFijos(dGF.gastosFijos);
      setIngresosFijos(dIF.ingresosFijos);
      setPresupuestoVariable(dVar.presupuestoVariable);
      setOverridesMensuales(dOv.overrides);
    } catch (err) {
      console.error(err);
      setError("No se ha podido cargar: " + err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  let saldo = saldoInicial;
  const filas = movimientos.map((m) => {
    saldo = saldo - Number(m.gasto) + Number(m.ingreso);
    return { ...m, saldo };
  });
  const saldoActual = filas.length ? filas[filas.length - 1].saldo : saldoInicial;

  const movDelMesReal = filas.filter((m) => mismoMes(m.fecha, hoy));
  const movDelMes = filas.filter((m) => mismoMes(m.fecha, mesSeleccionado));
  const ingresosMes = movDelMes.reduce((s, m) => s + Number(m.ingreso), 0);
  const gastosMes = movDelMes.reduce((s, m) => s + Number(m.gasto), 0);
  const ahorroRealMes = ingresosMes - gastosMes;
  const metaMin = Number(config.meta_min ?? 450);
  const metaMax = Number(config.meta_max ?? 500);

  // Previsión del mes, como en el Excel: lo que cobras normalmente menos
  // tus gastos fijos habituales menos lo que quieres ahorrar = lo que
  // te queda libre para gastar ese mes. "Ingresos previstos" se puede
  // corregir mes a mes (p.ej. un mes de transición sin cobro) sin que
  // afecte a los demás meses, que siguen usando el valor normal.
  const claveMes = `${mesSeleccionado.getFullYear()}-${String(mesSeleccionado.getMonth() + 1).padStart(2, "0")}`;
  const ingresosPrevistosDefault = ingresosFijos.reduce((s, iff) => s + Number(iff.importe), 0);
  const overrideMes = overridesMensuales.find((o) => o.anio_mes === claveMes);
  const ingresosPrevistos =
    overrideMes && overrideMes.ingresos_previstos !== null
      ? Number(overrideMes.ingresos_previstos)
      : ingresosPrevistosDefault;
  const gastosFijosPrevistos = gastosFijos.reduce((s, gf) => s + Number(gf.importe), 0);
  const disponibleParaGastar = ingresosPrevistos - gastosFijosPrevistos - metaMin;

  // De lo que ya has gastado este mes, la parte que NO es un gasto fijo
  // (comida, ocio, lo que sea) es lo que consume ese "disponible".
  const gastadoVariableReal = movDelMes
    .filter(
      (m) =>
        Number(m.gasto) > 0 &&
        !gastosFijos.some((gf) => m.concepto.toLowerCase().includes(gf.concepto.toLowerCase()))
    )
    .reduce((s, m) => s + Number(m.gasto), 0);
  const restaDisponible = disponibleParaGastar - gastadoVariableReal;
  const porcentajeDisponible =
    disponibleParaGastar > 0
      ? Math.min(100, (gastadoVariableReal / disponibleParaGastar) * 100)
      : gastadoVariableReal > 0
      ? 100
      : 0;
  const enMeta = restaDisponible >= 0;

  const gastosFijosConEstado = gastosFijos.map((gf) => {
    const registrado = movDelMes.some(
      (m) =>
        Number(m.gasto) > 0 &&
        m.concepto.toLowerCase().includes(gf.concepto.toLowerCase())
    );
    return { ...gf, registrado };
  });

  const diaHoy = hoy.getDate();
  const gastosFijosHoyEstado = gastosFijos.map((gf) => ({
    ...gf,
    registrado: movDelMesReal.some(
      (m) => Number(m.gasto) > 0 && m.concepto.toLowerCase().includes(gf.concepto.toLowerCase())
    ),
  }));
  const gastosHoy = gastosFijosHoyEstado.filter((gf) => diaEsHoy(gf.dia, diaHoy) && !gf.registrado);
  const ingresosHoy = ingresosFijos.filter((iff) => {
    const yaRegistrado = movDelMesReal.some(
      (m) => Number(m.ingreso) > 0 && m.concepto.toLowerCase().includes(iff.concepto.toLowerCase())
    );
    return diaEsHoy(iff.dia, diaHoy) && !yaRegistrado;
  });

  const variablesConGasto = presupuestoVariable.map((cat) => {
    const clave = palabraClave(cat.concepto);
    const movsCategoria = movDelMes.filter(
      (m) =>
        Number(m.gasto) > 0 &&
        (m.categoria_id ? m.categoria_id === cat.id : m.concepto.toLowerCase().includes(clave))
    );
    const gastado = movsCategoria.reduce((s, m) => s + Number(m.gasto), 0);
    const presupuestado = Number(cat.importe);
    const resta = presupuestado - gastado;
    const porcentaje = presupuestado > 0 ? Math.min(100, (gastado / presupuestado) * 100) : gastado > 0 ? 100 : 0;
    return { ...cat, gastado, resta, porcentaje, movimientos: movsCategoria };
  });

  async function guardarMovimiento(e) {
    e.preventDefault();
    if (!concepto || !importe) return;
    setError("");
    try {
      const res = await fetch("/api/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          concepto,
          gasto: tipo === "gasto" ? importe : 0,
          ingreso: tipo === "ingreso" ? importe : 0,
          categoriaId: tipo === "gasto" && categoriaId ? Number(categoriaId) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status} al guardar`);
      }
      setConcepto("");
      setImporte("");
      setCategoriaId("");
      cargarTodo();
    } catch (err) {
      console.error(err);
      setError("No se ha podido guardar: " + err.message);
    }
  }

  async function actualizarMovimiento(m) {
    setError("");
    try {
      const res = await fetch("/api/movimientos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: m.id,
          fecha: m.fecha,
          concepto: m.concepto,
          gasto: m.tipo === "gasto" ? m.importe : 0,
          ingreso: m.tipo === "ingreso" ? m.importe : 0,
          categoriaId: m.tipo === "gasto" && m.categoriaId ? Number(m.categoriaId) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status} al guardar`);
      }
      setMovEditandoId(null);
      cargarTodo();
    } catch (err) {
      console.error(err);
      setError("No se ha podido guardar el cambio: " + err.message);
    }
  }

  async function registrarRapido(gf) {
    await fetch("/api/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: new Date().toISOString().slice(0, 10),
        concepto: gf.concepto,
        gasto: gf.importe,
        ingreso: 0,
      }),
    });
    cargarTodo();
  }

  async function registrarIngresoRapido(iff) {
    await fetch("/api/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: new Date().toISOString().slice(0, 10),
        concepto: iff.concepto,
        gasto: 0,
        ingreso: iff.importe,
      }),
    });
    cargarTodo();
  }

  async function borrar(id) {
    await fetch(`/api/movimientos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function guardarSaldoInicial() {
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saldo_inicial: Number(nuevoSaldoInicial) }),
    });
    setEditandoSaldo(false);
    cargarTodo();
  }

  async function guardarMeta() {
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_min: Number(metaMinInput),
        meta_max: Number(metaMaxInput),
      }),
    });
    setEditandoMeta(false);
    cargarTodo();
  }

  async function guardarIngresosPrevistosMes() {
    await fetch("/api/overrides-mensuales", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anioMes: claveMes, ingresosPrevistos: Number(ingPrevistosInput) }),
    });
    setEditandoIngPrevistos(false);
    cargarTodo();
  }

  async function quitarOverrideIngresosMes() {
    await fetch(`/api/overrides-mensuales?anioMes=${claveMes}`, { method: "DELETE" });
    cargarTodo();
  }

  async function actualizarGF(gf) {
    await fetch("/api/gastos-fijos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gf),
    });
    cargarTodo();
  }

  async function borrarGF(id) {
    await fetch(`/api/gastos-fijos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirGF(e) {
    e.preventDefault();
    if (!nuevoGF.concepto) return;
    await fetch("/api/gastos-fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoGF),
    });
    setNuevoGF({ concepto: "", importe: "", dia: "" });
    cargarTodo();
  }

  async function actualizarIF(iff) {
    await fetch("/api/ingresos-fijos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(iff),
    });
    cargarTodo();
  }

  async function borrarIF(id) {
    await fetch(`/api/ingresos-fijos?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirIF(e) {
    e.preventDefault();
    if (!nuevoIF.concepto) return;
    await fetch("/api/ingresos-fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoIF),
    });
    setNuevoIF({ concepto: "", importe: "", dia: "" });
    cargarTodo();
  }

  async function actualizarCat(cat) {
    await fetch("/api/presupuesto-variable", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cat),
    });
    cargarTodo();
  }

  async function borrarCat(id) {
    await fetch(`/api/presupuesto-variable?id=${id}`, { method: "DELETE" });
    cargarTodo();
  }

  async function anadirCat(e) {
    e.preventDefault();
    if (!nuevaCat.concepto) return;
    await fetch("/api/presupuesto-variable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevaCat),
    });
    setNuevaCat({ concepto: "", importe: "" });
    cargarTodo();
  }

  const nombreMes = mesSeleccionado.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  function mesAnterior() {
    setMesSeleccionado((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function mesSiguiente() {
    setMesSeleccionado((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function irAHoy() {
    setMesSeleccionado(new Date());
  }
  const esMesActual = mismoMes(hoy.toISOString(), mesSeleccionado);

  function exportarExcel() {
    const wb = XLSX.utils.book_new();

    // ---- Resumen ----
    const resumenAOA = [
      [`Mis Cuentas — ${nombreMes}`],
      [],
      ["Ingresos previstos", ingresosPrevistos],
      ["Gastos fijos previstos", gastosFijosPrevistos],
      ["Meta de ahorro", metaMin],
      ["Disponible para gastar", disponibleParaGastar],
      [],
      ["Ingresos reales este mes", ingresosMes],
      ["Gastos reales este mes", gastosMes],
      ["Ahorro real este mes", ahorroRealMes],
      [],
      [`Comparado con ${nombreMesAnterior}`],
      ["Concepto", nombreMes, nombreMesAnterior, "Diferencia"],
      ["Ingresos", ingresosMes, ingresosMesAnterior, ingresosMes - ingresosMesAnterior],
      ["Gastos", gastosMes, gastosMesAnterior, gastosMes - gastosMesAnterior],
      ["Ahorro real", ahorroRealMes, ahorroMesAnterior, ahorroRealMes - ahorroMesAnterior],
      [],
      ["Saldo total actual", saldoActual],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenAOA);
    wsResumen["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    // ---- Movimientos ----
    const movAOA = [
      ["Fecha", "Concepto", "Gasto", "Ingreso", "Saldo"],
      ...filas.map((m) => [
        new Date(m.fecha).toLocaleDateString("es-ES"),
        m.concepto,
        Number(m.gasto) || "",
        Number(m.ingreso) || "",
        Number(m.saldo),
      ]),
    ];
    const wsMov = XLSX.utils.aoa_to_sheet(movAOA);
    wsMov["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsMov, "Movimientos");

    // ---- Gastos Fijos ----
    const gfAOA = [
      ["Concepto", "Día", "Importe"],
      ...gastosFijos.map((gf) => [gf.concepto, gf.dia, Number(gf.importe)]),
    ];
    const wsGF = XLSX.utils.aoa_to_sheet(gfAOA);
    wsGF["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsGF, "Gastos Fijos");

    // ---- Gastos Variables (del mes seleccionado) ----
    const gvAOA = [
      ["Categoría", "Presupuesto", "Gastado", "Resta"],
      ...variablesConGasto.map((c) => [c.concepto, Number(c.importe), c.gastado, c.resta]),
    ];
    const wsGV = XLSX.utils.aoa_to_sheet(gvAOA);
    wsGV["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsGV, "Gastos Variables");

    XLSX.writeFile(wb, `mis_cuentas_${claveMes}.xlsx`);
  }

  function exportarPDF() {
    window.print();
  }

  const listaMovsMostrada = mostrarTodosMovs ? filas : movDelMes;
  const totalGastoLista = listaMovsMostrada.reduce((s, m) => s + Number(m.gasto), 0);
  const totalIngresoLista = listaMovsMostrada.reduce((s, m) => s + Number(m.ingreso), 0);

  // ---- Comparativa con el mes anterior (para el informe / PDF) ----
  const mesAnteriorRef = new Date(mesSeleccionado.getFullYear(), mesSeleccionado.getMonth() - 1, 1);
  const nombreMesAnterior = mesAnteriorRef.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const movMesAnterior = filas.filter((m) => mismoMes(m.fecha, mesAnteriorRef));
  const ingresosMesAnterior = movMesAnterior.reduce((s, m) => s + Number(m.ingreso), 0);
  const gastosMesAnterior = movMesAnterior.reduce((s, m) => s + Number(m.gasto), 0);
  const ahorroMesAnterior = ingresosMesAnterior - gastosMesAnterior;

  // ---- Gráfico de tarta: en qué se ha ido el dinero este mes ----
  const PALETA_TARTA = ["#75978f", "#a08384", "#a9aa85", "#c0392b", "#5c7d76", "#d9a25c", "#7c9caf", "#8e7cc3", "#b0aa8f"];
  function claseDeGasto(m) {
    if (gastosFijos.some((gf) => m.concepto.toLowerCase().includes(gf.concepto.toLowerCase()))) {
      return "Gastos fijos";
    }
    if (m.categoria_id) {
      const cat = presupuestoVariable.find((c) => c.id === m.categoria_id);
      if (cat) return cat.concepto;
    }
    const catTexto = presupuestoVariable.find((c) => m.concepto.toLowerCase().includes(palabraClave(c.concepto)));
    return catTexto ? catTexto.concepto : "Otros";
  }
  const bucketsTarta = {};
  movDelMes
    .filter((m) => Number(m.gasto) > 0)
    .forEach((m) => {
      const clase = claseDeGasto(m);
      bucketsTarta[clase] = (bucketsTarta[clase] || 0) + Number(m.gasto);
    });
  const sliceTarta = Object.entries(bucketsTarta)
    .map(([label, value], i) => ({ label, value, color: PALETA_TARTA[i % PALETA_TARTA.length] }))
    .sort((a, b) => b.value - a.value);
  const totalTarta = sliceTarta.reduce((s, x) => s + x.value, 0);

  function pathsTarta(slices, size) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0) return [];
    const radio = size / 2;
    let anguloActual = -90;
    return slices.map((sl) => {
      const angulo = (sl.value / total) * 360;
      const x1 = radio + radio * Math.cos((anguloActual * Math.PI) / 180);
      const y1 = radio + radio * Math.sin((anguloActual * Math.PI) / 180);
      anguloActual += angulo;
      const x2 = radio + radio * Math.cos((anguloActual * Math.PI) / 180);
      const y2 = radio + radio * Math.sin((anguloActual * Math.PI) / 180);
      const largeArc = angulo > 180 ? 1 : 0;
      const d =
        angulo >= 359.999
          ? `M ${radio} 0 A ${radio} ${radio} 0 1 1 ${radio - 0.01} 0 Z`
          : `M ${radio} ${radio} L ${x1} ${y1} A ${radio} ${radio} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { d, color: sl.color };
    });
  }

  return (
    <div className="container">
      <h1>Mis Cuentas</h1>
      <p className="subtitle">Tarjeta y ahorro, todo junto en un solo número.</p>

      {error && (
        <div className="card error-msg" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="card saldo-actual">
        <div className="label">Tienes ahora mismo</div>
        <div className="valor">{loading ? "…" : money(saldoActual)}</div>
        {!editandoSaldo ? (
          <div className="editar-saldo" style={{ justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                setNuevoSaldoInicial(String(saldoInicial));
                setEditandoSaldo(true);
              }}
              style={{ background: "transparent", color: "#2f5496" }}
            >
              Corregir saldo de partida
            </button>
          </div>
        ) : (
          <div className="editar-saldo" style={{ justifyContent: "center" }}>
            <input
              type="number"
              step="0.01"
              value={nuevoSaldoInicial}
              onChange={(e) => setNuevoSaldoInicial(e.target.value)}
            />
            <button type="button" onClick={guardarSaldoInicial}>Guardar</button>
          </div>
        )}
      </div>

      <div className={"card tarjeta-hoy" + (ingresosHoy.length || gastosHoy.length ? " con-eventos" : "")}>
        <strong style={{ textTransform: "capitalize" }}>
          Hoy, {hoy.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
        </strong>
        {ingresosHoy.length === 0 && gastosHoy.length === 0 ? (
          <p className="subtitle" style={{ margin: "8px 0 0" }}>
            No tienes ningún ingreso ni gasto fijo previsto para hoy.
          </p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {ingresosHoy.map((iff) => (
              <div key={"ing-" + iff.id} className="hoy-item ingreso">
                <span>🎉 Hoy cobras: {iff.concepto}</span>
                <span className="gf-right">
                  {money(iff.importe)}
                  <button type="button" className="mini-btn" onClick={() => registrarIngresoRapido(iff)}>
                    Apuntar
                  </button>
                </span>
              </div>
            ))}
            {gastosHoy.map((gf) => (
              <div key={"gas-" + gf.id} className="hoy-item gasto">
                <span>💸 Hoy se te cobra: {gf.concepto}</span>
                <span className="gf-right">
                  {money(gf.importe)}
                  <button type="button" className="mini-btn" onClick={() => registrarRapido(gf)}>
                    Apuntar
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="selector-mes">
        <button type="button" className="mes-btn" onClick={mesAnterior}>‹</button>
        <span className="mes-actual" style={{ textTransform: "capitalize" }}>{nombreMes}</span>
        <button type="button" className="mes-btn" onClick={mesSiguiente}>›</button>
        {!esMesActual && (
          <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={irAHoy}>
            volver a hoy
          </button>
        )}
      </div>

      <div className="card solo-imprimir">
        <strong style={{ textTransform: "capitalize" }}>Informe — {nombreMes}</strong>
        <table style={{ marginTop: 10, marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num">{nombreMes}</th>
              <th className="num" style={{ textTransform: "capitalize" }}>{nombreMesAnterior}</th>
              <th className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ingresos</td>
              <td className="num">{money(ingresosMes)}</td>
              <td className="num">{money(ingresosMesAnterior)}</td>
              <td className="num">{money(ingresosMes - ingresosMesAnterior)}</td>
            </tr>
            <tr>
              <td>Gastos</td>
              <td className="num">{money(gastosMes)}</td>
              <td className="num">{money(gastosMesAnterior)}</td>
              <td className="num">{money(gastosMes - gastosMesAnterior)}</td>
            </tr>
            <tr>
              <td>Ahorro real</td>
              <td className="num">{money(ahorroRealMes)}</td>
              <td className="num">{money(ahorroMesAnterior)}</td>
              <td className="num">{money(ahorroRealMes - ahorroMesAnterior)}</td>
            </tr>
          </tbody>
        </table>

        <strong>En qué se ha ido el dinero este mes</strong>
        {totalTarta === 0 ? (
          <p className="subtitle">Todavía no hay gastos este mes.</p>
        ) : (
          <div className="tarta-wrap">
            <svg viewBox="0 0 180 180" width="180" height="180">
              {pathsTarta(sliceTarta, 180).map((p, i) => (
                <path key={i} d={p.d} fill={p.color} />
              ))}
            </svg>
            <div className="tarta-leyenda">
              {sliceTarta.map((sl, i) => (
                <div key={i} className="tarta-leyenda-item">
                  <span className="tarta-punto" style={{ background: sl.color }} />
                  <span style={{ flex: 1 }}>{sl.label}</span>
                  <span>{money(sl.value)}</span>
                  <span className="subtitle" style={{ minWidth: 40, textAlign: "right" }}>
                    {((sl.value / totalTarta) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={"card resumen-mes" + (enMeta ? " en-meta" : " fuera-meta")}>
        <div className="resumen-mes-header">
          <strong>Tu presupuesto de este mes</strong>
          <span className={"pill" + (enMeta ? " verde" : " rojo")}>
            {enMeta ? "Vas dentro de presupuesto" : "Te has pasado"}
          </span>
        </div>

        <div className="presupuesto-linea">
          <span>
            Ingresos previstos
            {!editandoIngPrevistos && (
              <button
                type="button"
                className="link-btn"
                style={{ marginLeft: 6 }}
                onClick={() => {
                  setIngPrevistosInput(String(ingresosPrevistos));
                  setEditandoIngPrevistos(true);
                }}
              >
                editar
              </button>
            )}
          </span>
          <span>{money(ingresosPrevistos)}</span>
        </div>
        {overrideMes && !editandoIngPrevistos && (
          <div className="var-item-bottom" style={{ marginTop: -6, marginBottom: 8 }}>
            Ajustado solo para {nombreMes} (normalmente {money(ingresosPrevistosDefault)})
          </div>
        )}
        {editandoIngPrevistos && (
          <div className="editar-saldo" style={{ marginBottom: 10 }}>
            <input
              type="number"
              step="0.01"
              value={ingPrevistosInput}
              onChange={(e) => setIngPrevistosInput(e.target.value)}
            />
            <button type="button" onClick={guardarIngresosPrevistosMes}>Guardar</button>
            {overrideMes && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  quitarOverrideIngresosMes();
                  setEditandoIngPrevistos(false);
                }}
              >
                usar el normal
              </button>
            )}
          </div>
        )}
        <div className="presupuesto-linea resta">
          <span>− Gastos fijos</span>
          <span>{money(gastosFijosPrevistos)}</span>
        </div>
        <div className="presupuesto-linea resta">
          <span>
            − Tu meta de ahorro
            {!editandoMeta && (
              <button
                type="button"
                className="link-btn"
                style={{ marginLeft: 6 }}
                onClick={() => {
                  setMetaMinInput(String(metaMin));
                  setMetaMaxInput(String(metaMax));
                  setEditandoMeta(true);
                }}
              >
                editar
              </button>
            )}
          </span>
          <span>{money(metaMin)}</span>
        </div>
        {editandoMeta && (
          <div className="editar-saldo" style={{ marginBottom: 10 }}>
            <input type="number" step="1" value={metaMinInput} onChange={(e) => setMetaMinInput(e.target.value)} />
            <span>—</span>
            <input type="number" step="1" value={metaMaxInput} onChange={(e) => setMetaMaxInput(e.target.value)} />
            <button type="button" onClick={guardarMeta}>Guardar</button>
          </div>
        )}
        <div className="presupuesto-linea total">
          <span>= Disponible para gastar</span>
          <span>{money(disponibleParaGastar)}</span>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="var-item-top">
            <span>Gastado hasta ahora</span>
            <span className={restaDisponible < 0 ? "var-resta negativo" : "var-resta"}>
              {restaDisponible < 0
                ? `Te has pasado ${money(Math.abs(restaDisponible))}`
                : `Te quedan ${money(restaDisponible)}`}
            </span>
          </div>
          <div className="barra-fondo">
            <div
              className={"barra-relleno" + (restaDisponible < 0 ? " excedido" : "")}
              style={{ width: `${porcentajeDisponible}%` }}
            />
          </div>
          <div className="var-item-bottom">
            {money(gastadoVariableReal)} de {money(disponibleParaGastar)}
          </div>
        </div>

        <div className="ahorro-real-linea">
          Ahorro real hasta ahora (ingresos − gastos que ya has metido): <strong>{money(ahorroRealMes)}</strong>
        </div>
      </div>

      <div className="card">
        <strong>Gastos fijos de este mes</strong>
        <p className="subtitle" style={{ margin: "6px 0 12px" }}>
          Toca uno pendiente para apuntarlo con un clic (usa el importe de siempre y la fecha de hoy).
        </p>
        {gastosFijosConEstado.map((gf) => (
          <div key={gf.id} className={"gf-item" + (gf.registrado ? " ok" : "")}>
            <span>
              {gf.registrado ? "✓" : "○"} {gf.concepto} <span className="dia">· día {gf.dia}</span>
            </span>
            <span className="gf-right">
              {money(gf.importe)}
              {!gf.registrado && (
                <button type="button" className="mini-btn" onClick={() => registrarRapido(gf)}>
                  Apuntar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Gastos variables de este mes</strong>
        <p className="subtitle" style={{ margin: "6px 0 12px" }}>
          Se rellena solo con lo que escribes abajo en "Añadir movimiento" si el concepto se parece al nombre de la categoría.
        </p>
        {variablesConGasto.map((cat) => {
          const abierta = categoriaAbiertaId === cat.id;
          return (
            <div key={cat.id} className="var-item">
              <button
                type="button"
                className="var-item-clicable"
                onClick={() => setCategoriaAbiertaId(abierta ? null : cat.id)}
              >
                <div className="var-item-top">
                  <span>{abierta ? "▾" : "▸"} {cat.concepto}</span>
                  <span className={cat.resta < 0 ? "var-resta negativo" : "var-resta"}>
                    {cat.resta < 0
                      ? `Te has pasado ${money(Math.abs(cat.resta))}`
                      : `Te quedan ${money(cat.resta)}`}
                  </span>
                </div>
                <div className="barra-fondo">
                  <div
                    className={"barra-relleno" + (cat.resta < 0 ? " excedido" : "")}
                    style={{ width: `${cat.porcentaje}%` }}
                  />
                </div>
                <div className="var-item-bottom">
                  {money(cat.gastado)} de {money(cat.importe)}
                </div>
              </button>
              {abierta && (
                <div className="var-desplegable">
                  {cat.movimientos.length === 0 ? (
                    <div className="var-item-bottom">Todavía no has metido ningún gasto aquí este mes.</div>
                  ) : (
                    cat.movimientos.map((m) => (
                      <div key={m.id} className="var-mov-item">
                        <span>{new Date(m.fecha).toLocaleDateString("es-ES")} · {m.concepto}</span>
                        <span>{money(m.gasto)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card no-imprimir">
        <strong>Añadir movimiento</strong>
        <form className="nuevo" onSubmit={guardarMovimiento}>
          <div className="tipo-toggle">
            <button type="button" className={tipo === "gasto" ? "activo gasto" : ""} onClick={() => setTipo("gasto")}>
              Gasto
            </button>
            <button type="button" className={tipo === "ingreso" ? "activo ingreso" : ""} onClick={() => setTipo("ingreso")}>
              Ingreso
            </button>
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label>Importe (€)</label>
            <input type="number" step="0.01" placeholder="0.00" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </div>
          <div className="full">
            <label>Concepto</label>
            <input type="text" placeholder="p.ej. comida, coche, paro..." value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          {tipo === "gasto" && (
            <div className="full">
              <label>Categoría (opcional)</label>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sin categoría / gasto fijo</option>
                {presupuestoVariable.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.concepto}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit">Añadir</button>
          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>

      <div className="card">
        <div className="resumen-mes-header">
          <strong>Movimientos</strong>
          <button type="button" className="link-btn" onClick={() => setMostrarTodosMovs((v) => !v)}>
            {mostrarTodosMovs ? "ver solo este mes" : "ver todos"}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th className="num">Gasto</th>
              <th className="num">Ingreso</th>
              <th className="num">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listaMovsMostrada.map((m) =>
              movEditandoId === m.id ? (
                <FilaMovimientoEditable
                  key={m.id}
                  m={m}
                  categorias={presupuestoVariable}
                  onGuardar={actualizarMovimiento}
                  onCancelar={() => setMovEditandoId(null)}
                />
              ) : (
                <tr key={m.id}>
                  <td>{new Date(m.fecha).toLocaleDateString("es-ES")}</td>
                  <td>{m.concepto}</td>
                  <td className="num gasto">{Number(m.gasto) ? money(m.gasto) : ""}</td>
                  <td className="num ingreso">{Number(m.ingreso) ? money(m.ingreso) : ""}</td>
                  <td className="num saldo-col">{money(m.saldo)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="mini-btn" onClick={() => setMovEditandoId(m.id)}>
                      editar
                    </button>{" "}
                    <button className="borrar" onClick={() => borrar(m.id)}>✕</button>
                  </td>
                </tr>
              )
            )}
            {!loading && listaMovsMostrada.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#888", padding: "16px 0" }}>
                  {mostrarTodosMovs
                    ? "Todavía no has añadido ningún movimiento."
                    : "No hay movimientos este mes."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="fila-totales">
              <td colSpan={2}>Total</td>
              <td className="num gasto">{money(totalGastoLista)}</td>
              <td className="num ingreso">{money(totalIngresoLista)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card no-imprimir">
        <button type="button" className="link-btn" onClick={() => setMostrarGestionVar((v) => !v)}>
          {mostrarGestionVar ? "Ocultar gestión de gastos variables" : "Gestionar mis categorías de gastos variables"}
        </button>
        {mostrarGestionVar && (
          <div style={{ marginTop: 12 }}>
            {presupuestoVariable.map((cat) => (
              <CategoriaEditable key={cat.id} cat={cat} onGuardar={actualizarCat} onBorrar={borrarCat} />
            ))}
            <form className="nuevo" onSubmit={anadirCat} style={{ marginTop: 16 }}>
              <div className="full">
                <label>Categoría nueva</label>
                <input
                  type="text"
                  value={nuevaCat.concepto}
                  onChange={(e) => setNuevaCat({ ...nuevaCat, concepto: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Presupuesto mensual (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevaCat.importe}
                  onChange={(e) => setNuevaCat({ ...nuevaCat, importe: e.target.value })}
                />
              </div>
              <button type="submit">Añadir categoría</button>
            </form>
          </div>
        )}
      </div>

      <div className="card no-imprimir">
        <button type="button" className="link-btn" onClick={() => setMostrarGestionIng((v) => !v)}>
          {mostrarGestionIng ? "Ocultar gestión de ingresos fijos" : "Gestionar mis ingresos fijos (el Paro, etc.)"}
        </button>
        {mostrarGestionIng && (
          <div style={{ marginTop: 12 }}>
            {ingresosFijos.map((iff) => (
              <GastoFijoEditable key={iff.id} gf={iff} onGuardar={actualizarIF} onBorrar={borrarIF} />
            ))}
            <form className="nuevo" onSubmit={anadirIF} style={{ marginTop: 16 }}>
              <div>
                <label>Concepto nuevo</label>
                <input
                  type="text"
                  value={nuevoIF.concepto}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, concepto: e.target.value })}
                />
              </div>
              <div>
                <label>Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevoIF.importe}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, importe: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Día del mes</label>
                <input
                  type="text"
                  placeholder="p.ej. 10"
                  value={nuevoIF.dia}
                  onChange={(e) => setNuevoIF({ ...nuevoIF, dia: e.target.value })}
                />
              </div>
              <button type="submit">Añadir ingreso fijo</button>
            </form>
          </div>
        )}
      </div>

      <div className="card no-imprimir">
        <button type="button" className="link-btn" onClick={() => setMostrarGestion((v) => !v)}>
          {mostrarGestion ? "Ocultar gestión de gastos fijos" : "Gestionar mis gastos fijos (añadir, editar, borrar)"}
        </button>
        {mostrarGestion && (
          <div style={{ marginTop: 12 }}>
            {gastosFijos.map((gf) => (
              <GastoFijoEditable key={gf.id} gf={gf} onGuardar={actualizarGF} onBorrar={borrarGF} />
            ))}
            <form className="nuevo" onSubmit={anadirGF} style={{ marginTop: 16 }}>
              <div>
                <label>Concepto nuevo</label>
                <input
                  type="text"
                  value={nuevoGF.concepto}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, concepto: e.target.value })}
                />
              </div>
              <div>
                <label>Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={nuevoGF.importe}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, importe: e.target.value })}
                />
              </div>
              <div className="full">
                <label>Día del mes</label>
                <input
                  type="text"
                  placeholder="p.ej. 1, 1-5, variable..."
                  value={nuevoGF.dia}
                  onChange={(e) => setNuevoGF({ ...nuevoGF, dia: e.target.value })}
                />
              </div>
              <button type="submit">Añadir gasto fijo</button>
            </form>
          </div>
        )}
      </div>

      <div className="card no-imprimir">
        <strong>Exportar mis datos</strong>
        <p className="subtitle" style={{ margin: "6px 0 12px" }}>
          El Excel lleva varias pestañas (Resumen, Movimientos, Gastos Fijos, Gastos Variables). El PDF es un informe con la comparativa del mes anterior y el gráfico de gastos.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={exportarExcel} style={{ flex: 1 }}>
            📊 Descargar Excel
          </button>
          <button type="button" onClick={exportarPDF} style={{ flex: 1 }}>
            🖨️ Exportar a PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function GastoFijoEditable({ gf, onGuardar, onBorrar }) {
  const [local, setLocal] = useState(gf);
  const cambiado =
    local.concepto !== gf.concepto || Number(local.importe) !== Number(gf.importe) || local.dia !== gf.dia;
  return (
    <div className="gf-editable">
      <input
        type="text"
        value={local.concepto}
        onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
      />
      <input
        type="number"
        step="0.01"
        value={local.importe}
        onChange={(e) => setLocal({ ...local, importe: e.target.value })}
      />
      <input
        type="text"
        value={local.dia}
        onChange={(e) => setLocal({ ...local, dia: e.target.value })}
      />
      {cambiado && (
        <button type="button" className="mini-btn" onClick={() => onGuardar(local)}>
          Guardar
        </button>
      )}
      <button type="button" className="borrar" onClick={() => onBorrar(gf.id)}>✕</button>
    </div>
  );
}

function CategoriaEditable({ cat, onGuardar, onBorrar }) {
  const [local, setLocal] = useState(cat);
  const cambiado = local.concepto !== cat.concepto || Number(local.importe) !== Number(cat.importe);
  return (
    <div className="gf-editable cat-editable">
      <input
        type="text"
        value={local.concepto}
        onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
      />
      <input
        type="number"
        step="0.01"
        value={local.importe}
        onChange={(e) => setLocal({ ...local, importe: e.target.value })}
      />
      {cambiado && (
        <button type="button" className="mini-btn" onClick={() => onGuardar(local)}>
          Guardar
        </button>
      )}
      <button type="button" className="borrar" onClick={() => onBorrar(cat.id)}>✕</button>
    </div>
  );
}

function FilaMovimientoEditable({ m, categorias, onGuardar, onCancelar }) {
  const [local, setLocal] = useState({
    fecha: m.fecha ? new Date(m.fecha).toISOString().slice(0, 10) : "",
    concepto: m.concepto,
    tipo: Number(m.gasto) > 0 ? "gasto" : "ingreso",
    importe: Number(m.gasto) > 0 ? m.gasto : m.ingreso,
    categoriaId: m.categoria_id || "",
  });
  return (
    <tr>
      <td colSpan={6}>
        <div className="fila-edit">
          <div className="tipo-toggle" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={local.tipo === "gasto" ? "activo gasto" : ""}
              onClick={() => setLocal({ ...local, tipo: "gasto" })}
            >
              Gasto
            </button>
            <button
              type="button"
              className={local.tipo === "ingreso" ? "activo ingreso" : ""}
              onClick={() => setLocal({ ...local, tipo: "ingreso" })}
            >
              Ingreso
            </button>
          </div>
          <input
            type="date"
            value={local.fecha}
            onChange={(e) => setLocal({ ...local, fecha: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            value={local.importe}
            onChange={(e) => setLocal({ ...local, importe: e.target.value })}
          />
          <input
            type="text"
            value={local.concepto}
            onChange={(e) => setLocal({ ...local, concepto: e.target.value })}
          />
          {local.tipo === "gasto" && (
            <select
              value={local.categoriaId}
              onChange={(e) => setLocal({ ...local, categoriaId: e.target.value })}
            >
              <option value="">Sin categoría / gasto fijo</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.concepto}</option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => onGuardar({ ...local, id: m.id })}>Guardar</button>
            <button type="button" className="link-btn" onClick={onCancelar}>Cancelar</button>
          </div>
        </div>
      </td>
    </tr>
  );
}
