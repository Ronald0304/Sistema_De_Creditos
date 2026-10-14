/* ==========================================
   LÓGICA DE INTERACTIVIDAD - EAGLE FINANCE
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. FUNCIONALIDAD DE MOSTRAR / OCULTAR CONTRASEÑA
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            // Cambiar el tipo de input entre 'password' y 'text'
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            // Cambiar el icono visualmente (opcional: puedes cambiar el emoji o clase)
            togglePasswordBtn.textContent = type === 'password' ? '👁' : '👁‍🗨';
        });
    }


    // 2. MANEJO DEL ENVÍO DEL FORMULARIO (LOGIN)
    const loginForm = document.getElementById('login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            // Prevenir el comportamiento por defecto de recargar la página
            event.preventDefault();

            // Obtener los valores de los inputs
            const emailValue = document.getElementById('email').value.trim();
            const passwordValue = document.getElementById('password').value.trim();
            const rememberMe = document.getElementById('remember-me').checked;

            // Validación simple de campos vacíos
            if (!emailValue || !passwordValue) {
                alert('Por favor, completa todos los campos.');
                return;
            }

            // Simulación de proceso de inicio de sesión exitoso
            console.log('Datos de acceso enviados:');
            console.log(`Correo: ${emailValue}`);
            console.log(`Recordar sesión: ${rememberMe}`);

            // Aquí puedes conectar posteriormente con una API o Backend (Fetch API, Axios, etc.)
            alert(`¡Bienvenido de nuevo! Iniciando sesión para ${emailValue}...`);
            
            // Opcional: limpiar formulario o redirigir
            // loginForm.reset();
        });
    }

});