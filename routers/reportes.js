/**
 *  ROUTER: REPORTES EJECUTIVOS  (/api/reportes)
 *  Actor principal: Gerente  (CU14 - RF15)

 *  GET /ejecutivo?anio=AAAA   Tablero gerencial completo:
 *      - Indicadores clave (cartera, mora, desembolsos, recaudación)
 *      - Serie mensual de desembolsos y recaudaciones
 *      - Cartera por producto, solicitudes por estado
 *      - Antigüedad de la mora (aging), principales deudores morosos
 *      - Rendimiento de oficiales, analistas y cajeros
 *  GET /recaudacion?desde&hasta   Detalle de recaudación diaria
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { actualizarMora } = require('../utils/mora');
const { PRODUCTOS } = require('../utils/parametros');
const { redondear } = require('../utils/finanzas');

const router = express.Router();
router.use(proteger('GERENTE', 'ADMIN'));

/* GET /ejecutivo ------------------------------------------------------------ */
router.get('/ejecutivo', async (req, res) => {
  const anioActual = new Date().getFullYear();
  const anio = /^\d{4}$/.test(String(req.query.anio)) ? String(req.query.anio) : String(anioActual);
  await actualizarMora();

  // --- Indicadores clave de cartera ---
  const cartera = await db.obtener(`
    SELECT
      COALESCE(SUM(CASE WHEN estado IN ('VIGENTE','EN_MORA') THEN saldo_capital END), 0) AS cartera_total,
      COALESCE(SUM(CASE WHEN estado = 'VIGENTE' THEN saldo_capital END), 0) AS cartera_vigente,
      COALESCE(SUM(CASE WHEN estado = 'EN_MORA' THEN saldo_capital END), 0) AS cartera_mora,
      SUM(CASE WHEN estado = 'VIGENTE' THEN 1 ELSE 0 END) AS creditos_vigentes,
      SUM(CASE WHEN estado = 'EN_MORA' THEN 1 ELSE 0 END) AS creditos_mora,
      SUM(CASE WHEN estado = 'CANCELADO' THEN 1 ELSE 0 END) AS creditos_cancelados,
      SUM(CASE WHEN estado = 'PENDIENTE_DESEMBOLSO' THEN 1 ELSE 0 END) AS pendientes_desembolso,
      COALESCE(SUM(CASE WHEN fecha_desembolso IS NOT NULL THEN monto_aprobado END), 0) AS total_desembolsado,
      COALESCE(SUM(CASE WHEN strftime('%Y', fecha_desembolso) = ? THEN monto_aprobado END), 0) AS desembolsado_anio
    FROM credito`, [anio]);

  const recaudacion = await db.obtener(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(fecha_pago) = DATE('now','localtime') THEN monto_total END), 0) AS hoy,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', fecha_pago) = strftime('%Y-%m','now','localtime') THEN monto_total END), 0) AS mes,
      COALESCE(SUM(CASE WHEN strftime('%Y', fecha_pago) = ? THEN monto_total END), 0) AS anio,
      COALESCE(SUM(CASE WHEN strftime('%Y', fecha_pago) = ? THEN monto_interes END), 0) AS intereses_anio,
      COALESCE(SUM(CASE WHEN strftime('%Y', fecha_pago) = ? THEN monto_recargo END), 0) AS recargos_anio,
      COUNT(CASE WHEN DATE(fecha_pago) = DATE('now','localtime') THEN 1 END) AS pagos_hoy
    FROM pago`, [anio, anio, anio]);

  const clientes = await db.obtener(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN strftime('%Y-%m', fecha_registro) = strftime('%Y-%m','now','localtime') THEN 1 ELSE 0 END) AS nuevos_mes
      FROM cliente`);

  const indiceMora = cartera.cartera_total > 0 ? redondear((cartera.cartera_mora / cartera.cartera_total) * 100) : 0;

  // --- Serie mensual (12 meses del año seleccionado) ---
  const desembolsosMes = await db.todos(
    `SELECT CAST(strftime('%m', fecha_desembolso) AS INTEGER) AS mes, COUNT(*) AS cantidad, SUM(monto_aprobado) AS monto
       FROM credito WHERE strftime('%Y', fecha_desembolso) = ? GROUP BY mes`, [anio]);
  const recaudacionMes = await db.todos(
    `SELECT CAST(strftime('%m', fecha_pago) AS INTEGER) AS mes, COUNT(*) AS cantidad, SUM(monto_total) AS monto
       FROM pago WHERE strftime('%Y', fecha_pago) = ? GROUP BY mes`, [anio]);
  const serieMensual = Array.from({ length: 12 }, (_, i) => {
    const d = desembolsosMes.find((f) => f.mes === i + 1);
    const r = recaudacionMes.find((f) => f.mes === i + 1);
    return { mes: i + 1, desembolsos: redondear(d?.monto || 0), cantidad_desembolsos: d?.cantidad || 0, recaudacion: redondear(r?.monto || 0), cantidad_pagos: r?.cantidad || 0 };
  });

  // --- Cartera por producto ---
  const porProducto = (await db.todos(`
    SELECT tipo_credito, COUNT(*) AS creditos, SUM(saldo_capital) AS saldo, SUM(monto_aprobado) AS desembolsado,
           SUM(CASE WHEN estado = 'EN_MORA' THEN saldo_capital ELSE 0 END) AS saldo_mora
      FROM vista_cartera WHERE estado IN ('VIGENTE','EN_MORA') GROUP BY tipo_credito ORDER BY saldo DESC`))
    .map((f) => ({ ...f, producto: PRODUCTOS[f.tipo_credito]?.nombre || f.tipo_credito }));

  // --- Embudo de solicitudes ---
  const solicitudesEstado = await db.todos('SELECT estado, COUNT(*) AS total, SUM(monto_solicitado) AS monto FROM solicitud_credito GROUP BY estado');

  // --- Antigüedad de la mora (aging por crédito) ---
  const aging = await db.obtener(`
    SELECT
      COALESCE(SUM(CASE WHEN dias BETWEEN 1 AND 30 THEN saldo END), 0) AS r1_30,
      COALESCE(SUM(CASE WHEN dias BETWEEN 31 AND 60 THEN saldo END), 0) AS r31_60,
      COALESCE(SUM(CASE WHEN dias BETWEEN 61 AND 90 THEN saldo END), 0) AS r61_90,
      COALESCE(SUM(CASE WHEN dias > 90 THEN saldo END), 0) AS r90_mas,
      COUNT(CASE WHEN dias BETWEEN 1 AND 30 THEN 1 END) AS c1_30,
      COUNT(CASE WHEN dias BETWEEN 31 AND 60 THEN 1 END) AS c31_60,
      COUNT(CASE WHEN dias BETWEEN 61 AND 90 THEN 1 END) AS c61_90,
      COUNT(CASE WHEN dias > 90 THEN 1 END) AS c90_mas
    FROM (SELECT saldo_capital AS saldo, CAST(julianday('now','localtime') - julianday(primera_vencida) AS INTEGER) AS dias
            FROM vista_cartera WHERE estado = 'EN_MORA')`);

  const topMorosos = await db.todos(`
    SELECT numero_credito, cliente, ci, cuotas_vencidas, monto_vencido, saldo_capital,
           CAST(julianday('now','localtime') - julianday(primera_vencida) AS INTEGER) AS dias_mora
      FROM vista_cartera WHERE estado = 'EN_MORA' ORDER BY monto_vencido DESC LIMIT 8`);

  // --- Rendimiento del personal ---
  const oficiales = await db.todos(`
    SELECT u.nombre_completo AS nombre,
      (SELECT COUNT(*) FROM cliente c WHERE c.id_oficial = u.id_usuario) AS clientes,
      (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_oficial = u.id_usuario) AS solicitudes,
      (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_oficial = u.id_usuario AND s.estado IN ('APROBADA','DESEMBOLSADA')) AS aprobadas,
      (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_oficial = u.id_usuario AND s.estado = 'RECHAZADA') AS rechazadas,
      (SELECT COALESCE(SUM(v.monto_aprobado),0) FROM vista_cartera v WHERE v.id_oficial = u.id_usuario AND v.fecha_desembolso IS NOT NULL) AS monto_colocado,
      (SELECT COALESCE(SUM(v.saldo_capital),0) FROM vista_cartera v WHERE v.id_oficial = u.id_usuario AND v.estado = 'EN_MORA') AS cartera_mora
    FROM usuario u WHERE u.rol = 'OFICIAL' ORDER BY monto_colocado DESC`);

  const analistas = await db.todos(`
    SELECT u.nombre_completo AS nombre, COUNT(e.id_evaluacion) AS evaluaciones,
           SUM(CASE WHEN e.dictamen = 'FAVORABLE' THEN 1 ELSE 0 END) AS favorables,
           SUM(CASE WHEN e.dictamen = 'NO_FAVORABLE' THEN 1 ELSE 0 END) AS no_favorables
      FROM usuario u LEFT JOIN evaluacion_credito e ON e.id_analista = u.id_usuario
     WHERE u.rol = 'ANALISTA' GROUP BY u.id_usuario ORDER BY evaluaciones DESC`);

  const cajeros = await db.todos(`
    SELECT u.nombre_completo AS nombre, COUNT(p.id_pago) AS pagos, COALESCE(SUM(p.monto_total),0) AS recaudado,
           COALESCE(SUM(CASE WHEN strftime('%Y-%m', p.fecha_pago) = strftime('%Y-%m','now','localtime') THEN p.monto_total END),0) AS recaudado_mes
      FROM usuario u LEFT JOIN pago p ON p.id_cajero = u.id_usuario
     WHERE u.rol = 'CAJERO' GROUP BY u.id_usuario ORDER BY recaudado DESC`);

  const aniosDisponibles = (await db.todos(`
    SELECT DISTINCT strftime('%Y', fecha_desembolso) AS anio FROM credito WHERE fecha_desembolso IS NOT NULL
    UNION SELECT DISTINCT strftime('%Y', fecha_pago) FROM pago ORDER BY anio DESC`)).map((f) => f.anio);
  if (!aniosDisponibles.includes(String(anioActual))) aniosDisponibles.unshift(String(anioActual));

  res.json({
    anio,
    anios_disponibles: aniosDisponibles,
    indicadores: { ...cartera, indice_mora: indiceMora, recaudacion, clientes },
    serie_mensual: serieMensual,
    por_producto: porProducto,
    solicitudes_estado: solicitudesEstado,
    aging,
    top_morosos: topMorosos,
    rendimiento: { oficiales, analistas, cajeros }
  });
});

/* GET /recaudacion ---------------------------------------------------------- */
router.get('/recaudacion', async (req, res) => {
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : null;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : null;
  const filas = await db.todos(
    `SELECT DATE(fecha_pago) AS fecha, COUNT(*) AS pagos, SUM(monto_capital) AS capital, SUM(monto_interes) AS interes,
            SUM(monto_recargo) AS recargo, SUM(monto_total) AS total
       FROM pago
      WHERE DATE(fecha_pago) >= DATE(COALESCE(?, DATE('now','localtime','-30 days')))
        AND DATE(fecha_pago) <= DATE(COALESCE(?, DATE('now','localtime')))
      GROUP BY DATE(fecha_pago) ORDER BY fecha DESC`,
    [desde, hasta]
  );
  res.json(filas);
});

module.exports = router;
