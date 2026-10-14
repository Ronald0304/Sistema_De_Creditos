/* ==========================================
   LÓGICA DE INTERACTIVIDAD - ENERGOBANK
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. OCULTAR / MOSTRAR CONTRASEÑA
    const botonMostrarClave = document.getElementById('boton-mostrar-clave');
    const campoClave = document.getElementById('clave');

    if (botonMostrarClave && campoClave) {
        botonMostrarClave.addEventListener('click', () => {
            // Cambiar entre tipo 'password' y 'text'
            const esClave = campoClave.getAttribute('type') === 'password';
            campoClave.setAttribute('type', esClave ? 'text' : 'password');

            // Cambiar el icono visualmente según el estado
            botonMostrarClave.textContent = esClave ? '👁‍🗨' : '👁';
            botonMostrarClave.setAttribute(
                'aria-label', 
                esClave ? 'Ocultar contraseña' : 'Mostrar contraseña'
            );
        });
    }


    // 2. SIMULACIÓN DE TECLADO VIRTUAL
    const botonTeclado = document.getElementById('boton-teclado-virtual');

    if (botonTeclado) {
        botonTeclado.addEventListener('click', () => {
            alert('Teclado virtual activado para mayor seguridad.');
            // Aquí se podría desplegar un componente de teclado en pantalla
        });
    }


    // 3. NAVEGACIÓN Y CAMBIO EN EL CARRUSEL PROMOCIONAL
    const puntos = document.querySelectorAll('.punto');

    puntos.forEach((punto, indice) => {
        punto.addEventListener('click', () => {
            // Quitar la clase 'activo' de todos los puntos
            puntos.forEach(p => p.classList.remove('activo'));

            // Agregar la clase 'activo' al punto seleccionado
            punto.classList.add('activo');

            console.log(`Pestaña promocional activa: ${indice + 1}`);
        });
    });


    // 4. MANEJO DEL ENVÍO DEL FORMULARIO DE INGRESO
    const formularioLogin = document.getElementById('formulario-inicio-sesion');

    if (formularioLogin) {
        formularioLogin.addEventListener('submit', (evento) => {
            // Evitar que la página se recargue por defecto
            evento.preventDefault();

            // Capturar los datos ingresados
            const usuario = document.getElementById('usuario').value.trim();
            const clave = document.getElementById('clave').value.trim();

            // Validación básica de seguridad
            if (!usuario || !clave) {
                alert('Por favor, ingresa tu usuario y contraseña.');
                return;
            }

            // Simulación de respuesta del servidor
            console.log('Iniciando sesión en Energobank con el usuario:', usuario);
            
            alert(`Accediendo a la cuenta de: ${usuario}...`);

            // Opcional: limpiar campos tras enviar
            // formularioLogin.reset();
        });
    }

});