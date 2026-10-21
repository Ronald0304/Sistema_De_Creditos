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
    const selectResultadoHistorial = document.getElementById('resultado_crediticio');
    const btnConsultarBuro = document.getElementById('btn-consultar-buro');
    const formEvaluar = document.getElementById('form-evaluar-solicitud');

    let cacheSolicitudesPendientes = [];
    let solicitudSeleccionadaActual = null;
    let datosBuroActual = null;

    // Función para obtener o generar el buró único fijo del cliente desde el backend
    async function obtenerBuroCliente(idSolicitud) {
        try {
            const respuesta = await fetch(`/api/solicitudes/consultar-buro/${idSolicitud}`);
            const data = await respuesta.json();

            if (respuesta.ok) {
                datosBuroActual = data;
                if (inputReferencia) inputReferencia.value = data.ref_historial;
                if (selectResultadoHistorial) selectResultadoHistorial.value = data.resultado_historial;
            }
        } catch (error) {
            console.error('Error al consultar buró:', error);
        }
    }

    // Mostrar pantalla flotante (Modal) con el reporte de buró detallado y fijo
    function mostrarModalBuro() {
        if (!solicitudSeleccionadaActual || !datosBuroActual) return;

        const ref = datosBuroActual.ref_historial;
        const resultado = datosBuroActual.resultado_historial;

        let score = 740;
        let calificacion = "NORMAL";
        let entidades = "Banco Bisa (Bs 4,200 - Al día)";
        let antecedentes = "Ninguno. Sin procesos judiciales.";

        if (resultado === "CON MORA LEVE") {
            score = 590;
            calificacion = "DEFICIENTE";
            entidades = "Banco Sol (Bs 2,100 - Atraso de 20 días)";
            antecedentes = "Retrasos menores registrados en los últimos 6 meses.";
        } else if (resultado === "CON ANTECEDENTES NEGATIVOS") {
            score = 410;
            calificacion = "MALO / CASTIGADO";
            entidades = "Banco Ganadero (Bs 8,500 - En mora de 90+ días)";
            antecedentes = "Operación castigada registrada en central de riesgos.";
        }

        const contenedorReporte = document.getElementById('contenido-reporte-buro');
        if (contenedorReporte) {
            contenedorReporte.innerHTML = `
                <p><strong>Código de Consulta Único:</strong> ${ref}</p>
                <p><strong>Cliente:</strong> ${solicitudSeleccionadaActual.cliente_nombre}</p>
                <p><strong>Fecha de Consulta:</strong> ${new Date().toLocaleString()}</p>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 10px 0;">
                <p><strong>Score Crediticio:</strong> <span style="font-weight: bold; color: ${score > 600 ? '#16a34a' : '#dc2626'};">${score} / 1000 (${calificacion})</span></p>
                <p><strong>Resultado en Buró:</strong> <span style="font-weight: bold; color: #2563eb;">${resultado}</span></p>
                <p><strong>Créditos Vigentes:</strong> ${entidades}</p>
                <p><strong>Antecedentes:</strong> ${antecedentes}</p>
            `;
        }

        const modalBuro = document.getElementById('modal-buro');
        if (modalBuro) modalBuro.style.display = 'flex';
    }

    if (btnConsultarBuro) {
        btnConsultarBuro.addEventListener('click', async () => {
            if (solicitudSeleccionadaActual) {
                await obtenerBuroCliente(solicitudSeleccionadaActual.id_solicitud);
                mostrarModalBuro();
            }
        });
    }

    const cerrarModalBuro = () => {
        const modalBuro = document.getElementById('modal-buro');
        if (modalBuro) modalBuro.style.display = 'none';
    };

    document.getElementById('modal-buro-cerrar-X')?.addEventListener('click', cerrarModalBuro);
    document.getElementById('modal-buro-btn-aceptar')?.addEventListener('click', cerrarModalBuro);

    // Calcular capacidad de pago automáticamente (Ingresos - Gastos)
    function calcularCapacidad() {
        const ing = parseFloat(inputIngresos.value) || 0;
        const gas = parseFloat(inputGastos.value) || 0;
        const cap = ing - gas;
        if (inputCapacidad) inputCapacidad.value = cap.toFixed(2);
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

            if (solicitudes.length > 0) {
                await actualizarVistaSolicitud(solicitudes[0]);
            }

        } catch (error) {
            console.error('Error al cargar pendientes:', error);
            if (selectSolicitud) selectSolicitud.innerHTML = '<option value="">Error de conexión</option>';
        }
    }

    // Actualizar campos visuales al cambiar de solicitud
    async function actualizarVistaSolicitud(sol) {
        solicitudSeleccionadaActual = sol;
        if (tituloNro) tituloNro.textContent = `Evaluar solicitud N° ${sol.id_solicitud}`;
        if (migaSolicitud) migaSolicitud.textContent = `Solicitud ${sol.id_solicitud}`;
        if (badgeEstado) badgeEstado.textContent = sol.estado || 'REGISTRADA';
        if (subtituloCliente) subtituloCliente.textContent = `${sol.cliente_nombre} · Bs ${Number(sol.monto_solicitado).toLocaleString('es-BO', {minimumFractionDigits: 2})} a ${sol.plazo_meses} meses`;
        
        if (sol.ingresos_mensuales && inputIngresos) {
            inputIngresos.value = sol.ingresos_mensuales;
            calcularCapacidad();
        }
        
        // Consultamos y asignamos el buró único fijo de este cliente
        await obtenerBuroCliente(sol.id_solicitud);
    }

    if (selectSolicitud) {
        selectSolicitud.addEventListener('change', async (e) => {
            const idSel = e.target.value;
            const encontrada = cacheSolicitudesPendientes.find(s => s.id_solicitud == idSel);
            if (encontrada) {
                await actualizarVistaSolicitud(encontrada);
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
                ref_historial: inputReferencia.value.trim(),
                resultado_historial: selectResultadoHistorial.value,
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

                alert(`¡Evaluación guardada con éxito (Ref: ${evaluacionData.ref_historial})! La solicitud ha sido derivada al Jefe de Créditos.`);
                
                cargarSolicitudesPendientes();

            } catch (error) {
                console.error('Error al guardar evaluación:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    cargarSolicitudesPendientes();
});