const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conexión / Creación de la base de datos SQLite en la raíz
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('Base de datos SQLite conectada correctamente.');
    db.run('PRAGMA foreign_keys = ON;');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cliente (
      id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
      ci TEXT UNIQUE NOT NULL,
      nombres TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      telefono TEXT,
      direccion TEXT,
      ingresos_mensuales REAL NOT NULL,
      fecha_registro TEXT NOT NULL DEFAULT (DATE('now')),
      login TEXT UNIQUE,
      clave TEXT,
      primer_login INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usuario (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_completo TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      clave_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('OFICIAL','CLIENTE','ANALISTA','JEFE','CAJERO','GERENTE','ADMIN')),
      limite_aprobacion REAL NOT NULL DEFAULT 0,
      id_cliente INTEGER NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS solicitud_credito (
      id_solicitud INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cliente INTEGER NOT NULL,
      id_usuario_registra INTEGER NOT NULL,
      fecha_solicitud TEXT NOT NULL DEFAULT (DATE('now')),
      monto_solicitado REAL NOT NULL CHECK (monto_solicitado > 0),
      plazo_meses INTEGER NOT NULL CHECK (plazo_meses > 0),
      destino TEXT NOT NULL,
      estado TEXT NOT NULL CHECK(estado IN ('REGISTRADA','EN_EVALUACION','APROBADA','RECHAZADA','DESEMBOLSADO')) DEFAULT 'REGISTRADA',
      motivo_rechazo TEXT NULL,
      FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
      FOREIGN KEY (id_usuario_registra) REFERENCES usuario(id_usuario)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evaluacion_credito (
      id_evaluacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_solicitud INTEGER NOT NULL UNIQUE,
      fecha_evaluacion TEXT NOT NULL DEFAULT (DATE('now')),
      ref_historial TEXT,
      resultado_historial TEXT,
      ingresos REAL,
      gastos REAL,
      capacidad_pago REAL,
      nivel_riesgo TEXT CHECK(nivel_riesgo IN ('BAJO','MEDIO','ALTO')),
      resultado TEXT CHECK(resultado IN ('FAVORABLE','DESFAVORABLE')),
      FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS credito (
    id_credito INTEGER PRIMARY KEY AUTOINCREMENT,
    id_solicitud INTEGER,
    numero_credito TEXT,
    monto_aprobado REAL DEFAULT 0,
    tasa_interes REAL DEFAULT 12.00,
    plazo_meses INTEGER DEFAULT 12,
    fecha_desembolso TEXT,
    saldo_capital REAL DEFAULT 0,
    estado TEXT DEFAULT 'VIGENTE',
    FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS contrato (
      id_contrato INTEGER PRIMARY KEY AUTOINCREMENT,
      id_credito INTEGER NOT NULL UNIQUE,
      numero_contrato TEXT UNIQUE NOT NULL,
      fecha_firma TEXT NOT NULL DEFAULT (DATE('now')),
      estado TEXT NOT NULL DEFAULT 'GENERADO',
      FOREIGN KEY (id_credito) REFERENCES credito(id_credito)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS cuota (
    id_cuota INTEGER PRIMARY KEY AUTOINCREMENT,
    id_credito INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    fecha_vencimiento TEXT NOT NULL,
    capital REAL,
    interes REAL,
    monto REAL NOT NULL,
    saldo REAL NOT NULL,
    saldo_capital REAL NOT NULL,
    estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE','PAGADA','VENCIDA')) DEFAULT 'PENDIENTE',
    UNIQUE (id_credito, numero),
    FOREIGN KEY (id_credito) REFERENCES credito(id_credito)
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS pago (
      id_pago INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cuota INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      fecha_pago TEXT NOT NULL DEFAULT (DATETIME('now')),
      monto REAL NOT NULL CHECK (monto > 0),
      monto_recibido REAL NOT NULL,
      cambio REAL NOT NULL DEFAULT 0,
      forma_pago TEXT NOT NULL DEFAULT 'EFECTIVO',
      numero_recibo TEXT UNIQUE NOT NULL,
      FOREIGN KEY (id_cuota) REFERENCES cuota(id_cuota),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS garantia (
      id_garantia INTEGER PRIMARY KEY AUTOINCREMENT,
      id_solicitud INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      valor REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'VIGENTE',
      FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id_auditoria INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER,
      fecha_hora TEXT NOT NULL DEFAULT (DATETIME('now')),
      operacion TEXT,
      entidad TEXT,
      id_entidad INTEGER,
      resultado TEXT,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
    )
  `);

  // Insertar datos de prueba iniciales
  // Insertar datos de prueba variados para testing
  db.get("SELECT COUNT(*) AS total FROM cliente", (err, row) => {
    if (row && row.total === 0) {
      // 1. Clientes de prueba
      db.run(`INSERT INTO cliente (id_cliente, ci, nombres, apellidos, telefono, direccion, ingresos_mensuales, fecha_registro) VALUES 
        (1, '1234567', 'María Elena', 'Quispe', '71234567', 'Av. 6 de Marzo', 4500.00, DATE('now')),
        (2, '7654321', 'Juan Carlos', 'Mamani', '77654321', 'Calle Murillo', 3200.00, DATE('now')),
        (3, '4567890', 'Rosa', 'Condori', '74567890', 'Av. Buenos Aires', 2800.00, DATE('now')),
        (4, '9876543', 'Pedro', 'Alcázar', '70011223', 'Av. Arce', 6000.00, DATE('now')),
        (5, '5544332', 'Ana', 'Torrez', '76655443', 'Sopocachi', 5200.00, DATE('now'))`);

      // 2. Usuarios de prueba para todos los roles del sistema
      db.run(`INSERT OR IGNORE INTO usuario (id_usuario, nombre_completo, login, clave_hash, rol, limite_aprobacion, activo) VALUES 
        (1, 'Carlos Mullisaca Mendoza', 'cmendoza', 'hash123', 'JEFE', 50000.00, 1),
        (2, 'Ana Maria Torrez', 'atorrez', 'clave123', 'OFICIAL', 0.00, 1),
        (3, 'Marco Antonio Perez', 'mperez', 'clave123', 'CAJERO', 0.00, 1),
        (4, 'Lucia Gomez Silva', 'lgomez', 'clave123', 'ANALISTA', 0.00, 1),
        (5, 'Roberto Mendez', 'rmendez', 'clave123', 'GERENTE', 100000.00, 1),
        (6, 'Administrador Sistema', 'admin', 'admin123', 'ADMIN', 999999.00, 1),
        (7, 'Pedro Alcázar', 'palcazar', 'clave123', 'CLIENTE', 0.00, 1)`);

      // 3. Solicitudes con diferentes estados (EN_EVALUACION, APROBADA, RECHAZADA)
      db.run(`INSERT INTO solicitud_credito (id_solicitud, id_cliente, id_usuario_registra, fecha_solicitud, monto_solicitado, plazo_meses, destino, estado, motivo_rechazo) VALUES 
        (101, 1, 1, DATE('now'), 30000.00, 12, 'Capital de trabajo', 'EN_EVALUACION', NULL),
        (102, 2, 1, DATE('now'), 12000.00, 6, 'Consumo', 'EN_EVALUACION', NULL),
        (103, 3, 1, DATE('now'), 8500.00, 12, 'Educación', 'EN_EVALUACION', NULL),
        (104, 4, 1, DATE('now'), 45000.00, 24, 'Compra de Vehículo', 'APROBADA', NULL),
        (105, 5, 1, DATE('now'), 15000.00, 12, 'Mejora de vivienda', 'RECHAZADA', 'Capacidad de pago insuficiente')`);

      console.log('Estructura de tablas y datos de prueba variados creados con éxito.');
    }
  });
});

module.exports = db;

