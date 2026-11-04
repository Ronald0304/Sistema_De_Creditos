/**
 *  ROUTER: PORTAL DEL CLIENTE  (/api/clientesp)
 *  Actor: Cliente (acceso externo de solo consulta)

 *  El cliente NO puede registrarse ni pagar en línea: su cuenta la crea el
 *  Oficial de Crédito. Todas las consultas usan el id_cliente de la SESIÓN
 *  (nunca un parámetro de la URL), por lo que un cliente jamás puede ver
 *  datos de otro (RNF02 - Confidencialidad).
 *
 *  GET /resumen    Perfil, estado de cuenta, solicitudes, créditos y pagos
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { actualizarMora } = require('../utils/mora');
const { PRODUCTOS } = require('../utils/parametros');
const { calcularMora } = require('../utils/finanzas');
const { ErrorNegocio } = require('../utils/errores');

const router = express.Router();
router.use(proteger('CLIENTE'));

/** Traduce el estado técnico del crédito a una situación legible para el cliente */
function situacionCliente(estado) {
  return {
    PENDIENTE_DESEMBOLSO: 'APROBADO - PENDIENTE DE DESEMBOLSO',
    VIGENTE: 'AL DÍA',
    EN_MORA: 'EN MORA',
    CANCELADO: 'CANCELADO'
  }[estado] || estado;
}

/* GET /resumen -------------------------------------------------------------- */
router.get('/resumen', async (req, res) => {
  const idCliente = req.session.usuario.id_cliente;
  if (!idCliente) throw new ErrorNegocio('La cuenta no está vinculada a un cliente.', 403);
  await actualizarMora();

  const perfil = await db.obtener(
    `SELECT c.ci, c.extension, c.nombres, c.apellidos, c.telefono, c.correo, c.direccion, c.ocupacion, c.fecha_registro,
            u.ultimo_acceso, o.nombre_completo AS oficial
       FROM cliente c
       JOIN usuario u ON u.id_cliente = c.id_cliente
       LEFT JOIN usuario o ON o.id_usuario = c.id_oficial
      WHERE c.id_cliente = ?`,
    [idCliente]
  );

  const solicitudes = (await db.todos(
    `SELECT s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.destino, s.estado, s.fecha_solicitud,
            s.fecha_resolucion, s.observacion_resolucion
       FROM solicitud_credito s WHERE s.id_cliente = ? ORDER BY s.id_solicitud DESC`,
    [idCliente]
  )).map((s) => ({
    ...s,
    producto: PRODUCTOS[s.tipo_credito]?.nombre,
    // El motivo de anulación es interno; al cliente se le muestra solo el de rechazo/aprobación
    observacion_resolucion: s.estado === 'ANULADA' ? 'Solicitud anulada.' : s.observacion_resolucion
  }));

  const creditos = await db.todos(
    `SELECT cr.id_credito, cr.numero_credito, cr.numero_contrato, cr.monto_aprobado, cr.tasa_interes, cr.plazo_meses,
            cr.cuota_mensual, cr.fecha_desembolso, cr.saldo_capital, cr.estado, s.tipo_credito
       FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE s.id_cliente = ? ORDER BY cr.id_credito DESC`,
    [idCliente]
  );

  for (const credito of creditos) {
    credito.producto = PRODUCTOS[credito.tipo_credito]?.nombre;
    credito.situacion = situacionCliente(credito.estado);
    const cuotas = await db.todos('SELECT * FROM cuota WHERE id_credito = ? ORDER BY numero', [credito.id_credito]);
    credito.cuotas = cuotas.map((q) => (q.estado === 'VENCIDA' ? { ...q, recargo_hoy: calcularMora(q).recargo } : q));
    credito.cuotas_pagadas = cuotas.filter((q) => q.estado === 'PAGADA').length;
    credito.cuotas_vencidas = cuotas.filter((q) => q.estado === 'VENCIDA').length;
    credito.monto_vencido = credito.cuotas.filter((q) => q.estado === 'VENCIDA').reduce((s, q) => s + q.monto + (q.recargo_hoy || 0), 0);
    credito.proxima_cuota = credito.estado === 'PENDIENTE_DESEMBOLSO' ? null : cuotas.find((q) => q.estado !== 'PAGADA') || null;
  }

  const pagos = await db.todos(
    `SELECT p.id_pago, p.numero_recibo, p.fecha_pago, p.tipo, p.cuotas_pagadas, p.monto_total, p.monto_recargo, p.forma_pago,
            cr.numero_credito
       FROM pago p JOIN credito cr ON cr.id_credito = p.id_credito
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE s.id_cliente = ? ORDER BY p.id_pago DESC`,
    [idCliente]
  );

  // Estado de cuenta general del cliente
  const activos = creditos.filter((c) => ['VIGENTE', 'EN_MORA'].includes(c.estado));
  let estadoGeneral = 'SIN_CREDITOS';
  if (creditos.some((c) => c.estado === 'EN_MORA')) estadoGeneral = 'EN_MORA';
  else if (activos.length) estadoGeneral = 'AL_DIA';
  else if (creditos.some((c) => c.estado === 'PENDIENTE_DESEMBOLSO')) estadoGeneral = 'PENDIENTE_DESEMBOLSO';
  else if (creditos.length && creditos.every((c) => c.estado === 'CANCELADO')) estadoGeneral = 'CANCELADO';

  res.json({
    perfil,
    estado_cuenta: {
      estado: estadoGeneral,
      saldo_total: activos.reduce((s, c) => s + c.saldo_capital, 0),
      creditos_activos: activos.length,
      monto_vencido: creditos.reduce((s, c) => s + c.monto_vencido, 0),
      total_pagado: pagos.reduce((s, p) => s + p.monto_total, 0)
    },
    solicitudes,
    creditos,
    pagos
  });
});

module.exports = router;
