document.addEventListener('DOMContentLoaded', () => {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-historial');
    const filtroDecision = document.getElementById('filtro-decision');
    const contadorAprobadas = document.getElementById('total-aprobadas');
    const contadorRechazadas = document.getElementById('total-rechazadas');
    const contadorTotal = document.getElementById('total-decisiones');
    const mensajePie = document.getElementById('mensaje-pie-historial');

    let historialCache = [];

    // Sincronizar datos de sesión en barra lateral
    const usuarioGuardado = localStorage.getItem('usuarioLogueado');
    if (usuarioGuardado) {
        try {
            const usuario = JSON.parse(usuarioGuardado);
            if (usuario.nombre) {
                document.getElementById('sidebar-nombre').textContent = usuario.nombre;
                document.getElementById('sidebar-avatar').textContent = usuario.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            }
            if (usuario.rol) {
                document.getElementById('sidebar-rol').textContent = usuario.rol === 'JEFE' ? 'Jefe de Créditos' : usuario.rol;
            }
        } catch (e) {
            console.error('Error al cargar sesión en historial:', e);
        }
    }

    // 1. Cargar el historial desde el backend
    async function cargarHistorial() {
        try {
            const respuesta = await fetch('/api/solicitudes/historial-decisiones');
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                cuerpoTabla.innerHTML = `<tr><td colspan="7" class="texto-vacio">Error al cargar el historial</td></tr>`;
                return;
            }

            historialCache = datos;
            actualizarMetricas(datos);
            renderizarTabla(datos);

        } catch (error) {
            console.error('Error de conexión:', error);
            cuerpoTabla.innerHTML = `<tr><td colspan="7" class="texto-vacio">No se pudo conectar con el servidor</td></tr>`;
        }
    }

    // Actualizar tarjetas métricas superiores
    function actualizarMetricas(datos) {
        const aprobadas = datos.filter(d => d.estado_solicitud === 'APROBADA' || d.estado_solicitud === 'DESEMBOLSADO').length;
        const rechazadas = datos.filter(d => d.estado_solicitud === 'RECHAZADA').length;

        contadorAprobadas.textContent = aprobadas;
        contadorRechazadas.textContent = rechazadas;
        contadorTotal.textContent = datos.length;
    }

    // Renderizar la tabla de decisiones
    function renderizarTabla(datos) {
        cuerpoTabla.innerHTML = '';

        if (datos.length === 0) {
            cuerpoTabla.innerHTML = `<tr><td colspan="7" class="texto-vacio">No se encontraron decisiones registradas</td></tr>`;
            mensajePie.textContent = 'Mostrando 0 registros.';
            return;
        }

        datos.forEach(item => {
            const tr = document.createElement('tr');
            const montoFormateado = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(item.monto_solicitado);

            let claseBadge = 'badge-estado-aprobada';
            if (item.estado_solicitud === 'DESEMBOLSADO') claseBadge = 'badge-estado-desembolsado';
            if (item.estado_solicitud === 'RECHAZADA') claseBadge = 'badge-estado-rechazada';

            tr.innerHTML = `
                <td><strong>#${item.id_solicitud}</strong></td>
                <td>${item.cliente_nombre}</td>
                <td><strong>Bs. ${montoFormateado}</strong></td>
                <td>${item.plazo_meses} meses</td>
                <td>${item.fecha_solicitud}</td>
                <td>${item.usuario_responsable}</td>
                <td><span class="${claseBadge}">${item.estado_solicitud}</span></td>
            `;
            cuerpoTabla.appendChild(tr);
        });

        mensajePie.textContent = `Mostrando ${datos.length} decisiones crediticias.`;
    }

    // 2. Filtrar por estado seleccionado
    filtroDecision.addEventListener('change', (e) => {
        const filtro = e.target.value;
        if (filtro === 'TODOS') {
            renderizarTabla(historialCache);
        } else {
            const filtrados = historialCache.filter(item => {
                if (filtro === 'APROBADA') {
                    return item.estado_solicitud === 'APROBADA';
                }
                return item.estado_solicitud === filtro;
            });
            renderizarTabla(filtrados);
        }
    });

    // Inicializar carga
    cargarHistorial();
});