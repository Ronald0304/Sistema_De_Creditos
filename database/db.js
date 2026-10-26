/**
 * ============================================================================
 *  MÓDULO DE BASE DE DATOS (SQLite)
 * ============================================================================
 *  - Abre (o crea) el archivo `database/creditos.sqlite`.
 *  - Define el esquema relacional del sistema: EXACTAMENTE 10 TABLAS.
 *  - Expone funciones con Promesas (`ejecutar`, `obtener`, `todos`) para
 *    evitar el "callback hell" del driver sqlite3.
 *  - Expone `transaccion(fn)`, que serializa las operaciones de escritura
 *    críticas (desembolsos, pagos, aprobaciones) para que sean atómicas.
 *
 *  TABLAS DEL NÚCLEO RELACIONAL (10):
 *    1. usuario               -> Credenciales y roles (personal y clientes)
 *    2. cliente               -> Datos personales y financieros del cliente
 *    3. historial_crediticio  -> Historial único del cliente (Core Bancario)
 *    4. solicitud_credito     -> Solicitudes y resolución del Jefe de Crédito
 *    5. evaluacion_credito    -> Dictamen técnico del Analista
 *    6. garantia              -> Garantías asociadas a cada solicitud
 *    7. credito               -> Crédito aprobado + contrato + desembolso
 *    8. cuota                 -> Cronograma de pagos (plan de amortización)
 *    9. pago                  -> Pagos / vouchers emitidos por el Cajero
 *   10. auditoria             -> Bitácora de operaciones del sistema
 * ============================================================================
 */
const sqlite3 = require('sqlite3');
const path = require('path');

/** Ruta física del archivo de base de datos */
const RUTA_BD = process.env.RUTA_BD || path.join(__dirname, 'creditos.sqlite');

const conexion = new sqlite3.Database(RUTA_BD, (error) => {
  if (error) {
    console.error('Error al conectar con SQLite:', error.message);
    process.exit(1);
  }
});

/* ----------------------------------------------------------------------------
 *  FUNCIONES BÁSICAS CON PROMESAS (uso interno)
 * -------------------------------------------------------------------------- */

/** Ejecuta INSERT/UPDATE/DELETE y devuelve { idInsertado, cambios } */
function ejecutarDirecto(sql, parametros = []) {
  return new Promise((resolver, rechazar) => {
    conexion.run(sql, parametros, function alTerminar(error) {
      if (error) return rechazar(error);
      resolver({ idInsertado: this.lastID, cambios: this.changes });
    });
  });
}

/** Devuelve una sola fila (o undefined) */
function obtener(sql, parametros = []) {
  return new Promise((resolver, rechazar) => {
    conexion.get(sql, parametros, (error, fila) => (error ? rechazar(error) : resolver(fila)));
  });
}

/** Devuelve todas las filas como arreglo */
function todos(sql, parametros = []) {
  return new Promise((resolver, rechazar) => {
    conexion.all(sql, parametros, (error, filas) => (error ? rechazar(error) : resolver(filas || [])));
  });
}

/** Ejecuta varias sentencias SQL separadas por ';' (solo para el esquema) */
function ejecutarScript(sql) {
  return new Promise((resolver, rechazar) => {
    conexion.exec(sql, (error) => (error ? rechazar(error) : resolver()));
  });
}

/* ----------------------------------------------------------------------------
 *  COLA DE ESCRITURA Y TRANSACCIONES
 *  sqlite3 usa una única conexión: si dos peticiones abren transacciones a la
 *  vez, sus sentencias se mezclarían. Por eso todas las escrituras pasan por
 *  una "cola" (promesa encadenada) que garantiza su ejecución secuencial.
 * -------------------------------------------------------------------------- */
let colaEscritura = Promise.resolve();

/** Encola una tarea asíncrona y devuelve su resultado cuando le toque */
function encolar(tarea) {
  const resultado = colaEscritura.then(tarea, tarea);
  // La cola nunca debe quedar "rota" aunque la tarea falle
  colaEscritura = resultado.catch(() => {});
  return resultado;
}

/** Escritura simple (fuera de transacción), respetando la cola */
function ejecutar(sql, parametros = []) {
  return encolar(() => ejecutarDirecto(sql, parametros));
}

/**
 * Ejecuta `fn` dentro de una transacción atómica.
 * `fn` recibe un objeto `tx` con { ejecutar, obtener, todos } que NO pasan por
 * la cola (ya estamos dentro de ella). Si `fn` lanza un error, se hace ROLLBACK.
 *
 * @example
 *   await transaccion(async (tx) => {
 *     await tx.ejecutar('UPDATE ...');
 *     await tx.ejecutar('INSERT ...');
 *   });
 */
function transaccion(fn) {
  return encolar(async () => {
    await ejecutarDirecto('BEGIN IMMEDIATE TRANSACTION');
    try {
      const resultado = await fn({ ejecutar: ejecutarDirecto, obtener, todos });
      await ejecutarDirecto('COMMIT');
      return resultado;
    } catch (error) {
      await ejecutarDirecto('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

/* ----------------------------------------------------------------------------
 *  ESQUEMA RELACIONAL (10 TABLAS) + ÍNDICES + VISTA AUXILIAR
 * -------------------------------------------------------------------------- */
const ESQUEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  /* 1. CLIENTE: persona natural que solicita créditos */
  CREATE TABLE IF NOT EXISTS cliente (
    id_cliente          INTEGER PRIMARY KEY AUTOINCREMENT,
    ci                  TEXT    NOT NULL UNIQUE,
    extension           TEXT    NOT NULL DEFAULT 'LP',
    nombres             TEXT    NOT NULL,
    apellidos           TEXT    NOT NULL,
    fecha_nacimiento    TEXT,
    telefono            TEXT,
    correo              TEXT,
    direccion           TEXT,
    ocupacion           TEXT,
    ingresos_mensuales  REAL    NOT NULL DEFAULT 0 CHECK (ingresos_mensuales >= 0),
    gastos_mensuales    REAL    NOT NULL DEFAULT 0 CHECK (gastos_mensuales >= 0),
    id_oficial          INTEGER,
    fecha_registro      TEXT    NOT NULL DEFAULT (DATE('now','localtime')),
    activo              INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (id_oficial) REFERENCES usuario(id_usuario)
  );

  /* 2. USUARIO: credenciales de acceso del personal y de los clientes */
  CREATE TABLE IF NOT EXISTS usuario (
    id_usuario          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo     TEXT    NOT NULL,
    login               TEXT    NOT NULL UNIQUE,
    clave_hash          TEXT    NOT NULL,
    correo              TEXT,
    rol                 TEXT    NOT NULL CHECK (rol IN ('ADMIN','OFICIAL','ANALISTA','JEFE','CAJERO','GERENTE','CLIENTE')),
    limite_aprobacion   REAL    NOT NULL DEFAULT 0,
    id_cliente          INTEGER UNIQUE,
    activo              INTEGER NOT NULL DEFAULT 1,
    debe_cambiar_clave  INTEGER NOT NULL DEFAULT 1,
    intentos_fallidos   INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta     TEXT,
    ultimo_acceso       TEXT,
    fecha_creacion      TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE
  );

  /* 3. HISTORIAL CREDITICIO: registro único por cliente consultado al Core Bancario */
  CREATE TABLE IF NOT EXISTS historial_crediticio (
    id_historial            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente              INTEGER NOT NULL UNIQUE,
    codigo_referencia       TEXT    NOT NULL UNIQUE,
    calificacion            TEXT    NOT NULL CHECK (calificacion IN ('A','B','C','D','E','F')),
    puntaje                 INTEGER NOT NULL,
    entidades_acreedoras    INTEGER NOT NULL DEFAULT 0,
    deuda_externa_total     REAL    NOT NULL DEFAULT 0,
    cuota_mensual_externa   REAL    NOT NULL DEFAULT 0,
    creditos_previos        INTEGER NOT NULL DEFAULT 0,
    creditos_internos       INTEGER NOT NULL DEFAULT 0,
    dias_mora_max           INTEGER NOT NULL DEFAULT 0,
    en_mora_actual          INTEGER NOT NULL DEFAULT 0,
    observaciones           TEXT,
    fecha_consulta          TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    id_analista             INTEGER,
    FOREIGN KEY (id_cliente)  REFERENCES cliente(id_cliente) ON DELETE CASCADE,
    FOREIGN KEY (id_analista) REFERENCES usuario(id_usuario)
  );

  /* 4. SOLICITUD DE CRÉDITO: incluye la resolución (aprobación/rechazo) del Jefe */
  CREATE TABLE IF NOT EXISTS solicitud_credito (
    id_solicitud            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                  TEXT    NOT NULL UNIQUE,
    id_cliente              INTEGER NOT NULL,
    id_oficial              INTEGER NOT NULL,
    tipo_credito            TEXT    NOT NULL CHECK (tipo_credito IN ('CONSUMO','MICROCREDITO','VEHICULAR','VIVIENDA','PYME')),
    monto_solicitado        REAL    NOT NULL CHECK (monto_solicitado > 0),
    plazo_meses             INTEGER NOT NULL CHECK (plazo_meses > 0),
    tasa_interes            REAL    NOT NULL CHECK (tasa_interes >= 0),
    destino                 TEXT    NOT NULL,
    descripcion             TEXT,
    estado                  TEXT    NOT NULL DEFAULT 'REGISTRADA'
                            CHECK (estado IN ('REGISTRADA','EN_EVALUACION','EVALUADA','APROBADA','RECHAZADA','DESEMBOLSADA','ANULADA')),
    fecha_solicitud         TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    fecha_envio_evaluacion  TEXT,
    id_jefe                 INTEGER,
    fecha_resolucion        TEXT,
    observacion_resolucion  TEXT,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
    FOREIGN KEY (id_oficial) REFERENCES usuario(id_usuario),
    FOREIGN KEY (id_jefe)    REFERENCES usuario(id_usuario)
  );

  /* 5. EVALUACIÓN DE CRÉDITO: dictamen técnico del Analista */
  CREATE TABLE IF NOT EXISTS evaluacion_credito (
    id_evaluacion           INTEGER PRIMARY KEY AUTOINCREMENT,
    id_solicitud            INTEGER NOT NULL UNIQUE,
    id_analista             INTEGER NOT NULL,
    id_historial            INTEGER NOT NULL,
    fecha_evaluacion        TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    ingresos                REAL    NOT NULL,
    gastos                  REAL    NOT NULL,
    deudas_mensuales        REAL    NOT NULL DEFAULT 0,
    capacidad_pago          REAL    NOT NULL,
    cuota_estimada          REAL    NOT NULL,
    relacion_cuota_ingreso  REAL    NOT NULL,
    cobertura_garantia      REAL    NOT NULL DEFAULT 0,
    puntaje_interno         INTEGER NOT NULL DEFAULT 0,
    nivel_riesgo            TEXT    NOT NULL CHECK (nivel_riesgo IN ('BAJO','MEDIO','ALTO')),
    dictamen                TEXT    NOT NULL CHECK (dictamen IN ('FAVORABLE','NO_FAVORABLE')),
    observaciones           TEXT    NOT NULL,
    FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud),
    FOREIGN KEY (id_analista)  REFERENCES usuario(id_usuario),
    FOREIGN KEY (id_historial) REFERENCES historial_crediticio(id_historial)
  );

  /* 6. GARANTÍA: bienes o personas que respaldan la solicitud */
  CREATE TABLE IF NOT EXISTS garantia (
    id_garantia             INTEGER PRIMARY KEY AUTOINCREMENT,
    id_solicitud            INTEGER NOT NULL,
    tipo                    TEXT    NOT NULL CHECK (tipo IN ('HIPOTECARIA','PRENDARIA','PERSONAL','DEPOSITO')),
    descripcion             TEXT    NOT NULL,
    valor_comercial         REAL    NOT NULL CHECK (valor_comercial > 0),
    documento_respaldo      TEXT,
    estado                  TEXT    NOT NULL DEFAULT 'REGISTRADA' CHECK (estado IN ('REGISTRADA','VIGENTE','LIBERADA')),
    fecha_registro          TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    id_oficial              INTEGER,
    FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud) ON DELETE CASCADE,
    FOREIGN KEY (id_oficial)   REFERENCES usuario(id_usuario)
  );

  /* 7. CRÉDITO: se crea al aprobar; contiene datos del contrato y del desembolso */
  CREATE TABLE IF NOT EXISTS credito (
    id_credito              INTEGER PRIMARY KEY AUTOINCREMENT,
    id_solicitud            INTEGER NOT NULL UNIQUE,
    numero_credito          TEXT    NOT NULL UNIQUE,
    numero_contrato         TEXT    NOT NULL UNIQUE,
    monto_aprobado          REAL    NOT NULL CHECK (monto_aprobado > 0),
    tasa_interes            REAL    NOT NULL,
    plazo_meses             INTEGER NOT NULL,
    cuota_mensual           REAL    NOT NULL,
    fecha_aprobacion        TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    fecha_desembolso        TEXT,
    id_oficial_desembolso   INTEGER,
    medio_desembolso        TEXT    CHECK (medio_desembolso IN ('ABONO_CUENTA','CHEQUE','EFECTIVO')),
    cuenta_destino          TEXT,
    codigo_transaccion      TEXT,
    saldo_capital           REAL    NOT NULL CHECK (saldo_capital >= 0),
    estado                  TEXT    NOT NULL DEFAULT 'PENDIENTE_DESEMBOLSO'
                            CHECK (estado IN ('PENDIENTE_DESEMBOLSO','VIGENTE','EN_MORA','CANCELADO')),
    FOREIGN KEY (id_solicitud)          REFERENCES solicitud_credito(id_solicitud),
    FOREIGN KEY (id_oficial_desembolso) REFERENCES usuario(id_usuario)
  );

  /* 9. PAGO: comprobante (voucher) de uno o varios pagos de cuotas */
  CREATE TABLE IF NOT EXISTS pago (
    id_pago                 INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_recibo           TEXT    NOT NULL UNIQUE,
    id_credito              INTEGER NOT NULL,
    id_cajero               INTEGER NOT NULL,
    fecha_pago              TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    tipo                    TEXT    NOT NULL CHECK (tipo IN ('CUOTA','CANCELACION_TOTAL')),
    cuotas_pagadas          TEXT    NOT NULL,
    monto_capital           REAL    NOT NULL DEFAULT 0,
    monto_interes           REAL    NOT NULL DEFAULT 0,
    monto_recargo           REAL    NOT NULL DEFAULT 0,
    recargo_exonerado       REAL    NOT NULL DEFAULT 0,
    motivo_exoneracion      TEXT,
    monto_total             REAL    NOT NULL CHECK (monto_total > 0),
    monto_recibido          REAL    NOT NULL,
    cambio                  REAL    NOT NULL DEFAULT 0,
    forma_pago              TEXT    NOT NULL DEFAULT 'EFECTIVO' CHECK (forma_pago IN ('EFECTIVO','TRANSFERENCIA','DEBITO_CUENTA','CHEQUE')),
    FOREIGN KEY (id_credito) REFERENCES credito(id_credito),
    FOREIGN KEY (id_cajero)  REFERENCES usuario(id_usuario)
  );

  /* 8. CUOTA: cada fila del cronograma de pagos */
  CREATE TABLE IF NOT EXISTS cuota (
    id_cuota                INTEGER PRIMARY KEY AUTOINCREMENT,
    id_credito              INTEGER NOT NULL,
    numero                  INTEGER NOT NULL,
    fecha_vencimiento       TEXT    NOT NULL,
    capital                 REAL    NOT NULL,
    interes                 REAL    NOT NULL,
    monto                   REAL    NOT NULL,
    saldo_capital           REAL    NOT NULL,
    estado                  TEXT    NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','VENCIDA','PAGADA')),
    dias_atraso             INTEGER NOT NULL DEFAULT 0,
    recargo_mora            REAL    NOT NULL DEFAULT 0,
    fecha_pago              TEXT,
    id_pago                 INTEGER,
    UNIQUE (id_credito, numero),
    FOREIGN KEY (id_credito) REFERENCES credito(id_credito) ON DELETE CASCADE,
    FOREIGN KEY (id_pago)    REFERENCES pago(id_pago)
  );

  /* 10. AUDITORÍA: trazabilidad de operaciones críticas (RN12 / RNF06) */
  CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario              INTEGER,
    login                   TEXT,
    rol                     TEXT,
    fecha_hora              TEXT    NOT NULL DEFAULT (DATETIME('now','localtime')),
    operacion               TEXT    NOT NULL,
    entidad                 TEXT,
    id_entidad              INTEGER,
    detalle                 TEXT,
    ip                      TEXT,
    resultado               TEXT    NOT NULL DEFAULT 'EXITO' CHECK (resultado IN ('EXITO','FALLO')),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL
  );

  /* Índices para acelerar las búsquedas más frecuentes (RNF05) */
  CREATE INDEX IF NOT EXISTS idx_solicitud_estado   ON solicitud_credito(estado);
  CREATE INDEX IF NOT EXISTS idx_solicitud_cliente  ON solicitud_credito(id_cliente);
  CREATE INDEX IF NOT EXISTS idx_cuota_credito      ON cuota(id_credito, estado);
  CREATE INDEX IF NOT EXISTS idx_cuota_vencimiento  ON cuota(fecha_vencimiento);
  CREATE INDEX IF NOT EXISTS idx_pago_fecha         ON pago(fecha_pago);
  CREATE INDEX IF NOT EXISTS idx_credito_estado     ON credito(estado);
  CREATE INDEX IF NOT EXISTS idx_auditoria_fecha    ON auditoria(fecha_hora);

  /* VISTA AUXILIAR (no es tabla): resumen de cartera por crédito para reportes */
  CREATE VIEW IF NOT EXISTS vista_cartera AS
    SELECT
      cr.id_credito, cr.numero_credito, cr.numero_contrato, cr.estado, cr.monto_aprobado,
      cr.saldo_capital, cr.tasa_interes, cr.plazo_meses, cr.cuota_mensual,
      cr.fecha_desembolso, cr.id_oficial_desembolso,
      s.id_solicitud, s.tipo_credito, s.id_oficial,
      cl.id_cliente, cl.ci, cl.nombres || ' ' || cl.apellidos AS cliente,
      (SELECT COUNT(*) FROM cuota q WHERE q.id_credito = cr.id_credito AND q.estado = 'VENCIDA') AS cuotas_vencidas,
      (SELECT COUNT(*) FROM cuota q WHERE q.id_credito = cr.id_credito AND q.estado = 'PAGADA')  AS cuotas_pagadas,
      (SELECT COALESCE(SUM(q.monto), 0) FROM cuota q WHERE q.id_credito = cr.id_credito AND q.estado = 'VENCIDA') AS monto_vencido,
      (SELECT MIN(q.fecha_vencimiento) FROM cuota q WHERE q.id_credito = cr.id_credito AND q.estado = 'VENCIDA') AS primera_vencida
    FROM credito cr
    JOIN solicitud_credito s ON s.id_solicitud = cr.id_solicitud
    JOIN cliente cl          ON cl.id_cliente  = s.id_cliente;
`;

/**
 * Crea el esquema (si no existe) y carga los datos de demostración la
 * primera vez. Debe llamarse ANTES de que el servidor acepte peticiones.
 */
async function inicializar() {
  await ejecutarScript(ESQUEMA);
  const { total } = await obtener('SELECT COUNT(*) AS total FROM usuario');
  if (total === 0) {
    const { cargarDatosDemostracion } = require('./semilla');
    await cargarDatosDemostracion();
    console.log('Datos de demostración cargados correctamente.');
  }
  console.log(`Base de datos SQLite lista en: ${RUTA_BD}`);
}

module.exports = {
  conexion,
  inicializar,
  ejecutar,
  obtener,
  todos,
  transaccion,
  RUTA_BD
};
