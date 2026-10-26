/**
 *  ROUTER: CAJA - PAGOS, CANCELACIONES Y MORA  (/api/pagos)
 *  Actor principal: Cajero  (CU12 - CU13 - RF13 - RF14)
 * 
 *  GET  /buscar?criterio=     Búsqueda rápida por CI, N° de crédito o nombre
 *  GET  /credito/:id          Estado de cuenta con recargos calculados a hoy
 *  POST /registrar            Pago de N cuotas (las más antiguas primero)
 *  POST /cancelar             Cancelación total anticipada del crédito
 *  GET  /recibo/:id           Datos del voucher imprimible
 *  GET  /del-dia              Arqueo: pagos del cajero en el día
 *  GET  /mora                 Cartera en mora (gestión de cobranza)
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { actualizarMora } = require('../utils/mora');
const { MORA } = require('../utils/parametros');
const { calcularMora, liquidarCancelacion, redondear } = require('../utils/finanzas');
const { registrarPagoCuotas, cancelarCreditoTotal } = require('../utils/operaciones');
const { obtenerRecibo } = require('../utils/consultas');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();
const FORMAS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'DEBITO_CUENTA', 'CHEQUE'];

/* GET /buscar --------------------------------------------------------------- */
router.get('/buscar', proteger('CAJERO'), async (req, res) => {
  const criterio = String(req.query.criterio || '').trim();
  if (criterio.length < 3) throw new ErrorNegocio('Ingrese al menos 3 caracteres (CI, N° de crédito o nombre).');
  await actualizarMora();
  const filas = await db.todos(
    `SELECT v.id_credito, v.numero_credito, v.estado, v.monto_aprobado, v.saldo_capital, v.cuota_mensual, v.plazo_meses,
            v.cuotas_pagadas, v.cuotas_vencidas, v.monto_vencido, v.ci, v.cliente, v.fecha_desembolso,
            (SELECT MIN(fecha_vencimiento) FROM cuota q WHERE q.id_credito = v.id_credito AND q.estado <> 'PAGADA') AS proximo_vencimiento
       FROM vista_cartera v
      WHERE v.estado <> 'PENDIENTE_DESEMBOLSO'
        AND (v.ci LIKE ? OR v.numero_credito LIKE ? OR v.cliente LIKE ?)
      ORDER BY CASE v.estado WHEN 'EN_MORA' THEN 0 WHEN 'VIGENTE' THEN 1 ELSE 2 END, v.id_credito DESC
      LIMIT 30`,
    [`${criterio}%`, `%${criterio}%`, `%${criterio}%`]
  );
  if (!filas.length) throw new ErrorNegocio('No se encontraron créditos desembolsados con ese criterio.', 404);
  res.json(filas);
});

/* GET /credito/:id ---------------------------------------------------------- */
router.get('/credito/:id', proteger('CAJERO'), async (req, res) => {
  const idCredito = validarId(req.params.id);
  await actualizarMora();
  const credito = await db.obtener(
    `SELECT v.*, cl.telefono, cl.extension FROM vista_cartera v JOIN cliente cl ON cl.id_cliente = v.id_cliente WHERE v.id_credito = ?`,
    [idCredito]
  );
  if (!credito) throw new ErrorNegocio('Crédito no encontrado.', 404);
  const cuotas = await db.todos(
    `SELECT q.*, p.numero_recibo FROM cuota q LEFT JOIN pago p ON p.id_pago = q.id_pago WHERE q.id_credito = ? ORDER BY q.numero`,
    [idCredito]
  );
  // Recargo calculado a la fecha para cada cuota no pagada
  const cuotasCalculadas = cuotas.map((q) => {
    if (q.estado === 'PAGADA') return { ...q, recargo_hoy: 0, total_hoy: 0 };
    const { diasAtraso, recargo } = calcularMora(q);
    return { ...q, dias_atraso: diasAtraso, recargo_hoy: recargo, total_hoy: redondear(q.monto + recargo) };
  });
  const pendientes = cuotasCalculadas.filter((q) => q.estado !== 'PAGADA');
  const liquidacion = pendientes.length ? liquidarCancelacion(pendientes) : null;
  const pagos = await db.todos(
    `SELECT p.id_pago, p.numero_recibo, p.fecha_pago, p.tipo, p.cuotas_pagadas, p.monto_total, p.monto_recargo, p.forma_pago,
            u.nombre_completo AS cajero
       FROM pago p JOIN usuario u ON u.id_usuario = p.id_cajero WHERE p.id_credito = ? ORDER BY p.id_pago DESC`,
    [idCredito]
  );
  res.json({
    credito,
    cuotas: cuotasCalculadas,
    pagos,
    politica_mora: { tasa_diaria: MORA.tasaRecargoDiario * 100, dias_gracia: MORA.diasGracia, tope: MORA.topeRecargo * 100 },
    cancelacion: liquidacion ? { capital: liquidacion.capital, interes: liquidacion.interes, recargo: liquidacion.recargo, total: liquidacion.total } : null
  });
});

/** Valida los datos comunes de cobro */
function validarCobro(cuerpo) {
  const formaPago = opcion(cuerpo.forma_pago || 'EFECTIVO', 'Forma de pago', FORMAS_PAGO);
  const exonerar = Boolean(cuerpo.exonerar_recargo);
  return {
    idCredito: validarId(cuerpo.id_credito, 'crédito'),
    formaPago,
    montoRecibido: numero(cuerpo.monto_recibido, 'Monto recibido', { min: 0.01, max: 100000000 }),
    exonerar,
    motivoExoneracion: exonerar ? texto(cuerpo.motivo_exoneracion, 'Motivo de exoneración del recargo', { min: 10, max: 300 }) : null
  };
}

/* POST /registrar ----------------------------------------------------------- */
router.post('/registrar', proteger('CAJERO'), async (req, res) => {
  const cuerpo = req.body || {};
  const datos = validarCobro(cuerpo);
  const cantidad = numero(cuerpo.cantidad_cuotas ?? 1, 'Cantidad de cuotas', { min: 1, max: 360, entero: true });
  await actualizarMora();

  const resultado = await db.transaccion(async (tx) => {
    const r = await registrarPagoCuotas(tx, { ...datos, cantidad, idCajero: req.session.usuario.id });
    await registrarAuditoria(req, 'REGISTRAR_PAGO', {
      entidad: 'pago', idEntidad: r.idPago,
      detalle: `${r.numeroRecibo} | Crédito #${datos.idCredito} | ${cantidad} cuota(s) | Bs ${r.total}${r.recargoExonerado ? ` | Recargo exonerado Bs ${r.recargoExonerado}: ${datos.motivoExoneracion}` : ''}`, tx
    });
    return r;
  });

  res.status(201).json({
    mensaje: resultado.estadoCredito === 'CANCELADO'
      ? '¡Pago registrado! El crédito quedó totalmente CANCELADO.'
      : 'Pago registrado correctamente.',
    id_pago: resultado.idPago,
    numero_recibo: resultado.numeroRecibo,
    total: resultado.total,
    cambio: resultado.cambio,
    estado_credito: resultado.estadoCredito
  });
});

/* POST /cancelar ------------------------------------------------------------ */
router.post('/cancelar', proteger('CAJERO'), async (req, res) => {
  const datos = validarCobro(req.body || {});
  await actualizarMora();
  const resultado = await db.transaccion(async (tx) => {
    const r = await cancelarCreditoTotal(tx, { ...datos, idCajero: req.session.usuario.id });
    await registrarAuditoria(req, 'CANCELACION_TOTAL', {
      entidad: 'pago', idEntidad: r.idPago, detalle: `${r.numeroRecibo} | Crédito #${datos.idCredito} | Bs ${r.total}`, tx
    });
    return r;
  });
  res.status(201).json({
    mensaje: 'Crédito CANCELADO en su totalidad. Las garantías quedan liberadas.',
    id_pago: resultado.idPago,
    numero_recibo: resultado.numeroRecibo,
    total: resultado.total,
    cambio: resultado.cambio,
    estado_credito: resultado.estadoCredito
  });
});

/* GET /recibo/:id ----------------------------------------------------------- */
router.get('/recibo/:id', proteger('CAJERO', 'GERENTE', 'ADMIN', 'CLIENTE'), async (req, res) => {
  const { rol, id_cliente: idCliente } = req.session.usuario;
  res.json(await obtenerRecibo(validarId(req.params.id), { idClienteSesion: rol === 'CLIENTE' ? idCliente : undefined }));
});

/* GET /del-dia -------------------------------------------------------------- */
router.get('/del-dia', proteger('CAJERO'), async (req, res) => {
  const pagos = await db.todos(
    `SELECT p.id_pago, p.numero_recibo, p.fecha_pago, p.tipo, p.cuotas_pagadas, p.monto_total, p.monto_recargo, p.forma_pago,
            cr.numero_credito, cl.nombres || ' ' || cl.apellidos AS cliente
       FROM pago p
       JOIN credito cr ON cr.id_credito = p.id_credito
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
       JOIN cliente cl ON cl.id_cliente = s.id_cliente
      WHERE p.id_cajero = ? AND DATE(p.fecha_pago) = DATE('now','localtime')
      ORDER BY p.id_pago DESC`,
    [req.session.usuario.id]
  );
  const totales = pagos.reduce(
    (t, p) => {
      t.total += p.monto_total;
      t.recargos += p.monto_recargo;
      t.por_forma[p.forma_pago] = (t.por_forma[p.forma_pago] || 0) + p.monto_total;
      return t;
    },
    { total: 0, recargos: 0, cantidad: pagos.length, por_forma: {} }
  );
  res.json({ pagos, totales });
});

/* GET /mora ----------------------------------------------------------------- */
router.get('/mora', proteger('CAJERO', 'GERENTE'), async (req, res) => {
  await actualizarMora();
  const filas = await db.todos(
    `SELECT v.id_credito, v.numero_credito, v.cliente, v.ci, v.cuotas_vencidas, v.monto_vencido, v.saldo_capital, v.primera_vencida,
            CAST(julianday('now','localtime') - julianday(v.primera_vencida) AS INTEGER) AS dias_mora,
            cl.telefono,
            (SELECT COALESCE(SUM(recargo_mora),0) FROM cuota q WHERE q.id_credito = v.id_credito AND q.estado = 'VENCIDA') AS recargo_acumulado
       FROM vista_cartera v JOIN cliente cl ON cl.id_cliente = v.id_cliente
      WHERE v.estado = 'EN_MORA'
      ORDER BY dias_mora DESC`
  );
  res.json(filas);
});

module.exports = router;
