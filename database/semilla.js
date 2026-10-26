/**
 * ============================================================================
 *  DATOS DE DEMOSTRACIÓN
 * ============================================================================
 *  Se cargan automáticamente la PRIMERA vez que se inicia el sistema (cuando
 *  la tabla `usuario` está vacía). Las fechas se calculan RELATIVAS AL DÍA
 *  ACTUAL, de modo que siempre existan créditos al día, en mora y cancelados.
 *
 *  Credenciales del personal (todas con la misma contraseña de demostración):
 *    admin     -> Administrador        | atorrez  -> Oficial de Crédito
 *    jcondori  -> Oficial de Crédito   | lgomez   -> Analista de Crédito
 *    cmendoza  -> Jefe de Crédito      | mperez   -> Cajero
 *    rmendez   -> Gerente
 *    Contraseña: Credito2026*
 *
 *  Clientes: usuario = CI. Algunos ya cambiaron su clave (Cliente2026*) y
 *  otros conservan la inicial (= CI) para demostrar el cambio obligatorio.
 * ============================================================================
 */
const db = require('./db');
const { hashClave } = require('../utils/seguridad');
const { PRODUCTOS } = require('../utils/parametros');
const { fechaHoy, sumarMeses, calcularCuotaFija, evaluarCapacidad } = require('../utils/finanzas');
const { crearCreditoAprobado, desembolsarCredito, registrarPagoCuotas } = require('../utils/operaciones');

const CLAVE_PERSONAL = 'Credito2026*';
const CLAVE_CLIENTE = 'Cliente2026*';

/** Fecha-hora desplazada N meses (y D días) respecto de hoy */
function haceMeses(meses, dias = 0, hora = '10:00:00') {
  const base = sumarMeses(fechaHoy(), -meses);
  const fecha = new Date(`${base}T00:00:00`);
  fecha.setDate(fecha.getDate() - dias);
  const dd = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())} ${hora}`;
}

async function cargarDatosDemostracion() {
  await db.transaccion(async (tx) => {
    /* ------------------------------------------------------------------
     * 1) PERSONAL DE LA ENTIDAD
     * ---------------------------------------------------------------- */
    const personal = [
      ['Administrador del Sistema', 'admin', 'admin@credimanager.bo', 'ADMIN', 0],
      ['Ana María Torrez Rojas', 'atorrez', 'atorrez@credimanager.bo', 'OFICIAL', 0],
      ['José Luis Condori Apaza', 'jcondori', 'jcondori@credimanager.bo', 'OFICIAL', 0],
      ['Lucía Gómez Silva', 'lgomez', 'lgomez@credimanager.bo', 'ANALISTA', 0],
      ['Carlos Mullisaca Mendoza', 'cmendoza', 'cmendoza@credimanager.bo', 'JEFE', 150000],
      ['Marco Antonio Pérez Quispe', 'mperez', 'mperez@credimanager.bo', 'CAJERO', 0],
      ['Roberto Méndez Rojas', 'rmendez', 'rmendez@credimanager.bo', 'GERENTE', 1000000]
    ];
    const ids = {};
    const hashPersonal = hashClave(CLAVE_PERSONAL);
    for (const [nombre, login, correo, rol, limite] of personal) {
      const { idInsertado } = await tx.ejecutar(
        `INSERT INTO usuario (nombre_completo, login, clave_hash, correo, rol, limite_aprobacion, activo, debe_cambiar_clave, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        [nombre, login, hashPersonal, correo, rol, limite, haceMeses(14)]
      );
      ids[login] = idInsertado;
    }

    /* ------------------------------------------------------------------
     * 2) CLIENTES (+ cuenta de acceso al portal)
     * ---------------------------------------------------------------- */
    const clientes = [
      // ci, nombres, apellidos, telefono, direccion, ocupacion, ingresos, gastos, oficial, ¿cambió clave?, meses de antigüedad
      ['1234567', 'María Elena', 'Quispe Mamani', '71234567', 'Av. 6 de Marzo N° 120, El Alto', 'Comerciante', 6500, 2200, 'atorrez', true, 8],
      ['7654321', 'Juan Carlos', 'Mamani Choque', '77654321', 'Calle Murillo N° 845, La Paz', 'Transportista', 4800, 1900, 'atorrez', true, 9],
      ['4567890', 'Rosa', 'Condori Limachi', '74567890', 'Av. Buenos Aires N° 1550, La Paz', 'Docente', 5200, 2100, 'jcondori', false, 1],
      ['9876543', 'Pedro', 'Alcázar Gutiérrez', '70011223', 'Av. Arce N° 2630, Sopocachi', 'Ingeniero civil', 12000, 4500, 'atorrez', true, 14],
      ['5544332', 'Ana Lucía', 'Vargas Tapia', '76655443', 'Calle Lisímaco Gutiérrez N° 410', 'Estudiante / Ventas', 2400, 1800, 'jcondori', false, 1],
      ['3216549', 'Luis Fernando', 'Choque Ramos', '71598746', 'Av. Hernando Siles N° 5010, Obrajes', 'Médico', 15000, 5200, 'atorrez', false, 1],
      ['6549873', 'Carmen Rosa', 'Huanca Flores', '72583691', 'Zona Villa Fátima, Calle 3 N° 77', 'Artesana', 3800, 1500, 'jcondori', false, 0],
      ['8523697', 'Diego Alejandro', 'Salazar Medina', '73692581', 'Av. Busch N° 1300, Miraflores', 'Músico independiente', 3000, 2600, 'jcondori', false, 1],
      ['1472583', 'Gabriela', 'Paz Flores', '79513578', 'Calle 21 de Calacoto N° 8100', 'Empresaria (restaurante)', 18000, 7000, 'atorrez', true, 3],
      ['9638527', 'Wilmer', 'Ticona Mamani', '78945612', 'Av. Juan Pablo II N° 3300, El Alto', 'Mecánico', 4200, 1700, 'jcondori', true, 4]
    ];
    const hashCliente = hashClave(CLAVE_CLIENTE);
    const idCliente = {};
    for (const [ci, nombres, apellidos, telefono, direccion, ocupacion, ingresos, gastos, oficial, cambio, meses] of clientes) {
      const { idInsertado } = await tx.ejecutar(
        `INSERT INTO cliente (ci, extension, nombres, apellidos, telefono, correo, direccion, ocupacion, ingresos_mensuales, gastos_mensuales, id_oficial, fecha_registro)
         VALUES (?, 'LP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ci, nombres, apellidos, telefono, `${nombres.split(' ')[0].toLowerCase()}.${apellidos.split(' ')[0].toLowerCase()}@correo.bo`,
          direccion, ocupacion, ingresos, gastos, ids[oficial], haceMeses(meses, 0).slice(0, 10)]
      );
      await tx.ejecutar(
        `INSERT INTO usuario (nombre_completo, login, clave_hash, rol, id_cliente, activo, debe_cambiar_clave, fecha_creacion)
         VALUES (?, ?, ?, 'CLIENTE', ?, 1, ?, ?)`,
        [`${nombres} ${apellidos}`, ci, cambio ? hashCliente : hashClave(ci), idInsertado, cambio ? 0 : 1, haceMeses(meses)]
      );
      idCliente[ci] = { id: idInsertado, ingresos, gastos, oficial: ids[oficial] };
    }

    /* ------------------------------------------------------------------
     * Funciones auxiliares de la semilla
     * ---------------------------------------------------------------- */
    let correlativo = 0;
    /** Crea una solicitud con la fecha indicada */
    async function crearSolicitud(ci, tipo, monto, plazo, destino, estado, fecha) {
      correlativo += 1;
      const cliente = idCliente[ci];
      const codigo = `SOL-${fecha.slice(0, 4)}-${String(correlativo).padStart(5, '0')}`;
      const { idInsertado } = await tx.ejecutar(
        `INSERT INTO solicitud_credito (codigo, id_cliente, id_oficial, tipo_credito, monto_solicitado, plazo_meses, tasa_interes, destino, estado,
                                        fecha_solicitud, fecha_envio_evaluacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [codigo, cliente.id, cliente.oficial, tipo, monto, plazo, PRODUCTOS[tipo].tasa, destino, estado, fecha, estado === 'REGISTRADA' ? null : fecha]
      );
      return { id: idInsertado, codigo, ci, tipo, monto, plazo, fecha };
    }

    /** Registra una garantía */
    async function garantia(sol, tipo, descripcion, valor, documento) {
      await tx.ejecutar(
        `INSERT INTO garantia (id_solicitud, tipo, descripcion, valor_comercial, documento_respaldo, estado, id_oficial, fecha_registro)
         VALUES (?, ?, ?, ?, ?, 'REGISTRADA', ?, ?)`,
        [sol.id, tipo, descripcion, valor, documento, idCliente[sol.ci].oficial, sol.fecha]
      );
    }

    /** Enlaza historial + emite evaluación del analista */
    async function evaluar(sol, { calificacion, puntaje, dictamen, riesgo, observacion, deudas = 0, mora = 0 }) {
      const cliente = idCliente[sol.ci];
      let historial = await tx.obtener('SELECT id_historial FROM historial_crediticio WHERE id_cliente = ?', [cliente.id]);
      if (!historial) {
        const { idInsertado } = await tx.ejecutar(
          `INSERT INTO historial_crediticio (id_cliente, codigo_referencia, calificacion, puntaje, entidades_acreedoras, deuda_externa_total,
                  cuota_mensual_externa, creditos_previos, creditos_internos, dias_mora_max, en_mora_actual, observaciones, fecha_consulta, id_analista)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`,
          [cliente.id, `HC-${sol.ci}-${String(cliente.id).padStart(4, '0')}`, calificacion, puntaje, deudas ? 1 : 0, deudas * 18, deudas,
            deudas ? 2 : 0, mora, mora ? `Registró atrasos históricos de hasta ${mora} días.` : 'Comportamiento de pago puntual.', sol.fecha, ids.lgomez]
        );
        historial = { id_historial: idInsertado };
      }
      const cuota = calcularCuotaFija(sol.monto, PRODUCTOS[sol.tipo].tasa, sol.plazo);
      const garantias = await tx.obtener('SELECT COALESCE(SUM(valor_comercial),0) AS v FROM garantia WHERE id_solicitud = ?', [sol.id]);
      const calc = evaluarCapacidad({ ingresos: cliente.ingresos, gastos: cliente.gastos, deudasMensuales: deudas, cuota, valorGarantias: garantias.v, monto: sol.monto, historial: { calificacion, en_mora_actual: 0, dias_mora_max: mora } });
      await tx.ejecutar(
        `INSERT INTO evaluacion_credito (id_solicitud, id_analista, id_historial, fecha_evaluacion, ingresos, gastos, deudas_mensuales, capacidad_pago,
                cuota_estimada, relacion_cuota_ingreso, cobertura_garantia, puntaje_interno, nivel_riesgo, dictamen, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sol.id, ids.lgomez, historial.id_historial, sol.fecha, cliente.ingresos, cliente.gastos, deudas, calc.capacidad_pago, cuota,
          calc.relacion_cuota_ingreso, calc.cobertura_garantia, calc.puntaje_interno, riesgo, dictamen, observacion]
      );
    }

    /** Aprueba la solicitud (resolución del Jefe) y genera el crédito */
    async function aprobar(sol, fecha, observacion = 'Aprobado conforme a dictamen favorable del analista.') {
      await tx.ejecutar(
        "UPDATE solicitud_credito SET estado = 'APROBADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ? WHERE id_solicitud = ?",
        [ids.cmendoza, fecha, observacion, sol.id]
      );
      return crearCreditoAprobado(tx, { idSolicitud: sol.id, monto: sol.monto, tasa: PRODUCTOS[sol.tipo].tasa, plazo: sol.plazo, fechaAprobacion: fecha });
    }

    /** Paga N cuotas, cada una en su fecha de vencimiento (o con días de atraso) */
    async function pagarCuotas(idCredito, cantidad, atrasos = []) {
      for (let i = 0; i < cantidad; i += 1) {
        const cuota = await tx.obtener("SELECT * FROM cuota WHERE id_credito = ? AND estado <> 'PAGADA' ORDER BY numero LIMIT 1", [idCredito]);
        const fecha = new Date(`${cuota.fecha_vencimiento}T00:00:00`);
        fecha.setDate(fecha.getDate() + (atrasos[i] || -2));
        const dd = (n) => String(n).padStart(2, '0');
        const fechaPago = `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())} 11:${dd(10 + i)}:00`;
        const total = cuota.monto * 1.3;
        await registrarPagoCuotas(tx, { idCredito, idCajero: ids.mperez, cantidad: 1, montoRecibido: Math.ceil(total), formaPago: i % 3 === 2 ? 'TRANSFERENCIA' : 'EFECTIVO', fechaPago });
      }
    }

    /* ------------------------------------------------------------------
     * 3) ESCENARIOS DEL CICLO DE VIDA DEL CRÉDITO
     * ---------------------------------------------------------------- */

    // (a) Pedro Alcázar: crédito CANCELADO (historial de buen pagador)
    let sol = await crearSolicitud('9876543', 'VEHICULAR', 40000, 12, 'Compra de vehículo particular', 'EN_EVALUACION', haceMeses(14, 5));
    await garantia(sol, 'PRENDARIA', 'Vehículo Toyota Corolla 2019, placa 3456-KTR', 65000, 'RUAT N° 778812');
    await evaluar(sol, { calificacion: 'A', puntaje: 810, dictamen: 'FAVORABLE', riesgo: 'BAJO', observacion: 'Ingresos estables y verificables. Garantía prendaria con cobertura superior al 150%.' });
    let credito = await aprobar(sol, haceMeses(14, 2));
    await desembolsarCredito(tx, { idCredito: credito.idCredito, idOficial: ids.atorrez, medio: 'ABONO_CUENTA', cuentaDestino: '1000-2233445', fechaDesembolso: haceMeses(13, 0, '09:30:00') });
    await pagarCuotas(credito.idCredito, 12);

    // (b) María Elena Quispe: crédito VIGENTE y AL DÍA
    sol = await crearSolicitud('1234567', 'MICROCREDITO', 25000, 18, 'Capital de trabajo para tienda de abarrotes', 'EN_EVALUACION', haceMeses(4, 6));
    await garantia(sol, 'PERSONAL', 'Garante: Sra. Julia Mamani (CI 3344556 LP), comerciante', 30000, 'Declaración jurada de garante');
    await evaluar(sol, { calificacion: 'B', puntaje: 735, dictamen: 'FAVORABLE', riesgo: 'MEDIO', deudas: 450, mora: 8, observacion: 'Negocio con 6 años de antigüedad. Capacidad de pago suficiente. Atraso histórico leve.' });
    credito = await aprobar(sol, haceMeses(4, 3));
    await desembolsarCredito(tx, { idCredito: credito.idCredito, idOficial: ids.atorrez, medio: 'EFECTIVO', cuentaDestino: null, fechaDesembolso: haceMeses(3, 0, '10:15:00') });
    await pagarCuotas(credito.idCredito, 3, [-1, 0, -2]);

    // (c) Juan Carlos Mamani: crédito EN MORA (3 cuotas vencidas)
    sol = await crearSolicitud('7654321', 'CONSUMO', 18000, 12, 'Reparación de minibús de transporte público', 'EN_EVALUACION', haceMeses(6, 4));
    await garantia(sol, 'PRENDARIA', 'Minibús Nissan Urvan 2012, placa 2211-LPZ', 45000, 'RUAT N° 552310');
    await evaluar(sol, { calificacion: 'B', puntaje: 712, dictamen: 'FAVORABLE', riesgo: 'MEDIO', deudas: 300, observacion: 'Ingresos diarios del transporte. Garantía prendaria suficiente.' });
    credito = await aprobar(sol, haceMeses(6, 1));
    await desembolsarCredito(tx, { idCredito: credito.idCredito, idOficial: ids.atorrez, medio: 'ABONO_CUENTA', cuentaDestino: '1000-7766554', fechaDesembolso: haceMeses(5, 5, '11:00:00') });
    await pagarCuotas(credito.idCredito, 2, [0, 6]);

    // (d) Gabriela Paz: crédito PyME VIGENTE
    sol = await crearSolicitud('1472583', 'PYME', 90000, 36, 'Equipamiento de cocina industrial para restaurante', 'EN_EVALUACION', haceMeses(2, 8));
    await garantia(sol, 'HIPOTECARIA', 'Departamento en Calacoto, Calle 21 N° 8100, 95 m²', 180000, 'Folio real N° 2.01.1.99.0012345');
    await evaluar(sol, { calificacion: 'A', puntaje: 798, dictamen: 'FAVORABLE', riesgo: 'BAJO', deudas: 1200, observacion: 'Empresa con estados financieros sólidos. Garantía hipotecaria con cobertura del 200%.' });
    credito = await aprobar(sol, haceMeses(2, 4), 'Aprobado. Se recomienda seguimiento trimestral del flujo del negocio.');
    await desembolsarCredito(tx, { idCredito: credito.idCredito, idOficial: ids.atorrez, medio: 'ABONO_CUENTA', cuentaDestino: '1000-9988776', fechaDesembolso: haceMeses(1, 2, '15:20:00') });
    await pagarCuotas(credito.idCredito, 1, [-3]);

    // (e) Wilmer Ticona: crédito EN MORA reciente (sin pagos)
    sol = await crearSolicitud('9638527', 'MICROCREDITO', 12000, 12, 'Compra de herramientas para taller mecánico', 'EN_EVALUACION', haceMeses(3, 10));
    await garantia(sol, 'PERSONAL', 'Garante: Sr. Ramiro Ticona (CI 4455667 LP)', 15000, 'Declaración jurada de garante');
    await evaluar(sol, { calificacion: 'C', puntaje: 650, dictamen: 'FAVORABLE', riesgo: 'MEDIO', mora: 25, observacion: 'Capacidad de pago ajustada pero suficiente. Atrasos históricos moderados.' });
    credito = await aprobar(sol, haceMeses(3, 6));
    await desembolsarCredito(tx, { idCredito: credito.idCredito, idOficial: ids.jcondori, medio: 'EFECTIVO', cuentaDestino: null, fechaDesembolso: haceMeses(2, 12, '09:45:00') });

    // (f) Luis Fernando Choque: APROBADO, pendiente de desembolso
    sol = await crearSolicitud('3216549', 'VEHICULAR', 120000, 48, 'Compra de vehículo nuevo', 'EN_EVALUACION', haceMeses(0, 9));
    await garantia(sol, 'PRENDARIA', 'Vehículo a adquirir: Toyota RAV4 2026 (prenda sobre el bien)', 160000, 'Proforma concesionaria N° 4471');
    await evaluar(sol, { calificacion: 'A', puntaje: 825, dictamen: 'FAVORABLE', riesgo: 'BAJO', observacion: 'Profesional con ingresos altos y estables. Sin deudas en el sistema financiero.' });
    await aprobar(sol, haceMeses(0, 2));

    // (g) Pedro Alcázar: nueva solicitud EVALUADA (favorable) esperando al Jefe
    sol = await crearSolicitud('9876543', 'VIVIENDA', 140000, 120, 'Ampliación de vivienda familiar', 'EN_EVALUACION', haceMeses(0, 6));
    await garantia(sol, 'HIPOTECARIA', 'Casa en Sopocachi, Av. Arce N° 2630, 210 m²', 420000, 'Folio real N° 2.01.1.01.0098765');
    await evaluar(sol, { calificacion: 'A', puntaje: 820, dictamen: 'FAVORABLE', riesgo: 'BAJO', observacion: 'Excelente historial (crédito anterior cancelado sin atrasos). Cobertura hipotecaria del 300%.' });
    await tx.ejecutar("UPDATE solicitud_credito SET estado = 'EVALUADA' WHERE id_solicitud = ?", [sol.id]);

    // (h) Diego Salazar: EVALUADA con dictamen NO FAVORABLE
    sol = await crearSolicitud('8523697', 'CONSUMO', 35000, 24, 'Compra de equipos de sonido', 'EN_EVALUACION', haceMeses(0, 5));
    await garantia(sol, 'PERSONAL', 'Garante: Sra. Elena Medina (CI 2233441 LP)', 20000, 'Declaración jurada de garante');
    await evaluar(sol, { calificacion: 'D', puntaje: 580, dictamen: 'NO_FAVORABLE', riesgo: 'ALTO', deudas: 650, mora: 55, observacion: 'Capacidad de pago insuficiente: la cuota supera el 100% del ingreso disponible. Atrasos de 55 días.' });
    await tx.ejecutar("UPDATE solicitud_credito SET estado = 'EVALUADA' WHERE id_solicitud = ?", [sol.id]);

    // (i) Ana Lucía Vargas: RECHAZADA
    sol = await crearSolicitud('5544332', 'CONSUMO', 15000, 24, 'Compra de mercadería', 'EN_EVALUACION', haceMeses(0, 15));
    await garantia(sol, 'PERSONAL', 'Garante: Sr. Mario Vargas (CI 1122334 LP)', 10000, 'Declaración jurada de garante');
    await evaluar(sol, { calificacion: 'C', puntaje: 640, dictamen: 'NO_FAVORABLE', riesgo: 'ALTO', observacion: 'Ingresos variables y sin respaldo documental suficiente. Capacidad de pago muy ajustada.' });
    await tx.ejecutar(
      "UPDATE solicitud_credito SET estado = 'RECHAZADA', id_jefe = ?, fecha_resolucion = ?, observacion_resolucion = ? WHERE id_solicitud = ?",
      [ids.cmendoza, haceMeses(0, 12), 'Capacidad de pago insuficiente según dictamen técnico. Puede volver a postular con mayores ingresos demostrables.', sol.id]
    );

    // (j) Rosa Condori: EN EVALUACIÓN (bandeja del analista)
    sol = await crearSolicitud('4567890', 'CONSUMO', 20000, 24, 'Estudios de posgrado (maestría)', 'EN_EVALUACION', haceMeses(0, 2));
    await garantia(sol, 'DEPOSITO', 'DPF N° 556677 en Banco Unión a 360 días', 22000, 'Certificado DPF N° 556677');

    // (k) Carmen Huanca: REGISTRADA (el oficial aún debe completar garantías)
    await crearSolicitud('6549873', 'MICROCREDITO', 8000, 12, 'Compra de materia prima (lana de alpaca)', 'REGISTRADA', haceMeses(0, 0, '09:00:00'));

    /* ------------------------------------------------------------------
     * 4) AUDITORÍA INICIAL
     * ---------------------------------------------------------------- */
    await tx.ejecutar(
      `INSERT INTO auditoria (id_usuario, login, rol, operacion, entidad, detalle, ip, resultado)
       VALUES (?, 'admin', 'ADMIN', 'CARGA_INICIAL', 'sistema', 'Carga de datos de demostración', '127.0.0.1', 'EXITO')`,
      [ids.admin]
    );
  });
}

module.exports = { cargarDatosDemostracion, CLAVE_PERSONAL, CLAVE_CLIENTE };
