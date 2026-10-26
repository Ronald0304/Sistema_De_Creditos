/** PARÁMETROS DE NEGOCIO DE LA ENTIDAD FINANCIERA

 *  Centraliza las políticas crediticias (tasas, plazos, montos, mora) para
 *  no "quemarlas" en distintos archivos. Modificar aquí impacta en todo el
 *  sistema (RNF07 - Escalabilidad: agregar nuevos productos crediticios).
 */

/** Nombre comercial de la entidad (aparece en contratos y vouchers) */
const ENTIDAD = {
  nombre: 'CrediManager S.A.',
  nombreCorto: 'CrediManager',
  nit: '1020304050',
  direccion: 'Av. 16 de Julio (El Prado) N° 1440, La Paz - Bolivia',
  telefono: '(591-2) 2201234',
  ciudad: 'La Paz'
};

/**
 * Productos crediticios disponibles.
 * tasa: Tasa de interés nominal ANUAL (%) sugerida por defecto.
 */
const PRODUCTOS = {
  CONSUMO:      { nombre: 'Crédito de Consumo',  tasa: 16.0, montoMin: 1000,  montoMax: 80000,   plazoMin: 3,  plazoMax: 48 },
  MICROCREDITO: { nombre: 'Microcrédito',        tasa: 18.0, montoMin: 500,   montoMax: 50000,   plazoMin: 3,  plazoMax: 36 },
  VEHICULAR:    { nombre: 'Crédito Vehicular',   tasa: 12.5, montoMin: 10000, montoMax: 250000,  plazoMin: 12, plazoMax: 72 },
  VIVIENDA:     { nombre: 'Crédito de Vivienda', tasa: 9.0,  montoMin: 30000, montoMax: 1500000, plazoMin: 24, plazoMax: 240 },
  PYME:         { nombre: 'Crédito PyME',        tasa: 13.5, montoMin: 5000,  montoMax: 500000,  plazoMin: 6,  plazoMax: 84 }
};

/** Tipos de garantía aceptados */
const TIPOS_GARANTIA = {
  HIPOTECARIA: 'Hipotecaria (inmueble)',
  PRENDARIA:   'Prendaria (vehículo / maquinaria)',
  PERSONAL:    'Personal (garante)',
  DEPOSITO:    'Depósito a plazo fijo (DPF)'
};

/** Políticas de mora */
const MORA = {
  /** Recargo diario aplicado sobre el monto de la cuota vencida (0.10 % diario) */
  tasaRecargoDiario: 0.001,
  /** Días de gracia antes de empezar a cobrar recargo */
  diasGracia: 0,
  /** Tope del recargo como porcentaje de la cuota (evita recargos desproporcionados) */
  topeRecargo: 0.25
};

/** Políticas de evaluación (usadas para el pre-dictamen automático) */
const EVALUACION = {
  /** Relación máxima cuota / capacidad de pago para riesgo BAJO */
  rciBajo: 0.40,
  /** Relación máxima cuota / capacidad de pago para riesgo MEDIO */
  rciMedio: 0.70
};

/** Políticas de seguridad del login */
const SEGURIDAD = {
  maxIntentosFallidos: 5,
  minutosBloqueo: 15,
  /** Inactividad máxima de la sesión (minutos) */
  minutosSesion: 60
};

/** Roles del sistema y su descripción legible */
const ROLES = {
  ADMIN:    'Administrador',
  OFICIAL:  'Oficial de Crédito',
  ANALISTA: 'Analista de Crédito',
  JEFE:     'Jefe de Crédito',
  CAJERO:   'Cajero',
  GERENTE:  'Gerente',
  CLIENTE:  'Cliente'
};

/** Página de inicio de cada rol después de iniciar sesión */
const INICIO_POR_ROL = {
  ADMIN:    '/app/usuarios',
  OFICIAL:  '/app/clientes',
  ANALISTA: '/app/evaluaciones',
  JEFE:     '/app/aprobaciones',
  CAJERO:   '/app/pagos',
  GERENTE:  '/app/reportes',
  CLIENTE:  '/app/portal'
};

module.exports = { ENTIDAD, PRODUCTOS, TIPOS_GARANTIA, MORA, EVALUACION, SEGURIDAD, ROLES, INICIO_POR_ROL };
