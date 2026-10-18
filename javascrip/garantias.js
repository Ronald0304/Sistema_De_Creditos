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

    const selectSolicitud = document.getElementById('select-solicitud');
    const formGarantia = document.getElementById('form-registrar-garantia');
    const tbodyGarantias = document.getElementById('tbody-garantias');
    const tituloTabla = document.getElementById('titulo-tabla-garantias');

    // 1. Cargar las solicitudes existentes en el select
    async function cargarSolicitudes() {
        try {
            const respuesta = await fetch('/api/solicitudes/listar-solicitudes');
            const solicitudes = await respuesta.json();

            if (!respuesta.ok) {
                selectSolicitud.innerHTML = '<option value="">Error al cargar solicitudes</option>';
                return;
            }

            if (solicitudes.length === 0) {
                selectSolicitud.innerHTML = '<option value="">No hay solicitudes registradas</option>';
                return;
            }

            selectSolicitud.innerHTML = '';
            solicitudes.forEach(sol => {
                const option = document.createElement('option');
                option.value = sol.id_solicitud;
                option.textContent = `${sol.id_solicitud} · ${sol.cliente_nombre}`;
                selectSolicitud.appendChild(option);
            });

            // Cargar automáticamente las garantías de la primera solicitud
            if (selectSolicitud.value) {
                cargarGarantiasSolicitud(selectSolicitud.value);
            }

        } catch (error) {
            console.error('Error al cargar solicitudes:', error);
            selectSolicitud.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    // 2. Cargar las garantías de la solicitud seleccionada desde SQLite
    async function cargarGarantiasSolicitud(idSolicitud) {
        tituloTabla.textContent = `GARANTÍAS DE LA SOLICITUD ${idSolicitud}`;

        try {
            const respuesta = await fetch(`/api/solicitudes/garantias/${idSolicitud}`);
            const garantias = await respuesta.json();

            tbodyGarantias.innerHTML = '';

            if (garantias.length === 0) {
                tbodyGarantias.innerHTML = `
                    <tr>
                        <td colspan="4" class="texto-vacio">No hay garantías registradas para esta solicitud</td>
                    </tr>
                `;
                return;
            }

            garantias.forEach(g => {
                const tr = document.createElement('tr');
                const montoFormateado = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(g.valor);
                
                let claseBadge = 'badge-estado-vigente';
                if (g.estado === 'EN_CUSTODIA') claseBadge = 'badge-estado-custodia';
                if (g.estado === 'LIBERADA') claseBadge = 'badge-estado-liberada';

                tr.innerHTML = `
                    <td><strong>${g.tipo}</strong></td>
                    <td>${g.descripcion}</td>
                    <td><strong>Bs. ${montoFormateado}</strong></td>
                    <td><span class="${claseBadge}">${g.estado}</span></td>
                `;
                tbodyGarantias.appendChild(tr);
            });

        } catch (error) {
            console.error('Error al cargar garantías:', error);
            tbodyGarantias.innerHTML = `
                <tr>
                    <td colspan="4" class="texto-vacio">Error al cargar las garantías</td>
                </tr>
            `;
        }
    }

    // Evento al cambiar la solicitud seleccionada
    selectSolicitud.addEventListener('change', (e) => {
        if (e.target.value) {
            cargarGarantiasSolicitud(e.target.value);
        }
    });

    // 3. Registrar una nueva garantía en la base de datos
    formGarantia.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id_solicitud = selectSolicitud.value;
        if (!id_solicitud) {
            alert('Seleccione una solicitud.');
            return;
        }

        const garantiaData = {
            id_solicitud: parseInt(id_solicitud),
            tipo: document.getElementById('tipo_garantia').value,
            descripcion: document.getElementById('descripcion_garantia').value.trim(),
            valor: parseFloat(document.getElementById('valor_garantia').value),
            estado: document.getElementById('estado_garantia').value
        };

        try {
            const respuesta = await fetch('/api/solicitudes/garantias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(garantiaData)
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                alert(resultado.error || 'No se pudo agregar la garantía');
                return;
            }

            alert('¡Garantía registrada con éxito!');
            
            // Limpiar los campos de entrada pero mantener la solicitud seleccionada
            document.getElementById('descripcion_garantia').value = '';
            document.getElementById('valor_garantia').value = '';

            // Recargar la tabla con la garantía recién agregada
            cargarGarantiasSolicitud(id_solicitud);

        } catch (error) {
            console.error('Error al guardar garantía:', error);
            alert('No se pudo conectar con el servidor.');
        }
    });

    // Inicializar desplegable
    cargarSolicitudes();
});