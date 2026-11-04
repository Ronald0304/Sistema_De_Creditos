/**
 * ============================================================================
 *  SCRIPT: REINICIAR BASE DE DATOS
 *  Uso:  npm run reiniciar-bd
 *  Elimina el archivo SQLite para que, en el próximo arranque del servidor,
 *  se vuelva a crear el esquema y se carguen los datos de demostración.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');

const base = process.env.RUTA_BD || path.join(__dirname, 'creditos.sqlite');
for (const archivo of [base, `${base}-wal`, `${base}-shm`, `${base}-journal`]) {
  if (fs.existsSync(archivo)) {
    fs.unlinkSync(archivo);
    console.log(`Eliminado: ${path.basename(archivo)}`);
  }
}
console.log('Base de datos reiniciada. Ejecute "npm start" para regenerarla con datos de demostración.');
