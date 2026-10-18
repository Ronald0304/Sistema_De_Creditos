document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener los datos del usuario logueado en la sesión
    const usuarioGuardado = localStorage.getItem('usuarioLogueado');
    const menuNav = document.getElementById('menu-navegacion');

    if (!usuarioGuardado) {
        alert('No se detectó una sesión activa. Redirigiendo al inicio de sesión...');
        window.location.href = 'login.html';
        return;
    }

    let usuario = {};
    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (e) {
        console.error('Error al parsear usuario logueado:', e);
    }

    // Nombres y fallback
    const nombreCompleto = usuario.nombre || usuario.nombre_completo || 'Usuario del Sistema';
    const loginUser = usuario.login || usuario.usuario || 'usuario';
    const rolUser = (usuario.rol || 'OFICIAL').toUpperCase();
    const idUser = usuario.id || usuario.id_usuario || '1';
    const limiteAprobacion = usuario.limite_aprobacion ? parseFloat(usuario.limite_aprobacion) : 0.00;

    // Calcular Iniciales
    const iniciales = nombreCompleto
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

    // 2. Renderizar datos en la barra lateral
    document.getElementById('sidebar-avatar').textContent = iniciales;
    document.getElementById('sidebar-nombre').textContent = nombreCompleto;
    
    let textoRolFormateado = 'Oficial de Crédito';
    if (rolUser === 'ANALISTA') textoRolFormateado = 'Analista de Crédito';
    if (rolUser === 'JEFE') textoRolFormateado = 'Jefe de Créditos';
    document.getElementById('sidebar-rol').textContent = textoRolFormateado;

    // 3. Construir navegación lateral según el ROL exacto
    if (rolUser === 'JEFE') {
        menuNav.innerHTML = `
            <a href="aprobaciones.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Bandeja de aprobación</span>  
            </a>
            <a href="historial.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Historial de decisiones</span>
            </a>
            <a href="perfil.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Mi perfil</span>
            </a>
        `;
    } else if (rolUser === 'ANALISTA') {
        menuNav.innerHTML = `
            <a href="evaluaciones.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Evaluaciones</span>  
            </a>
            <a href="perfil.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Mi perfil</span>
            </a>
        `;
    } else if (rolUser === 'CAJERO') {
        // Menú exclusivo para el Cajero
        menuNav.innerHTML = `
            <a href="pagos.html" class="enlace-nav activo">
                <span class="icono-nav">💳</span>
                <span class="texto-nav">Caja / Pagos</span>  
            </a>
        `;
    } else if (rolUser === 'ADMIN') {
        menuNav.innerHTML = `
            <a href="usuarios.html" class="enlace-nav activo">
                <span class="icono-nav"></span>
                <span class="texto-nav">Gestión Usuarios</span>
            </a>
            <a href="perfil.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Mi Perfil</span>
            </a>
        `;
    } else if (rolUser === 'GERENTE') {
        menuNav.innerHTML = `
            <a href="reportes.html" class="enlace-nav activo">
                <span class="texto-nav">Reportes de Gestión</span>  
            </a>
            <a href="perfil.html" class="enlace-nav">
                <span class="texto-nav">Mi perfil</span>
            </a>
        `;
    
    }else {
        // Rol por defecto: OFICIAL
        menuNav.innerHTML = `
            <a href="clientes.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Clientes</span>  
            </a>
            <a href="solicitudes.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Solicitudes</span>
            </a>
            <a href="garantias.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Garantías</span>
            </a>
            <a href="desembolsos.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Desembolsos</span>
            </a>
            <a href="perfil.html" class="enlace-nav">
                <span class="icono-nav"></span>
                <span class="texto-nav">Mi perfil</span>
            </a>
        `;
    }

    // 4. Renderizar datos en la vista principal de Perfil
    document.getElementById('perfil-avatar-grande').textContent = iniciales;
    document.getElementById('perfil-nombre-completo').textContent = nombreCompleto;
    document.getElementById('perfil-rol-badge').textContent = rolUser;
    document.getElementById('perfil-login').textContent = loginUser;

    document.getElementById('perfil-info-nombre').textContent = nombreCompleto;
    document.getElementById('perfil-info-login').textContent = loginUser;
    document.getElementById('perfil-info-rol').textContent = rolUser;
    document.getElementById('perfil-info-limite').textContent = `Bs. ${limiteAprobacion.toLocaleString('es-BO', {minimumFractionDigits: 2})}`;
    document.getElementById('perfil-info-estado').textContent = 'ACTIVO';
    document.getElementById('perfil-info-id').textContent = idUser;

    // 5. Manejar el Botón de Cerrar Sesión
    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            if (confirm('¿Está seguro de que desea cerrar la sesión?')) {
                localStorage.removeItem('usuarioLogueado');
                window.location.href = 'login.html';
            }
        });
    }
});