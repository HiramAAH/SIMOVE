// server.js
const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// Rutas de autenticación
app.use('/', authRoutes);

// Servir index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});