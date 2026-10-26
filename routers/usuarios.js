/**
 *  ROUTER: ADMINISTRACIÓN DE USUARIOS Y AUDITORÍA  (/api/usuarios)
 *  Rol permitido: ADMIN  (CU15 - RF16)

 *  GET    /                     Listado de usuarios con filtros
 *  GET    /resumen              Indicadores para el panel del administrador
 *  POST   /                     Crear usuario interno
 *  PUT    /:id                  Editar datos y rol
 *  PATCH  /:id/estado           Activar / desactivar
 *  POST   /:id/restablecer-clave  Generar clave temporal / desbloquear
 *  DELETE /:id                  Eliminar (solo si no tiene operaciones)
 *  GET    /auditoria            Bitácora con filtros
 *  GET    /auditoria/resumen    Estadísticas de actividad y supervisión
 */
const express = require('express');
const db = require('../database/db');
const { proteger } = require('../middleware/autenticacion');
const { hashClave, validarFortaleza, generarClaveTemporal } = require('../utils/seguridad');
const { registrarAuditoria } = require('../utils/auditoria');
const { ROLES } = require('../utils/parametros');
const { ErrorNegocio, texto, numero, opcion, id: validarId } = require('../utils/errores');

const router = express.Router();
router.use(proteger('ADMIN'));

/** Roles que el administrador puede asignar a cuentas internas */
const ROLES_INTERNOS = ['ADMIN', 'OFICIAL', 'ANALISTA', 'JEFE', 'CAJERO', 'GERENTE'];
const PATRON_LOGIN = /^[a-z0-9._-]{3,30}$/;

/** Valida los datos comunes de creación/edición */
function validarDatosUsuario(cuerpo) {
  return {
    nombre: texto(cuerpo.nombre_completo, 'Nombre completo', { min: 3, max: 100 }),
    login: texto(String(cuerpo.login || '').toLowerCase(), 'Usuario', {
      patron: PATRON_LOGIN,
      mensajePatron: 'El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.'
    }),
    correo: texto(cuerpo.correo, 'Correo', { requerido: false, max: 100, patron: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, mensajePatron: 'El correo electrónico no es válido.' }),
    rol: opcion(cuerpo.rol, 'Rol', ROLES_INTERNOS),
    limite: numero(cuerpo.limite_aprobacion ?? 0, 'Límite de aprobación', { min: 0, max: 100000000 })
  };
}

/** Evita que el sistema quede sin ningún administrador activo */
async function verificarUltimoAdmin(idUsuario) {
  const { total } = await db.obtener("SELECT COUNT(*) AS total FROM usuario WHERE rol = 'ADMIN' AND activo = 1 AND id_usuario <> ?", [idUsuario]);
  if (total === 0) throw new ErrorNegocio('No puede dejar el sistema sin un administrador activo.', 409);
}

/* GET / --------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  const { rol, estado, buscar, tipo = 'internos' } = req.query;
  const condiciones = [];
  const parametros = [];
  if (tipo === 'internos') condiciones.push("u.rol <> 'CLIENTE'");
  if (tipo === 'clientes') condiciones.push("u.rol = 'CLIENTE'");
  if (rol && ROLES[rol]) { condiciones.push('u.rol = ?'); parametros.push(rol); }
  if (estado === 'activos') condiciones.push('u.activo = 1');
  if (estado === 'inactivos') condiciones.push('u.activo = 0');
  if (buscar) {
    condiciones.push('(u.nombre_completo LIKE ? OR u.login LIKE ?)');
    parametros.push(`%${buscar}%`, `%${buscar}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const usuarios = await db.todos(
    `SELECT u.id_usuario, u.nombre_completo, u.login, u.correo, u.rol, u.limite_aprobacion, u.activo,
            u.debe_cambiar_clave, u.ultimo_acceso, u.fecha_creacion, u.id_cliente,
            CASE WHEN u.bloqueado_hasta > DATETIME('now','localtime') THEN 1 ELSE 0 END AS bloqueado
       FROM usuario u ${where}
      ORDER BY u.rol = 'CLIENTE', u.nombre_completo`,
    parametros
  );
  res.json(usuarios.map((u) => ({ ...u, rol_nombre: ROLES[u.rol] })));
});

/* GET /resumen ------------------------------------------------------------- */
router.get('/resumen', async (req, res) => {
  const porRol = await db.todos('SELECT rol, COUNT(*) AS total, SUM(activo) AS activos FROM usuario GROUP BY rol');
  const generales = await db.obtener(`
    SELECT
      (SELECT COUNT(*) FROM usuario WHERE rol <> 'CLIENTE') AS internos,
      (SELECT COUNT(*) FROM usuario WHERE rol <> 'CLIENTE' AND activo = 1) AS internos_activos,
      (SELECT COUNT(*) FROM usuario WHERE rol = 'CLIENTE') AS clientes,
      (SELECT COUNT(*) FROM usuario WHERE bloqueado_hasta > DATETIME('now','localtime')) AS bloqueados,
      (SELECT COUNT(*) FROM usuario WHERE debe_cambiar_clave = 1) AS cambio_pendiente,
      (SELECT COUNT(*) FROM auditoria WHERE DATE(fecha_hora) = DATE('now','localtime')) AS eventos_hoy
  `);
  res.json({ generales, porRol: porRol.map((r) => ({ ...r, rol_nombre: ROLES[r.rol] })) });
});

/* POST / ------------------------------------------------------------------- */
router.post('/', async (req, res) => {
  const cuerpo = req.body || {};
  const datos = validarDatosUsuario(cuerpo);
  const claveTemporal = cuerpo.clave_temporal ? String(cuerpo.clave_temporal) : generarClaveTemporal();
  const errorFortaleza = validarFortaleza(claveTemporal, { login: datos.login });
  if (errorFortaleza) throw new ErrorNegocio(`Clave temporal inválida: ${errorFortaleza}`);

  const existe = await db.obtener('SELECT 1 FROM usuario WHERE LOWER(login) = ?', [datos.login]);
  if (existe) throw new ErrorNegocio('El nombre de usuario ya se encuentra registrado.', 409);

  const limite = datos.rol === 'JEFE' || datos.rol === 'GERENTE' ? datos.limite : 0;
  const { idInsertado } = await db.ejecutar(
    `INSERT INTO usuario (nombre_completo, login, clave_hash, correo, rol, limite_aprobacion, activo, debe_cambiar_clave)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
    [datos.nombre, datos.login, hashClave(claveTemporal), datos.correo, datos.rol, limite]
  );
  await registrarAuditoria(req, 'CREAR_USUARIO', { entidad: 'usuario', idEntidad: idInsertado, detalle: `${datos.login} (${datos.rol})` });
  res.status(201).json({
    mensaje: 'Usuario creado correctamente. Deberá cambiar su contraseña en el primer ingreso.',
    id_usuario: idInsertado,
    credenciales: { usuario: datos.login, clave_temporal: claveTemporal }
  });
});

/* PUT /:id ----------------------------------------------------------------- */
router.put('/:id', async (req, res) => {
  const idUsuario = validarId(req.params.id);
  const actual = await db.obtener('SELECT * FROM usuario WHERE id_usuario = ?', [idUsuario]);
  if (!actual) throw new ErrorNegocio('Usuario no encontrado.', 404);
  if (actual.rol === 'CLIENTE') throw new ErrorNegocio('Las cuentas de clientes se gestionan desde el módulo de Clientes.', 409);

  const datos = validarDatosUsuario(req.body || {});
  const duplicado = await db.obtener('SELECT 1 FROM usuario WHERE LOWER(login) = ? AND id_usuario <> ?', [datos.login, idUsuario]);
  if (duplicado) throw new ErrorNegocio('El nombre de usuario ya está en uso por otra cuenta.', 409);
  if (actual.rol === 'ADMIN' && datos.rol !== 'ADMIN') await verificarUltimoAdmin(idUsuario);
  if (idUsuario === req.session.usuario.id && datos.rol !== 'ADMIN') {
    throw new ErrorNegocio('No puede quitarse a sí mismo el rol de administrador.', 409);
  }

  const limite = datos.rol === 'JEFE' || datos.rol === 'GERENTE' ? datos.limite : 0;
  await db.ejecutar(
    'UPDATE usuario SET nombre_completo = ?, login = ?, correo = ?, rol = ?, limite_aprobacion = ? WHERE id_usuario = ?',
    [datos.nombre, datos.login, datos.correo, datos.rol, limite, idUsuario]
  );
  const cambios = actual.rol !== datos.rol ? ` | Rol: ${actual.rol} a ${datos.rol}` : '';
  await registrarAuditoria(req, 'EDITAR_USUARIO', { entidad: 'usuario', idEntidad: idUsuario, detalle: `${datos.login}${cambios}` });
  res.json({ mensaje: 'Usuario actualizado correctamente.' });
});

/* PATCH /:id/estado -------------------------------------------------------- */
router.patch('/:id/estado', async (req, res) => {
  const idUsuario = validarId(req.params.id);
  const activo = req.body?.activo ? 1 : 0;
  const actual = await db.obtener('SELECT * FROM usuario WHERE id_usuario = ?', [idUsuario]);
  if (!actual) throw new ErrorNegocio('Usuario no encontrado.', 404);
  if (idUsuario === req.session.usuario.id) throw new ErrorNegocio('No puede desactivar su propia cuenta.', 409);
  if (!activo && actual.rol === 'ADMIN') await verificarUltimoAdmin(idUsuario);

  await db.ejecutar('UPDATE usuario SET activo = ? WHERE id_usuario = ?', [activo, idUsuario]);
  await registrarAuditoria(req, activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', { entidad: 'usuario', idEntidad: idUsuario, detalle: actual.login });
  res.json({ mensaje: activo ? 'Usuario activado.' : 'Usuario desactivado. Ya no podrá iniciar sesión.' });
});

/* POST /:id/restablecer-clave ---------------------------------------------- */
router.post('/:id/restablecer-clave', async (req, res) => {
  const idUsuario = validarId(req.params.id);
  const usuario = await db.obtener(
    'SELECT u.*, c.ci FROM usuario u LEFT JOIN cliente c ON c.id_cliente = u.id_cliente WHERE u.id_usuario = ?',
    [idUsuario]
  );
  if (!usuario) throw new ErrorNegocio('Usuario no encontrado.', 404);

  // Clientes: vuelven a su CI. Personal interno: clave temporal aleatoria.
  const nuevaClave = usuario.rol === 'CLIENTE' ? usuario.ci : generarClaveTemporal();
  await db.ejecutar(
    'UPDATE usuario SET clave_hash = ?, debe_cambiar_clave = 1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?',
    [hashClave(nuevaClave), idUsuario]
  );
  await registrarAuditoria(req, 'RESTABLECER_CLAVE', { entidad: 'usuario', idEntidad: idUsuario, detalle: usuario.login });
  res.json({
    mensaje: 'Contraseña restablecida. El usuario deberá cambiarla al ingresar.',
    credenciales: { usuario: usuario.login, clave_temporal: nuevaClave }
  });
});

/* DELETE /:id -------------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  const idUsuario = validarId(req.params.id);
  const usuario = await db.obtener('SELECT * FROM usuario WHERE id_usuario = ?', [idUsuario]);
  if (!usuario) throw new ErrorNegocio('Usuario no encontrado.', 404);
  if (idUsuario === req.session.usuario.id) throw new ErrorNegocio('No puede eliminar su propia cuenta.', 409);
  if (usuario.rol === 'CLIENTE') throw new ErrorNegocio('Las cuentas de clientes no se eliminan; puede desactivarlas.', 409);
  if (usuario.rol === 'ADMIN') await verificarUltimoAdmin(idUsuario);

  // Integridad referencial: un usuario con operaciones registradas no se borra
  const { operaciones } = await db.obtener(
    `SELECT
       (SELECT COUNT(*) FROM cliente WHERE id_oficial = ?) +
       (SELECT COUNT(*) FROM solicitud_credito WHERE id_oficial = ? OR id_jefe = ?) +
       (SELECT COUNT(*) FROM evaluacion_credito WHERE id_analista = ?) +
       (SELECT COUNT(*) FROM historial_crediticio WHERE id_analista = ?) +
       (SELECT COUNT(*) FROM garantia WHERE id_oficial = ?) +
       (SELECT COUNT(*) FROM credito WHERE id_oficial_desembolso = ?) +
       (SELECT COUNT(*) FROM pago WHERE id_cajero = ?) AS operaciones`,
    Array(8).fill(idUsuario)
  );
  if (operaciones > 0) {
    throw new ErrorNegocio(`El usuario tiene ${operaciones} operación(es) registradas y no puede eliminarse por trazabilidad. Desactívelo en su lugar.`, 409);
  }
  await db.ejecutar('DELETE FROM usuario WHERE id_usuario = ?', [idUsuario]);
  await registrarAuditoria(req, 'ELIMINAR_USUARIO', { entidad: 'usuario', idEntidad: idUsuario, detalle: usuario.login });
  res.json({ mensaje: 'Usuario eliminado correctamente.' });
});

/* GET /auditoria ----------------------------------------------------------- */
router.get('/auditoria', async (req, res) => {
  const { operacion, usuario, resultado, desde, hasta } = req.query;
  const limite = Math.min(Number(req.query.limite) || 200, 1000);
  const condiciones = [];
  const parametros = [];
  if (operacion) { condiciones.push('operacion = ?'); parametros.push(operacion); }
  if (usuario) { condiciones.push('login LIKE ?'); parametros.push(`%${usuario}%`); }
  if (resultado === 'EXITO' || resultado === 'FALLO') { condiciones.push('resultado = ?'); parametros.push(resultado); }
  if (desde) { condiciones.push('DATE(fecha_hora) >= DATE(?)'); parametros.push(desde); }
  if (hasta) { condiciones.push('DATE(fecha_hora) <= DATE(?)'); parametros.push(hasta); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const registros = await db.todos(`SELECT * FROM auditoria ${where} ORDER BY id_auditoria DESC LIMIT ?`, [...parametros, limite]);
  const operaciones = await db.todos('SELECT DISTINCT operacion FROM auditoria ORDER BY operacion');
  res.json({ registros, operaciones: operaciones.map((o) => o.operacion) });
});

/* GET /auditoria/resumen  (supervisión general del sistema) ---------------- */
router.get('/auditoria/resumen', async (req, res) => {
  const hoy = await db.obtener(`
    SELECT COUNT(*) AS eventos,
           SUM(CASE WHEN resultado = 'FALLO' THEN 1 ELSE 0 END) AS fallos,
           SUM(CASE WHEN operacion = 'LOGIN' AND resultado = 'EXITO' THEN 1 ELSE 0 END) AS ingresos
      FROM auditoria WHERE DATE(fecha_hora) = DATE('now','localtime')`);
  const porUsuario = await db.todos(`
    SELECT login, rol, COUNT(*) AS total, MAX(fecha_hora) AS ultima
      FROM auditoria WHERE login IS NOT NULL AND fecha_hora >= DATETIME('now','localtime','-30 days')
     GROUP BY login, rol ORDER BY total DESC LIMIT 10`);
  const gestionClientes = await db.todos(`
    SELECT u.nombre_completo AS oficial,
           (SELECT COUNT(*) FROM cliente c WHERE c.id_oficial = u.id_usuario) AS clientes,
           (SELECT COUNT(*) FROM solicitud_credito s WHERE s.id_oficial = u.id_usuario) AS solicitudes,
           (SELECT COUNT(*) FROM credito cr WHERE cr.id_oficial_desembolso = u.id_usuario) AS desembolsos
      FROM usuario u WHERE u.rol = 'OFICIAL' ORDER BY clientes DESC`);
  const solicitudesPorEstado = await db.todos('SELECT estado, COUNT(*) AS total FROM solicitud_credito GROUP BY estado');
  res.json({ hoy, porUsuario, gestionClientes, solicitudesPorEstado });
});

module.exports = router;
