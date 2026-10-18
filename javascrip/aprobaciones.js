// Función para pintar los datos del usuario logueado en la barra lateral
function cargarDatosUsuario() {
    const usuarioGuardado = localStorage.getItem('usuarioLogueado');
    if (!usuarioGuardado) return;

    try {
        const usuario = JSON.parse(usuarioGuardado);

        const nombreUsuarioEl = document.querySelector('.nombre-usuario');
        const rolUsuarioEl = document.querySelector('.rol-usuario');
        const avatarUsuarioEl = document.querySelector('.avatar-usuario');

        if (nombreUsuarioEl && usuario.nombre) {
            nombreUsuarioEl.textContent = usuario.nombre;
        }
        if (rolUsuarioEl && usuario.rol) {
            // Formatea el rol para que se vea estético (Ej: JEFE -> Jefe de Créditos)
            let rolTexto = usuario.rol;
            if (usuario.rol === 'JEFE') rolTexto = 'Jefe de Créditos';
            rolUsuarioEl.textContent = rolTexto;
        }

        if (avatarUsuarioEl && usuario.nombre) {
            // Genera las iniciales automáticamente (Ej: Carlos Mendoza -> CM)
            const iniciales = usuario.nombre
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            avatarUsuarioEl.textContent = iniciales;
        }
    } catch (e) {
        console.error("Error al procesar el usuario logueado:", e);
    }
}

// Función principal para pedir los datos y métricas a la base de datos SQLite
async function cargarBandeja(estado = 'TODOS') {
  try {
    const respuesta = await fetch(`/api/solicitudes?estado=${estado}`);
    if (!respuesta.ok) throw new Error("Error al consultar la base de datos");

    const data = await respuesta.json();

    // 1. Actualizar tarjetas métricas superiores
    const elEvaluacion = document.getElementById('contador-evaluacion');
    const elAprobadas = document.getElementById('contador-aprobadas');
    const elRechazadas = document.getElementById('contador-rechazadas');

    if (elEvaluacion) elEvaluacion.textContent = data.metricas.enEvaluacion;
    if (elAprobadas) elAprobadas.textContent = data.metricas.aprobadasHoy;
    if (elRechazadas) elRechazadas.textContent = data.metricas.rechazadasHoy;

    // 2. Rellenar la tabla con las solicitudes de SQLite
    const tbody = document.getElementById('cuerpo-tabla-solicitudes');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data.solicitudes || data.solicitudes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 25px; color: #666;">
            No hay solicitudes registradas con el estado: <strong>${estado}</strong>
          </td>
        </tr>`;
      return;
    }

    data.solicitudes.forEach(item => {
      const fila = document.createElement('tr');
      
      let claseEstado = 'estado-evaluacion';
      if (item.estado === 'APROBADA') claseEstado = 'estado-aprobada';
      if (item.estado === 'RECHAZADA') claseEstado = 'estado-rechazada';

      fila.innerHTML = `
        <td><strong>${item.id}</strong></td>
        <td>${item.cliente}</td>
        <td class="monto-moneda">Bs. ${Number(item.monto).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
        <td>${item.plazo} meses</td>
        <td>${item.fecha}</td>
        <td><span class="etiqueta-estado ${claseEstado}">${item.estado}</span></td>
        <td class="texto-centrado">
          <a href="detalle_evaluacion.html?id=${item.id}" class="boton-accion-ver">Ver</a>
        </td>
      `;
      tbody.appendChild(fila);
    });

  } catch (error) {
    console.error("Error al cargar la bandeja:", error);
  }
}

function verDetalleSolicitud(id) {
  console.log("Ver detalle de la solicitud:", id);
  alert(`Abriendo detalles de la solicitud N° ${id}`);
}

// Inicialización automática al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  // Pinta los datos del usuario en la esquina inferior izquierda
  cargarDatosUsuario();

  // Configura el selector de filtros y carga la bandeja inicial
  const filtroEstado = document.getElementById('filtro-estado');
  
  if (filtroEstado) {
    cargarBandeja(filtroEstado.value);

    filtroEstado.addEventListener('change', (e) => {
      cargarBandeja(e.target.value);
    });
  } else {
    cargarBandeja('TODOS');
  }
});