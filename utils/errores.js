/** ERRORES Y VALIDACIONES
 *  `ErrorNegocio` representa un error "controlado" (validación, regla de
 *  negocio, permiso). El manejador global de Express lo traduce a una
 *  respuesta JSON con el código HTTP indicado, sin exponer detalles internos.
 */

class ErrorNegocio extends Error {
  /**
   * @param {string} mensaje  Mensaje legible para el usuario (en español)
   * @param {number} estado   Código HTTP (400 por defecto)
   * @param {string} [codigo] Código interno opcional (p. ej. CAMBIO_CLAVE_REQUERIDO)
   */
  constructor(mensaje, estado = 400, codigo) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.estado = estado;
    this.codigo = codigo;
  }
}

/**s Valida y limpia un texto.
 * @returns {string|null} El texto recortado o null si es opcional y vino vacío.
 */
function texto(valor, campo, { requerido = true, min = 1, max = 255, patron, mensajePatron } = {}) {
  const limpio = typeof valor === 'string' ? valor.trim() : (valor === undefined || valor === null ? '' : String(valor).trim());
  if (!limpio) {
    if (requerido) throw new ErrorNegocio(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  if (limpio.length < min) throw new ErrorNegocio(`El campo "${campo}" debe tener al menos ${min} caracteres.`);
  if (limpio.length > max) throw new ErrorNegocio(`El campo "${campo}" no puede superar los ${max} caracteres.`);
  if (patron && !patron.test(limpio)) throw new ErrorNegocio(mensajePatron || `El campo "${campo}" tiene un formato inválido.`);
  return limpio;
}

/**
 * Valida un número.
 * @returns {number|null}
 */
function numero(valor, campo, { requerido = true, min = -Infinity, max = Infinity, entero = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new ErrorNegocio(`El campo "${campo}" es obligatorio.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ErrorNegocio(`El campo "${campo}" debe ser un número válido.`);
  if (entero && !Number.isInteger(n)) throw new ErrorNegocio(`El campo "${campo}" debe ser un número entero.`);
  if (n < min) throw new ErrorNegocio(`El campo "${campo}" debe ser mayor o igual a ${min}.`);
  if (n > max) throw new ErrorNegocio(`El campo "${campo}" debe ser menor o igual a ${max}.`);
  return n;
}

/** Valida que el valor pertenezca a una lista cerrada */
function opcion(valor, campo, opciones, { requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new ErrorNegocio(`Debe seleccionar un valor para "${campo}".`);
    return null;
  }
  if (!opciones.includes(valor)) throw new ErrorNegocio(`El valor de "${campo}" no es válido.`);
  return valor;
}

/** Valida un identificador numérico de la URL (/:id) */
function id(valor, campo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorNegocio(`Identificador "${campo}" inválido.`, 400);
  return n;
}

module.exports = { ErrorNegocio, texto, numero, opcion, id };
