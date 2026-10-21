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

            if (!login || !clave) {
                alert('Por favor ingrese su usuario y contraseña.');
                return;
            }

            try {
                // 1. Intentar primero el login como usuario interno (Admin, Oficial, Jefe, etc.)
                let respuesta = await fetch('/api/solicitudes/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login, clave })
                });

                let data = await respuesta.json();

                // 2. Si falla en usuario interno, intentar como cliente mediante clientesp.js
                if (!respuesta.ok) {
                    respuesta = await fetch('/api/clientesp/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ login, clave })
                    });
                    data = await respuesta.json();
                }

                if (!respuesta.ok) {
                    alert(data.error || 'Usuario o contraseña incorrectos');
                    return;
                }

                // Guardar usuario logueado en LocalStorage
                localStorage.setItem('usuarioLogueado', JSON.stringify(data.usuario));

                // 3. Redirección inteligente por Rol
                const rol = data.usuario.rol;
                if (rol === 'JEFE') {
                    window.location.href = './aprobaciones.html';
                } else if (rol === 'OFICIAL') {
                    window.location.href = './clientes.html';
                } else if (rol === 'ANALISTA') {
                    window.location.href = './evaluaciones.html';
                } else if (rol === 'CAJERO') {
                    window.location.href = './pagos.html';
                } else if (rol === 'ADMIN') {
                    window.location.href = './usuarios.html';
                } else if (rol === 'GERENTE') {
                    window.location.href = './reportes.html';
                } else if (rol === 'CLIENTE') {
                    window.location.href = './cliente_panel.html';
                } else {
                    window.location.href = './cliente_panel.html';
                }

            } catch (error) {
                console.error('Error al intentar conectar:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }
});