/**
 *  ROUTER: EVALUACIÓN CREDITICIA  (/api/evaluaciones)
 *  Actor principal: Analista de Crédito  (CU03 - CU04 - CU05)

 *  GET  /bandeja                     Solicitudes EN_EVALUACION + indicadores
 *  GET  /realizadas                  Evaluaciones emitidas por el analista
 *  GET  /solicitud/:id               Expediente completo + pre-cálculo de riesgo
 *  POST /solicitud/:id/historial     Consultar/enlazar historial en el Core Bancario
 *  POST /solicitud/:id/dictamen      Emitir dictamen FAVORABLE / NO_FAVORABLE

 *  INTEGRACIÓN CON EL CORE BANCARIO (simulada):
 *  El "Sistema de Riesgo Crediticio" es un actor externo. Para fines
 *  académicos se simula de forma DETERMINÍSTICA a partir del CI (el mismo
 *  cliente siempre obtiene el mismo resultado externo) y se combina con el
 *  comportamiento REAL del cliente dentro de esta entidad (créditos, mora y
 *  atrasos registrados), generando un historial ÚNICO por cliente (RN14).
 */
const crypto = require('crypto');
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { calcularCuotaFija, evaluarCapacidad, redondear, fechaHoraAhora } = require('../utils/finanzas');
const { obtenerDetalleSolicitud } = require('../utils/consultas');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();
router.use(proteger('ANALISTA'));

/** Generador pseudoaleatorio determinístico a partir de una semilla de texto */
function generadorDesde(semilla) {
  const bytes = crypto.createHash('sha256').update(String(semilla)).digest();
  let posicion = 0;
  return () => {
    const valor = bytes.readUInt16BE(posicion % 30) / 65535;
    posicion += 2;
    return valor;
  };
}

/** Determina la calificación (A-F) según días de mora y mora actual */
function calificar(diasMoraMax, enMoraActual) {
  if (enMoraActual) return diasMoraMax > 90 ? 'F' : diasMoraMax > 30 ? 'E' : 'D';
  if (diasMoraMax === 0) return 'A';
  if (diasMoraMax <= 15) return 'B';
  if (diasMoraMax <= 30) return 'C';
  if (diasMoraMax <= 60) return 'D';
  if (diasMoraMax <= 90) return 'E';
  return 'F';
}

/** Rango de puntaje (score) por calificación */
const RANGO_PUNTAJE = { A: [780, 850], B: [700, 779], C: [620, 699], D: [540, 619], E: [450, 539], F: [300, 449] };

/**
 * Consulta el historial del cliente: datos externos (simulados) + internos (reales).
 */
async function consultarCoreBancario(cliente) {
  const azar = generadorDesde(`core-${cliente.ci}`);

  // --- Información EXTERNA (otras entidades del sistema financiero) ---
  const entidades = Math.floor(azar() * 4);
  const deudaExterna = entidades ? redondear(cliente.ingresos_mensuales * (1 + azar() * 5) * entidades * 0.6) : 0;
  const cuotaExterna = entidades ? redondear(deudaExterna / (12 + Math.floor(azar() * 24))) : 0;
  const previosExternos = Math.floor(azar() * 6);
  const moraExternaMax = azar() < 0.7 ? 0 : Math.floor(azar() * 75);
  const moraExternaActual = azar() < 0.08;

  // --- Información INTERNA (comportamiento real en esta entidad) ---
  const interno = await db.obtener(
    `SELECT COUNT(DISTINCT cr.id_credito) AS creditos,
            COALESCE(MAX(q.dias_atraso), 0) AS dias_mora_max,
            SUM(CASE WHEN cr.estado = 'EN_MORA' THEN 1 ELSE 0 END) AS en_mora
       FROM credito cr
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
       LEFT JOIN cuota q ON q.id_credito = cr.id_credito
      WHERE s.id_cliente = ? AND cr.estado <> 'PENDIENTE_DESEMBOLSO'`,
    [cliente.id_cliente]
  );
  const deudaInterna = await db.obtener(
    `SELECT COALESCE(SUM(cr.saldo_capital), 0) AS saldo, COALESCE(SUM(cr.cuota_mensual), 0) AS cuota
       FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE s.id_cliente = ? AND cr.estado IN ('VIGENTE','EN_MORA')`,
    [cliente.id_cliente]
  );

  const diasMoraMax = Math.max(moraExternaMax, interno.dias_mora_max || 0);
  const enMoraActual = moraExternaActual || (interno.en_mora || 0) > 0;
  const calificacion = calificar(diasMoraMax, enMoraActual);
  const [minimo, maximo] = RANGO_PUNTAJE[calificacion];
  const puntaje = Math.round(minimo + azar() * (maximo - minimo));

  const observaciones = [];
  if (!entidades && !previosExternos && !interno.creditos) observaciones.push('Cliente sin historial crediticio previo (primer crédito).');
  if (entidades) observaciones.push(`Mantiene deudas vigentes en ${entidades} entidad(es) externa(s).`);
  if (deudaInterna.saldo > 0) observaciones.push(`Saldo vigente en esta entidad: Bs ${deudaInterna.saldo.toFixed(2)}.`);
  if (enMoraActual) observaciones.push('ALERTA: registra mora vigente a la fecha de consulta.');
  if (diasMoraMax > 0 && !enMoraActual) observaciones.push(`Registró atrasos históricos de hasta ${diasMoraMax} días.`);
  if (!enMoraActual && diasMoraMax === 0 && (entidades || interno.creditos)) observaciones.push('Comportamiento de pago puntual.');

  return {
    calificacion,
    puntaje,
    entidades_acreedoras: entidades + (deudaInterna.saldo > 0 ? 1 : 0),
    deuda_externa_total: redondear(deudaExterna + deudaInterna.saldo),
    cuota_mensual_externa: redondear(cuotaExterna + deudaInterna.cuota),
    creditos_previos: previosExternos + (interno.creditos || 0),
    creditos_internos: interno.creditos || 0,
    dias_mora_max: diasMoraMax,
    en_mora_actual: enMoraActual ? 1 : 0,
    observaciones: observaciones.join(' ')
  };
}

/* GET /bandeja -------------------------------------------------------------- */
router.get('/bandeja', async (req, res) => {
  const solicitudes = await db.todos(
    `SELECT s.id_solicitud, s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.tasa_interes, s.destino,
            s.fecha_solicitud, s.fecha_envio_evaluacion,
            c.ci, c.nombres || ' ' || c.apellidos AS cliente, c.ingresos_mensuales,
            o.nombre_completo AS oficial,
            h.calificacion, h.fecha_consulta,
            (SELECT COUNT(*) FROM garantia g WHERE g.id_solicitud = s.id_solicitud) AS garantias,
            CAST(julianday('now','localtime') - julianday(COALESCE(s.fecha_envio_evaluacion, s.fecha_solicitud)) AS INTEGER) AS dias_espera
       FROM solicitud_credito s
       JOIN cliente c ON c.id_cliente = s.id_cliente
       JOIN usuario o ON o.id_usuario = s.id_oficial
       LEFT JOIN historial_crediticio h ON h.id_cliente = c.id_cliente
      WHERE s.estado = 'EN_EVALUACION'
      ORDER BY s.fecha_envio_evaluacion ASC`
  );
  const indicadores = await db.obtener(
    `SELECT
       (SELECT COUNT(*) FROM solicitud_credito WHERE estado = 'EN_EVALUACION') AS pendientes,
       (SELECT COUNT(*) FROM evaluacion_credito WHERE id_analista = ? AND DATE(fecha_evaluacion) = DATE('now','localtime')) AS evaluadas_hoy,
       (SELECT COUNT(*) FROM evaluacion_credito WHERE id_analista = ? AND dictamen = 'FAVORABLE') AS favorables,
       (SELECT COUNT(*) FROM evaluacion_credito WHERE id_analista = ? AND dictamen = 'NO_FAVORABLE') AS no_favorables`,
    [req.session.usuario.id, req.session.usuario.id, req.session.usuario.id]
  );
  res.json({ indicadores, solicitudes });
});

/* GET /realizadas ----------------------------------------------------------- */
router.get('/realizadas', async (req, res) => {
  const filas = await db.todos(
    `SELECT e.id_evaluacion, e.fecha_evaluacion, e.dictamen, e.nivel_riesgo, e.capacidad_pago, e.relacion_cuota_ingreso,
            s.id_solicitud, s.codigo, s.monto_solicitado, s.estado, c.nombres || ' ' || c.apellidos AS cliente, c.ci
       FROM evaluacion_credito e
       JOIN solicitud_credito s ON s.id_solicitud = e.id_solicitud
       JOIN cliente c ON c.id_cliente = s.id_cliente
      WHERE e.id_analista = ?
      ORDER BY e.id_evaluacion DESC LIMIT 100`,
    [req.session.usuario.id]
  );
  res.json(filas);
});

/** Construye el pre-cálculo de capacidad de pago para el expediente */
function preCalcular(detalle, entradas = {}) {
  const { solicitud, cliente, historial, valor_garantias: valorGarantias } = detalle;
  const cuota = calcularCuotaFija(solicitud.monto_solicitado, solicitud.tasa_interes, solicitud.plazo_meses);
  const ingresos = entradas.ingresos ?? cliente.ingresos_mensuales;
  const gastos = entradas.gastos ?? cliente.gastos_mensuales;
  const deudas = entradas.deudas ?? (historial ? historial.cuota_mensual_externa : 0);
  return {
    cuota_estimada: cuota,
    ingresos,
    gastos,
    deudas_mensuales: deudas,
    ...evaluarCapacidad({ ingresos, gastos, deudasMensuales: deudas, cuota, valorGarantias, monto: solicitud.monto_solicitado, historial })
  };
}

/* GET /solicitud/:id -------------------------------------------------------- */
router.get('/solicitud/:id', async (req, res) => {
  const detalle = await obtenerDetalleSolicitud(validarId(req.params.id));
  // Créditos anteriores del cliente en la entidad (historial interno)
  const creditosAnteriores = await db.todos(
    `SELECT cr.numero_credito, cr.monto_aprobado, cr.estado, cr.saldo_capital, cr.fecha_desembolso,
            (SELECT COUNT(*) FROM cuota q WHERE q.id_credito = cr.id_credito AND q.estado = 'VENCIDA') AS vencidas,
            (SELECT COALESCE(MAX(dias_atraso),0) FROM cuota q WHERE q.id_credito = cr.id_credito) AS max_atraso
       FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE s.id_cliente = ? AND cr.id_solicitud <> ? AND cr.estado <> 'PENDIENTE_DESEMBOLSO'
      ORDER BY cr.id_credito DESC`,
    [detalle.cliente.id_cliente, detalle.solicitud.id_solicitud]
  );
  res.json({ ...detalle, creditos_anteriores: creditosAnteriores, pre_calculo: preCalcular(detalle) });
});

/* POST /solicitud/:id/historial --------------------------------------------- */
router.post('/solicitud/:id/historial', async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const detalle = await obtenerDetalleSolicitud(idSolicitud);
  if (detalle.solicitud.estado !== 'EN_EVALUACION') throw new ErrorNegocio('La solicitud no está en evaluación.', 409);

  const datos = await consultarCoreBancario(detalle.cliente);
  const ahora = fechaHoraAhora();
  if (detalle.historial) {
    // El historial es ÚNICO por cliente: se actualiza con la nueva consulta
    await db.ejecutar(
      `UPDATE historial_crediticio SET calificacion = ?, puntaje = ?, entidades_acreedoras = ?, deuda_externa_total = ?,
              cuota_mensual_externa = ?, creditos_previos = ?, creditos_internos = ?, dias_mora_max = ?, en_mora_actual = ?,
              observaciones = ?, fecha_consulta = ?, id_analista = ?
        WHERE id_cliente = ?`,
      [datos.calificacion, datos.puntaje, datos.entidades_acreedoras, datos.deuda_externa_total, datos.cuota_mensual_externa,
        datos.creditos_previos, datos.creditos_internos, datos.dias_mora_max, datos.en_mora_actual, datos.observaciones,
        ahora, req.session.usuario.id, detalle.cliente.id_cliente]
    );
  } else {
    const referencia = `HC-${detalle.cliente.ci.replace(/[^0-9A-Z]/gi, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await db.ejecutar(
      `INSERT INTO historial_crediticio (id_cliente, codigo_referencia, calificacion, puntaje, entidades_acreedoras, deuda_externa_total,
              cuota_mensual_externa, creditos_previos, creditos_internos, dias_mora_max, en_mora_actual, observaciones, fecha_consulta, id_analista)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [detalle.cliente.id_cliente, referencia, datos.calificacion, datos.puntaje, datos.entidades_acreedoras, datos.deuda_externa_total,
        datos.cuota_mensual_externa, datos.creditos_previos, datos.creditos_internos, datos.dias_mora_max, datos.en_mora_actual,
        datos.observaciones, ahora, req.session.usuario.id]
    );
  }
  const historial = await db.obtener('SELECT * FROM historial_crediticio WHERE id_cliente = ?', [detalle.cliente.id_cliente]);
  await registrarAuditoria(req, 'CONSULTAR_HISTORIAL', { entidad: 'historial_crediticio', idEntidad: historial.id_historial, detalle: `CI ${detalle.cliente.ci} | Calificación ${historial.calificacion}` });
  res.json({ mensaje: 'Historial crediticio enlazado desde el Core Bancario.', historial, pre_calculo: preCalcular({ ...detalle, historial }) });
});

/* POST /solicitud/:id/dictamen ---------------------------------------------- */
router.post('/solicitud/:id/dictamen', async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const cuerpo = req.body || {};
  const detalle = await obtenerDetalleSolicitud(idSolicitud);
  if (detalle.solicitud.estado !== 'EN_EVALUACION') throw new ErrorNegocio('La solicitud no está pendiente de evaluación.', 409);
  if (!detalle.historial) throw new ErrorNegocio('Debe consultar y enlazar el historial crediticio del cliente antes de emitir el dictamen.', 409);

  const ingresos = numero(cuerpo.ingresos, 'Ingresos verificados', { min: 0 });
  const gastos = numero(cuerpo.gastos, 'Gastos verificados', { min: 0 });
  const deudas = numero(cuerpo.deudas_mensuales ?? 0, 'Cuotas de otras deudas', { min: 0 });
  const nivelRiesgo = opcion(cuerpo.nivel_riesgo, 'Nivel de riesgo', ['BAJO', 'MEDIO', 'ALTO']);
  const dictamen = opcion(cuerpo.dictamen, 'Dictamen', ['FAVORABLE', 'NO_FAVORABLE']);
  const observaciones = texto(cuerpo.observaciones, 'Observaciones / fundamento técnico', { min: 10, max: 1000 });

  const calculo = preCalcular(detalle, { ingresos, gastos, deudas });

  await db.transaccion(async (tx) => {
    await tx.ejecutar(
      `INSERT INTO evaluacion_credito (id_solicitud, id_analista, id_historial, ingresos, gastos, deudas_mensuales, capacidad_pago,
              cuota_estimada, relacion_cuota_ingreso, cobertura_garantia, puntaje_interno, nivel_riesgo, dictamen, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idSolicitud, req.session.usuario.id, detalle.historial.id_historial, ingresos, gastos, deudas, calculo.capacidad_pago,
        calculo.cuota_estimada, calculo.relacion_cuota_ingreso, calculo.cobertura_garantia, calculo.puntaje_interno,
        nivelRiesgo, dictamen, observaciones]
    );
    await tx.ejecutar("UPDATE solicitud_credito SET estado = 'EVALUADA' WHERE id_solicitud = ?", [idSolicitud]);
    await registrarAuditoria(req, 'EMITIR_DICTAMEN', { entidad: 'solicitud_credito', idEntidad: idSolicitud, detalle: `${detalle.solicitud.codigo} | ${dictamen} | Riesgo ${nivelRiesgo}`, tx });
  });

  res.status(201).json({ mensaje: `Dictamen ${dictamen === 'FAVORABLE' ? 'FAVORABLE' : 'NO FAVORABLE'} emitido y remitido al Jefe de Crédito.` });
});

module.exports = router;
