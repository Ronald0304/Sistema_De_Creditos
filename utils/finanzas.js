/** CÁLCULOS FINANCIEROS
 *  - Manejo de fechas en formato ISO local (AAAA-MM-DD), sin desfases UTC.
 *  - Sistema de amortización FRANCÉS (cuota fija) para el cronograma.
 *  - Cálculo de recargos por mora.
 *  - Liquidación para la cancelación anticipada (total) de un crédito.
 */
const { MORA, EVALUACION } = require('./parametros');

/* FECHAS*/

/** Rellena con ceros a la izquierda */
const dosDigitos = (n) => String(n).padStart(2, '0');

/** Convierte un objeto Date a 'AAAA-MM-DD' usando la hora LOCAL */
function aFechaISO(fecha) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Fecha de hoy en formato 'AAAA-MM-DD' */
function fechaHoy() {
  return aFechaISO(new Date());
}

/** Fecha y hora actual 'AAAA-MM-DD HH:MM:SS' (local) */
function fechaHoraAhora() {
  const d = new Date();
  return `${aFechaISO(d)} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
}

/** Convierte 'AAAA-MM-DD' (o 'AAAA-MM-DD HH:MM:SS') a Date local a medianoche */
function deFechaISO(texto) {
  const [anio, mes, dia] = String(texto).slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

/**
 * Suma meses a una fecha respetando fin de mes.
 * Ej.: 31/01 + 1 mes = 28/02 (o 29/02 en año bisiesto).
 */
function sumarMeses(fechaISO, meses) {
  const base = deFechaISO(fechaISO);
  const diaOriginal = base.getDate();
  const objetivo = new Date(base.getFullYear(), base.getMonth() + meses, 1);
  const ultimoDia = new Date(objetivo.getFullYear(), objetivo.getMonth() + 1, 0).getDate();
  objetivo.setDate(Math.min(diaOriginal, ultimoDia));
  return aFechaISO(objetivo);
}

/** Días transcurridos entre dos fechas ISO (b - a) */
function diasEntre(fechaA, fechaB) {
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((deFechaISO(fechaB) - deFechaISO(fechaA)) / MS_DIA);
}

/*  REDONDEO MONETARIO */

/** Redondea a 2 decimales evitando errores de coma flotante */
function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/*  AMORTIZACIÓN (SISTEMA FRANCÉS)- */

/**
 * Calcula la cuota fija mensual.
 * Fórmula: C = P · i / (1 - (1 + i)^-n), con i = tasa anual / 12 / 100
 */
function calcularCuotaFija(monto, tasaAnual, plazoMeses) {
  const i = Number(tasaAnual) / 100 / 12;
  if (i === 0) return redondear(monto / plazoMeses);
  return redondear((monto * i) / (1 - Math.pow(1 + i, -plazoMeses)));
}

/**
 * Genera el cronograma completo de pagos.
 * La última cuota se ajusta para que el saldo final sea exactamente 0.
 *
 * @param {number} monto        Capital prestado
 * @param {number} tasaAnual    Tasa nominal anual (%)
 * @param {number} plazoMeses   Número de cuotas
 * @param {string} fechaInicio  Fecha base (aprobación o desembolso) 'AAAA-MM-DD'
 * @returns {{cuotaFija:number, cuotas:Array, totalInteres:number, totalPagar:number}}
 */
function generarCronograma(monto, tasaAnual, plazoMeses, fechaInicio = fechaHoy()) {
  const i = Number(tasaAnual) / 100 / 12;
  const cuotaFija = calcularCuotaFija(monto, tasaAnual, plazoMeses);
  const cuotas = [];
  let saldo = redondear(monto);
  let totalInteres = 0;

  for (let numero = 1; numero <= plazoMeses; numero += 1) {
    const interes = redondear(saldo * i);
    let capital = redondear(cuotaFija - interes);
    // Última cuota: se amortiza todo el saldo restante
    if (numero === plazoMeses) capital = saldo;
    const montoCuota = redondear(capital + interes);
    saldo = redondear(saldo - capital);
    totalInteres = redondear(totalInteres + interes);
    cuotas.push({
      numero,
      fecha_vencimiento: sumarMeses(fechaInicio, numero),
      capital,
      interes,
      monto: montoCuota,
      saldo_capital: Math.max(0, saldo)
    });
  }
  return { cuotaFija, cuotas, totalInteres, totalPagar: redondear(monto + totalInteres) };
}

/*   MORA */

/**
 * Calcula los días de atraso y el recargo por mora de una cuota a una fecha.
 * Recargo = monto_cuota × tasa_diaria × (días_atraso − días_gracia), con tope.
 */
function calcularMora(cuota, fechaReferencia = fechaHoy()) {
  const diasAtraso = Math.max(0, diasEntre(cuota.fecha_vencimiento, fechaReferencia));
  const diasCobrables = Math.max(0, diasAtraso - MORA.diasGracia);
  const recargoBruto = cuota.monto * MORA.tasaRecargoDiario * diasCobrables;
  const recargo = redondear(Math.min(recargoBruto, cuota.monto * MORA.topeRecargo));
  return { diasAtraso, recargo };
}

/**
 * Liquidación para CANCELACIÓN TOTAL anticipada del crédito:
 *  - Cuotas vencidas: capital + interés + recargo por mora.
 *  - Primera cuota no vencida (periodo en curso): capital + interés.
 *  - Cuotas futuras restantes: SOLO capital (se condonan intereses futuros).
 *
 * @param {Array} cuotasPendientes  Cuotas con estado PENDIENTE o VENCIDA (ordenadas)
 */
function liquidarCancelacion(cuotasPendientes, fechaReferencia = fechaHoy()) {
  let capital = 0;
  let interes = 0;
  let recargo = 0;
  let periodoEnCursoCobrado = false;
  const detalle = cuotasPendientes.map((cuota) => {
    const { diasAtraso, recargo: recargoCuota } = calcularMora(cuota, fechaReferencia);
    let interesCobrado = 0;
    if (diasAtraso > 0) {
      interesCobrado = cuota.interes;
    } else if (!periodoEnCursoCobrado) {
      interesCobrado = cuota.interes;
      periodoEnCursoCobrado = true;
    }
    capital += cuota.capital;
    interes += interesCobrado;
    recargo += recargoCuota;
    return { ...cuota, dias_atraso: diasAtraso, recargo: recargoCuota, interes_cobrado: redondear(interesCobrado) };
  });
  capital = redondear(capital);
  interes = redondear(interes);
  recargo = redondear(recargo);
  return { capital, interes, recargo, total: redondear(capital + interes + recargo), detalle };
}

/* EVALUACIÓN DE RIESGO (pre-dictamen de apoyo al Analista) */

/**
 * Calcula indicadores de capacidad de pago y una sugerencia de riesgo.
 * El dictamen final SIEMPRE lo decide el Analista (el sistema solo sugiere).
 */
function evaluarCapacidad({ ingresos, gastos, deudasMensuales, cuota, valorGarantias, monto, historial }) {
  const capacidad = redondear(ingresos - gastos - deudasMensuales);
  const rci = capacidad > 0 ? cuota / capacidad : Infinity;
  const cobertura = monto > 0 ? redondear((valorGarantias / monto) * 100) : 0;

  // Puntaje interno de 0 a 100 combinando capacidad, historial y garantías
  let puntaje = 50;
  if (rci <= EVALUACION.rciBajo) puntaje += 20;
  else if (rci <= EVALUACION.rciMedio) puntaje += 5;
  else puntaje -= 30;

  if (historial) {
    const ajustesCalificacion = { A: 20, B: 10, C: 0, D: -15, E: -25, F: -40 };
    puntaje += ajustesCalificacion[historial.calificacion] ?? 0;
    if (historial.en_mora_actual) puntaje -= 25;
    if (historial.dias_mora_max > 90) puntaje -= 10;
  }
  if (cobertura >= 100) puntaje += 10;
  else if (cobertura >= 50) puntaje += 5;
  else puntaje -= 5;
  puntaje = Math.max(0, Math.min(100, puntaje));

  let nivelRiesgo = 'ALTO';
  if (puntaje >= 70) nivelRiesgo = 'BAJO';
  else if (puntaje >= 45) nivelRiesgo = 'MEDIO';

  const dictamenSugerido = nivelRiesgo !== 'ALTO' && capacidad > 0 && rci <= EVALUACION.rciMedio ? 'FAVORABLE' : 'NO_FAVORABLE';

  return {
    capacidad_pago: capacidad,
    relacion_cuota_ingreso: Number.isFinite(rci) ? redondear(rci * 100) : 999,
    cobertura_garantia: cobertura,
    puntaje_interno: puntaje,
    nivel_riesgo_sugerido: nivelRiesgo,
    dictamen_sugerido: dictamenSugerido
  };
}

module.exports = {
  aFechaISO,
  fechaHoy,
  fechaHoraAhora,
  deFechaISO,
  sumarMeses,
  diasEntre,
  redondear,
  calcularCuotaFija,
  generarCronograma,
  calcularMora,
  liquidarCancelacion,
  evaluarCapacidad
};
