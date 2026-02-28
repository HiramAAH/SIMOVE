// routes/auth.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// Conexión a MySQL (puedes pasarla desde server.js o crear pool)
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'simove'
});

connection.connect((err) => {
  if (err) console.error('Error MySQL:', err);
});

// Endpoint login
router.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password)
    return res.status(400).json({ success: false, message: 'Faltan datos' });

  connection.query(
    'SELECT * FROM usuarios WHERE nombre_usuario = ? AND password = ?',
    [nombre_usuario, password],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Error en la consulta' });

      if (results.length > 0) {
        // Solo devolvemos datos necesarios
        const user = { id_usuario: results[0].id_usuario, nombre_usuario: results[0].nombre_usuario, rol: results[0].rol };
        res.json({ success: true, user });
      } else {
        res.status(401).json({ success: false, message: 'Usuario o contraseña incorrecta' });
      }
    }
  );
});

module.exports = router;