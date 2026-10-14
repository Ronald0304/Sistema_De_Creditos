/* ==========================================
   LÓGICA E INTERACTIVIDAD - BLUEBANK DASHBOARD
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. NAVEGACIÓN DEL MENÚ LATERAL
    // ==========================================
    const itemsMenu = document.querySelectorAll('.item-menu');

    itemsMenu.forEach(item => {
        item.addEventListener('click', () => {
            // Remover la clase activa de todos los elementos
            itemsMenu.forEach(i => i.classList.remove('activo'));
            // Agregar la clase activa al elemento seleccionado
            item.classList.add('activo');
        });
    });


    // ==========================================
    // 2. FILTROS DE TIEMPO (Estadísticas y Períodos)
    // ==========================================
    // Filtros rápidos de las tarjetas superiores
    const botonesFiltro = document.querySelectorAll('.boton-filtro');
    botonesFiltro.forEach(boton => {
        boton.addEventListener('click', (e) => {
            const contenedorPadre = e.target.closest('.filtros-tiempo');
            if (contenedorPadre) {
                contenedorPadre.querySelectorAll('.boton-filtro').forEach(b => b.classList.remove('activo'));
                e.target.classList.add('activo');
            }
        });
    });

    // Filtros de período en el balance general
    const botonesPeriodo = document.querySelectorAll('.boton-periodo');
    botonesPeriodo.forEach(boton => {
        boton.addEventListener('click', (e) => {
            const contenedorPadre = e.target.closest('.periodos-tiempo');
            if (contenedorPadre) {
                contenedorPadre.querySelectorAll('.boton-periodo').forEach(b => b.classList.remove('activo'));
                e.target.classList.add('activo');
            }
        });
    });


    // ==========================================
    // 3. ACCIONES DE LA CABECERA (Notificaciones y Salir)
    // ==========================================
    const botonNotificaciones = document.getElementById('boton-notificaciones');
    const indicadorNotificacion = document.querySelector('.indicador-notificacion');

    if (botonNotificaciones) {
        botonNotificaciones.addEventListener('click', () => {
            alert('Tienes 1 notificación pendiente de tu tarjeta Visa.');
            // Ocultar el punto rojo tras revisar
            if (indicadorNotificacion) {
                indicadorNotificacion.style.display = 'none';
            }
        });
    }

    const botonCerrarSesion = document.getElementById('boton-cerrar-sesion');
    if (botonCerrarSesion) {
        botonCerrarSesion.addEventListener('click', () => {
            const confirmar = confirm('¿Deseas cerrar la sesión de Ernest Hemingway?');
            if (confirmar) {
                alert('Sesión cerrada correctamente.');
                // Redirigir al login (por ejemplo: index.html)
                // window.location.href = "index.html";
            }
        });
    }


    // ==========================================
    // 4. RENDERIZADO DE GRÁFICOS (CANVAS HTML5)
    // ==========================================

    // A. Gráfico de Ingresos (Línea)
    const canvasIngresos = document.getElementById('grafico-ingresos');
    if (canvasIngresos) {
        const ctx = canvasIngresos.getContext('2d');
        dibujarGraficoLineal(canvasIngresos, ctx);
    }

    // B. Gráfico de Balance Anual (Barras comparativas)
    const canvasBalance = document.getElementById('grafico-balance-anual');
    if (canvasBalance) {
        const ctx = canvasBalance.getContext('2d');
        dibujarGraficoBarras(canvasBalance, ctx);
    }

});


/* ==========================================
   FUNCIONES AUXILIARES PARA DIBUJAR EN CANVAS
   ========================================== */

// Dibuja una línea suave simular a la gráfica de ingresos
function dibujarGraficoLineal(canvas, ctx) {
    const ancho = canvas.width = canvas.parentElement.clientWidth;
    const alto = canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, ancho, alto);

    // Puntos ficticios para la curva
    const puntos = [
        { x: 0, y: alto * 0.7 },
        { x: ancho * 0.2, y: alto * 0.6 },
        { x: ancho * 0.4, y: alto * 0.2 },
        { x: ancho * 0.6, y: alto * 0.8 },
        { x: ancho * 0.8, y: alto * 0.5 },
        { x: ancho, y: alto * 0.3 }
    ];

    // Trazar línea
    ctx.beginPath();
    ctx.moveTo(puntos[0].x, puntos[0].y);
    for (let i = 1; i < puntos.length; i++) {
        ctx.lineTo(puntos[i].x, puntos[i].y);
    }
    ctx.strokeStyle = '#2b5cff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Relleno degradado debajo de la curva
    ctx.lineTo(ancho, alto);
    ctx.lineTo(0, alto);
    ctx.closePath();
    const degradado = ctx.createLinearGradient(0, 0, 0, alto);
    degradado.addColorStop(0, 'rgba(43, 92, 255, 0.2)');
    degradado.addColorStop(1, 'rgba(43, 92, 255, 0.0)');
    ctx.fillStyle = degradado;
    ctx.fill();
}

// Dibuja las barras verticales de Ingresos vs Gastos
function dibujarGraficoBarras(canvas, ctx) {
    const ancho = canvas.width = canvas.parentElement.clientWidth;
    const alto = canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, ancho, alto);

    const cantidadBarras = 12;
    const anchoBarra = 6;
    const separacion = (ancho - 40) / cantidadBarras;

    for (let i = 0; i < cantidadBarras; i++) {
        const x = 20 + (i * separacion);
        
        // Simular alturas aleatorias para representación visual
        const alturaIngreso = Math.random() * (alto * 0.5) + 30;
        const alturaGasto = Math.random() * (alto * 0.3) + 20;

        // Barra de Ingreso (Azul)
        ctx.fillStyle = '#2b5cff';
        ctx.beginPath();
        ctx.roundRect(x, alto / 2 - alturaIngreso, anchoBarra, alturaIngreso, 3);
        ctx.fill();

        // Barra de Gasto (Gris)
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.roundRect(x, alto / 2 + 5, anchoBarra, alturaGasto, 3);
        ctx.fill();
    }
}