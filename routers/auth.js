/**
 *  ROUTER: AUTENTICACIÓN  (/api/auth)
 * 
 *  POST /login          Inicio de sesión unificado (personal y clientes)
 *  POST /logout         Cierre de sesión
 *  GET  /sesion         Datos del usuario autenticado
 *  GET  /estado         ¿Hay sesión activa? (para la landing, sin error 401)
 *  POST /cambiar-clave  Cambio de contraseña (obligatorio en el primer ingreso)
 *  GET  /perfil         Perfil y estadísticas del usuario interno
 *  GET  /tasas          Productos y tasas públicas (simulador de la landing)
 */
const express = require('express');
const db = require('../database/db');
const { verificarClave, hashClave, validarFortaleza } = require('../utils/seguridad');
const { registrarAuditoria } = require('../utils/auditoria');
const { SEGURIDAD, INICIO_POR_ROL, ROLES, PRODUCTOS } = require('../utils/parametros');
const { fechaHoraAhora } = require('../utils/finanzas');
const { ErrorNegocio, texto } = require('../utils/errores');
const { requiereSesion, requiereClaveActualizada } = require('../middleware/autenticacion');
const { limitadorPeticiones } = require('../middleware/seguridad');

const router = express.Router();

/** Construye el objeto de usuario que se guarda en la sesión / se envía al cliente */
function datosPublicos(usuario) {
  return {
    id: usuario.id_usuario,
    nombre: usuario.nombre_completo,
    login: usuario.login,
    rol: usuario.rol,
    rol_nombre: ROLES[usuario.rol],
    id_cliente: usuario.id_cliente || null,
    debe_cambiar_clave: Boolean(usuario.debe_cambiar_clave)
  };
}

/** Destino de navegación según el estado del usuario */
function destinoDe(usuario) {
  return usuario.debe_cambiar_clave ? '/app/cambiar-clave' : INICIO_POR_ROL[usuario.rol];
}

/* POST /login */
router.post('/login', limitadorPeticiones({ limite: 30 }), async (req, res) => {
  const cuerpo = req.body || {};
  const login = texto(cuerpo.login, 'Usuario', { max: 60 }).toLowerCase();
  const clave = typeof cuerpo.clave === 'string' ? cuerpo.clave : '';
  if (!clave) throw new ErrorNegocio('Ingrese su contraseña.');

  const usuario = await db.obtener('SELECT * FROM usuario WHERE LOWER(login) = ?', [login]);
  const errorGenerico = 'Usuario o contraseña incorrectos.';

  if (!usuario) {
    await registrarAuditoria(req, 'LOGIN', { detalle: `Intento con usuario inexistente: ${login}`, resultado: 'FALLO', usuario: { login } });
    throw new ErrorNegocio(errorGenerico, 401);
  }

  // Cuenta bloqueada temporalmente por intentos fallidos
  if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > fechaHoraAhora()) {
    throw new ErrorNegocio(`Cuenta bloqueada temporalmente por intentos fallidos. Intente después de las ${usuario.bloqueado_hasta.slice(11, 16)}.`, 423);
  }

  if (!verificarClave(clave, usuario.clave_hash)) {
    const intentos = usuario.intentos_fallidos + 1;
    let bloqueo = null;
    if (intentos >= SEGURIDAD.maxIntentosFallidos) {
      const hasta = new Date(Date.now() + SEGURIDAD.minutosBloqueo * 60000);
      const dd = (n) => String(n).padStart(2, '0');
      bloqueo = `${hasta.getFullYear()}-${dd(hasta.getMonth() + 1)}-${dd(hasta.getDate())} ${dd(hasta.getHours())}:${dd(hasta.getMinutes())}:${dd(hasta.getSeconds())}`;
    }
    await db.ejecutar('UPDATE usuario SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?', [bloqueo ? 0 : intentos, bloqueo, usuario.id_usuario]);
    await registrarAuditoria(req, 'LOGIN', { detalle: bloqueo ? 'Contraseña incorrecta. Cuenta bloqueada.' : 'Contraseña incorrecta', resultado: 'FALLO', usuario: { id: usuario.id_usuario, login: usuario.login, rol: usuario.rol } });
    if (bloqueo) throw new ErrorNegocio(`Demasiados intentos fallidos. Su cuenta fue bloqueada por ${SEGURIDAD.minutosBloqueo} minutos.`, 423);
    const restantes = SEGURIDAD.maxIntentosFallidos - intentos;
    throw new ErrorNegocio(`${errorGenerico} Le quedan ${restantes} intento(s).`, 401);
  }

  if (!usuario.activo) {
    await registrarAuditoria(req, 'LOGIN', { detalle: 'Cuenta deshabilitada', resultado: 'FALLO', usuario: { id: usuario.id_usuario, login: usuario.login, rol: usuario.rol } });
    throw new ErrorNegocio('Su cuenta se encuentra deshabilitada. Contacte con la entidad.', 403);
  }

  await db.ejecutar('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id_usuario = ?', [fechaHoraAhora(), usuario.id_usuario]);

  // Regenerar el identificador de sesión evita ataques de fijación de sesión
  await new Promise((resolver, rechazar) => req.session.regenerate((error) => (error ? rechazar(error) : resolver())));
  req.session.usuario = datosPublicos(usuario);
  await new Promise((resolver, rechazar) => req.session.save((error) => (error ? rechazar(error) : resolver())));

  await registrarAuditoria(req, 'LOGIN', { detalle: 'Inicio de sesión exitoso' });
  res.json({ mensaje: `Bienvenido(a), ${usuario.nombre_completo}`, usuario: req.session.usuario, destino: destinoDe(usuario) });
});

/*  POST /logout */
router.post('/logout', async (req, res) => {
  if (req.session?.usuario) await registrarAuditoria(req, 'LOGOUT', { detalle: 'Cierre de sesión' });
  req.session.destroy(() => {
    res.clearCookie('credimanager.sid');
    res.json({ mensaje: 'Sesión cerrada correctamente.' });
  });
});

/*  GET /sesion */
router.get('/sesion', requiereSesion, (req, res) => {
  res.json({ usuario: req.session.usuario, destino: destinoDe(req.session.usuario) });
});

/*  GET /estado  (público: indica si hay sesión activa, sin responder 401) */
router.get('/estado', (req, res) => {
  const usuario = req.session?.usuario || null;
  res.json({ usuario, destino: usuario ? destinoDe(usuario) : null });
});

/*  POST /cambiar-clave */
router.post('/cambiar-clave', requiereSesion, async (req, res) => {
  const { clave_actual: claveActual, clave_nueva: claveNueva, confirmacion } = req.body || {};
  if (!claveActual || !claveNueva || !confirmacion) throw new ErrorNegocio('Complete todos los campos.');
  if (claveNueva !== confirmacion) throw new ErrorNegocio('La confirmación no coincide con la nueva contraseña.');

  const usuario = await db.obtener(
    `SELECT u.*, c.ci FROM usuario u LEFT JOIN cliente c ON c.id_cliente = u.id_cliente WHERE u.id_usuario = ?`,
    [req.session.usuario.id]
  );
  if (!verificarClave(claveActual, usuario.clave_hash)) {
    await registrarAuditoria(req, 'CAMBIAR_CLAVE', { entidad: 'usuario', idEntidad: usuario.id_usuario, detalle: 'Contraseña actual incorrecta', resultado: 'FALLO' });
    throw new ErrorNegocio('La contraseña actual es incorrecta.');
  }
  if (claveActual === claveNueva) throw new ErrorNegocio('La nueva contraseña debe ser diferente a la actual.');
  const errorFortaleza = validarFortaleza(claveNueva, { login: usuario.login, ci: usuario.ci });
  if (errorFortaleza) throw new ErrorNegocio(errorFortaleza);

  await db.ejecutar('UPDATE usuario SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id_usuario = ?', [hashClave(claveNueva), usuario.id_usuario]);
  req.session.usuario.debe_cambiar_clave = false;
  await registrarAuditoria(req, 'CAMBIAR_CLAVE', { entidad: 'usuario', idEntidad: usuario.id_usuario, detalle: 'Contraseña actualizada' });
  res.json({ mensaje: 'Contraseña actualizada correctamente.', destino: INICIO_POR_ROL[usuario.rol] });
});

/*   GET /perfil  (estadísticas de trabajo según el rol) */
router.get('/perfil', requiereSesion, requiereClaveActualizada, async (req, res) => {
  const { id, rol } = req.session.usuario;
  const usuario = await db.obtener(
    `SELECT id_usuario, nombre_completo, login, correo, rol, limite_aprobacion, ultimo_acceso, fecha_creacion
       FROM usuario WHERE id_usuario = ?`,
    [id]
  );

  // Indicadores personales por rol
  const consultas = {
    OFICIAL: [
      ['Clientes registrados', 'SELECT COUNT(*) AS v FROM cliente WHERE id_oficial = ?'],
      ['Solicitudes registradas', 'SELECT COUNT(*) AS v FROM solicitud_credito WHERE id_oficial = ?'],
      ['Desembolsos ejecutados', 'SELECT COUNT(*) AS v FROM credito WHERE id_oficial_desembolso = ?']
    ],
    ANALISTA: [
      ['Evaluaciones emitidas', 'SELECT COUNT(*) AS v FROM evaluacion_credito WHERE id_analista = ?'],
      ['Dictámenes favorables', "SELECT COUNT(*) AS v FROM evaluacion_credito WHERE id_analista = ? AND dictamen = 'FAVORABLE'"],
      ['Historiales consultados', 'SELECT COUNT(*) AS v FROM historial_crediticio WHERE id_analista = ?']
    ],
    JEFE: [
      ['Solicitudes aprobadas', "SELECT COUNT(*) AS v FROM solicitud_credito WHERE id_jefe = ? AND estado IN ('APROBADA','DESEMBOLSADA')"],
      ['Solicitudes rechazadas', "SELECT COUNT(*) AS v FROM solicitud_credito WHERE id_jefe = ? AND estado = 'RECHAZADA'"]
    ],
    CAJERO: [
      ['Pagos procesados', 'SELECT COUNT(*) AS v FROM pago WHERE id_cajero = ?'],
      ['Pagos de hoy', "SELECT COUNT(*) AS v FROM pago WHERE id_cajero = ? AND DATE(fecha_pago) = DATE('now','localtime')"]
    ]
  };
  const estadisticas = [];
  for (const [etiqueta, sql] of consultas[rol] || []) {
    const fila = await db.obtener(sql, [id]);
    estadisticas.push({ etiqueta, valor: fila?.v || 0 });
  }
  const actividad = await db.todos(
    'SELECT fecha_hora, operacion, detalle, resultado FROM auditoria WHERE id_usuario = ? ORDER BY id_auditoria DESC LIMIT 8',
    [id]
  );
  res.json({ usuario: { ...usuario, rol_nombre: ROLES[usuario.rol] }, estadisticas, actividad });
});

/*  GET /tasas  (público: lo usa el simulador de cuotas de la página de inicio) */
router.get('/tasas', (req, res) => {
  res.json(Object.entries(PRODUCTOS).map(([codigo, p]) => ({ codigo, ...p })));
});

module.exports = router;
