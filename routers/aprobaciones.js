/**
 *  ROUTER: APROBACIÓN DE CRÉDITOS  (/api/aprobaciones)
 *  Actor principal: Jefe de Crédito  (CU07 - CU08 - RF08 - RF09)
 * 
 *  GET  /bandeja        Solicitudes EVALUADAS pendientes de resolución
 *  POST /:id/aprobar    Aprobar: genera crédito, contrato y cronograma
 *  POST /:id/rechazar   Rechazar con motivo obligatorio (RN11)
 *  GET  /historial      Historial de decisiones (resoluciones)
 * 
 *  Reglas aplicadas:
 *   RN03 - No se aprueba sin evaluación FAVORABLE del Analista.
 *   RN04 - El monto aprobado no puede superar el límite de aprobación del Jefe.
 *   RN05 - Toda aprobación genera el contrato antes del desembolso.
 *   RN06 - Todo crédito tiene su cronograma de cuotas.
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { PRODUCTOS } = require('../utils/parametros');
const { fechaHoraAhora } = require('../utils/finanzas');
const { crearCreditoAprobado } = require('../utils/operaciones');
const { ErrorNegocio, texto, numero, id: validarId } = require('../utils/errores');

const router = express.Router();

/* GET /bandeja -------------------------------------------------------------- */
router.get('/bandeja', proteger('JEFE'), async (req, res) => {
  const solicitudes = await db.todos(
    `SELECT s.id_solicitud, s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.tasa_interes, s.destino, s.fecha_solicitud,
            c.ci, c.nombres || ' ' || c.apellidos AS cliente,
            e.dictamen, e.nivel_riesgo, e.capacidad_pago, e.relacion_cuota_ingreso, e.cobertura_garantia, e.fecha_evaluacion,
            a.nombre_completo AS analista, h.calificacion
       FROM solicitud_credito s
       JOIN cliente c ON c.id_cliente = s.id_cliente
       JOIN evaluacion_credito e ON e.id_solicitud = s.id_solicitud
       JOIN usuario a ON a.id_usuario = e.id_analista
       LEFT JOIN historial_crediticio h ON h.id_cliente = c.id_cliente
      WHERE s.estado = 'EVALUADA'
      ORDER BY e.fecha_evaluacion ASC`
  );
  const metricas = await db.obtener(
    `SELECT
       (SELECT COUNT(*) FROM solicitud_credito WHERE estado = 'EVALUADA') AS pendientes,
       (SELECT COUNT(*) FROM solicitud_credito WHERE estado = 'EN_EVALUACION') AS en_analisis,
       (SELECT COUNT(*) FROM solicitud_credito WHERE estado IN ('APROBADA','DESEMBOLSADA') AND DATE(fecha_resolucion) = DATE('now','localtime')) AS aprobadas_hoy,
       (SELECT COUNT(*) FROM solicitud_credito WHERE estado = 'RECHAZADA' AND DATE(fecha_resolucion) = DATE('now','localtime')) AS rechazadas_hoy,
       (SELECT COALESCE(SUM(cr.monto_aprobado),0) FROM credito cr WHERE strftime('%Y-%m', cr.fecha_aprobacion) = strftime('%Y-%m','now','localtime')) AS monto_aprobado_mes`
  );
  const jefe = await db.obtener('SELECT limite_aprobacion FROM usuario WHERE id_usuario = ?', [req.session.usuario.id]);
  res.json({
    metricas: { ...metricas, limite_aprobacion: jefe.limite_aprobacion },
    solicitudes: solicitudes.map((s) => ({ ...s, producto: PRODUCTOS[s.tipo_credito]?.nombre }))
  });
});

/** Obtiene una solicitud evaluada lista para resolución */
async function obtenerParaResolver(idSolicitud) {
  const fila = await db.obtener(
    `SELECT s.*, e.dictamen, c.ci FROM solicitud_credito s
       JOIN cliente c ON c.id_cliente = s.id_cliente
       LEFT JOIN evaluacion_credito e ON e.id_solicitud = s.id_solicitud
      WHERE s.id_solicitud = ?`,
    [idSolicitud]
  );
  if (!fila) throw new ErrorNegocio('Solicitud no encontrada.', 404);
  if (fila.estado !== 'EVALUADA') throw new ErrorNegocio(`La solicitud no está pendiente de resolución (estado actual: ${fila.estado}).`, 409);
  return fila;
}

/* POST /:id/aprobar --------------------------------------------------------- */
router.post('/:id/aprobar', proteger('JEFE'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const cuerpo = req.body || {};
  const solicitud = await obtenerParaResolver(idSolicitud);

  if (solicitud.dictamen !== 'FAVORABLE') {
    throw new ErrorNegocio('RN03: No se puede aprobar una solicitud con dictamen NO FAVORABLE. Solo puede rechazarla.', 409);
  }
  const monto = numero(cuerpo.monto_aprobado ?? solicitud.monto_solicitado, 'Monto aprobado', { min: 1, max: solicitud.monto_solicitado });
  const tasa = numero(cuerpo.tasa_interes ?? solicitud.tasa_interes, 'Tasa de interés anual', { min: 1, max: 40 });
  const observacion = texto(cuerpo.observacion, 'Observación', { requerido: false, max: 500 }) || 'Aprobado conforme a dictamen favorable.';

  const jefe = await db.obtener('SELECT limite_aprobacion FROM usuario WHERE id_usuario = ?', [req.session.usuario.id]);
  if (monto > jefe.limite_aprobacion) {
    throw new ErrorNegocio(`RN04: El monto (Bs ${monto.toFixed(2)}) supera su límite de aprobación (Bs ${jefe.limite_aprobacion.toFixed(2)}). Debe elevarse a una instancia superior.`, 403);
  }

  const resultado = await db.transaccion(async (tx) => {
    const ahora = fechaHoraAhora();
    await tx.ejecutar(
      "UPDATE solicitud_credito SET estado = 'APROBADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ? WHERE id_solicitud = ?",
      [req.session.usuario.id, ahora, observacion, idSolicitud]
    );
    const credito = await crearCreditoAprobado(tx, { idSolicitud, monto, tasa, plazo: solicitud.plazo_meses, fechaAprobacion: ahora });
    await registrarAuditoria(req, 'APROBAR_CREDITO', {
      entidad: 'solicitud_credito', idEntidad: idSolicitud,
      detalle: `${solicitud.codigo} | ${credito.numeroCredito} | Bs ${monto} al ${tasa}% | ${solicitud.plazo_meses} meses`, tx
    });
    return credito;
  });

  res.json({
    mensaje: `Crédito ${resultado.numeroCredito} aprobado. Contrato ${resultado.numeroContrato} y cronograma generados.`,
    id_credito: resultado.idCredito,
    numero_credito: resultado.numeroCredito,
    numero_contrato: resultado.numeroContrato,
    cuota_mensual: resultado.cuotaMensual
  });
});

/* POST /:id/rechazar -------------------------------------------------------- */
router.post('/:id/rechazar', proteger('JEFE'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const motivo = texto(req.body?.motivo, 'Motivo del rechazo', { min: 10, max: 500 });
  const solicitud = await obtenerParaResolver(idSolicitud);
  await db.ejecutar(
    "UPDATE solicitud_credito SET estado = 'RECHAZADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ? WHERE id_solicitud = ?",
    [req.session.usuario.id, fechaHoraAhora(), motivo, idSolicitud]
  );
  await registrarAuditoria(req, 'RECHAZAR_CREDITO', { entidad: 'solicitud_credito', idEntidad: idSolicitud, detalle: `${solicitud.codigo}: ${motivo}` });
  res.json({ mensaje: `Solicitud ${solicitud.codigo} rechazada. El cliente podrá ver el resultado en su portal.` });
});

/* GET /historial ------------------------------------------------------------ */
router.get('/historial', proteger('JEFE', 'GERENTE', 'ADMIN'), async (req, res) => {
  const { resultado, desde, hasta, buscar } = req.query;
  const condiciones = ["s.estado IN ('APROBADA','RECHAZADA','DESEMBOLSADA')"];
  const parametros = [];
  if (resultado === 'APROBADA') condiciones.push("s.estado IN ('APROBADA','DESEMBOLSADA')");
  if (resultado === 'RECHAZADA') condiciones.push("s.estado = 'RECHAZADA'");
  if (desde) { condiciones.push('DATE(s.fecha_resolucion) >= DATE(?)'); parametros.push(desde); }
  if (hasta) { condiciones.push('DATE(s.fecha_resolucion) <= DATE(?)'); parametros.push(hasta); }
  if (buscar) {
    condiciones.push("(c.ci LIKE ? OR (c.nombres || ' ' || c.apellidos) LIKE ? OR s.codigo LIKE ?)");
    parametros.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`);
  }
  const filas = await db.todos(
    `SELECT s.id_solicitud, s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.estado, s.fecha_resolucion,
            s.observacion_resolucion, c.ci, c.nombres || ' ' || c.apellidos AS cliente,
            j.nombre_completo AS jefe, e.dictamen, e.nivel_riesgo, a.nombre_completo AS analista,
            cr.id_credito, cr.numero_credito, cr.numero_contrato, cr.monto_aprobado, cr.tasa_interes, cr.estado AS estado_credito
       FROM solicitud_credito s
       JOIN cliente c ON c.id_cliente = s.id_cliente
       LEFT JOIN usuario j ON j.id_usuario = s.id_jefe
       LEFT JOIN evaluacion_credito e ON e.id_solicitud = s.id_solicitud
       LEFT JOIN usuario a ON a.id_usuario = e.id_analista
       LEFT JOIN credito cr ON cr.id_solicitud = s.id_solicitud
      WHERE ${condiciones.join(' AND ')}
      ORDER BY s.fecha_resolucion DESC LIMIT 500`,
    parametros
  );
  const resumen = filas.reduce(
    (r, f) => {
      if (f.estado === 'RECHAZADA') r.rechazadas += 1;
      else { r.aprobadas += 1; r.monto_aprobado += f.monto_aprobado || 0; }
      return r;
    },
    { aprobadas: 0, rechazadas: 0, monto_aprobado: 0 }
  );
  res.json({ resumen, decisiones: filas.map((f) => ({ ...f, producto: PRODUCTOS[f.tipo_credito]?.nombre })) });
});

module.exports = router;
