const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar conexión a BD
const db = require('./database/db');

// Importar Routers
const solicitudesRoutes = require('./routers/solicitudes');
const pagosRoutes = require('./routers/pagos');
const usuariosRoutes = require('./routers/usuarios');
const clientespRoutes = require('./routers/clientesp'); // <--- 1. IMPORTAR RUTA DE CLIENTES (Panel Cliente y Login)

const app = express();
const PUERTO = 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Archivos estáticos
app.use(express.static(path.join(__dirname)));

// Rutas API
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/clientesp', clientespRoutes); // <--- 2. REGISTRAR ENDPOINT DE CLIENTES

// Servir vistas HTML principales
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'aprobaciones.html'));
});

app.get('/desembolsos', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'desembolsos.html'));
});

app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'perfil.html'));
});

app.get('/pagos', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'pagos.html'));
});

app.get('/contratos.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'contratos.html'));
});

app.get('/reportes', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'repostes.html'));
});

app.get('/usuarios', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'usuarios.html'));
});

// Ruta HTML para el Panel del Cliente
app.get('/cliente_panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'tamplates', 'cliente_panel.html'));
});

// Iniciar Servidor
app.listen(PUERTO, () => {
  console.log(`Servidor iniciado en http://localhost:${PUERTO}`);
});