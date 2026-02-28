const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'simove'
});

// Datos de prueba
const nombre_usuario = 'Hiram';
const password = '123456';

connection.query(
  'SELECT * FROM usuarios WHERE nombre_usuario = ? AND password = ?',
  [nombre_usuario, password],
  (err, results) => {
    if (err) {
      console.error('Error en la consulta:', err);
    } else if (results.length > 0) {
      console.log('Usuario encontrado. Login exitoso.');
    } else {
      console.log('Usuario no encontrado o contraseña incorrecta.');
    }
    connection.end();
  }
);