/**
 *  CONSULTAS REUTILIZABLES

 *  Consultas compartidas por varios routers (detalle de solicitud, crédito
 *  con su cronograma, voucher de pago), para no duplicar SQL.
 */
const db = require('../database/db');
const { PRODUCTOS, TIPOS_GARANTIA, ENTIDAD } = require('./parametros');
const { ErrorNegocio } = require('./errores');

/**
 * Devuelve la solicitud con cliente, garantías, evaluación, historial y crédito.
 * @throws {ErrorNegocio} 404 si no existe
 */
async function obtenerDetalleSolicitud(idSolicitud) {
  const solicitud = await db.obtener(
    `SELECT s.*, o.nombre_completo AS oficial, j.nombre_completo AS jefe
       FROM solicitud_credito s
       JOIN usuario o      ON o.id_usuario = s.id_oficial
       LEFT JOIN usuario j ON j.id_usuario = s.id_jefe
      WHERE s.id_solicitud = ?`,
    [idSolicitud]
  );
  if (!solicitud) throw new ErrorNegocio('Solicitud no encontrada.', 404);
  solicitud.producto = PRODUCTOS[solicitud.tipo_credito]?.nombre || solicitud.tipo_credito;

  const [cliente, garantias, evaluacion, historial, credito] = await Promise.all([
    db.obtener('SELECT * FROM cliente WHERE id_cliente = ?', [solicitud.id_cliente]),
    db.todos('SELECT * FROM garantia WHERE id_solicitud = ? ORDER BY id_garantia', [idSolicitud]),
    db.obtener(
      `SELECT e.*, u.nombre_completo AS analista FROM evaluacion_credito e
         JOIN usuario u ON u.id_usuario = e.id_analista WHERE e.id_solicitud = ?`,
      [idSolicitud]
    ),
    db.obtener('SELECT * FROM historial_crediticio WHERE id_cliente = ?', [solicitud.id_cliente]),
    db.obtener('SELECT * FROM credito WHERE id_solicitud = ?', [idSolicitud])
  ]);

  const valorGarantias = garantias.reduce((suma, g) => suma + g.valor_comercial, 0);
  return {
    solicitud,
    cliente,
    garantias: garantias.map((g) => ({ ...g, tipo_nombre: TIPOS_GARANTIA[g.tipo] })),
    valor_garantias: valorGarantias,
    evaluacion: evaluacion || null,
    historial: historial || null,
    credito: credito || null
  };
}

/** Devuelve el crédito con datos del cliente, contrato, garantías y cuotas.
 * Si se indica `idClienteSesion`, valida que el crédito pertenezca al cliente.*/
async function obtenerCreditoCompleto(idCredito, { idClienteSesion } = {}) {
  const credito = await db.obtener(
    `SELECT cr.*, s.codigo AS codigo_solicitud, s.tipo_credito, s.destino, s.monto_solicitado, s.fecha_solicitud,
            s.id_cliente, s.observacion_resolucion,
            o.nombre_completo AS oficial, j.nombre_completo AS jefe, d.nombre_completo AS oficial_desembolso
       FROM credito cr
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
       JOIN usuario o           ON o.id_usuario   = s.id_oficial
       LEFT JOIN usuario j      ON j.id_usuario   = s.id_jefe
       LEFT JOIN usuario d      ON d.id_usuario   = cr.id_oficial_desembolso
      WHERE cr.id_credito = ?`,
    [idCredito]
  );
  if (!credito) throw new ErrorNegocio('Crédito no encontrado.', 404);
  if (idClienteSesion && credito.id_cliente !== idClienteSesion) {
    throw new ErrorNegocio('No tiene permiso para ver este crédito.', 403);
  }
  credito.producto = PRODUCTOS[credito.tipo_credito]?.nombre || credito.tipo_credito;

  const [cliente, cuotas, garantias] = await Promise.all([
    db.obtener('SELECT * FROM cliente WHERE id_cliente = ?', [credito.id_cliente]),
    db.todos(
      `SELECT q.*, p.numero_recibo FROM cuota q LEFT JOIN pago p ON p.id_pago = q.id_pago
        WHERE q.id_credito = ? ORDER BY q.numero`,
      [idCredito]
    ),
    db.todos('SELECT * FROM garantia WHERE id_solicitud = ? ORDER BY id_garantia', [credito.id_solicitud])
  ]);

  const totales = cuotas.reduce(
    (t, q) => ({
      capital: t.capital + q.capital,
      interes: t.interes + q.interes,
      total: t.total + q.monto,
      pagado: t.pagado + (q.estado === 'PAGADA' ? q.monto : 0),
      vencido: t.vencido + (q.estado === 'VENCIDA' ? q.monto : 0)
    }),
    { capital: 0, interes: 0, total: 0, pagado: 0, vencido: 0 }
  );

  return {
    entidad: ENTIDAD,
    credito,
    cliente,
    cuotas,
    garantias: garantias.map((g) => ({ ...g, tipo_nombre: TIPOS_GARANTIA[g.tipo] })),
    totales
  };
}

/** Devuelve los datos de un voucher de pago.
 * Si se indica `idClienteSesion`, valida que el pago pertenezca al cliente. */
async function obtenerRecibo(idPago, { idClienteSesion } = {}) {
  const pago = await db.obtener(
    `SELECT p.*, u.nombre_completo AS cajero, cr.numero_credito, cr.saldo_capital, cr.estado AS estado_credito,
            cr.plazo_meses, s.id_cliente, cl.ci, cl.extension, cl.nombres || ' ' || cl.apellidos AS cliente
       FROM pago p
       JOIN usuario u           ON u.id_usuario    = p.id_cajero
       JOIN credito cr          ON cr.id_credito   = p.id_credito
       JOIN solicitud_credito s ON s.id_solicitud  = cr.id_solicitud
       JOIN cliente cl          ON cl.id_cliente   = s.id_cliente
      WHERE p.id_pago = ?`,
    [idPago]
  );
  if (!pago) throw new ErrorNegocio('Comprobante no encontrado.', 404);
  if (idClienteSesion && pago.id_cliente !== idClienteSesion) throw new ErrorNegocio('No tiene permiso para ver este comprobante.', 403);
  const cuotas = await db.todos(
    'SELECT numero, fecha_vencimiento, capital, interes, monto, dias_atraso, recargo_mora FROM cuota WHERE id_pago = ? ORDER BY numero',
    [idPago]
  );
  const pendientes = await db.obtener(
    "SELECT COUNT(*) AS total FROM cuota WHERE id_credito = ? AND estado <> 'PAGADA'",
    [pago.id_credito]
  );
  return { entidad: ENTIDAD, pago, cuotas, cuotas_pendientes: pendientes.total };
}

module.exports = { obtenerDetalleSolicitud, obtenerCreditoCompleto, obtenerRecibo };
