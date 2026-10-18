// Cargar usuario logueado en la barra lateral
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
        if (rolUsuarioEl) {
            rolUsuarioEl.textContent = 'Oficial de Crédito';
        }

        if (avatarUsuarioEl && usuario.nombre) {
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

document.addEventListener('DOMContentLoaded', () => {
    cargarDatosUsuario();

    const selectSolicitud = document.getElementById('select-solicitud-aprobada');
    const inputMonto = document.getElementById('monto_aprobado');
    const inputPlazo = document.getElementById('plazo_credito');
    const inputNroCredito = document.getElementById('numero_credito');
    const formDesembolso = document.getElementById('form-registrar-desembolso');
    const tbodyDesembolsos = document.getElementById('tbody-desembolsos');

    let listaSolicitudesCache = [];

    // 1. Cargar solicitudes aprobadas en el desplegable
    async function cargarSolicitudesAprobadas() {
        try {
            const respuesta = await fetch('/api/solicitudes/listar-aprobadas');
            const solicitudes = await respuesta.json();
            listaSolicitudesCache = solicitudes;

            if (!respuesta.ok || solicitudes.length === 0) {
                selectSolicitud.innerHTML = '<option value="">No hay solicitudes disponibles</option>';
                return;
            }

            selectSolicitud.innerHTML = '<option value="">Seleccione una solicitud...</option>';
            solicitudes.forEach(sol => {
                const option = document.createElement('option');
                option.value = sol.id_solicitud;
                option.textContent = `${sol.id_solicitud} · ${sol.cliente_nombre} (Bs. ${sol.monto_solicitado})`;
                selectSolicitud.appendChild(option);
            });

        } catch (error) {
            console.error('Error al cargar solicitudes:', error);
            selectSolicitud.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    // Al seleccionar una solicitud, autocompletar monto y plazo
    selectSolicitud.addEventListener('change', (e) => {
        const idSeleccionado = e.target.value;
        const encontrada = listaSolicitudesCache.find(s => s.id_solicitud == idSeleccionado);

        if (encontrada) {
            inputMonto.value = encontrada.monto_solicitado;
            inputPlazo.value = encontrada.plazo_meses;
        } else {
            inputMonto.value = '';
            inputPlazo.value = '';
        }
    });

    // 2. Cargar historial de desembolsos
    async function cargarHistorialDesembolsos() {
        try {
            const respuesta = await fetch('/api/solicitudes/desembolsos');
            const desembolsos = await respuesta.json();

            tbodyDesembolsos.innerHTML = '';

            if (desembolsos.length === 0) {
                tbodyDesembolsos.innerHTML = `
                    <tr>
                        <td colspan="6" class="texto-vacio">No hay créditos desembolsados registrados</td>
                    </tr>
                `;
                return;
            }

            desembolsos.forEach(d => {
                const tr = document.createElement('tr');
                const montoFormateado = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(d.monto);

                tr.innerHTML = `
                    <td><strong>${d.numero_credito}</strong></td>
                    <td>${d.cliente_nombre}</td>
                    <td><strong>Bs. ${montoFormateado}</strong></td>
                    <td>${d.plazo_meses} meses</td>
                    <td>${d.fecha_desembolso || 'Hoy'}</td>
                    <td><span class="badge-estado-desembolsado">${d.estado}</span></td>
                `;
                tbodyDesembolsos.appendChild(tr);
            });

        } catch (error) {
            console.error('Error al cargar historial:', error);
            tbodyDesembolsos.innerHTML = `
                <tr>
                    <td colspan="6" class="texto-vacio">Error al cargar los desembolsos</td>
                </tr>
            `;
        }
    }

    // 3. Registrar nuevo desembolso
    formDesembolso.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id_solicitud = selectSolicitud.value;
        if (!id_solicitud) {
            alert('Por favor seleccione una solicitud aprobada.');
            return;
        }

        const desembolsoData = {
            id_solicitud: parseInt(id_solicitud),
            numero_credito: inputNroCredito.value.trim(),
            monto_desembolsado: parseFloat(inputMonto.value),
            tasa_interes: parseFloat(document.getElementById('tasa_interes').value)
        };

        try {
            const respuesta = await fetch('/api/solicitudes/desembolsos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(desembolsoData)
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                alert(resultado.error || 'No se pudo registrar el desembolso');
                return;
            }

            alert('¡Desembolso confirmado y registrado con éxito!');
            
            formDesembolso.reset();
            inputNroCredito.value = '2026-0002'; // Incrementar sugerencia básica
            document.getElementById('tasa_interes').value = '12.00';
            
            // Recargar datos
            cargarSolicitudesAprobadas();
            cargarHistorialDesembolsos();

        } catch (error) {
            console.error('Error al guardar desembolso:', error);
            alert('No se pudo conectar con el servidor.');
        }
    });

    // Inicializar funciones al cargar
    cargarSolicitudesAprobadas();
    cargarHistorialDesembolsos();
});