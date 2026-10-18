// Cargar datos del oficial en la barra lateral
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

    const btnBuscar = document.getElementById('btn-buscar-cliente');
    const inputCiBuscar = document.getElementById('ci_buscar');
    const badgeCliente = document.getElementById('badge-cliente');
    const nombreClienteSpan = document.getElementById('nombre-cliente-encontrado');
    const idClienteInput = document.getElementById('id_cliente_seleccionado');
    const formSolicitud = document.getElementById('form-nueva-solicitud');
    const btnCancelar = document.getElementById('btn-cancelar');

    // 1. Buscar Cliente por CI
    if (btnBuscar) {
        btnBuscar.addEventListener('click', async () => {
            const ci = inputCiBuscar.value.trim();
            if (!ci) {
                alert('Ingrese un número de CI para buscar.');
                return;
            }

            try {
                const respuesta = await fetch(`/api/solicitudes/buscar-cliente/${ci}`);
                const cliente = await respuesta.json();

                if (!respuesta.ok) {
                    alert(cliente.error || 'Cliente no encontrado.');
                    badgeCliente.classList.add('oculto');
                    idClienteInput.value = '';
                    return;
                }

                // Mostrar datos en el badge
                nombreClienteSpan.textContent = `${cliente.nombres} ${cliente.apellidos}`;
                idClienteInput.value = cliente.id_cliente;
                badgeCliente.classList.remove('oculto');

            } catch (error) {
                console.error('Error al buscar cliente:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    // 2. Enviar y Guardar Nueva Solicitud
    if (formSolicitud) {
        formSolicitud.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id_cliente = idClienteInput.value;
            if (!id_cliente) {
                alert('Por favor busque y seleccione un cliente válido mediante su CI antes de guardar.');
                return;
            }

            // Obtener oficial de crédito actual
            const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioLogueado') || '{}');
            const id_usuario_registra = usuarioLogueado.id || 2; // Default oficial Ana (ID 2)

            const solicitudData = {
                id_cliente: parseInt(id_cliente),
                id_usuario_registra: id_usuario_registra,
                monto_solicitado: parseFloat(document.getElementById('monto_solicitado').value),
                plazo_meses: parseInt(document.getElementById('plazo_meses').value),
                destino: document.getElementById('destino').value
            };

            try {
                const respuesta = await fetch('/api/solicitudes/nueva', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(solicitudData)
                });

                const resultado = await respuesta.json();

                if (!respuesta.ok) {
                    alert(resultado.error || 'No se pudo registrar la solicitud');
                    return;
                }

                alert(`¡Solicitud #${resultado.id_solicitud} registrada con éxito en estado REGISTRADA!`);
                formSolicitud.reset();
                badgeCliente.classList.add('oculto');
                idClienteInput.value = '';

            } catch (error) {
                console.error('Error al guardar solicitud:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    // 3. Botón Cancelar (Limpia el formulario)
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            formSolicitud.reset();
            badgeCliente.classList.add('oculto');
            idClienteInput.value = '';
        });
    }
});