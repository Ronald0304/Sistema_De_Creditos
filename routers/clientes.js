/**
 *  ROUTER: GESTIÓN DE CLIENTES  (/api/clientes)   (CU01 - RF01 - RF02)

 *  GET   /              Listado con búsqueda (Oficial, Administrador, Gerente)
 *  GET   /ci/:ci        Buscar cliente por CI
 *  GET   /:id           Ficha completa del cliente
 *  POST  /              Registrar cliente + cuenta de acceso (usuario = CI, clave = CI)
 *  PUT   /:id           Actualizar datos del cliente
 *  PATCH /:id/estado    Activar / desactivar cliente (Administrador)
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { hashClave } = require('../utils/seguridad');
const { registrarAuditoria } = require('../utils/auditoria');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();

const EXTENSIONES = ['LP', 'CB', 'SC', 'OR', 'PT', 'CH', 'TJ', 'BN', 'PD', 'EXT'];
const PATRON_CI = /^[0-9]{5,10}(-[0-9A-Z]{1,2})?$/;
const PATRON_TELEFONO = /^[0-9+\s-]{7,15}$/;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida y normaliza los datos del formulario de cliente */
function validarCliente(cuerpo, { incluirCi = true } = {}) {
  const datos = {
    extension: opcion(cuerpo.extension || 'LP', 'Extensión', EXTENSIONES),
    nombres: texto(cuerpo.nombres, 'Nombres', { min: 2, max: 80 }),
    apellidos: texto(cuerpo.apellidos, 'Apellidos', { min: 2, max: 80 }),
    fecha_nacimiento: texto(cuerpo.fecha_nacimiento, 'Fecha de nacimiento', { requerido: false, patron: /^\d{4}-\d{2}-\d{2}$/ }),
    telefono: texto(cuerpo.telefono, 'Teléfono', { patron: PATRON_TELEFONO, mensajePatron: 'El teléfono debe tener entre 7 y 15 dígitos.' }),
    correo: texto(cuerpo.correo, 'Correo', { requerido: false, max: 100, patron: PATRON_CORREO, mensajePatron: 'El correo electrónico no es válido.' }),
    direccion: texto(cuerpo.direccion, 'Dirección', { min: 5, max: 200 }),
    ocupacion: texto(cuerpo.ocupacion, 'Ocupación', { min: 3, max: 100 }),
    ingresos_mensuales: numero(cuerpo.ingresos_mensuales, 'Ingresos mensuales', { min: 0, max: 10000000 }),
    gastos_mensuales: numero(cuerpo.gastos_mensuales ?? 0, 'Gastos mensuales', { min: 0, max: 10000000 })
  };
  if (incluirCi) {
    datos.ci = texto(String(cuerpo.ci || '').toUpperCase(), 'CI', { patron: PATRON_CI, mensajePatron: 'El CI debe contener entre 5 y 10 dígitos (complemento opcional, ej.: 1234567-1A).' });
  }
  if (datos.fecha_nacimiento) {
    const edad = (Date.now() - new Date(datos.fecha_nacimiento).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (edad < 18 || edad > 100) throw new ErrorNegocio('El cliente debe ser mayor de edad (18 años o más).');
  }
  return datos;
}

/* GET / --------- */
router.get('/', proteger('OFICIAL', 'ADMIN', 'GERENTE'), async (req, res) => {
  const { buscar, estado } = req.query;
  const condiciones = [];
  const parametros = [];
  if (buscar) {
    condiciones.push("(c.ci LIKE ? OR (c.nombres || ' ' || c.apellidos) LIKE ?)");
    parametros.push(`%${buscar}%`, `%${buscar}%`);
  }
  if (estado === 'activos') condiciones.push('c.activo = 1');
  if (estado === 'inactivos') condiciones.push('c.activo = 0');
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const clientes = await db.todos(
    `SELECT c.*, o.nombre_completo AS oficial, u.debe_cambiar_clave, u.ultimo_acceso, u.id_usuario,
            (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_cliente = c.id_cliente) AS solicitudes,
            (SELECT COUNT(*) FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
              WHERE s.id_cliente = c.id_cliente AND cr.estado IN ('VIGENTE','EN_MORA')) AS creditos_activos,
            (SELECT COUNT(*) FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
              WHERE s.id_cliente = c.id_cliente AND cr.estado = 'EN_MORA') AS creditos_mora
       FROM cliente c
       LEFT JOIN usuario o ON o.id_usuario = c.id_oficial
       LEFT JOIN usuario u ON u.id_cliente = c.id_cliente
       ${where}
      ORDER BY c.id_cliente DESC`,
    parametros
  );
  res.json(clientes);
});

/* GET /ci/:ci ----- */
router.get('/ci/:ci', proteger('OFICIAL', 'ADMIN'), async (req, res) => {
  const ci = String(req.params.ci || '').trim().toUpperCase();
  const cliente = await db.obtener(
    `SELECT id_cliente, ci, extension, nombres, apellidos, ingresos_mensuales, gastos_mensuales, activo,
            (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_cliente = cliente.id_cliente
               AND s.estado IN ('REGISTRADA','EN_EVALUACION','EVALUADA','APROBADA')) AS solicitudes_en_curso
       FROM cliente WHERE ci = ?`,
    [ci]
  );
  if (!cliente) throw new ErrorNegocio('No existe un cliente con ese CI. Debe registrarlo primero.', 404);
  res.json(cliente);
});

/* GET /:id ------------------------------------------------------------------ */
router.get('/:id', proteger('OFICIAL', 'ADMIN', 'GERENTE'), async (req, res) => {
  const idCliente = validarId(req.params.id);
  const cliente = await db.obtener(
    `SELECT c.*, o.nombre_completo AS oficial, u.login, u.debe_cambiar_clave, u.ultimo_acceso, u.id_usuario
       FROM cliente c
       LEFT JOIN usuario o ON o.id_usuario = c.id_oficial
       LEFT JOIN usuario u ON u.id_cliente = c.id_cliente
      WHERE c.id_cliente = ?`,
    [idCliente]
  );
  if (!cliente) throw new ErrorNegocio('Cliente no encontrado.', 404);
  const solicitudes = await db.todos(
    `SELECT s.id_solicitud, s.codigo, s.tipo_credito, s.monto_solicitado, s.plazo_meses, s.estado, s.fecha_solicitud,
            cr.id_credito, cr.numero_credito, cr.estado AS estado_credito, cr.saldo_capital
       FROM solicitud_credito s LEFT JOIN credito cr ON cr.id_solicitud = s.id_solicitud
      WHERE s.id_cliente = ? ORDER BY s.id_solicitud DESC`,
    [idCliente]
  );
  const historial = await db.obtener('SELECT * FROM historial_crediticio WHERE id_cliente = ?', [idCliente]);
  res.json({ cliente, solicitudes, historial });
});

/* POST / -------------------------------------------------------------------- */
router.post('/', proteger('OFICIAL', 'ADMIN'), async (req, res) => {
  const datos = validarCliente(req.body || {});
  const existe = await db.obtener('SELECT 1 FROM cliente WHERE ci = ?', [datos.ci]);
  if (existe) throw new ErrorNegocio('El número de CI ya se encuentra registrado en el sistema.', 409);
  const loginOcupado = await db.obtener('SELECT 1 FROM usuario WHERE LOWER(login) = LOWER(?)', [datos.ci]);
  if (loginOcupado) throw new ErrorNegocio('Ya existe una cuenta de acceso con ese CI como usuario.', 409);

  const idCliente = await db.transaccion(async (tx) => {
    const { idInsertado } = await tx.ejecutar(
      `INSERT INTO cliente (ci, extension, nombres, apellidos, fecha_nacimiento, telefono, correo, direccion, ocupacion,
                            ingresos_mensuales, gastos_mensuales, id_oficial)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [datos.ci, datos.extension, datos.nombres, datos.apellidos, datos.fecha_nacimiento, datos.telefono, datos.correo,
        datos.direccion, datos.ocupacion, datos.ingresos_mensuales, datos.gastos_mensuales, req.session.usuario.id]
    );
    // Cuenta de acceso al portal: usuario = CI, contraseña inicial = CI (cambio obligatorio)
    await tx.ejecutar(
      `INSERT INTO usuario (nombre_completo, login, clave_hash, correo, rol, id_cliente, activo, debe_cambiar_clave)
       VALUES (?, ?, ?, ?, 'CLIENTE', ?, 1, 1)`,
      [`${datos.nombres} ${datos.apellidos}`, datos.ci.toLowerCase(), hashClave(datos.ci), datos.correo, idInsertado]
    );
    await registrarAuditoria(req, 'CREAR_CLIENTE', { entidad: 'cliente', idEntidad: idInsertado, detalle: `CI ${datos.ci} - ${datos.nombres} ${datos.apellidos}`, tx });
    return idInsertado;
  });

  res.status(201).json({
    mensaje: 'Cliente registrado correctamente con acceso al portal.',
    id_cliente: idCliente,
    credenciales: { usuario: datos.ci.toLowerCase(), clave: datos.ci, nota: 'En su primer ingreso el cliente deberá cambiar obligatoriamente su contraseña.' }
  });
});

/* PUT /:id ------------- */
router.put('/:id', proteger('OFICIAL', 'ADMIN'), async (req, res) => {
  const idCliente = validarId(req.params.id);
  const actual = await db.obtener('SELECT * FROM cliente WHERE id_cliente = ?', [idCliente]);
  if (!actual) throw new ErrorNegocio('Cliente no encontrado.', 404);
  // El CI no se modifica: es el identificador y el usuario de acceso del cliente
  const datos = validarCliente(req.body || {}, { incluirCi: false });

  await db.transaccion(async (tx) => {
    await tx.ejecutar(
      `UPDATE cliente SET extension = ?, nombres = ?, apellidos = ?, fecha_nacimiento = ?, telefono = ?, correo = ?,
              direccion = ?, ocupacion = ?, ingresos_mensuales = ?, gastos_mensuales = ?
        WHERE id_cliente = ?`,
      [datos.extension, datos.nombres, datos.apellidos, datos.fecha_nacimiento, datos.telefono, datos.correo,
        datos.direccion, datos.ocupacion, datos.ingresos_mensuales, datos.gastos_mensuales, idCliente]
    );
    await tx.ejecutar('UPDATE usuario SET nombre_completo = ?, correo = ? WHERE id_cliente = ?', [`${datos.nombres} ${datos.apellidos}`, datos.correo, idCliente]);
    await registrarAuditoria(req, 'EDITAR_CLIENTE', { entidad: 'cliente', idEntidad: idCliente, detalle: `CI ${actual.ci}`, tx });
  });
  res.json({ mensaje: 'Datos del cliente actualizados correctamente.' });
});

/* PATCH /:id/estado --- */
router.patch('/:id/estado', proteger('ADMIN'), async (req, res) => {
  const idCliente = validarId(req.params.id);
  const activo = req.body?.activo ? 1 : 0;
  const cliente = await db.obtener('SELECT ci FROM cliente WHERE id_cliente = ?', [idCliente]);
  if (!cliente) throw new ErrorNegocio('Cliente no encontrado.', 404);
  await db.transaccion(async (tx) => {
    await tx.ejecutar('UPDATE cliente SET activo = ? WHERE id_cliente = ?', [activo, idCliente]);
    await tx.ejecutar('UPDATE usuario SET activo = ? WHERE id_cliente = ?', [activo, idCliente]);
    await registrarAuditoria(req, activo ? 'ACTIVAR_CLIENTE' : 'DESACTIVAR_CLIENTE', { entidad: 'cliente', idEntidad: idCliente, detalle: `CI ${cliente.ci}`, tx });
  });
  res.json({ mensaje: activo ? 'Cliente activado.' : 'Cliente desactivado (sin acceso al portal ni nuevas solicitudes).' });
});

module.exports = router;
