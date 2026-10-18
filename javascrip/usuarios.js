document.addEventListener('DOMContentLoaded', () => {
  // 1. Validar sesión activa y cargar datos del Administrador en la barra lateral
  const usuarioGuardado = localStorage.getItem('usuarioLogueado');
  
  if (!usuarioGuardado) {
    alert('No se detectó una sesión activa. Redirigiendo al inicio de sesión...');
    window.location.href = 'login.html';
    return;
  }

  try {
    const usuario = JSON.parse(usuarioGuardado);
    const nombre = usuario.nombre || usuario.nombre_completo || 'Administrador';
    const rolUser = (usuario.rol || 'ADMIN').toUpperCase();

    // Calcular Iniciales para el Avatar
    const iniciales = nombre
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const avatarEl = document.getElementById('sidebar-avatar');
    const nombreEl = document.getElementById('sidebar-nombre');
    const rolEl = document.getElementById('sidebar-rol');

    if (avatarEl) avatarEl.textContent = iniciales;
    if (nombreEl) nombreEl.textContent = nombre;
    if (rolEl) rolEl.textContent = rolUser === 'ADMIN' ? 'Administrador' : rolUser;

  } catch (e) {
    console.error('Error al leer sesión:', e);
  }

  // 2. Manejar el Botón de Cerrar Sesión
  const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
  if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener('click', () => {
      if (confirm('¿Está seguro de que desea cerrar la sesión?')) {
        localStorage.removeItem('usuarioLogueado');
        window.location.href = 'login.html';
      }
    });
  }

  const tbodyUsuarios = document.getElementById('tbody-usuarios');
  const formRegistrarUsuario = document.getElementById('form-registrar-usuario');

  // 3. Cargar la lista completa de usuarios del sistema
  async function cargarUsuarios() {
    try {
      const res = await fetch('/api/usuarios');
      const usuarios = await res.json();

      if (!tbodyUsuarios) return;
      tbodyUsuarios.innerHTML = '';

      if (!Array.isArray(usuarios) || usuarios.length === 0) {
        tbodyUsuarios.innerHTML = `<tr><td colspan="7" class="texto-vacio">No hay usuarios registrados.</td></tr>`;
        return;
      }

      usuarios.forEach(u => {
        const tr = document.createElement('tr');
        const esActivo = u.activo === 1;
        const badgeClase = esActivo ? 'badge-estado-desembolsado' : 'badge-pendiente';
        const textoEstado = esActivo ? 'ACTIVO' : 'INACTIVO';

        tr.innerHTML = `
          <td><strong>#${u.id_usuario}</strong></td>
          <td>${u.nombre_completo}</td>
          <td><code>${u.login}</code></td>
          <td><span class="badge-rol">${u.rol}</span></td>
          <td>Bs. ${parseFloat(u.limite_aprobacion || 0).toFixed(2)}</td>
          <td><span class="${badgeClase}">${textoEstado}</span></td>
          <td>
            <button 
              type="button" 
              class="boton-primario" 
              style="background: ${esActivo ? '#ef4444' : '#10b981'}; padding: 4px 10px; font-size: 12px;" 
              onclick="cambiarEstadoUsuario(${u.id_usuario}, ${esActivo ? 0 : 1})">
              ${esActivo ? 'Desactivar' : 'Activar'}
            </button>
          </td>
        `;
        tbodyUsuarios.appendChild(tr);
      });
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      tbodyUsuarios.innerHTML = `<tr><td colspan="7" class="texto-vacio">Error de conexión al cargar la lista.</td></tr>`;
    }
  }

  // 4. Registrar un nuevo usuario desde el formulario
  if (formRegistrarUsuario) {
    formRegistrarUsuario.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nuevoUsuario = {
        nombre_completo: document.getElementById('nombre_completo').value.trim(),
        login: document.getElementById('login').value.trim(),
        clave_hash: document.getElementById('clave_hash').value.trim(),
        rol: document.getElementById('rol').value,
        limite_aprobacion: parseFloat(document.getElementById('limite_aprobacion').value) || 0
      };

      try {
        const res = await fetch('/api/usuarios/registrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevoUsuario)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        alert('¡Usuario registrado con éxito!');
        formRegistrarUsuario.reset();
        document.getElementById('limite_aprobacion').value = '0.00';
        cargarUsuarios();

      } catch (err) {
        alert('Error al registrar usuario: ' + err.message);
      }
    });
  }

  // 5. Función global para activar/desactivar estado de usuario
  window.cambiarEstadoUsuario = async (id, nuevoEstado) => {
    const accion = nuevoEstado === 1 ? 'activar' : 'desactivar';
    if (!confirm(`¿Está seguro de que desea ${accion} este usuario?`)) return;

    try {
      const res = await fetch(`/api/usuarios/estado/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoEstado })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      cargarUsuarios();
    } catch (err) {
      alert('Error al cambiar el estado del usuario: ' + err.message);
    }
  };

  // Inicializar carga de datos al abrir la página
  cargarUsuarios();
});