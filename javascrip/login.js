document.addEventListener('DOMContentLoaded', () => {
    const formulario = document.getElementById('formulario-login');
    const inputUsuario = document.getElementById('campo-usuario');
    const inputContrasena = document.getElementById('campo-contrasena');
    const botonVerContrasena = document.querySelector('.boton-ver-contrasena');

    let mostrarContrasena = false;

    if (botonVerContrasena) {
        botonVerContrasena.addEventListener('click', () => {
            mostrarContrasena = !mostrarContrasena;
            inputContrasena.type = mostrarContrasena ? 'text' : 'password';
            botonVerContrasena.textContent = mostrarContrasena ? '👁️‍🗨️' : '';
        });
    }

    if (formulario) {
        formulario.addEventListener('submit', async (e) => {
            e.preventDefault();

            const login = inputUsuario.value.trim();
            const clave = inputContrasena.value.trim();

            try {
                const respuesta = await fetch('/api/solicitudes/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login, clave })
                });

                const data = await respuesta.json();

                if (!respuesta.ok) {
                    alert(data.error || 'Usuario o contraseña incorrectos');
                    return;
                }

                // Guardar usuario logueado en LocalStorage
                localStorage.setItem('usuarioLogueado', JSON.stringify(data.usuario));

                // Redirección por Rol
                const rol = data.usuario.rol;
                if (rol === 'JEFE') {
                    window.location.href = './aprobaciones.html';
                } else if (rol === 'OFICIAL') {
                    window.location.href = './clientes.html'; // <--- Apunta a tu archivo clientes.html
                } else if (rol === 'ANALISTA') {
                    window.location.href = './evaluaciones.html';
                } else if (rol === 'CAJERO') {
                    window.location.href = './pagos.html';
                } else if (rol === 'ADMIN') {
                    window.location.href = './usuarios.html';
                } else {
                    window.location.href = './aprobaciones.html'; // Redirigir a una página por defecto si el rol no coincide
                }

            } catch (error) {
                console.error('Error al intentar conectar:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }
});