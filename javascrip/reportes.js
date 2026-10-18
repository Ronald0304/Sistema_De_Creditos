document.addEventListener('DOMContentLoaded', async () => {
    // Cargar datos de usuario en sidebar
    const usuarioGuardado = localStorage.getItem('usuarioLogueado');
    if (usuarioGuardado) {
        try {
            const usuario = JSON.parse(usuarioGuardado);
            document.querySelector('.nombre-usuario').textContent = usuario.nombre || 'Gerente';
            document.querySelector('.rol-usuario').textContent = 'Gerencia General';
            document.querySelector('.avatar-usuario').textContent = 'GR';
        } catch (e) { console.error(e); }
    }

    try {
        const respuesta = await fetch('/api/solicitudes/reportes/gestion?anio=2026');
        const data = await respuesta.json();

        if (!respuesta.ok) throw new Error("Error al obtener reportes");

        // Rellenar métricas generales
        document.getElementById('rep-total-creditos').textContent = data.resumenGeneral.total_creditos;
        document.getElementById('rep-monto-colocado').textContent = `Bs ${Number(data.resumenGeneral.monto_total_colocado).toLocaleString('es-BO', {minimumFractionDigits: 2})}`;
        document.getElementById('rep-vigentes').textContent = data.resumenGeneral.creditos_vigentes;

        // Rellenar tabla mensual
        const tbody = document.getElementById('cuerpo-tabla-reportes');
        tbody.innerHTML = '';

        const mesesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        if (!data.desgloseAnual || data.desgloseAnual.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No hay registros de cuotas para el periodo actual.</td></tr>`;
            return;
        }

        data.desgloseAnual.forEach(item => {
            const indexMes = parseInt(item.mes) - 1;
            const nombreMes = mesesNombres[indexMes] || `Mes ${item.mes}`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${nombreMes}</strong></td>
                    <td>${item.total_cuotas}</td>
                    <td class="monto-moneda">Bs ${Number(item.monto_esperado).toLocaleString('es-BO', {minimumFractionDigits: 2})}</td>
                    <td><span style="color: #10b981; font-weight: 600;">${item.cuotas_pagadas}</span></td>
                    <td><span style="color: #ef4444; font-weight: 600;">${item.cuotas_vencidas}</span></td>
                    <td style="color: #2563eb; font-weight: 600;">Bs ${Number(item.monto_pendiente).toLocaleString('es-BO', {minimumFractionDigits: 2})}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error al cargar los reportes gerenciales:", error);
    }
});