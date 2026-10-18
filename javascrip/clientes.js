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
    // 1. Cargar datos del oficial en el sidebar
    cargarDatosUsuario();

    const formularioCliente = document.getElementById('form-registrar-cliente');

    // 2. Manejar el envío del formulario de registro de cliente
    if (formularioCliente) {
        formularioCliente.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Capturar los valores del formulario
            const clienteData = {
                ci: document.getElementById('ci').value.trim(),
                telefono: document.getElementById('telefono').value.trim(),
                nombres: document.getElementById('nombres').value.trim(),
                apellidos: document.getElementById('apellidos').value.trim(),
                direccion: document.getElementById('direccion').value.trim(),
                ingresos_mensuales: parseFloat(document.getElementById('ingresos_mensuales').value)
            };

            try {
                // Enviar petición POST al backend usando la ruta correcta de solicitudes
                const respuesta = await fetch('/api/solicitudes/clientes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clienteData)
                });

                const resultado = await respuesta.json();

                if (!respuesta.ok) {
                    alert(resultado.error || 'No se pudo registrar el cliente');
                    return;
                }

                alert('¡Cliente registrado con éxito en la base de datos!');
                formularioCliente.reset(); // Limpiar formulario tras éxito

            } catch (error) {
                console.error('Error de conexión:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    // 3. Manejar la acción del botón Cancelar para limpiar los campos
    const botonCancelar = document.querySelector('.boton-secundario');
    if (botonCancelar && formularioCliente) {
        // Aseguramos que actúe como botón normal de limpieza si no es de tipo reset
        botonCancelar.addEventListener('click', (e) => {
            e.preventDefault();
            formularioCliente.reset();
        });
    }
});