// routes/auth.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// Conexión a MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'simove'
});

connection.connect((err) => {
  if (err) console.error('Error MySQL:', err);
});

// LOGIN
router.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({
      success: false,
      message: 'Faltan datos'
    });
  }

  connection.query(
    'SELECT id_usuario, nombre_usuario, rol FROM usuarios WHERE nombre_usuario = ? AND password = ?',
    [nombre_usuario, password],
    (err, results) => {

      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error en la consulta'
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Usuario o contraseña incorrecta'
        });
      }

      const user = results[0];

      // Guardar usuario en sesión
      req.session.user = {
        id_usuario: user.id_usuario,
        nombre_usuario: user.nombre_usuario,
        rol: user.rol
      };

      return res.json({
        success: true,
        user: req.session.user
      });
    }
  );
});


// LOGOUT
router.post('/logout', (req, res) => {

  const usuario = req.session.user;

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión'
      });
    }

    res.json({
      success: true,
      user: usuario
    });
  });
});

module.exports = router;