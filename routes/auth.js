// routes/auth.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// -------------------
// CONEXIÓN DINÁMICA A MYSQL USANDO POOL (Evita ECONNRESET)
// -------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'simove',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Prueba la conexión inicial
pool.getConnection((err, connection) => {
  if (err) {
    console.error('\x1b[31m[ERROR DB]\x1b[0m en auth.js:', err.message);
  } else {
    console.log('\x1b[34m[AUTH]\x1b[0m Pool de conexiones listo para autenticación.');
    connection.release(); // Importante liberar la conexión al pool
  }
});

// SE ELIMINÓ pool.connect() ya que el pool se maneja solo con getConnection

// -------------------
// RUTA: LOGIN
// -------------------
router.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({
      success: false,
      message: 'Faltan datos'
    });
  }

  const query = 'SELECT id_usuario, nombre_usuario, rol FROM usuarios WHERE nombre_usuario = ? AND password = ?';
  
  // El pool gestiona automáticamente la conexión para la consulta
  pool.query(query, [nombre_usuario, password], (err, results) => {
    if (err) {
      console.error('\x1b[31m[ERROR LOGIN]\x1b[0m', err);
      return res.status(500).json({
        success: false,
        message: 'Error en la consulta al servidor'
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario o contraseña incorrecta'
      });
    }

    const user = results[0];

    req.session.user = {
      id_usuario: user.id_usuario,
      nombre_usuario: user.nombre_usuario,
      rol: user.rol
    };

    console.log(`\x1b[32m[LOGIN ÉXITO]\x1b[0m Usuario: ${user.nombre_usuario} (${user.rol})`);

    return res.json({
      success: true,
      user: req.session.user
    });
  });
});

// -------------------
// RUTA: LOGOUT
// -------------------
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'No se pudo cerrar sesión' });
      }
      res.clearCookie('connect.sid');
      return res.json({ success: true, message: 'Sesión cerrada correctamente' });
    });
  } else {
    res.json({ success: true });
  }
});

module.exports = router;