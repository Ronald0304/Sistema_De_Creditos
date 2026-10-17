import React from 'react';
import ReactDOM from 'react-dom/client';
import LoginCrediManager from './login2.jsx';

// Busca la sección del formulario en el HTML
const contenedor = document.getElementById('raiz-formulario-react');

if (contenedor) {
    const root = ReactDOM.createRoot(contenedor);
    root.render(
        <React.StrictMode>
            <LoginCrediManager />
        </React.StrictMode>
    );
}