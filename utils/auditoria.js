/**
 *  REGISTRO DE AUDITORÍA (RN12 - RNF06)

 *  Toda operación relevante (login, creación de clientes, aprobaciones,
 *  desembolsos, pagos, cambios de usuarios...) queda registrada con usuario,
 *  fecha, operación, entidad afectada, IP y resultado.
 */
const db = require('../database/db');

/**
 * Registra un evento de auditoría. Nunca lanza errores (la auditoría no debe
 * interrumpir la operación principal), pero sí los informa por consola.
 *
 * @param {object} req        Petición de Express (para obtener usuario e IP)
 * @param {string} operacion  Código de la operación, p. ej. 'APROBAR_CREDITO'
 * @param {object} [opciones] { entidad, idEntidad, detalle, resultado, usuario, tx }
 */
async function registrarAuditoria(req, operacion, opciones = {}) {
  const { entidad = null, idEntidad = null, detalle = null, resultado = 'EXITO', tx } = opciones;
  const usuario = opciones.usuario || req?.session?.usuario || {};
  const ip = req ? (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '') : null;
  const sql = `INSERT INTO auditoria (id_usuario, login, rol, operacion, entidad, id_entidad, detalle, ip, resultado)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const parametros = [usuario.id || null, usuario.login || null, usuario.rol || null, operacion, entidad, idEntidad,
    detalle ? String(detalle).slice(0, 1000) : null, ip, resultado];
  try {
    // Dentro de una transacción se usa su propio ejecutor (evita bloquear la cola)
    if (tx) await tx.ejecutar(sql, parametros);
    else await db.ejecutar(sql, parametros);
  } catch (error) {
    console.error('No se pudo registrar la auditoría:', error.message);
  }
}

module.exports = { registrarAuditoria };
