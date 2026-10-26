/**  MIDDLEWARES DE SEGURIDAD HTTP
 *  - Cabeceras de seguridad (equivalente básico a "helmet").
 *  - Protección CSRF: toda petición que modifica datos debe enviarse como
 *    JSON desde el mismo origen (los formularios de otros sitios no pueden
 *    enviar `application/json` sin CORS, y la cookie es SameSite=Lax).
 *  - Limitador simple de intentos de inicio de sesión por IP.
 */

/** Agrega cabeceras HTTP de seguridad a todas las respuestas */
function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
  );
  next();
}

/**
 * Exige JSON en peticiones de escritura dirigidas a la API.
 * El frontend (javascrip/comun.js) siempre envía `Content-Type: application/json`.
 */
function exigirJson(req, res, next) {
  const metodosEscritura = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (metodosEscritura.includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Formato de petición no permitido. Use JSON.' });
  }
  return next();
}

/**
 * Limitador en memoria: máximo `limite` peticiones por IP cada `ventanaMs`.
 * Se usa en el endpoint de login para frenar ataques de fuerza bruta.
 */
function limitadorPeticiones({ limite = 20, ventanaMs = 15 * 60 * 1000 } = {}) {
  const registros = new Map();
  setInterval(() => {
    const ahora = Date.now();
    for (const [ip, dato] of registros) if (ahora - dato.inicio > ventanaMs) registros.delete(ip);
  }, ventanaMs).unref();

  return (req, res, next) => {
    const ip = req.ip || 'desconocida';
    const ahora = Date.now();
    const dato = registros.get(ip);
    if (!dato || ahora - dato.inicio > ventanaMs) {
      registros.set(ip, { inicio: ahora, cantidad: 1 });
      return next();
    }
    dato.cantidad += 1;
    if (dato.cantidad > limite) {
      return res.status(429).json({ error: 'Demasiados intentos. Espere unos minutos e intente nuevamente.' });
    }
    return next();
  };
}

module.exports = { cabecerasSeguridad, exigirJson, limitadorPeticiones };
