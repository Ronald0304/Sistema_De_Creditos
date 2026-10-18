document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener el ID de la solicitud desde la URL (ej: contrato.html?id=103)
    const urlParams = new URLSearchParams(window.location.search);
    const idSolicitud = urlParams.get('id');

    if (!idSolicitud) {
        alert('No se especificó el ID de la solicitud.');
        return;
    }

    try {
        // 2. Consultar los datos detallados desde el backend
        const respuesta = await fetch(`/api/solicitudes/detalle-evaluacion/${idSolicitud}`);
        if (!respuesta.ok) throw new Error('No se pudo obtener la información de la solicitud.');
        
        const data = await respuesta.json();

        // 3. Rellenar los datos generales en el contrato
        document.getElementById('lbl-nro-contrato').textContent = data.codigo_contrato || `CT-2025-${String(idSolicitud).padStart(4, '0')}`;
        document.getElementById('txt-cliente-nombre').textContent = data.cliente_nombre || 'S/N';
        document.getElementById('txt-cliente-ci').textContent = data.cliente_ci || 'S/N';
        document.getElementById('txt-cliente-tel').textContent = data.cliente_telefono || 'S/N';
        document.getElementById('txt-cliente-dir').textContent = data.direccion || 'La Paz, Bolivia';
        
        const monto = parseFloat(data.monto_solicitado || 0);
        const plazo = parseInt(data.plazo_meses || 12);

        document.getElementById('txt-monto').textContent = monto.toLocaleString('es-BO', { minimumFractionDigits: 2 });
        document.getElementById('txt-destino').textContent = data.destino || 'Capital de trabajo';
        document.getElementById('txt-plazo').textContent = plazo;
        document.getElementById('firma-nombre-cliente').textContent = data.cliente_nombre || 'DEUDOR';

        // 4. Calcular y rellenar el Cronograma de Pagos (Sistema Francés)
        const tasaAnual = 0.12; // 12% Anual
        const tasaMensual = tasaAnual / 12;
        const cuotaFija = monto * (tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);

        let saldo = monto;
        const tbodyCronograma = document.getElementById('tabla-cuerpo-cronograma');
        tbodyCronograma.innerHTML = '';

        let fechaBase = new Date(); // Fecha actual de emisión

        for (let i = 1; i <= plazo; i++) {
            let interes = saldo * tasaMensual;
            let capital = cuotaFija - interes;
            saldo -= capital;

            let fechaVenc = new Date(fechaBase);
            fechaVenc.setMonth(fechaVenc.getMonth() + i);
            let fechaStr = fechaVenc.toISOString().split('T')[0];

            tbodyCronograma.innerHTML += `
                <tr>
                    <td>${i}</td>
                    <td>${fechaStr}</td>
                    <td>${capital.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${interes.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="font-weight: 600; color: #2563eb;">Bs ${cuotaFija.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${(saldo > 0 ? saldo : 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            `;
        }

    } catch (error) {
        console.error('Error al cargar los datos del contrato:', error);
        alert('Ocurrió un error al generar el contrato.');
    }
});