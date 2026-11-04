/**
 *  ROUTER: REPROGRAMACIÓN DE CRÉDITOS  (/api/reprogramaciones)
 *  Clientes en mora temprana: solicitud (Cliente) -> simulación y dictamen
 *  (Oficial de Crédito) -> aprobación o rechazo (Jefe de Crédito).

 *  CLIENTE
 *    GET  /mis-creditos               Elegibilidad y reprogramaciones de sus créditos
 *    POST /                           Enviar solicitud (estado PENDIENTE_EVALUACION)
 *  OFICIAL / JEFE
 *    GET  /bandeja?vista=pendientes   Bandeja según el rol (o vista=historial)
 *    GET  /:id                        Expediente completo + simulación
 *    POST /:id/simular                Simular el nuevo plan sin guardar (Oficial)
 *    POST /:id/derivar                Guardar simulación + dictamen y derivar al Jefe (Oficial)
 *    POST /:id/aprobar                Aprobar: nuevo cronograma + Adenda (Jefe)
 *    POST /:id/rechazar               Rechazar con motivo (Jefe)
 *  DOCUMENTOS
 *    GET  /:id/adjuntos/:idAdjunto    Ver un documento de respaldo
 *    GET  /:id/adenda                 Datos de la Adenda al contrato (solo APROBADA)
 */
const crypto = require('crypto');
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { registrarAuditoria } = require('../utils/auditoria');
const { actualizarMora } = require('../utils/mora');
const { PRODUCTOS, ENTIDAD } = require('../utils/parametros');
const { fechaHoraAhora } = require('../utils/finanzas');
const {
  ESTADOS_EN_CURSO, plazoMaximo, obtenerSituacionCredito, evaluarElegibilidad, plazoParaCuota,
  calcularSimulacion, validarAdjuntos, aplicarReprogramacion
} = require('../utils/reprogramacion');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();

/** Columnas de la reprogramación + nombres de cliente, crédito, oficial y jefe */
const SELECT_REPROGRAMACION = `
  SELECT r.id_reprogramacion, r.codigo, r.id_credito, r.id_cliente, r.estado, r.motivo, r.tipo_propuesta, r.propuesta_plazo,
         r.propuesta_cuota, r.cuotas_vencidas, r.dias_mora, r.monto_vencido, r.fecha_solicitud, r.id_oficial, r.fecha_evaluacion,
         r.nuevo_plazo, r.nueva_tasa, r.saldo_capital_anterior, r.interes_vencido, r.interes_moratorio, r.capital_reprogramado,
         r.nueva_cuota, r.recomendacion, r.dictamen_oficial, r.id_jefe, r.fecha_resolucion, r.observacion_resolucion, r.numero_adenda,
         c.ci, c.extension, c.nombres || ' ' || c.apellidos AS cliente,
         cr.numero_credito, cr.numero_contrato, cr.estado AS estado_credito, s.tipo_credito,
         o.nombre_completo AS oficial, j.nombre_completo AS jefe,
         (SELECT COUNT(*) FROM reprogramacion_adjunto a WHERE a.id_reprogramacion = r.id_reprogramacion) AS adjuntos
    FROM reprogramacion r
    JOIN cliente c           ON c.id_cliente   = r.id_cliente
    JOIN credito cr          ON cr.id_credito  = r.id_credito
    JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
    LEFT JOIN usuario o      ON o.id_usuario   = r.id_oficial
    LEFT JOIN usuario j      ON j.id_usuario   = r.id_jefe`;

/** Agrega el nombre del producto */
const conProducto = (fila) => (fila ? { ...fila, producto: PRODUCTOS[fila.tipo_credito]?.nombre || fila.tipo_credito } : fila);

/** Obtiene una reprogramación o lanza 404 */
async function obtenerReprogramacion(ejecutor, idReprogramacion) {
  const fila = await ejecutor.obtener(`${SELECT_REPROGRAMACION} WHERE r.id_reprogramacion = ?`, [idReprogramacion]);
  if (!fila) throw new ErrorNegocio('Solicitud de reprogramación no encontrada.', 404);
  return conProducto(fila);
}

/** El cliente solo puede acceder a SUS reprogramaciones (RNF02) */
function validarPropietario(req, rep) {
  const { rol, id_cliente: idCliente } = req.session.usuario;
  if (rol === 'CLIENTE' && (!idCliente || rep.id_cliente !== idCliente)) {
    throw new ErrorNegocio('No tiene permiso para ver esta solicitud de reprogramación.', 403);
  }
}

/** Valida los parámetros que el Oficial usa en el simulador */
function validarParametrosSimulacion(cuerpo, situacion) {
  const tope = plazoMaximo(situacion.credito.tipo_credito);
  return {
    plazo: numero(cuerpo.plazo, 'Nuevo plazo (meses)', { min: 1, max: tope, entero: true }),
    tasa: numero(cuerpo.tasa, 'Tasa de interés anual (%)', { min: 0, max: 40 })
  };
}

/* ============================================================================
 *  CLIENTE
 * ========================================================================== */

/* GET /mis-creditos ---------------------------------------------------------- */
router.get('/mis-creditos', proteger('CLIENTE'), async (req, res) => {
  const idCliente = req.session.usuario.id_cliente;
  if (!idCliente) throw new ErrorNegocio('La cuenta no está vinculada a un cliente.', 403);
  await actualizarMora();

  const creditos = await db.todos(
    `SELECT cr.id_credito FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE s.id_cliente = ? ORDER BY cr.id_credito DESC`,
    [idCliente]
  );
  const resultado = [];
  for (const { id_credito: idCredito } of creditos) {
    const situacion = await obtenerSituacionCredito(db, idCredito);
    const reprogramaciones = await db.todos(
      `SELECT id_reprogramacion, codigo, estado, fecha_solicitud, fecha_resolucion, observacion_resolucion, numero_adenda,
              nueva_cuota, nuevo_plazo
         FROM reprogramacion WHERE id_credito = ? ORDER BY id_reprogramacion DESC`,
      [idCredito]
    );
    resultado.push({
      id_credito: idCredito,
      numero_credito: situacion.credito.numero_credito,
      saldo_capital: situacion.saldo_capital,
      cuota_mensual: situacion.credito.cuota_mensual,
      plazo_maximo: plazoMaximo(situacion.credito.tipo_credito),
      elegibilidad: evaluarElegibilidad(situacion),
      reprogramado: reprogramaciones.some((r) => r.estado === 'APROBADA'),
      en_curso: reprogramaciones.find((r) => ESTADOS_EN_CURSO.includes(r.estado)) || null,
      ultima: reprogramaciones[0] || null
    });
  }
  res.json(resultado);
});

/* POST /  (enviar solicitud) -------------------------------------------------- */
router.post('/', proteger('CLIENTE'), async (req, res) => {
  const idCliente = req.session.usuario.id_cliente;
  if (!idCliente) throw new ErrorNegocio('La cuenta no está vinculada a un cliente.', 403);
  const cuerpo = req.body || {};
  const idCredito = validarId(cuerpo.id_credito, 'id_credito');
  const motivo = texto(cuerpo.motivo, 'Motivo / justificativo de la mora', { min: 20, max: 1000 });
  const tipoPropuesta = opcion(cuerpo.tipo_propuesta, 'Tipo de propuesta', ['PLAZO', 'CUOTA']);
  const adjuntos = validarAdjuntos(cuerpo.adjuntos);
  await actualizarMora();

  const resultado = await db.transaccion(async (tx) => {
    const situacion = await obtenerSituacionCredito(tx, idCredito);
    if (situacion.credito.id_cliente !== idCliente) throw new ErrorNegocio('No tiene permiso sobre este crédito.', 403);

    const enCurso = await tx.obtener(
      `SELECT codigo FROM reprogramacion WHERE id_credito = ? AND estado IN ('PENDIENTE_EVALUACION','EN_REVISION_JEFE')`,
      [idCredito]
    );
    if (enCurso) throw new ErrorNegocio(`Ya tiene una solicitud de reprogramación en curso (${enCurso.codigo}).`, 409);

    // La elegibilidad SIEMPRE se verifica en el servidor (no basta con ocultar el botón)
    const elegibilidad = evaluarElegibilidad(situacion);
    if (!elegibilidad.elegible) throw new ErrorNegocio(elegibilidad.mensaje, 409);

    const propuestaPlazo = tipoPropuesta === 'PLAZO'
      ? numero(cuerpo.propuesta_plazo, 'Plazo propuesto (meses)', { min: 1, max: plazoMaximo(situacion.credito.tipo_credito), entero: true })
      : null;
    const propuestaCuota = tipoPropuesta === 'CUOTA'
      ? numero(cuerpo.propuesta_cuota, 'Cuota máxima propuesta (Bs)', { min: 1, max: situacion.saldo_capital + situacion.monto_vencido })
      : null;

    // Código legible: se inserta con un código temporal y luego se asigna el definitivo
    const { idInsertado } = await tx.ejecutar(
      `INSERT INTO reprogramacion (codigo, id_credito, id_cliente, estado, motivo, tipo_propuesta, propuesta_plazo, propuesta_cuota,
                                   cuotas_vencidas, dias_mora, monto_vencido, fecha_solicitud)
       VALUES (?, ?, ?, 'PENDIENTE_EVALUACION', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`TMP-${crypto.randomBytes(6).toString('hex')}`, idCredito, idCliente, motivo, tipoPropuesta, propuestaPlazo, propuestaCuota,
        situacion.cuotas_vencidas, situacion.dias_mora, situacion.monto_vencido, fechaHoraAhora()]
    );
    const codigo = `REP-${fechaHoraAhora().slice(0, 4)}-${String(idInsertado).padStart(5, '0')}`;
    await tx.ejecutar('UPDATE reprogramacion SET codigo = ? WHERE id_reprogramacion = ?', [codigo, idInsertado]);

    for (const adjunto of adjuntos) {
      await tx.ejecutar(
        'INSERT INTO reprogramacion_adjunto (id_reprogramacion, nombre, tipo_mime, tamano, contenido) VALUES (?, ?, ?, ?, ?)',
        [idInsertado, adjunto.nombre, adjunto.tipo, adjunto.buffer.length, adjunto.buffer]
      );
    }
    await registrarAuditoria(req, 'SOLICITAR_REPROGRAMACION', {
      entidad: 'reprogramacion', idEntidad: idInsertado,
      detalle: `${codigo} | ${situacion.credito.numero_credito} | ${situacion.cuotas_vencidas} cuota(s) vencida(s), ${situacion.dias_mora} días | ${adjuntos.length} adjunto(s)`, tx
    });
    return { idInsertado, codigo };
  });

  res.status(201).json({
    mensaje: `Solicitud ${resultado.codigo} enviada. Su Oficial de Crédito la evaluará y le informaremos el resultado.`,
    id_reprogramacion: resultado.idInsertado,
    codigo: resultado.codigo,
    estado: 'PENDIENTE_EVALUACION'
  });
});

/* ============================================================================
 *  OFICIAL DE CRÉDITO / JEFE DE CRÉDITO
 * ========================================================================== */

/* GET /bandeja ---------------------------------------------------------------- */
router.get('/bandeja', proteger('OFICIAL', 'JEFE'), async (req, res) => {
  const { rol } = req.session.usuario;
  const vista = req.query.vista === 'historial' ? 'historial' : 'pendientes';
  const estadoPendiente = rol === 'OFICIAL' ? 'PENDIENTE_EVALUACION' : 'EN_REVISION_JEFE';

  const filas = vista === 'pendientes'
    ? await db.todos(`${SELECT_REPROGRAMACION} WHERE r.estado = ? ORDER BY r.fecha_solicitud ASC`, [estadoPendiente])
    : await db.todos(`${SELECT_REPROGRAMACION} ORDER BY r.id_reprogramacion DESC LIMIT 200`);

  const metricas = await db.obtener(
    `SELECT SUM(CASE WHEN estado = 'PENDIENTE_EVALUACION' THEN 1 ELSE 0 END) AS pendientes_evaluacion,
            SUM(CASE WHEN estado = 'EN_REVISION_JEFE' THEN 1 ELSE 0 END)     AS en_revision_jefe,
            SUM(CASE WHEN estado = 'APROBADA'  AND substr(fecha_resolucion, 1, 7) = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END) AS aprobadas_mes,
            SUM(CASE WHEN estado = 'RECHAZADA' AND substr(fecha_resolucion, 1, 7) = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END) AS rechazadas_mes
       FROM reprogramacion`
  );
  res.json({
    vista,
    metricas: {
      pendientes_evaluacion: metricas.pendientes_evaluacion || 0,
      en_revision_jefe: metricas.en_revision_jefe || 0,
      aprobadas_mes: metricas.aprobadas_mes || 0,
      rechazadas_mes: metricas.rechazadas_mes || 0
    },
    reprogramaciones: filas.map(conProducto)
  });
});

/* GET /:id  (expediente + simulación) ---------------------------------------- */
router.get('/:id', proteger('OFICIAL', 'JEFE', 'GERENTE', 'ADMIN'), async (req, res) => {
  const idReprogramacion = validarId(req.params.id);
  await actualizarMora();
  const rep = await obtenerReprogramacion(db, idReprogramacion);
  const cliente = await db.obtener(
    `SELECT ci, extension, nombres, apellidos, telefono, correo, ocupacion, ingresos_mensuales, gastos_mensuales
       FROM cliente WHERE id_cliente = ?`,
    [rep.id_cliente]
  );
  const situacion = await obtenerSituacionCredito(db, rep.id_credito);
  const adjuntos = await db.todos(
    'SELECT id_adjunto, nombre, tipo_mime, tamano, fecha_carga FROM reprogramacion_adjunto WHERE id_reprogramacion = ? ORDER BY id_adjunto',
    [idReprogramacion]
  );
  const tope = plazoMaximo(situacion.credito.tipo_credito);

  // Simulación vigente (solo mientras la solicitud está en curso)
  let simulacion = null;
  let plazoSugerido = null;
  if (ESTADOS_EN_CURSO.includes(rep.estado) && situacion.pendientes.length) {
    const capital = situacion.saldo_capital + situacion.interes_vencido + situacion.interes_moratorio;
    const tasa = rep.nueva_tasa ?? situacion.credito.tasa_interes;
    if (rep.tipo_propuesta === 'PLAZO') plazoSugerido = Math.min(rep.propuesta_plazo, tope);
    else plazoSugerido = plazoParaCuota(capital, tasa, rep.propuesta_cuota, tope) || tope;
    simulacion = calcularSimulacion(situacion, { plazo: rep.nuevo_plazo || plazoSugerido, tasa });
  }
  const { limite_aprobacion: limite } = await db.obtener('SELECT limite_aprobacion FROM usuario WHERE id_usuario = ?', [req.session.usuario.id]);

  res.json({
    reprogramacion: rep,
    cliente,
    credito: {
      ...situacion.credito,
      producto: PRODUCTOS[situacion.credito.tipo_credito]?.nombre || situacion.credito.tipo_credito
    },
    situacion: {
      cuotas_pagadas: situacion.cuotas_pagadas,
      cuotas_pendientes: situacion.pendientes.length,
      cuotas_vencidas: situacion.cuotas_vencidas,
      dias_mora: situacion.dias_mora,
      saldo_capital: situacion.saldo_capital,
      interes_vencido: situacion.interes_vencido,
      interes_moratorio: situacion.interes_moratorio,
      monto_vencido: situacion.monto_vencido
    },
    adjuntos,
    plazo_maximo: tope,
    plazo_sugerido: plazoSugerido,
    simulacion,
    limite_aprobacion: limite
  });
});

/* POST /:id/simular  (no guarda nada) ---------------------------------------- */
router.post('/:id/simular', proteger('OFICIAL'), async (req, res) => {
  const rep = await obtenerReprogramacion(db, validarId(req.params.id));
  if (!ESTADOS_EN_CURSO.includes(rep.estado)) throw new ErrorNegocio('La solicitud ya fue resuelta.', 409);
  const situacion = await obtenerSituacionCredito(db, rep.id_credito);
  if (!situacion.pendientes.length) throw new ErrorNegocio('El crédito no tiene cuotas pendientes.', 409);
  const parametros = validarParametrosSimulacion(req.body || {}, situacion);
  res.json(calcularSimulacion(situacion, parametros));
});

/* POST /:id/derivar  (Oficial -> Jefe) ---------------------------------------- */
router.post('/:id/derivar', proteger('OFICIAL'), async (req, res) => {
  const idReprogramacion = validarId(req.params.id);
  const cuerpo = req.body || {};
  const recomendacion = opcion(cuerpo.recomendacion, 'Recomendación', ['FAVORABLE', 'NO_FAVORABLE']);
  const dictamen = texto(cuerpo.dictamen, 'Dictamen del Oficial', { min: 20, max: 1000 });
  await actualizarMora();

  const resultado = await db.transaccion(async (tx) => {
    const rep = await obtenerReprogramacion(tx, idReprogramacion);
    if (rep.estado !== 'PENDIENTE_EVALUACION') throw new ErrorNegocio('Esta solicitud ya fue evaluada y derivada.', 409);
    const situacion = await obtenerSituacionCredito(tx, rep.id_credito);
    if (!['VIGENTE', 'EN_MORA'].includes(situacion.credito.estado) || !situacion.pendientes.length) {
      throw new ErrorNegocio('El crédito ya no está activo o no tiene cuotas pendientes.', 409);
    }
    const parametros = validarParametrosSimulacion(cuerpo, situacion);
    const sim = calcularSimulacion(situacion, parametros);
    await tx.ejecutar(
      `UPDATE reprogramacion
          SET estado = 'EN_REVISION_JEFE', id_oficial = ?, fecha_evaluacion = ?, nuevo_plazo = ?, nueva_tasa = ?,
              saldo_capital_anterior = ?, interes_vencido = ?, interes_moratorio = ?, capital_reprogramado = ?, nueva_cuota = ?,
              recomendacion = ?, dictamen_oficial = ?
        WHERE id_reprogramacion = ?`,
      [req.session.usuario.id, fechaHoraAhora(), sim.plazo, sim.tasa, sim.saldo_capital_anterior, sim.interes_vencido,
        sim.interes_moratorio, sim.capital_reprogramado, sim.cuota, recomendacion, dictamen, idReprogramacion]
    );
    await registrarAuditoria(req, 'DERIVAR_REPROGRAMACION', {
      entidad: 'reprogramacion', idEntidad: idReprogramacion,
      detalle: `${rep.codigo} | ${recomendacion} | Capital Bs ${sim.capital_reprogramado} | ${sim.plazo} meses al ${sim.tasa}% | Cuota Bs ${sim.cuota}`, tx
    });
    return { rep, sim };
  });

  res.json({ mensaje: `Solicitud ${resultado.rep.codigo} derivada al Jefe de Crédito con dictamen ${recomendacion === 'FAVORABLE' ? 'FAVORABLE' : 'NO FAVORABLE'}.` });
});

/* POST /:id/aprobar  (Jefe) ---------------------------------------------------- */
router.post('/:id/aprobar', proteger('JEFE'), async (req, res) => {
  const idReprogramacion = validarId(req.params.id);
  const observacion = texto((req.body || {}).observacion, 'Observación', { requerido: false, max: 500 }) || 'Reprogramación aprobada.';
  await actualizarMora();

  const resultado = await db.transaccion(async (tx) => {
    const rep = await obtenerReprogramacion(tx, idReprogramacion);
    if (rep.estado !== 'EN_REVISION_JEFE') throw new ErrorNegocio('Solo se pueden aprobar solicitudes derivadas por el Oficial de Crédito.', 409);
    // Igual que RN03: no se aprueba sin dictamen favorable
    if (rep.recomendacion !== 'FAVORABLE') throw new ErrorNegocio('El dictamen del Oficial es NO FAVORABLE: la reprogramación solo puede ser rechazada.', 409);

    // RN04: el Jefe debe tener atribución para el capital a reprogramar
    const situacion = await obtenerSituacionCredito(tx, rep.id_credito);
    const capital = situacion.saldo_capital + situacion.interes_vencido + situacion.interes_moratorio;
    const { limite_aprobacion: limite } = await tx.obtener('SELECT limite_aprobacion FROM usuario WHERE id_usuario = ?', [req.session.usuario.id]);
    if (capital > limite) {
      throw new ErrorNegocio(`RN04: El capital a reprogramar (Bs ${capital.toFixed(2)}) supera su límite de aprobación (Bs ${limite.toFixed(2)}).`, 403);
    }

    const r = await aplicarReprogramacion(tx, { reprogramacion: rep, idJefe: req.session.usuario.id, observacion });
    await registrarAuditoria(req, 'APROBAR_REPROGRAMACION', {
      entidad: 'reprogramacion', idEntidad: idReprogramacion,
      detalle: `${rep.codigo} | ${r.credito.numero_credito} | Adenda ${r.numeroAdenda} | Capital Bs ${r.simulacion.capital_reprogramado} | `
        + `${r.simulacion.plazo} meses | Cuota Bs ${r.simulacion.cuota}`, tx
    });
    return { rep, ...r };
  });

  res.json({
    mensaje: `Reprogramación ${resultado.rep.codigo} aprobada. El crédito ${resultado.credito.numero_credito} queda al día con un nuevo cronograma de ${resultado.simulacion.plazo} cuotas.`,
    id_reprogramacion: idReprogramacion,
    id_credito: resultado.rep.id_credito,
    numero_adenda: resultado.numeroAdenda,
    nueva_cuota: resultado.simulacion.cuota,
    nuevo_plazo: resultado.simulacion.plazo
  });
});

/* POST /:id/rechazar  (Jefe) --------------------------------------------------- */
router.post('/:id/rechazar', proteger('JEFE'), async (req, res) => {
  const idReprogramacion = validarId(req.params.id);
  const motivo = texto((req.body || {}).motivo, 'Motivo del rechazo', { min: 10, max: 500 });

  const rep = await db.transaccion(async (tx) => {
    const fila = await obtenerReprogramacion(tx, idReprogramacion);
    if (fila.estado !== 'EN_REVISION_JEFE') throw new ErrorNegocio('Solo se pueden rechazar solicitudes derivadas por el Oficial de Crédito.', 409);
    await tx.ejecutar(
      `UPDATE reprogramacion SET estado = 'RECHAZADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ?
        WHERE id_reprogramacion = ?`,
      [req.session.usuario.id, fechaHoraAhora(), motivo, idReprogramacion]
    );
    await registrarAuditoria(req, 'RECHAZAR_REPROGRAMACION', {
      entidad: 'reprogramacion', idEntidad: idReprogramacion, detalle: `${fila.codigo} | Motivo: ${motivo}`, tx
    });
    return fila;
  });
  res.json({ mensaje: `Reprogramación ${rep.codigo} rechazada. El cliente podrá ver el motivo en su portal.` });
});

/* ============================================================================
 *  DOCUMENTOS
 * ========================================================================== */

/* GET /:id/adjuntos/:idAdjunto ------------------------------------------------- */
router.get('/:id/adjuntos/:idAdjunto', proteger('OFICIAL', 'JEFE', 'GERENTE', 'ADMIN', 'CLIENTE'), async (req, res) => {
  const rep = await obtenerReprogramacion(db, validarId(req.params.id));
  validarPropietario(req, rep);
  const adjunto = await db.obtener(
    'SELECT nombre, tipo_mime, contenido FROM reprogramacion_adjunto WHERE id_adjunto = ? AND id_reprogramacion = ?',
    [validarId(req.params.idAdjunto, 'idAdjunto'), rep.id_reprogramacion]
  );
  if (!adjunto) throw new ErrorNegocio('Documento no encontrado.', 404);
  res.setHeader('Content-Type', adjunto.tipo_mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(adjunto.nombre)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(adjunto.contenido);
});

/* GET /:id/adenda --------------------------------------------------------------- */
router.get('/:id/adenda', proteger('OFICIAL', 'JEFE', 'GERENTE', 'ADMIN', 'CLIENTE'), async (req, res) => {
  const idReprogramacion = validarId(req.params.id);
  const rep = await obtenerReprogramacion(db, idReprogramacion);
  validarPropietario(req, rep);
  if (rep.estado !== 'APROBADA') throw new ErrorNegocio('La Adenda solo existe para reprogramaciones aprobadas.', 409);

  const { detalle_adenda: detalle } = await db.obtener('SELECT detalle_adenda FROM reprogramacion WHERE id_reprogramacion = ?', [idReprogramacion]);
  const cliente = await db.obtener('SELECT ci, extension, nombres, apellidos, direccion, telefono FROM cliente WHERE id_cliente = ?', [rep.id_cliente]);
  const credito = await db.obtener(
    `SELECT cr.numero_credito, cr.numero_contrato, cr.monto_aprobado, cr.fecha_desembolso, s.tipo_credito
       FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud WHERE cr.id_credito = ?`,
    [rep.id_credito]
  );
  res.json({
    entidad: ENTIDAD,
    reprogramacion: rep,
    cliente,
    credito: { ...credito, producto: PRODUCTOS[credito.tipo_credito]?.nombre || credito.tipo_credito },
    ...JSON.parse(detalle || '{}')
  });
});

module.exports = router;
