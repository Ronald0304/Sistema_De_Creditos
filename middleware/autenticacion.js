/** MIDDLEWARES DE AUTENTICACIÓN Y AUTORIZACIÓN POR ROLES

 *  - `requiereSesion`: exige una sesión válida y revalida contra la BD que el
 *    usuario siga activo (si el Administrador lo desactiva o le cambia el rol,
 *    el efecto es inmediato).
 *  - `requiereClaveActualizada`: bloquea todas las operaciones mientras el
 *    usuario tenga pendiente el cambio obligatorio de contraseña.
 *  - `requiereRol(...roles)`: restringe el acceso a los roles indicados.
 */
const db = require('../database/db');

/** Respuesta JSON estándar de error de autenticación */
function responderNoAutenticado(res, mensaje = 'Su sesión ha expirado. Inicie sesión nuevamente.') {
  return res.status(401).json({ error: mensaje, codigo: 'SESION_EXPIRADA' });
}

/** Verifica que exista una sesión y que el usuario siga habilitado */
async function requiereSesion(req, res, next) {
  const sesion = req.session?.usuario;
  if (!sesion) return responderNoAutenticado(res);

  const usuario = await db.obtener(
    'SELECT id_usuario, nombre_completo, login, rol, activo, debe_cambiar_clave, id_cliente FROM usuario WHERE id_usuario = ?',
    [sesion.id]
  );
  if (!usuario || !usuario.activo) {
    req.session.destroy(() => {});
    return responderNoAutenticado(res, 'Su cuenta fue deshabilitada. Contacte al administrador.');
  }

  // Sincroniza la sesión con los datos actuales de la BD
  req.session.usuario = {
    ...sesion,
    nombre: usuario.nombre_completo,
    login: usuario.login,
    rol: usuario.rol,
    id_cliente: usuario.id_cliente,
    debe_cambiar_clave: Boolean(usuario.debe_cambiar_clave)
  };
  return next();
}

/** Bloquea el acceso si el usuario debe cambiar su contraseña primero */
function requiereClaveActualizada(req, res, next) {
  if (req.session?.usuario?.debe_cambiar_clave) {
    return res.status(403).json({
      error: 'Por seguridad debe cambiar su contraseña antes de continuar.',
      codigo: 'CAMBIO_CLAVE_REQUERIDO'
    });
  }
  return next();
}

/** Restringe el acceso a uno o varios roles */
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.session?.usuario?.rol;
    if (!rol || !rolesPermitidos.includes(rol)) {
      return res.status(403).json({ error: 'No tiene permisos para realizar esta operación.', codigo: 'SIN_PERMISO' });
    }
    return next();
  };
}

/** Atajo: sesión + contraseña actualizada + rol */
function proteger(...roles) {
  const cadena = [requiereSesion, requiereClaveActualizada];
  if (roles.length) cadena.push(requiereRol(...roles));
  return cadena;
}

module.exports = { requiereSesion, requiereClaveActualizada, requiereRol, proteger };
