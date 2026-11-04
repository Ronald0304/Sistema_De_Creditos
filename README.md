# CrediManager — Sistema de Gestión de Créditos

Sistema web para una entidad bancaria que gestiona el **ciclo de vida completo del crédito**: registro del cliente, solicitud, garantías, evaluación de riesgo con historial del Core Bancario, aprobación, contrato, cronograma, desembolso, cobranza, control de mora y reportes gerenciales.

> Proyecto académico — Análisis y Diseño de Sistemas I (INF 241) · UMSA · Grupo 3

---

## Instalación y ejecución

Requisitos: **Node.js 18 o superior**.

```bash
npm install        # instala express, express-session y sqlite3
npm start          # inicia el servidor en http://localhost:3000
```

- La primera vez se crea automáticamente `database/creditos.sqlite` con **datos de demostración** (las fechas se calculan respecto al día actual, por lo que siempre existen créditos al día, en mora y cancelados).
- `npm run reiniciar-bd` elimina la base de datos para regenerarla en el próximo arranque.
- `npm run dev` inicia con recarga automática (`node --watch`).

Variables de entorno opcionales: `PUERTO` (por defecto 3000), `SECRETO_SESION` (recomendado en producción), `NODE_ENV=production` (cookie `secure`).

## Accesos de demostración

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `Credito2026*` |
| Oficial de Crédito | `atorrez` / `jcondori` | `Credito2026*` |
| Analista de Crédito | `lgomez` | `Credito2026*` |
| Jefe de Crédito | `cmendoza` (límite Bs 150.000) | `Credito2026*` |
| Cajero | `mperez` | `Credito2026*` |
| Gerente | `rmendez` | `Credito2026*` |
| Cliente al día | `1234567` | `Cliente2026*` |
| Cliente en mora | `7654321` | `Cliente2026*` |
| Cliente (primer ingreso) | `4567890` | `4567890` (su CI -> cambio obligatorio) |

La página de inicio incluye un desplegable **“Accesos de demostración”** que rellena el formulario con un clic.

---

## Roles y funcionalidades

| Rol | Funciones principales |
|---|---|
| **Administrador** | CRUD de usuarios, cambio de rol y límite de aprobación, activar/desactivar, restablecer contraseña, eliminar (solo si no tiene operaciones), bitácora de auditoría con filtros y exportación CSV, supervisión de la gestión de clientes por oficial. |
| **Oficial de Crédito** | Registro de clientes (se crea su acceso: usuario = CI, contraseña = CI), solicitudes con validación de límites por producto y cuota estimada, garantías (cobertura en vivo), envío a evaluación, anulación y desembolso vía Core Bancario (simulado). |
| **Analista de Crédito** | Bandeja de evaluación, enlace del **historial crediticio único** del cliente (Core Bancario: datos externos simulados + comportamiento interno real), cálculo de capacidad de pago, sugerencia automática de riesgo y dictamen **Favorable / No Favorable**. |
| **Jefe de Crédito** | Aprueba o rechaza (motivo obligatorio). Al aprobar se generan automáticamente el **crédito, el contrato imprimible y el cronograma**. Respeta RN03 (sin dictamen favorable no se aprueba) y RN04 (límite de aprobación). Historial de decisiones. |
| **Cajero** | Búsqueda rápida por CI / N° de crédito / nombre, estado de cuenta con **recargo por mora calculado a la fecha**, pago de N cuotas (de la más antigua), **cancelación total anticipada**, exoneración controlada del recargo (auditada), **voucher imprimible**, cartera en mora y arqueo del día. |
| **Gerente** | Tablero ejecutivo: cartera total y en mora, índice de mora, desembolsos y recaudación mensual (gráficos), cartera por producto, antigüedad de la mora, embudo de solicitudes, principales morosos, rendimiento de oficiales, analistas y cajeros, recaudación diaria. |
| **Cliente** | Portal de solo consulta: estado de cuenta (**Al día / En mora / Cancelado**), resultado de sus solicitudes (con motivo de rechazo), cronograma, contrato, pagos y vouchers. No puede registrarse ni pagar en línea. |

Cada panel tiene su sección de **Cerrar sesión** (barra lateral y menú de usuario) y la landing detecta una sesión activa para continuar o **cambiar de usuario**.

---

## Flujo del crédito

```
Oficial: REGISTRADA ──enviar--> EN_EVALUACION ──Analista: dictamen--> EVALUADA
                                                                          │
                       Jefe: rechazar <--────────────────────────────────|
                       (RECHAZADA)                                         v
                                     Jefe: aprobar --> APROBADA (crédito + contrato + cronograma)
                                                          │
                                     Oficial: desembolsar v
                                                     DESEMBOLSADA ── crédito VIGENTE <-> EN_MORA --> CANCELADO
```

---

## Base de datos (exactamente 10 tablas)

| # | Tabla | Descripción |
|---|---|---|
| 1 | `usuario` | Credenciales y roles (personal y clientes), bloqueo por intentos, cambio obligatorio de clave |
| 2 | `cliente` | Datos personales y financieros |
| 3 | `historial_crediticio` | Historial **único** por cliente consultado al Core Bancario |
| 4 | `solicitud_credito` | Solicitud + resolución del Jefe (fecha, jefe, observación/motivo) |
| 5 | `evaluacion_credito` | Dictamen técnico del Analista |
| 6 | `garantia` | Garantías de cada solicitud |
| 7 | `credito` | Crédito aprobado + datos del contrato + desembolso |
| 8 | `cuota` | Cronograma (sistema francés) |
| 9 | `pago` | Vouchers (pago de cuotas o cancelación total) |
| 10 | `auditoria` | Bitácora de operaciones |

Además existe la **vista** `vista_cartera` (no es tabla) para reportes, e índices para las consultas frecuentes.

---

## Seguridad

- Contraseñas con **scrypt + sal** por usuario (nunca en texto plano) y comparación en tiempo constante.
- Sesiones con `express-session`: cookie `httpOnly`, `SameSite=Lax`, expiración por inactividad (60 min) y regeneración del ID al iniciar sesión.
- **Autorización por rol en cada endpoint y en cada vista** (`/app/:pagina`); el estado del usuario se revalida en cada petición (desactivación inmediata).
- **Cambio de contraseña obligatorio** en el primer ingreso: el servidor bloquea toda la API y las vistas hasta que se cambie.
- Bloqueo de cuenta tras 5 intentos fallidos (15 min) y limitador de peticiones al login.
- Protección CSRF (solo se aceptan escrituras JSON del mismo origen), cabeceras de seguridad y CSP, escape de HTML en el frontend (XSS).
- Solo se publican las carpetas `css/`, `javascrip/` e `img/`: la base de datos y el código del servidor no son accesibles.
- Las vistas se sirven con `Cache-Control: no-store` (tras cerrar sesión, “Atrás” no muestra datos).
- Transacciones atómicas para aprobaciones, desembolsos y pagos; auditoría de operaciones críticas.

---

## Estructura del proyecto

```
├── server.js              Servidor Express (configuración, sesiones, rutas, errores)
├── index.html             Landing page con inicio de sesión integrado
├── database/
│   ├── db.js              Conexión, esquema (10 tablas), transacciones con cola
│   ├── semilla.js         Datos de demostración
│   └── reiniciar.js       Script para reiniciar la BD
├── middleware/
│   ├── autenticacion.js   Sesión, cambio de clave obligatorio, roles
│   └── seguridad.js       Cabeceras, CSRF (JSON), limitador
├── routers/               API REST por módulo + vistas protegidas
│   ├── auth.js  usuarios.js  clientes.js  solicitudes.js  evaluaciones.js
│   ├── aprobaciones.js  creditos.js  pagos.js  reportes.js  clientesp.js
│   └── vistas.js
├── utils/
│   ├── parametros.js      Políticas de negocio (tasas, mora, seguridad)
│   ├── finanzas.js        Fechas, amortización francesa, mora, liquidación
│   ├── operaciones.js     Aprobación, desembolso, pagos (atómicos)
│   ├── mora.js            Control automático de mora (cada hora)
│   ├── consultas.js       Consultas compartidas
│   ├── seguridad.js  auditoria.js  errores.js
├── tamplates/             Vistas HTML de cada panel y documentos imprimibles
├── css/                   base.css (sistema de diseño) + estilos por vista + impresion.css
├── javascrip/             comun.js (núcleo del frontend) + lógica de cada vista
└── img/
```

## Documentos imprimibles

- **Contrato** `/app/contrato?id=ID` · **Cronograma** `/app/cronograma?id=ID` · **Voucher** `/app/voucher?id=ID_PAGO` (formato ticket 80 mm).
- Botón **“Imprimir / Guardar PDF”**: la hoja de estilos de impresión elimina controles, fondos y sombras.
- Los reportes del Gerente, el historial y el arqueo de caja también se imprimen limpiamente.

## Políticas configurables (`utils/parametros.js`)

- Productos: Consumo 16 %, Microcrédito 18 %, Vehicular 12,5 %, Vivienda 9 %, PyME 13,5 % (con montos y plazos mínimos/máximos).
- Mora: recargo 0,10 % diario sobre la cuota vencida, tope 25 %, días de gracia configurables.
- Seguridad: 5 intentos fallidos, 15 minutos de bloqueo, 60 minutos de sesión.
