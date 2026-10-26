/** UTILIDADES DE SEGURIDAD

 *  - Las contraseñas NUNCA se guardan en texto plano (RNF01).
 *  - Se utiliza `scrypt` (incluido en Node.js, sin dependencias externas),
 *    con una sal aleatoria por usuario. Formato almacenado:
 *        scrypt$<sal_hex>$<hash_hex>
 *  - La comparación se hace en tiempo constante (timingSafeEqual) para
 *    evitar ataques de temporización.
 */
const crypto = require('crypto');

const LONGITUD_HASH = 64;

/** Genera el hash seguro de una contraseña */
function hashClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(clave), sal, LONGITUD_HASH).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

/** Verifica una contraseña contra su hash almacenado */
function verificarClave(clave, almacenado) {
  if (!almacenado || typeof almacenado !== 'string') return false;
  const partes = almacenado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, sal, hashGuardado] = partes;
  const hashCalculado = crypto.scryptSync(String(clave), sal, LONGITUD_HASH);
  const bufferGuardado = Buffer.from(hashGuardado, 'hex');
  if (bufferGuardado.length !== hashCalculado.length) return false;
  return crypto.timingSafeEqual(bufferGuardado, hashCalculado);
}

/**
 * Valida la fortaleza de una nueva contraseña.
 * @returns {string|null} Mensaje de error o null si es válida.
 */
function validarFortaleza(clave, { login, ci } = {}) {
  if (typeof clave !== 'string' || clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (clave.length > 64) return 'La contraseña no puede superar los 64 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave)) return 'La contraseña debe contener al menos una letra.';
  if (!/[0-9]/.test(clave)) return 'La contraseña debe contener al menos un número.';
  if (!/[A-ZÁÉÍÓÚÑ]/.test(clave)) return 'La contraseña debe contener al menos una letra mayúscula.';
  if ((login && clave.toLowerCase() === String(login).toLowerCase()) || (ci && clave === String(ci))) {
    return 'La contraseña no puede ser igual a su usuario o a su CI.';
  }
  return null;
}

/** Genera una contraseña temporal legible (para restablecimientos) */
function generarClaveTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const minus = 'abcdefghijkmnpqrstuvwxyz';
  const aleatorio = (cadena) => cadena[crypto.randomInt(cadena.length)];
  return `${aleatorio(letras)}${aleatorio(minus)}${aleatorio(minus)}${aleatorio(minus)}-${crypto.randomInt(1000, 9999)}${aleatorio(letras)}`;
}

module.exports = { hashClave, verificarClave, validarFortaleza, generarClaveTemporal };
