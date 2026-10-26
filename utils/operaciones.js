/** OPERACIONES CREDITICIAS ATÓMICAS

 *  Lógica central del ciclo de vida del crédito. Cada función recibe `tx`
 *  (ejecutor de una transacción abierta con db.transaccion) para garantizar
 *  que todas las escrituras se confirmen o se reviertan juntas (RNF03).
 *  La utilizan los routers y también la carga de datos de demostración.
 */
const crypto = require('crypto');
const { generarCronograma, calcularMora, liquidarCancelacion, redondear, fechaHoy, fechaHoraAhora, sumarMeses } = require('./finanzas');
const { ErrorNegocio } = require('./errores');

/**
 * CU07 + CU09 + CU10: Crea el crédito aprobado, su número de contrato y el
 * cronograma de cuotas (RN05, RN06).
 * @returns {Promise<{idCredito:number, numeroCredito:string, numeroContrato:string, cuotaMensual:number}>}
 */
async function crearCreditoAprobado(tx, { idSolicitud, monto, tasa, plazo, fechaAprobacion = fechaHoraAhora() }) {
  const anio = fechaAprobacion.slice(0, 4);
  const sufijo = String(idSolicitud).padStart(5, '0');
  const numeroCredito = `CR-${anio}-${sufijo}`;
  const numeroContrato = `CT-${anio}-${sufijo}`;
  const cronograma = generarCronograma(monto, tasa, plazo, fechaAprobacion.slice(0, 10));

  const { idInsertado: idCredito } = await tx.ejecutar(
    `INSERT INTO credito (id_solicitud, numero_credito, numero_contrato, monto_aprobado, tasa_interes, plazo_meses, cuota_mensual,
                          fecha_aprobacion, saldo_capital, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_DESEMBOLSO')`,
    [idSolicitud, numeroCredito, numeroContrato, monto, tasa, plazo, cronograma.cuotaFija, fechaAprobacion, monto]
  );
  for (const cuota of cronograma.cuotas) {
    await tx.ejecutar(
      `INSERT INTO cuota (id_credito, numero, fecha_vencimiento, capital, interes, monto, saldo_capital, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [idCredito, cuota.numero, cuota.fecha_vencimiento, cuota.capital, cuota.interes, cuota.monto, cuota.saldo_capital]
    );
  }
  return { idCredito, numeroCredito, numeroContrato, cuotaMensual: cronograma.cuotaFija };
}

/** CU11: Desembolso del crédito. Reprograma las fechas de vencimiento a partir
 * de la fecha efectiva de desembolso y activa el crédito (estado VIGENTE).*/
async function desembolsarCredito(tx, { idCredito, idOficial, medio, cuentaDestino, fechaDesembolso = fechaHoraAhora() }) {
  const credito = await tx.obtener('SELECT * FROM credito WHERE id_credito = ?', [idCredito]);
  if (!credito) throw new ErrorNegocio('Crédito no encontrado.', 404);
  if (credito.estado !== 'PENDIENTE_DESEMBOLSO') throw new ErrorNegocio('El crédito ya fue desembolsado.', 409);

  const { total: garantias } = await tx.obtener('SELECT COUNT(*) AS total FROM garantia WHERE id_solicitud = ?', [credito.id_solicitud]);
  if (garantias === 0) throw new ErrorNegocio('Debe registrar al menos una garantía antes de ejecutar el desembolso.', 409);

  // Código de operación devuelto por el Core Bancario (simulado)
  const codigoTransaccion = `TRX-${fechaDesembolso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const cuotas = await tx.todos('SELECT id_cuota, numero FROM cuota WHERE id_credito = ? ORDER BY numero', [idCredito]);
  for (const cuota of cuotas) {
    await tx.ejecutar('UPDATE cuota SET fecha_vencimiento = ? WHERE id_cuota = ?', [sumarMeses(fechaDesembolso.slice(0, 10), cuota.numero), cuota.id_cuota]);
  }
  await tx.ejecutar(
    `UPDATE credito SET estado = 'VIGENTE', fecha_desembolso = ?, id_oficial_desembolso = ?, medio_desembolso = ?,
            cuenta_destino = ?, codigo_transaccion = ? WHERE id_credito = ?`,
    [fechaDesembolso, idOficial, medio, cuentaDestino, codigoTransaccion, idCredito]
  );
  await tx.ejecutar("UPDATE solicitud_credito SET estado = 'DESEMBOLSADA' WHERE id_solicitud = ?", [credito.id_solicitud]);
  await tx.ejecutar("UPDATE garantia SET estado = 'VIGENTE' WHERE id_solicitud = ?", [credito.id_solicitud]);
  return { codigoTransaccion, credito };
}

/** Genera un número de recibo único y legible */
function generarNumeroRecibo(fecha = fechaHoy()) {
  return `REC-${fecha.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Recalcula saldo y estado del crédito luego de un pago (RN07, RN10).
 * CANCELADO solo cuando no quedan cuotas por pagar.*/
async function actualizarEstadoCredito(tx, idCredito) {
  const resumen = await tx.obtener(
    `SELECT COALESCE(SUM(CASE WHEN estado <> 'PAGADA' THEN capital ELSE 0 END), 0) AS saldo,
            SUM(CASE WHEN estado = 'VENCIDA' THEN 1 ELSE 0 END) AS vencidas,
            SUM(CASE WHEN estado <> 'PAGADA' THEN 1 ELSE 0 END) AS pendientes
       FROM cuota WHERE id_credito = ?`,
    [idCredito]
  );
  const credito = await tx.obtener('SELECT id_solicitud FROM credito WHERE id_credito = ?', [idCredito]);
  let estado = 'VIGENTE';
  if (!resumen.pendientes) estado = 'CANCELADO';
  else if (resumen.vencidas) estado = 'EN_MORA';
  await tx.ejecutar('UPDATE credito SET saldo_capital = ?, estado = ? WHERE id_credito = ?', [Math.max(0, redondear(resumen.saldo)), estado, idCredito]);
  // Al cancelar el crédito se liberan las garantías
  if (estado === 'CANCELADO') await tx.ejecutar("UPDATE garantia SET estado = 'LIBERADA' WHERE id_solicitud = ?", [credito.id_solicitud]);
  return estado;
}

/** Valida que el crédito pueda recibir pagos */
async function obtenerCreditoCobrable(tx, idCredito) {
  const credito = await tx.obtener('SELECT * FROM credito WHERE id_credito = ?', [idCredito]);
  if (!credito) throw new ErrorNegocio('Crédito no encontrado.', 404);
  if (credito.estado === 'PENDIENTE_DESEMBOLSO') throw new ErrorNegocio('El crédito aún no fue desembolsado.', 409);
  if (credito.estado === 'CANCELADO') throw new ErrorNegocio('El crédito ya se encuentra CANCELADO (totalmente pagado).', 409);
  return credito;
}

/** CU12: Pago de una o varias cuotas consecutivas (siempre las más antiguas
 * primero, RN08). Calcula el recargo por mora de cada cuota vencida.*/
async function registrarPagoCuotas(tx, { idCredito, idCajero, cantidad, montoRecibido, formaPago, exonerar = false, motivoExoneracion = null, fechaPago = fechaHoraAhora() }) {
  await obtenerCreditoCobrable(tx, idCredito);
  const pendientes = await tx.todos("SELECT * FROM cuota WHERE id_credito = ? AND estado <> 'PAGADA' ORDER BY numero", [idCredito]);
  if (cantidad > pendientes.length) throw new ErrorNegocio(`Solo quedan ${pendientes.length} cuota(s) pendientes.`);

  const seleccion = pendientes.slice(0, cantidad).map((cuota) => ({ ...cuota, ...calcularMora(cuota, fechaPago.slice(0, 10)) }));
  const capital = redondear(seleccion.reduce((s, q) => s + q.capital, 0));
  const interes = redondear(seleccion.reduce((s, q) => s + q.interes, 0));
  const recargoCalculado = redondear(seleccion.reduce((s, q) => s + q.recargo, 0));
  const recargo = exonerar ? 0 : recargoCalculado;
  const total = redondear(capital + interes + recargo);

  if (montoRecibido + 0.001 < total) throw new ErrorNegocio(`Monto insuficiente. El total a pagar es Bs ${total.toFixed(2)}.`);
  const cambio = formaPago === 'EFECTIVO' ? redondear(montoRecibido - total) : 0;
  const recibido = formaPago === 'EFECTIVO' ? montoRecibido : total;
  const numeroRecibo = generarNumeroRecibo(fechaPago.slice(0, 10));

  const { idInsertado: idPago } = await tx.ejecutar(
    `INSERT INTO pago (numero_recibo, id_credito, id_cajero, fecha_pago, tipo, cuotas_pagadas, monto_capital, monto_interes, monto_recargo,
                       recargo_exonerado, motivo_exoneracion, monto_total, monto_recibido, cambio, forma_pago)
     VALUES (?, ?, ?, ?, 'CUOTA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [numeroRecibo, idCredito, idCajero, fechaPago, seleccion.map((q) => q.numero).join(','), capital, interes, recargo,
      exonerar ? recargoCalculado : 0, exonerar ? motivoExoneracion : null, total, recibido, cambio, formaPago]
  );
  for (const cuota of seleccion) {
    await tx.ejecutar(
      "UPDATE cuota SET estado = 'PAGADA', fecha_pago = ?, id_pago = ?, dias_atraso = ?, recargo_mora = ? WHERE id_cuota = ?",
      [fechaPago, idPago, cuota.diasAtraso, exonerar ? 0 : cuota.recargo, cuota.id_cuota]
    );
  }
  const estadoCredito = await actualizarEstadoCredito(tx, idCredito);
  return { idPago, numeroRecibo, total, cambio, estadoCredito, recargoExonerado: exonerar ? recargoCalculado : 0 };
}

/** Cancelación TOTAL anticipada del crédito: paga todas las cuotas pendientes
 * con la liquidación definida en finanzas.liquidarCancelacion().*/
async function cancelarCreditoTotal(tx, { idCredito, idCajero, montoRecibido, formaPago, exonerar = false, motivoExoneracion = null, fechaPago = fechaHoraAhora() }) {
  await obtenerCreditoCobrable(tx, idCredito);
  const pendientes = await tx.todos("SELECT * FROM cuota WHERE id_credito = ? AND estado <> 'PAGADA' ORDER BY numero", [idCredito]);
  const liquidacion = liquidarCancelacion(pendientes, fechaPago.slice(0, 10));
  const recargo = exonerar ? 0 : liquidacion.recargo;
  const total = redondear(liquidacion.capital + liquidacion.interes + recargo);

  if (montoRecibido + 0.001 < total) throw new ErrorNegocio(`Monto insuficiente. El total de cancelación es Bs ${total.toFixed(2)}.`);
  const cambio = formaPago === 'EFECTIVO' ? redondear(montoRecibido - total) : 0;
  const recibido = formaPago === 'EFECTIVO' ? montoRecibido : total;
  const numeroRecibo = generarNumeroRecibo(fechaPago.slice(0, 10));

  const { idInsertado: idPago } = await tx.ejecutar(
    `INSERT INTO pago (numero_recibo, id_credito, id_cajero, fecha_pago, tipo, cuotas_pagadas, monto_capital, monto_interes, monto_recargo,
                       recargo_exonerado, motivo_exoneracion, monto_total, monto_recibido, cambio, forma_pago)
     VALUES (?, ?, ?, ?, 'CANCELACION_TOTAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [numeroRecibo, idCredito, idCajero, fechaPago, pendientes.map((q) => q.numero).join(','), liquidacion.capital, liquidacion.interes,
      recargo, exonerar ? liquidacion.recargo : 0, exonerar ? motivoExoneracion : null, total, recibido, cambio, formaPago]
  );
  for (const cuota of liquidacion.detalle) {
    await tx.ejecutar(
      "UPDATE cuota SET estado = 'PAGADA', fecha_pago = ?, id_pago = ?, dias_atraso = ?, recargo_mora = ? WHERE id_cuota = ?",
      [fechaPago, idPago, cuota.dias_atraso, exonerar ? 0 : cuota.recargo, cuota.id_cuota]
    );
  }
  const estadoCredito = await actualizarEstadoCredito(tx, idCredito);
  return { idPago, numeroRecibo, total, cambio, estadoCredito, liquidacion };
}

module.exports = { crearCreditoAprobado, desembolsarCredito, registrarPagoCuotas, cancelarCreditoTotal, actualizarEstadoCredito };
