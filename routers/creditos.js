/**
 *  ROUTER: CRÉDITOS, DESEMBOLSOS, CONTRATOS Y CRONOGRAMAS  (/api/creditos)
 *  (CU09 - CU10 - CU11 - RF10 - RF11 - RF12)

 *  GET  /pendientes-desembolso   Créditos aprobados listos para desembolsar (Oficial)
 *  GET  /desembolsados           Últimos desembolsos ejecutados (Oficial)
 *  POST /:id/desembolsar         Ejecutar el desembolso vía Core Bancario (Oficial)
 *  GET  /:id                     Crédito completo con cronograma (contrato / impresión)
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { PRODUCTOS } = require('../utils/parametros');
const { desembolsarCredito } = require('../utils/operaciones');
const { obtenerCreditoCompleto } = require('../utils/consultas');
const { ErrorNegocio, texto, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();

/* GET /pendientes-desembolso ------------------------------------------------ */
router.get('/pendientes-desembolso', proteger('OFICIAL'), async (req, res) => {
  const filas = await db.todos(
    `SELECT cr.id_credito, cr.numero_credito, cr.numero_contrato, cr.monto_aprobado, cr.tasa_interes, cr.plazo_meses,
            cr.cuota_mensual, cr.fecha_aprobacion, s.id_solicitud, s.codigo, s.tipo_credito,
            c.ci, c.nombres || ' ' || c.apellidos AS cliente, j.nombre_completo AS jefe,
            (SELECT COUNT(*) FROM garantia g WHERE g.id_solicitud = s.id_solicitud) AS garantias,
            (SELECT COALESCE(SUM(valor_comercial),0) FROM garantia g WHERE g.id_solicitud = s.id_solicitud) AS valor_garantias
       FROM credito cr
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
       JOIN cliente c ON c.id_cliente = s.id_cliente
       LEFT JOIN usuario j ON j.id_usuario = s.id_jefe
      WHERE cr.estado = 'PENDIENTE_DESEMBOLSO'
      ORDER BY cr.fecha_aprobacion ASC`
  );
  res.json(filas.map((f) => ({ ...f, producto: PRODUCTOS[f.tipo_credito]?.nombre })));
});

/* GET /desembolsados -------------------------------------------------------- */
router.get('/desembolsados', proteger('OFICIAL', 'GERENTE', 'ADMIN'), async (req, res) => {
  const filas = await db.todos(
    `SELECT cr.id_credito, cr.numero_credito, cr.numero_contrato, cr.monto_aprobado, cr.plazo_meses, cr.cuota_mensual,
            cr.fecha_desembolso, cr.medio_desembolso, cr.codigo_transaccion, cr.estado, cr.saldo_capital,
            c.ci, c.nombres || ' ' || c.apellidos AS cliente, d.nombre_completo AS oficial
       FROM credito cr
       JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
       JOIN cliente c ON c.id_cliente = s.id_cliente
       LEFT JOIN usuario d ON d.id_usuario = cr.id_oficial_desembolso
      WHERE cr.fecha_desembolso IS NOT NULL
      ORDER BY cr.fecha_desembolso DESC LIMIT 100`
  );
  res.json(filas);
});

/* POST /:id/desembolsar ----------------------------------------------------- */
router.post('/:id/desembolsar', proteger('OFICIAL'), async (req, res) => {
  const idCredito = validarId(req.params.id);
  const cuerpo = req.body || {};
  const medio = opcion(cuerpo.medio_desembolso, 'Medio de desembolso', ['ABONO_CUENTA', 'CHEQUE', 'EFECTIVO']);
  const cuenta = medio === 'EFECTIVO'
    ? null
    : texto(cuerpo.cuenta_destino, medio === 'CHEQUE' ? 'Número de cheque' : 'Cuenta de destino', { min: 5, max: 30, patron: /^[0-9-]+$/, mensajePatron: 'Solo se permiten números y guiones.' });

  const resultado = await db.transaccion(async (tx) => {
    const r = await desembolsarCredito(tx, { idCredito, idOficial: req.session.usuario.id, medio, cuentaDestino: cuenta });
    await registrarAuditoria(req, 'DESEMBOLSAR_CREDITO', {
      entidad: 'credito', idEntidad: idCredito,
      detalle: `${r.credito.numero_credito} | Bs ${r.credito.monto_aprobado} | ${medio} | ${r.codigoTransaccion}`, tx
    });
    return r;
  });

  res.json({
    mensaje: `Desembolso ejecutado con éxito. Código de operación Core Bancario: ${resultado.codigoTransaccion}`,
    codigo_transaccion: resultado.codigoTransaccion,
    id_credito: idCredito
  });
});

/* GET /:id  (contrato y cronograma imprimibles) ----------------------------- */
router.get('/:id', proteger('OFICIAL', 'JEFE', 'GERENTE', 'ADMIN', 'CAJERO', 'ANALISTA', 'CLIENTE'), async (req, res) => {
  const idCredito = validarId(req.params.id);
  const { rol, id_cliente: idCliente } = req.session.usuario;
  // El cliente solo puede consultar SUS propios créditos (RNF02 - Confidencialidad)
  const datos = await obtenerCreditoCompleto(idCredito, { idClienteSesion: rol === 'CLIENTE' ? idCliente : undefined });
  if (rol === 'CLIENTE' && !idCliente) throw new ErrorNegocio('Sin permiso.', 403);
  res.json(datos);
});

module.exports = router;
