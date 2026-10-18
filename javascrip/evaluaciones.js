document.addEventListener('DOMContentLoaded', () => {
    const selectSolicitud = document.getElementById('select-evaluar-solicitud');
    const tituloNro = document.getElementById('titulo-solicitud-nro');
    const migaSolicitud = document.getElementById('miga-solicitud-actual');
    const badgeEstado = document.getElementById('badge-estado-sol');
    const subtituloCliente = document.getElementById('subtitulo-cliente-info');
    
    const inputIngresos = document.getElementById('ingresos');
    const inputGastos = document.getElementById('gastos');
    const inputCapacidad = document.getElementById('capacidad_calculada');
    const formEvaluar = document.getElementById('form-evaluar-solicitud');

    let cacheSolicitudesPendientes = [];

    // Calcular capacidad de pago automáticamente (Ingresos - Gastos)
    function calcularCapacidad() {
        const ing = parseFloat(inputIngresos.value) || 0;
        const gas = parseFloat(inputGastos.value) || 0;
        const cap = ing - gas;
        inputCapacidad.value = cap.toFixed(2);
    }

    inputIngresos.addEventListener('input', calcularCapacidad);
    inputGastos.addEventListener('input', calcularCapacidad);

    // 1. Cargar solicitudes pendientes de evaluación
    async function cargarSolicitudesPendientes() {
        try {
            const respuesta = await fetch('/api/solicitudes/evaluaciones/pendientes');
            const solicitudes = await respuesta.json();
            cacheSolicitudesPendientes = solicitudes;

            if (!respuesta.ok || solicitudes.length === 0) {
                selectSolicitud.innerHTML = '<option value="">No hay solicitudes pendientes</option>';
                tituloNro.textContent = 'Evaluar solicitud';
                subtituloCliente.textContent = 'No hay solicitudes para evaluar';
                return;
            }

            selectSolicitud.innerHTML = '';
            solicitudes.forEach((sol, index) => {
                const option = document.createElement('option');
                option.value = sol.id_solicitud;
                option.textContent = `Solicitud #${sol.id_solicitud} - ${sol.cliente_nombre}`;
                selectSolicitud.appendChild(option);
            });

            // Seleccionar y cargar la primera por defecto
            if (solicitudes.length > 0) {
                actualizarVistaSolicitud(solicitudes[0]);
            }

        } catch (error) {
            console.error('Error al cargar pendientes:', error);
            selectSolicitud.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    // Actualizar campos visuales al cambiar de solicitud en el select
    function actualizarVistaSolicitud(sol) {
        tituloNro.textContent = `Evaluar solicitud N° ${sol.id_solicitud}`;
        migaSolicitud.textContent = `Solicitud ${sol.id_solicitud}`;
        badgeEstado.textContent = sol.estado || 'EN_EVALUACION';
        subtituloCliente.textContent = `${sol.cliente_nombre} · Bs ${Number(sol.monto_solicitado).toLocaleString('es-BO', {minimumFractionDigits: 2})} a ${sol.plazo_meses} meses`;
        
        if (sol.ingresos_mensuales) {
            inputIngresos.value = sol.ingresos_mensuales;
            calcularCapacidad();
        }
    }

    selectSolicitud.addEventListener('change', (e) => {
        const idSel = e.target.value;
        const encontrada = cacheSolicitudesPendientes.find(s => s.id_solicitud == idSel);
        if (encontrada) {
            actualizarVistaSolicitud(encontrada);
        }
    });

    // 2. Enviar y guardar evaluación del analista
    formEvaluar.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id_solicitud = selectSolicitud.value;
        if (!id_solicitud) {
            alert('Seleccione una solicitud válida para evaluar.');
            return;
        }

        const resultadoEvaluacionSeleccionado = document.querySelector('input[name="resultado_evaluacion"]:checked').value;

        const evaluacionData = {
            id_solicitud: parseInt(id_solicitud),
            referencia_crediticia: document.getElementById('referencia_crediticia').value.trim(),
            resultado_crediticio: document.getElementById('resultado_crediticio').value,
            ingresos: parseFloat(inputIngresos.value),
            gastos: parseFloat(inputGastos.value),
            nivel_riesgo: document.getElementById('nivel_riesgo').value,
            resultado_evaluacion: resultadoEvaluacionSeleccionado
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

            alert(`¡Evaluación guardada con éxito! La solicitud #${id_solicitud} ha cambiado su estado a: ${resultado.nuevo_estado}`);
            
            // Recargar lista pendiente
            cargarSolicitudesPendientes();

        } catch (error) {
            console.error('Error al guardar evaluación:', error);
            alert('No se pudo conectar con el servidor.');
        }
    });

    // Inicializar
    cargarSolicitudesPendientes();
});