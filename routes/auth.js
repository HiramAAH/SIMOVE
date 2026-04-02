const express = require('express');
const bcrypt = require('bcrypt');

module.exports = (pool) => {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;

    if (!nombre_usuario || !password) {
      return res.status(400).json({ success: false, message: 'Faltan datos' });
    }

    const query = 'SELECT id_usuario, nombre_usuario, rol, password FROM usuarios WHERE nombre_usuario = ?';
    
    pool.query(query, [nombre_usuario], async (err, results) => {
      if (err) {
        console.error('\x1b[31m[ERROR LOGIN]\x1b[0m', err);
        return res.status(500).json({ success: false, message: 'Error en la consulta al servidor' });
      }

      if (results.length === 0) {
        return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
      }

      const user = results[0];

      // Compara la contraseña encriptada
      const contrasenaValida = await bcrypt.compare(password, user.password);

      if (!contrasenaValida) {
        return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
      }

      req.session.user = {
        id_usuario: user.id_usuario,
        nombre_usuario: user.nombre_usuario,
        rol: user.rol
      };

      console.log(`\x1b[32m[LOGIN ÉXITO]\x1b[0m Usuario: ${user.nombre_usuario} (${user.rol})`);
      return res.json({ success: true, user: req.session.user });
    });
  });

  router.post('/logout', (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        return res.json({ success: true, message: 'Sesión cerrada' });
      });
    } else {
      res.json({ success: true });
    }
  });

  return router;
};