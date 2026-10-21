document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar datos iniciales al abrir la vista de Gestión de Usuarios
    cargarUsuarios();
    cargarClientesRegistrados();

    // 2. Manejador para el formulario de Registro de Nuevo Usuario
    const formCrear = document.getElementById('form-crear-usuario');
    if (formCrear) {
        formCrear.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nuevoUsuario = {
                nombre_completo: document.getElementById('crear-nombre').value.trim(),
                login: document.getElementById('crear-login').value.trim(),
                clave_hash: document.getElementById('crear-clave').value.trim(),
                rol: document.getElementById('crear-rol').value,
                limite_aprobacion: parseFloat(document.getElementById('crear-limite').value) || 0.00
            };

            try {
                const respuesta = await fetch('/api/usuarios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevoUsuario)
                });

                const data = await respuesta.json();
                if (!respuesta.ok) throw new Error(data.error || 'Error al registrar usuario');

                alert('Usuario registrado con éxito');
                formCrear.reset();
                document.getElementById('crear-limite').value = '0.00';
                cargarUsuarios();
            } catch (error) {
                console.error('Error al crear usuario:', error);
                alert(error.message);
            }
        });
    }

    // 3. Manejadores para cerrar el Modal Flotante de Edición
    const btnCerrarModal = document.getElementById('cerrar-modal');
    const btnCancelarModal = document.getElementById('btn-cancelar');

    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModalEdicion);
    if (btnCancelarModal) btnCancelarModal.addEventListener('click', cerrarModalEdicion);

    // 4. Manejador para enviar la actualización del usuario (PUT)
    const formEditar = document.getElementById('form-editar-usuario');
    if (formEditar) {
        formEditar.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('edit-id').value;
            const datosActualizados = {
                nombre_completo: document.getElementById('edit-nombre').value.trim(),
                login: document.getElementById('edit-login').value.trim(),
                rol: document.getElementById('edit-rol').value,
                limite_aprobacion: parseFloat(document.getElementById('edit-limite').value) || 0.00
            };

            try {
                const respuesta = await fetch(`/api/usuarios/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datosActualizados)
                });

                const data = await respuesta.json();
                if (!respuesta.ok) throw new Error(data.error || 'Error al actualizar usuario');

                alert('Usuario actualizado correctamente');
                cerrarModalEdicion();
                cargarUsuarios();
            } catch (error) {
                console.error('Error al actualizar usuario:', error);
                alert(error.message);
            }
        });
    }
});

// ==========================================
// FUNCIÓN: LISTAR USUARIOS DEL SISTEMA
// ==========================================
async function cargarUsuarios() {
    try {
        const respuesta = await fetch('/api/usuarios');
        if (!respuesta.ok) throw new Error('Error al consultar los usuarios');

        const usuarios = await respuesta.json();
        const tbody = document.getElementById('cuerpo-tabla-usuarios');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!usuarios || usuarios.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: #666;">
                        No hay usuarios registrados en el sistema.
                    </td>
                </tr>`;
            return;
        }

        usuarios.forEach(u => {
            const userId = u.id !== undefined ? u.id : u.id_usuario;
            const fila = document.createElement('tr');
            
            const activo = u.activo === 1;
            const estadoBadge = activo 
                ? '<span class="etiqueta-estado estado-aprobada">ACTIVO</span>' 
                : '<span class="etiqueta-estado estado-rechazada">INACTIVO</span>';
            
            const botonEstadoTexto = activo ? 'Desactivar' : 'Activar';
            const botonEstadoClase = activo ? 'boton-peligro' : 'boton-primario';

            fila.innerHTML = `
                <td><strong>#${userId}</strong></td>
                <td>${u.nombre_completo}</td>
                <td><code>${u.login}</code></td>
                <td><span class="badge-rol">${u.rol}</span></td>
                <td>Bs. ${Number(u.limite_aprobacion || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                <td>${estadoBadge}</td>
                <td class="texto-centrado">
                    <button type="button" class="boton-accion-editar" onclick="abrirModalEdicion(${userId}, '${u.nombre_completo}', '${u.login}', '${u.rol}', ${u.limite_aprobacion})">Editar</button>
                    <button type="button" class="${botonEstadoClase}" style="padding: 6px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; border: none; font-weight: 600;" onclick="cambiarEstadoUsuario(${userId}, ${u.activo})">${botonEstadoTexto}</button>
                </td>
            `;
            tbody.appendChild(fila);
        });

    } catch (error) {
        console.error('Error al cargar la tabla de usuarios:', error);
    }
}

// ==========================================
// FUNCIONES DEL MODAL FLOTANTE DE EDICIÓN
// ==========================================
function abrirModalEdicion(id, nombre, login, rol, limite) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-nombre').value = nombre;
    document.getElementById('edit-login').value = login;
    document.getElementById('edit-rol').value = rol;
    document.getElementById('edit-limite').value = limite;

    const modal = document.getElementById('modal-editar');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalEdicion() {
    const modal = document.getElementById('modal-editar');
    if (modal) modal.style.display = 'none';
}

// ==========================================
// FUNCIÓN: ACTIVAR / DESACTIVAR USUARIO
// ==========================================
async function cambiarEstadoUsuario(id, estadoActual) {
    const nuevoEstado = estadoActual === 1 ? 0 : 1;
    const accionStr = nuevoEstado === 1 ? 'activar' : 'desactivar';

    if (confirm(`¿Está seguro de que desea ${accionStr} este usuario?`)) {
        try {
            const respuesta = await fetch(`/api/usuarios/${id}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: nuevoEstado })
            });

            if (!respuesta.ok) throw new Error('Error al cambiar el estado');
            cargarUsuarios();
        } catch (error) {
            console.error('Error:', error);
            alert('No se pudo cambiar el estado del usuario.');
        }
    }
}

// ==========================================
// FUNCIÓN: LISTAR CLIENTES REGISTRADOS
// ==========================================
async function cargarClientesRegistrados() {
    try {
        const respuesta = await fetch('/api/usuarios/clientes/todos');
        if (!respuesta.ok) throw new Error('Error al consultar los clientes');

        const data = await respuesta.json();
        const tbody = document.getElementById('cuerpo-tabla-clientes');
        const contadorEl = document.getElementById('contador-clientes');
        
        if (!tbody) return;

        tbody.innerHTML = '';
        if (contadorEl) contadorEl.textContent = `Total: ${data.total || 0}`;

        if (!data.clientes || data.clientes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 20px; color: #666;">
                        No hay clientes registrados en la base de datos.
                    </td>
                </tr>`;
            return;
        }

        data.clientes.forEach(c => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td><strong>#${c.id_cliente}</strong></td>
                <td>${c.ci}</td>
                <td>${c.nombres} ${c.apellidos}</td>
                <td>${c.telefono || 'S/N'}</td>
                <td>${c.direccion || 'S/N'}</td>
                <td>Bs. ${Number(c.ingresos_mensuales || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
            `;
            tbody.appendChild(fila);
        });

    } catch (error) {
        console.error('Error al cargar la tabla de clientes:', error);
    }
}