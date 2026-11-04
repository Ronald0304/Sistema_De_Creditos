/** REPROGRAMACIÓN DE CRÉDITOS (clientes en mora temprana)

 *  Lógica central del módulo. Todas las funciones que escriben reciben `tx`
 *  (ejecutor de una transacción abierta con db.transaccion) para que el
 *  cambio de cronograma se confirme o se revierta completo (RNF03).
 *
 *  Flujo:
 *    1) CLIENTE  solicita (estado PENDIENTE_EVALUACION) si es elegible:
 *                crédito activo con MENOS de 3 cuotas vencidas y MENOS de
 *                90 días de mora (utils/parametros.js -> REPROGRAMACION).
 *    2) OFICIAL  simula el nuevo plan capitalizando los intereses vencidos y
 *                los intereses moratorios, y deriva (EN_REVISION_JEFE).
 *    3) JEFE     aprueba (APROBADA: nuevo cronograma + Adenda) o rechaza.
 */
const { REPROGRAMACION, PRODUCTOS } = require('./parametros');
const { generarCronograma, calcularCuotaFija, calcularMora, redondear, fechaHoy, fechaHoraAhora } = require('./finanzas');
const { ErrorNegocio } = require('./errores');

/** Estados en los que una reprogramación sigue "en curso" */
const ESTADOS_EN_CURSO = ['PENDIENTE_EVALUACION', 'EN_REVISION_JEFE'];

/** Plazo máximo (meses) del nuevo plan: el del producto o el de la política */
function plazoMaximo(tipoCredito) {
  return PRODUCTOS[tipoCredito]?.plazoMax || REPROGRAMACION.plazoMaximo;
}

/**
 * Situación actual del crédito a una fecha: cuotas pagadas, vencidas,
 * saldo de capital, intereses vencidos e intereses moratorios (recargos).
 * @param {object} ejecutor  `db` o `tx` (cualquier objeto con obtener/todos)
 */
async function obtenerSituacionCredito(ejecutor, idCredito, fechaReferencia = fechaHoy()) {
  const credito = await ejecutor.obtener(
    `SELECT cr.*, s.tipo_credito, s.id_cliente, s.codigo AS codigo_solicitud
       FROM credito cr JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
      WHERE cr.id_credito = ?`,
    [idCredito]
  );
  if (!credito) throw new ErrorNegocio('Crédito no encontrado.', 404);

  const cuotas = await ejecutor.todos('SELECT * FROM cuota WHERE id_credito = ? ORDER BY numero', [idCredito]);
  const pagadas = cuotas.filter((q) => q.estado === 'PAGADA');
  const pendientes = cuotas.filter((q) => q.estado !== 'PAGADA');
  // Vencida = así la marcó el control de mora, o su fecha ya pasó
  const vencidas = pendientes
    .filter((q) => q.estado === 'VENCIDA' || q.fecha_vencimiento < fechaReferencia)
    .map((q) => ({ ...q, ...calcularMora(q, fechaReferencia) }));
  const suma = (lista, campo) => redondear(lista.reduce((s, q) => s + q[campo], 0));

  return {
    credito,
    pendientes,
    cuotas_pagadas: pagadas.length,
    // Las cuotas se pagan siempre de la más antigua a la más reciente (RN08)
    ultimo_numero_pagado: pagadas.reduce((max, q) => Math.max(max, q.numero), 0),
    cuotas_vencidas: vencidas.length,
    dias_mora: vencidas.reduce((max, q) => Math.max(max, q.diasAtraso), 0),
    saldo_capital: suma(pendientes, 'capital'),
    interes_vencido: suma(vencidas, 'interes'),
    interes_moratorio: suma(vencidas, 'recargo'),
    monto_vencido: redondear(suma(vencidas, 'monto') + suma(vencidas, 'recargo'))
  };
}

/**
 * Regla de elegibilidad (panel del cliente):
 *   - crédito activo (VIGENTE o EN_MORA),
 *   - con al menos 1 cuota vencida (mora temprana),
 *   - con MENOS de `maxCuotasVencidas` cuotas vencidas y MENOS de `maxDiasMora` días.
 * @returns {{elegible:boolean, codigo:string, mensaje:string, ...}}
 */
function evaluarElegibilidad(situacion) {
  const { maxCuotasVencidas, maxDiasMora } = REPROGRAMACION;
  const base = {
    cuotas_vencidas: situacion.cuotas_vencidas,
    dias_mora: situacion.dias_mora,
    monto_vencido: situacion.monto_vencido,
    max_cuotas_vencidas: maxCuotasVencidas,
    max_dias_mora: maxDiasMora
  };
  if (!['VIGENTE', 'EN_MORA'].includes(situacion.credito.estado)) {
    return { ...base, elegible: false, codigo: 'NO_ACTIVO', mensaje: 'Solo los créditos activos (desembolsados y no cancelados) pueden reprogramarse.' };
  }
  if (situacion.cuotas_vencidas === 0) {
    return { ...base, elegible: false, codigo: 'AL_DIA', mensaje: 'Su crédito está al día: no requiere reprogramación.' };
  }
  if (situacion.cuotas_vencidas >= maxCuotasVencidas || situacion.dias_mora >= maxDiasMora) {
    return {
      ...base,
      elegible: false,
      codigo: 'EXCEDE_LIMITE',
      mensaje: `Su crédito registra ${situacion.cuotas_vencidas} cuota(s) vencida(s) y ${situacion.dias_mora} días de mora. `
        + `La reprogramación en línea solo está disponible con menos de ${maxCuotasVencidas} cuotas vencidas y menos de ${maxDiasMora} días de mora. `
        + 'Por favor, acérquese a su agencia para evaluar su caso con su Oficial de Crédito.'
    };
  }
  return { ...base, elegible: true, codigo: 'ELEGIBLE', mensaje: 'Puede solicitar la reprogramación de su crédito.' };
}

/** Menor plazo (meses) cuya cuota no supera la cuota máxima propuesta; null si no existe */
function plazoParaCuota(capital, tasa, cuotaMaxima, plazoTope) {
  for (let n = 1; n <= plazoTope; n += 1) {
    if (calcularCuotaFija(capital, tasa, n) <= cuotaMaxima) return n;
  }
  return null;
}

/**
 * SIMULADOR: suma al capital pendiente los intereses corrientes vencidos y los
 * intereses moratorios (recargos por mora) y genera el nuevo plan con el
 * sistema francés. Las cuotas nuevas continúan la numeración del crédito.
 */
function calcularSimulacion(situacion, { plazo, tasa, fechaBase = fechaHoy() }) {
  const capital = redondear(situacion.saldo_capital + situacion.interes_vencido + situacion.interes_moratorio);
  const plan = generarCronograma(capital, tasa, plazo, fechaBase);
  const desplazamiento = situacion.ultimo_numero_pagado;
  const cuotas = plan.cuotas.map((q) => ({ ...q, numero: q.numero + desplazamiento }));
  return {
    saldo_capital_anterior: situacion.saldo_capital,
    interes_vencido: situacion.interes_vencido,
    interes_moratorio: situacion.interes_moratorio,
    capital_reprogramado: capital,
    plazo,
    tasa,
    cuota: plan.cuotaFija,
    cuota_anterior: situacion.credito.cuota_mensual,
    cuotas_pendientes_anteriores: situacion.pendientes.length,
    total_interes: plan.totalInteres,
    total_pagar: plan.totalPagar,
    primer_vencimiento: cuotas[0]?.fecha_vencimiento || null,
    ultimo_vencimiento: cuotas[cuotas.length - 1]?.fecha_vencimiento || null,
    cuotas
  };
}

/* ----------------------------------------------------------------------------
 *  ADJUNTOS: validación del tipo REAL del archivo (firma de bytes) y tamaño
 * -------------------------------------------------------------------------- */
const FIRMAS = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],        // %PDF
  'image/png': [0x89, 0x50, 0x4e, 0x47],              // .PNG
  'image/jpeg': [0xff, 0xd8, 0xff]                    // JPEG
};

/**
 * Valida la lista de adjuntos enviada como JSON: [{ nombre, tipo, datos(base64) }].
 * @returns {Array<{nombre:string, tipo:string, buffer:Buffer}>}
 */
function validarAdjuntos(lista) {
  const { minAdjuntos, maxAdjuntos, maxBytesAdjunto, tiposAdjunto } = REPROGRAMACION;
  const adjuntos = lista === undefined || lista === null ? [] : lista;
  if (!Array.isArray(adjuntos)) throw new ErrorNegocio('El formato de los adjuntos no es válido.');
  if (adjuntos.length < minAdjuntos) throw new ErrorNegocio(`Debe adjuntar al menos ${minAdjuntos} documento(s) de respaldo.`);
  if (adjuntos.length > maxAdjuntos) throw new ErrorNegocio(`Puede adjuntar como máximo ${maxAdjuntos} archivos.`);

  return adjuntos.map((adjunto, i) => {
    const nombre = String(adjunto?.nombre || '')
      .replace(/[^\wáéíóúÁÉÍÓÚñÑ .()-]/g, '_')
      .trim()
      .slice(0, 120) || `adjunto-${i + 1}`;
    if (!tiposAdjunto.includes(adjunto?.tipo)) throw new ErrorNegocio(`El archivo "${nombre}" debe ser PDF, JPG o PNG.`);
    const base64 = String(adjunto.datos || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw new ErrorNegocio(`El archivo "${nombre}" está dañado o vacío.`);
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) throw new ErrorNegocio(`El archivo "${nombre}" está vacío.`);
    if (buffer.length > maxBytesAdjunto) {
      throw new ErrorNegocio(`El archivo "${nombre}" supera el tamaño máximo de ${Math.round(maxBytesAdjunto / 1024 / 1024)} MB.`);
    }
    // El contenido debe corresponder realmente al tipo declarado
    if (!FIRMAS[adjunto.tipo].every((byte, j) => buffer[j] === byte)) {
      throw new ErrorNegocio(`El contenido del archivo "${nombre}" no corresponde a un ${adjunto.tipo === 'application/pdf' ? 'PDF' : 'archivo de imagen'} válido.`);
    }
    return { nombre, tipo: adjunto.tipo, buffer };
  });
}

/**
 * APROBACIÓN (Jefe de Crédito): reemplaza las cuotas no pagadas por el nuevo
 * cronograma, actualiza el crédito (EN_MORA -> VIGENTE / "Al día") y registra
 * los datos de la Adenda. Los importes se recalculan a la fecha de aprobación.
 */
async function aplicarReprogramacion(tx, { reprogramacion: rep, idJefe, observacion, fecha = fechaHoraAhora() }) {
  const hoy = fecha.slice(0, 10);
  const situacion = await obtenerSituacionCredito(tx, rep.id_credito, hoy);
  if (!['VIGENTE', 'EN_MORA'].includes(situacion.credito.estado)) {
    throw new ErrorNegocio('El crédito ya no está activo (fue cancelado o aún no se desembolsó). No se puede reprogramar.', 409);
  }
  if (!situacion.pendientes.length) throw new ErrorNegocio('El crédito no tiene cuotas pendientes por reprogramar.', 409);

  const simulacion = calcularSimulacion(situacion, { plazo: rep.nuevo_plazo, tasa: rep.nueva_tasa, fechaBase: hoy });
  const { credito } = situacion;
  const detalleAdenda = {
    condiciones_anteriores: {
      estado: credito.estado,
      plazo_meses: credito.plazo_meses,
      cuota_mensual: credito.cuota_mensual,
      tasa_interes: credito.tasa_interes,
      saldo_capital: situacion.saldo_capital,
      cuotas_pagadas: situacion.cuotas_pagadas,
      cuotas_vencidas: situacion.cuotas_vencidas,
      dias_mora: situacion.dias_mora,
      monto_vencido: situacion.monto_vencido,
      cuotas_pendientes: situacion.pendientes.map((q) => ({
        numero: q.numero, fecha_vencimiento: q.fecha_vencimiento, capital: q.capital, interes: q.interes, monto: q.monto, estado: q.estado
      }))
    },
    cronograma_nuevo: simulacion.cuotas
  };

  // 1) Las cuotas NO pagadas se reemplazan por el nuevo plan (las pagadas se conservan)
  await tx.ejecutar("DELETE FROM cuota WHERE id_credito = ? AND estado <> 'PAGADA'", [rep.id_credito]);
  for (const cuota of simulacion.cuotas) {
    await tx.ejecutar(
      `INSERT INTO cuota (id_credito, numero, fecha_vencimiento, capital, interes, monto, saldo_capital, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [rep.id_credito, cuota.numero, cuota.fecha_vencimiento, cuota.capital, cuota.interes, cuota.monto, cuota.saldo_capital]
    );
  }

  // 2) El crédito queda al día con las nuevas condiciones
  await tx.ejecutar(
    `UPDATE credito SET saldo_capital = ?, cuota_mensual = ?, plazo_meses = ?, tasa_interes = ?, estado = 'VIGENTE'
      WHERE id_credito = ?`,
    [simulacion.capital_reprogramado, simulacion.cuota, situacion.ultimo_numero_pagado + simulacion.plazo, simulacion.tasa, rep.id_credito]
  );

  // 3) Resolución + datos de la Adenda al contrato
  const numeroAdenda = `AD-${fecha.slice(0, 4)}-${String(rep.id_reprogramacion).padStart(5, '0')}`;
  await tx.ejecutar(
    `UPDATE reprogramacion
        SET estado = 'APROBADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ?, numero_adenda = ?, detalle_adenda = ?,
            saldo_capital_anterior = ?, interes_vencido = ?, interes_moratorio = ?, capital_reprogramado = ?, nueva_cuota = ?
      WHERE id_reprogramacion = ?`,
    [idJefe, fecha, observacion, numeroAdenda, JSON.stringify(detalleAdenda),
      simulacion.saldo_capital_anterior, simulacion.interes_vencido, simulacion.interes_moratorio,
      simulacion.capital_reprogramado, simulacion.cuota, rep.id_reprogramacion]
  );
  return { numeroAdenda, simulacion, credito };
}

module.exports = {
  ESTADOS_EN_CURSO,
  plazoMaximo,
  obtenerSituacionCredito,
  evaluarElegibilidad,
  plazoParaCuota,
  calcularSimulacion,
  validarAdjuntos,
  aplicarReprogramacion
};
