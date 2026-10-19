document.addEventListener('DOMContentLoaded', () => {
    const selectSolicitud = document.getElementById('select-evaluar-solicitud');
    const tituloNro = document.getElementById('titulo-solicitud-nro');
    const migaSolicitud = document.getElementById('miga-solicitud-actual');
    const badgeEstado = document.getElementById('badge-estado-sol');
    const subtituloCliente = document.getElementById('subtitulo-cliente-info');
    
    const inputIngresos = document.getElementById('ingresos');
    const inputGastos = document.getElementById('gastos');
    const inputCapacidad = document.getElementById('capacidad_calculada');
    const inputReferencia = document.getElementById('referencia_crediticia');
    const formEvaluar = document.getElementById('form-evaluar-solicitud');

    let cacheSolicitudesPendientes = [];

    // Función para generar un código de referencia único simulando la central de riesgos (Ej: R-45871)
    function generarReferenciaAutomatica() {
        if (inputReferencia) {
            const aleatorio = Math.floor(10000 + Math.random() * 90000); // Número aleatorio de 5 dígitos
            inputReferencia.value = `R-${aleatorio}`;
        }
    }

    // Calcular capacidad de pago automáticamente (Ingresos - Gastos)
    function calcularCapacidad() {
        const ing = parseFloat(inputIngresos.value) || 0;
        const gas = parseFloat(inputGastos.value) || 0;
        const cap = ing - gas;
        inputCapacidad.value = cap.toFixed(2);
    }

    if (inputIngresos) inputIngresos.addEventListener('input', calcularCapacidad);
    if (inputGastos) inputGastos.addEventListener('input', calcularCapacidad);

    // 1. Cargar solicitudes pendientes de evaluación
    async function cargarSolicitudesPendientes() {
        try {
            const respuesta = await fetch('/api/solicitudes/evaluaciones/pendientes');
            const solicitudes = await respuesta.json();
            cacheSolicitudesPendientes = solicitudes;

            if (!respuesta.ok || !solicitudes || solicitudes.length === 0) {
                if (selectSolicitud) selectSolicitud.innerHTML = '<option value="">No hay solicitudes pendientes</option>';
                if (tituloNro) tituloNro.textContent = 'Evaluar solicitud';
                if (subtituloCliente) subtituloCliente.textContent = 'No hay solicitudes para evaluar';
                return;
            }

            if (selectSolicitud) {
                selectSolicitud.innerHTML = '';
                solicitudes.forEach((sol) => {
                    const option = document.createElement('option');
                    option.value = sol.id_solicitud;
                    option.textContent = `Solicitud #${sol.id_solicitud} - ${sol.cliente_nombre}`;
                    selectSolicitud.appendChild(option);
                });
            }

            // Seleccionar y cargar la primera por defecto y generar su referencia única
            if (solicitudes.length > 0) {
                actualizarVistaSolicitud(solicitudes[0]);
                generarReferenciaAutomatica();
            }

        } catch (error) {
            console.error('Error al cargar pendientes:', error);
            if (selectSolicitud) selectSolicitud.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    // Actualizar campos visuales al cambiar de solicitud en el select
    function actualizarVistaSolicitud(sol) {
        if (tituloNro) tituloNro.textContent = `Evaluar solicitud N° ${sol.id_solicitud}`;
        if (migaSolicitud) migaSolicitud.textContent = `Solicitud ${sol.id_solicitud}`;
        if (badgeEstado) badgeEstado.textContent = sol.estado || 'REGISTRADA';
        if (subtituloCliente) subtituloCliente.textContent = `${sol.cliente_nombre} · Bs ${Number(sol.monto_solicitado).toLocaleString('es-BO', {minimumFractionDigits: 2})} a ${sol.plazo_meses} meses`;
        
        if (sol.ingresos_mensuales && inputIngresos) {
            inputIngresos.value = sol.ingresos_mensuales;
            calcularCapacidad();
        }
        
        // Generar una referencia única nueva al cambiar de solicitud
        generarReferenciaAutomatica();
    }

    if (selectSolicitud) {
        selectSolicitud.addEventListener('change', (e) => {
            const idSel = e.target.value;
            const encontrada = cacheSolicitudesPendientes.find(s => s.id_solicitud == idSel);
            if (encontrada) {
                actualizarVistaSolicitud(encontrada);
            }
        });
    }

    // 2. Enviar y guardar evaluación del analista
    if (formEvaluar) {
        formEvaluar.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id_solicitud = selectSolicitud.value;
            if (!id_solicitud) {
                alert('Seleccione una solicitud válida para evaluar.');
                return;
            }

            const resultadoSeleccionadoEl = document.querySelector('input[name="resultado_evaluacion"]:checked');
            if (!resultadoSeleccionadoEl) {
                alert('Debe seleccionar si el resultado de la evaluación es FAVORABLE o DESFAVORABLE.');
                return;
            }

            const evaluacionData = {
                id_solicitud: parseInt(id_solicitud),
                referencia_crediticia: inputReferencia ? inputReferencia.value.trim() : 'R-00000',
                resultado_crediticio: document.getElementById('resultado_crediticio').value,
                ingresos: parseFloat(inputIngresos.value) || 0,
                gastos: parseFloat(inputGastos.value) || 0,
                nivel_riesgo: document.getElementById('nivel_riesgo').value,
                resultado_evaluacion: resultadoSeleccionadoEl.value
            };

            try {
                const respuesta = await fetch('/api/solicitudes/evaluaciones', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(evaluacionData)
                });

                const resultado = await respuesta.json();

                if (!respuesta.ok) {
                    alert(resultado.error || 'No se pudo guardar la evaluación');
                    return;
                }

                alert(`¡Evaluación guardada con éxito! La solicitud #${id_solicitud} ha sido enviada a la bandeja del Jefe de Créditos.`);
                
                // Recargar lista pendiente (la solicitud evaluada desaparecerá automáticamente)
                cargarSolicitudesPendientes();

            } catch (error) {
                console.error('Error al guardar evaluación:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    // Inicializar al cargar la página
    cargarSolicitudesPendientes();
});