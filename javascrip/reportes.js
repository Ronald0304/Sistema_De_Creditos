/* ==========================================
   LÓGICA E INTERACTIVIDAD - REPORTE BANCARIO
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. CAMBIO DE VISTAS (RESUMEN / GENERAL / DETALLES)
    // ==========================================
    const botonesVista = document.querySelectorAll('.boton-vista');

    botonesVista.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesVista.forEach(b => b.classList.remove('activo'));
            boton.classList.add('activo');
            console.log(`Vista cambiada a: ${boton.textContent.trim()}`);
        });
    });


    // ==========================================
    // 2. FILTROS DE CALIFICACIÓN (GRADE A-G)
    // ==========================================
    const botonesCalificacion = document.querySelectorAll('.btn-calificacion');

    botonesCalificacion.forEach(boton => {
        boton.addEventListener('click', () => {
            // Permite seleccionar / deseleccionar filtros
            boton.classList.toggle('activo');
            
            const seleccionados = Array.from(botonesCalificacion)
                .filter(b => b.classList.contains('activo'))
                .map(b => b.textContent.trim());
            
            console.log('Filtro de calificaciones activas:', seleccionados);
        });
    });


    // ==========================================
    // 3. FILTRO DE PROPÓSITOS (PURPOSE)
    // ==========================================
    const itemsProposito = document.querySelectorAll('.item-proposito');

    itemsProposito.forEach(item => {
        item.addEventListener('click', () => {
            itemsProposito.forEach(i => i.classList.remove('seleccionado'));
            item.classList.add('seleccionado');
            console.log(`Filtro por propósito: ${item.textContent.trim()}`);
        });
    });


    // ==========================================
    // 4. RENDERIZADO DE GRÁFICOS (CANVAS HTML5)
    // ==========================================

    // A. Gráfico de Solicitudes por Mes (Línea con Puntos)
    const canvasMes = document.getElementById('grafico-solicitudes-mes');
    if (canvasMes) {
        const ctx = canvasMes.getContext('2d');
        dibujarGraficoTendenciaMes(canvasMes, ctx);
    }

    // B. Gráfico de Plazos (Dona 36 vs 60 meses)
    const canvasPlazos = document.getElementById('grafico-plazos');
    if (canvasPlazos) {
        const ctx = canvasPlazos.getContext('2d');
        dibujarGraficoDonaPlazos(canvasPlazos, ctx);
    }

});


/* ==========================================
   FUNCIONES DE DIBUJO EN CANVAS
   ========================================== */

// Dibuja la tendencia ascendente de solicitudes mensuales
function dibujarGraficoTendenciaMes(canvas, ctx) {
    const ancho = canvas.width = canvas.parentElement.clientWidth;
    const alto = canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, ancho, alto);

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const valores = [2.3, 2.3, 2.6, 2.8, 2.9, 3.2, 3.4, 3.4, 3.5, 3.8, 4.0, 4.3]; // Representación K

    const margenHorizontal = 30;
    const pasoX = (ancho - margenHorizontal * 2) / (meses.length - 1);
    
    // Trazar línea de tendencia
    ctx.beginPath();
    for (let i = 0; i < meses.length; i++) {
        const x = margenHorizontal + i * pasoX;
        const y = alto - (valores[i] / 5.0) * (alto - 40) - 20;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        // Dibujar etiquetas de texto de meses
        ctx.fillStyle = '#a0aec0';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(meses[i], x, alto - 5);
    }

    ctx.strokeStyle = '#4da6ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dibujar puntos blancos en cada mes
    for (let i = 0; i < meses.length; i++) {
        const x = margenHorizontal + i * pasoX;
        const y = alto - (valores[i] / 5.0) * (alto - 40) - 20;

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}

// Dibuja el gráfico de dona de los plazos (27% vs 73%)
function dibujarGraficoDonaPlazos(canvas, ctx) {
    const ancho = canvas.width = canvas.parentElement.clientWidth;
    const alto = canvas.height = canvas.parentElement.clientHeight;
    const centroX = ancho / 2;
    const centroY = alto / 2;
    const radioExterno = Math.min(ancho, alto) / 2 - 10;
    const radioInterno = radioExterno * 0.65;

    ctx.clearRect(0, 0, ancho, alto);

    const porcentaje60 = 0.27; // 27%
    const porcentaje36 = 0.73; // 73%

    const anguloFin36 = porcentaje36 * Math.PI * 2;

    // Segmento 36 Meses (Azul brillante)
    ctx.beginPath();
    ctx.arc(centroX, centroY, radioExterno, 0, anguloFin36);
    ctx.arc(centroX, centroY, radioInterno, anguloFin36, 0, true);
    ctx.closePath();
    ctx.fillStyle = '#4da6ff';
    ctx.fill();

    // Segmento 60 Meses (Naranja)
    ctx.beginPath();
    ctx.arc(centroX, centroY, radioExterno, anguloFin36, Math.PI * 2);
    ctx.arc(centroX, centroY, radioInterno, Math.PI * 2, anguloFin36, true);
    ctx.closePath();
    ctx.fillStyle = '#e67e22';
    ctx.fill();
}