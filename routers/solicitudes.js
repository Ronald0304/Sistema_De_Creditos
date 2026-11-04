/**
 *  ROUTER: SOLICITUDES DE CRÉDITO Y GARANTÍAS  (/api/solicitudes)
 *  Actor principal: Oficial de Crédito  (CU02 - CU06 - RF03 - RF07)

 *  Flujo de estados de una solicitud (RN02):
 *    REGISTRADA -> EN_EVALUACION -> EVALUADA -> APROBADA -> DESEMBOLSADA
 *                                            \-> RECHAZADA
 *    REGISTRADA / EN_EVALUACION -> ANULADA
 *
 *  GET    /parametros               Productos, tasas y tipos de garantía
 *  GET    /                         Listado (filtros: estado, buscar, mias)
 *  GET    /:id                      Detalle completo
 *  POST   /                         Registrar solicitud
 *  PUT    /:id                      Editar (solo REGISTRADA)
 *  POST   /:id/enviar               Enviar a evaluación del Analista
 *  POST   /:id/anular               Anular con motivo
 *  GET    /:id/garantias            Garantías de la solicitud
 *  POST   /:id/garantias            Registrar garantía
 *  PUT    /garantias/:idGarantia    Editar garantía
 *  DELETE /garantias/:idGarantia    Eliminar garantía
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { PRODUCTOS, TIPOS_GARANTIA } = require('../utils/parametros');
const { calcularCuotaFija, fechaHoraAhora } = require('../utils/finanzas');
const { obtenerDetalleSolicitud } = require('../utils/consultas');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();

/** Estados en los que una solicitud se considera "en curso" */
const ESTADOS_EN_CURSO = ['REGISTRADA', 'EN_EVALUACION', 'EVALUADA', 'APROBADA'];
/** Estados en los que aún se pueden gestionar garantías */
const ESTADOS_GARANTIA_EDITABLE = ['REGISTRADA', 'EN_EVALUACION', 'EVALUADA', 'APROBADA'];

/** Valida los datos financieros de la solicitud contra las políticas del producto */
function validarSolicitud(cuerpo) {
  const tipo = opcion(cuerpo.tipo_credito, 'Tipo de crédito', Object.keys(PRODUCTOS));
  const producto = PRODUCTOS[tipo];
  const monto = numero(cuerpo.monto_solicitado, 'Monto solicitado', { min: producto.montoMin, max: producto.montoMax });
  const plazo = numero(cuerpo.plazo_meses, 'Plazo (meses)', { min: producto.plazoMin, max: producto.plazoMax, entero: true });
  return {
    tipo,
    monto,
    plazo,
    tasa: producto.tasa,
    destino: texto(cuerpo.destino, 'Destino del crédito', { min: 3, max: 120 }),
    descripcion: texto(cuerpo.descripcion, 'Descripción', { requerido: false, max: 500 })
  };
}

/** Obtiene una solicitud o lanza 404 */
async function buscarSolicitud(idSolicitud) {
  const solicitud = await db.obtener('SELECT * FROM solicitud_credito WHERE id_solicitud = ?', [idSolicitud]);
  if (!solicitud) throw new ErrorNegocio('Solicitud no encontrada.', 404);
  return solicitud;
}

/* GET /parametros ----------------------------------------------------------- */
router.get('/parametros', proteger(), (req, res) => {
  res.json({
    productos: Object.entries(PRODUCTOS).map(([codigo, p]) => ({ codigo, ...p })),
    tipos_garantia: Object.entries(TIPOS_GARANTIA).map(([codigo, nombre]) => ({ codigo, nombre }))
  });
});

/* GET / --------------------------------------------------------------------- */
router.get('/', proteger('OFICIAL', 'ADMIN', 'GERENTE', 'JEFE'), async (req, res) => {
  const { estado, buscar, mias } = req.query;
  const condiciones = [];
  const parametros = [];
  if (estado) {
    const estados = String(estado).split(',');
    condiciones.push(`s.estado IN (${estados.map(() => '?').join(',')})`);
    parametros.push(...estados);
  }
  if (buscar) {
    condiciones.push("(c.ci LIKE ? OR (c.nombres || ' ' || c.apellidos) LIKE ? OR s.codigo LIKE ?)");
    parametros.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`);
  }
  if (mias === '1') { condiciones.push('s.id_oficial = ?'); parametros.push(req.session.usuario.id); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = await db.todos(
    `SELECT s.id_solicitud, s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.tasa_interes, s.destino,
            s.estado, s.fecha_solicitud, s.fecha_resolucion, s.observacion_resolucion,
            c.id_cliente, c.ci, c.nombres || ' ' || c.apellidos AS cliente,
            o.nombre_completo AS oficial,
            (SELECT COUNT(*) FROM garantia g WHERE g.id_solicitud = s.id_solicitud) AS garantias,
            (SELECT COALESCE(SUM(valor_comercial),0) FROM garantia g WHERE g.id_solicitud = s.id_solicitud) AS valor_garantias,
            e.dictamen, cr.id_credito, cr.numero_credito, cr.estado AS estado_credito
       FROM solicitud_credito s
       JOIN cliente c ON c.id_cliente = s.id_cliente
       JOIN usuario o ON o.id_usuario = s.id_oficial
       LEFT JOIN evaluacion_credito e ON e.id_solicitud = s.id_solicitud
       LEFT JOIN credito cr ON cr.id_solicitud = s.id_solicitud
       ${where}
      ORDER BY s.id_solicitud DESC
      LIMIT 500`,
    parametros
  );
  res.json(filas.map((f) => ({ ...f, producto: PRODUCTOS[f.tipo_credito]?.nombre })));
});

/* GET /:id ------------------------------------------------------------------ */
router.get('/:id', proteger('OFICIAL', 'ANALISTA', 'JEFE', 'GERENTE', 'ADMIN'), async (req, res) => {
  res.json(await obtenerDetalleSolicitud(validarId(req.params.id)));
});

/* POST / -------------------------------------------------------------------- */
router.post('/', proteger('OFICIAL'), async (req, res) => {
  const cuerpo = req.body || {};
  const idCliente = validarId(cuerpo.id_cliente, 'cliente');
  const datos = validarSolicitud(cuerpo);

  const cliente = await db.obtener('SELECT * FROM cliente WHERE id_cliente = ?', [idCliente]);
  if (!cliente) throw new ErrorNegocio('El cliente no existe.', 404);
  if (!cliente.activo) throw new ErrorNegocio('El cliente se encuentra inactivo y no puede solicitar créditos.', 409);

  // Política: un cliente solo puede tener UNA solicitud en curso a la vez
  const enCurso = await db.obtener(
    `SELECT codigo, estado FROM solicitud_credito WHERE id_cliente = ? AND estado IN (${ESTADOS_EN_CURSO.map(() => '?').join(',')})`,
    [idCliente, ...ESTADOS_EN_CURSO]
  );
  if (enCurso) throw new ErrorNegocio(`El cliente ya tiene la solicitud ${enCurso.codigo} en curso (estado: ${enCurso.estado}).`, 409);

  const resultado = await db.transaccion(async (tx) => {
    const temporal = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { idInsertado } = await tx.ejecutar(
      `INSERT INTO solicitud_credito (codigo, id_cliente, id_oficial, tipo_credito, monto_solicitado, plazo_meses, tasa_interes, destino, descripcion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADA')`,
      [temporal, idCliente, req.session.usuario.id, datos.tipo, datos.monto, datos.plazo, datos.tasa, datos.destino, datos.descripcion]
    );
    const codigo = `SOL-${new Date().getFullYear()}-${String(idInsertado).padStart(5, '0')}`;
    await tx.ejecutar('UPDATE solicitud_credito SET codigo = ? WHERE id_solicitud = ?', [codigo, idInsertado]);
    await registrarAuditoria(req, 'CREAR_SOLICITUD', { entidad: 'solicitud_credito', idEntidad: idInsertado, detalle: `${codigo} | CI ${cliente.ci} | Bs ${datos.monto}`, tx });
    return { idInsertado, codigo };
  });

  res.status(201).json({
    mensaje: `Solicitud ${resultado.codigo} registrada. Registre las garantías y envíela a evaluación.`,
    id_solicitud: resultado.idInsertado,
    codigo: resultado.codigo,
    cuota_estimada: calcularCuotaFija(datos.monto, datos.tasa, datos.plazo)
  });
});

/* PUT /:id ------------------------------------------------------------------ */
router.put('/:id', proteger('OFICIAL'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const solicitud = await buscarSolicitud(idSolicitud);
  if (solicitud.estado !== 'REGISTRADA') throw new ErrorNegocio('Solo se pueden editar solicitudes en estado REGISTRADA.', 409);
  const datos = validarSolicitud(req.body || {});
  await db.ejecutar(
    `UPDATE solicitud_credito SET tipo_credito = ?, monto_solicitado = ?, plazo_meses = ?, tasa_interes = ?, destino = ?, descripcion = ?
      WHERE id_solicitud = ?`,
    [datos.tipo, datos.monto, datos.plazo, datos.tasa, datos.destino, datos.descripcion, idSolicitud]
  );
  await registrarAuditoria(req, 'EDITAR_SOLICITUD', { entidad: 'solicitud_credito', idEntidad: idSolicitud, detalle: solicitud.codigo });
  res.json({ mensaje: 'Solicitud actualizada correctamente.' });
});

/* POST /:id/enviar ---------------------------------------------------------- */
router.post('/:id/enviar', proteger('OFICIAL'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const solicitud = await buscarSolicitud(idSolicitud);
  if (solicitud.estado !== 'REGISTRADA') throw new ErrorNegocio('La solicitud ya fue enviada o no está en estado REGISTRADA.', 409);
  await db.ejecutar(
    "UPDATE solicitud_credito SET estado = 'EN_EVALUACION', fecha_envio_evaluacion = ? WHERE id_solicitud = ?",
    [fechaHoraAhora(), idSolicitud]
  );
  await registrarAuditoria(req, 'ENVIAR_EVALUACION', { entidad: 'solicitud_credito', idEntidad: idSolicitud, detalle: solicitud.codigo });
  res.json({ mensaje: `Solicitud ${solicitud.codigo} enviada a la bandeja del Analista de Crédito.` });
});

/* POST /:id/anular ---------------------------------------------------------- */
router.post('/:id/anular', proteger('OFICIAL'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const motivo = texto(req.body?.motivo, 'Motivo de anulación', { min: 5, max: 300 });
  const solicitud = await buscarSolicitud(idSolicitud);
  if (!['REGISTRADA', 'EN_EVALUACION'].includes(solicitud.estado)) {
    throw new ErrorNegocio('Solo se pueden anular solicitudes REGISTRADAS o EN EVALUACIÓN.', 409);
  }
  await db.ejecutar(
    "UPDATE solicitud_credito SET estado = 'ANULADA', observacion_resolucion = ?, fecha_resolucion = ? WHERE id_solicitud = ?",
    [`Anulada por el oficial: ${motivo}`, fechaHoraAhora(), idSolicitud]
  );
  await registrarAuditoria(req, 'ANULAR_SOLICITUD', { entidad: 'solicitud_credito', idEntidad: idSolicitud, detalle: `${solicitud.codigo}: ${motivo}` });
  res.json({ mensaje: 'Solicitud anulada.' });
});

/*  GARANTÍAS  (RN13: tipo, descripción, valor y estado obligatorios) */

/** Valida los datos de una garantía */
function validarGarantia(cuerpo) {
  return {
    tipo: opcion(cuerpo.tipo, 'Tipo de garantía', Object.keys(TIPOS_GARANTIA)),
    descripcion: texto(cuerpo.descripcion, 'Descripción', { min: 5, max: 300 }),
    valor: numero(cuerpo.valor_comercial, 'Valor comercial', { min: 1, max: 100000000 }),
    documento: texto(cuerpo.documento_respaldo, 'Documento de respaldo', { requerido: false, max: 120 })
  };
}

/* GET /:id/garantias -------------------------------------------------------- */
router.get('/:id/garantias', proteger('OFICIAL', 'ANALISTA', 'JEFE', 'GERENTE', 'ADMIN'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const garantias = await db.todos('SELECT * FROM garantia WHERE id_solicitud = ? ORDER BY id_garantia DESC', [idSolicitud]);
  res.json(garantias.map((g) => ({ ...g, tipo_nombre: TIPOS_GARANTIA[g.tipo] })));
});

/* POST /:id/garantias ------------------------------------------------------- */
router.post('/:id/garantias', proteger('OFICIAL'), async (req, res) => {
  const idSolicitud = validarId(req.params.id);
  const solicitud = await buscarSolicitud(idSolicitud);
  if (!ESTADOS_GARANTIA_EDITABLE.includes(solicitud.estado)) {
    throw new ErrorNegocio(`No se pueden registrar garantías en una solicitud ${solicitud.estado}.`, 409);
  }
  const datos = validarGarantia(req.body || {});
  const { idInsertado } = await db.ejecutar(
    `INSERT INTO garantia (id_solicitud, tipo, descripcion, valor_comercial, documento_respaldo, estado, id_oficial)
     VALUES (?, ?, ?, ?, ?, 'REGISTRADA', ?)`,
    [idSolicitud, datos.tipo, datos.descripcion, datos.valor, datos.documento, req.session.usuario.id]
  );
  await registrarAuditoria(req, 'REGISTRAR_GARANTIA', { entidad: 'garantia', idEntidad: idInsertado, detalle: `${solicitud.codigo} | ${datos.tipo} | Bs ${datos.valor}` });
  res.status(201).json({ mensaje: 'Garantía registrada correctamente.', id_garantia: idInsertado });
});

/** Obtiene una garantía junto con el estado de su solicitud */
async function buscarGarantiaEditable(idGarantia) {
  const garantia = await db.obtener(
    `SELECT g.*, s.estado AS estado_solicitud, s.codigo FROM garantia g
       JOIN solicitud_credito s ON s.id_solicitud = g.id_solicitud WHERE g.id_garantia = ?`,
    [idGarantia]
  );
  if (!garantia) throw new ErrorNegocio('Garantía no encontrada.', 404);
  if (!ESTADOS_GARANTIA_EDITABLE.includes(garantia.estado_solicitud)) {
    throw new ErrorNegocio('La garantía ya no puede modificarse: el crédito fue desembolsado o la solicitud está cerrada.', 409);
  }
  return garantia;
}

/* PUT /garantias/:idGarantia ------------------------------------------------ */
router.put('/garantias/:idGarantia', proteger('OFICIAL'), async (req, res) => {
  const idGarantia = validarId(req.params.idGarantia, 'garantía');
  const garantia = await buscarGarantiaEditable(idGarantia);
  const datos = validarGarantia(req.body || {});
  await db.ejecutar(
    'UPDATE garantia SET tipo = ?, descripcion = ?, valor_comercial = ?, documento_respaldo = ? WHERE id_garantia = ?',
    [datos.tipo, datos.descripcion, datos.valor, datos.documento, idGarantia]
  );
  await registrarAuditoria(req, 'EDITAR_GARANTIA', { entidad: 'garantia', idEntidad: idGarantia, detalle: garantia.codigo });
  res.json({ mensaje: 'Garantía actualizada.' });
});

/* DELETE /garantias/:idGarantia --------------------------------------------- */
router.delete('/garantias/:idGarantia', proteger('OFICIAL'), async (req, res) => {
  const idGarantia = validarId(req.params.idGarantia, 'garantía');
  const garantia = await buscarGarantiaEditable(idGarantia);
  await db.ejecutar('DELETE FROM garantia WHERE id_garantia = ?', [idGarantia]);
  await registrarAuditoria(req, 'ELIMINAR_GARANTIA', { entidad: 'garantia', idEntidad: idGarantia, detalle: `${garantia.codigo} | ${garantia.tipo}` });
  res.json({ mensaje: 'Garantía eliminada.' });
});

module.exports = router;
