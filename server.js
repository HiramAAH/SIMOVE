const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const app = express();
const PORT = 3000;

// Middleware para parsear JSON
app.use(express.json());

// Servir archivos estáticos
app.use(express.static("public"));

// Conexión a MySQL
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // tu contraseña de MySQL
  database: "simove",
});

connection.connect((err) => {
  if (err) {
    console.error("Error conectando a MySQL:", err);
  } else {
    console.log("Conexión a MySQL exitosa");
  }
});

// Ruta raíz
app.get("/", (req, res) => {
  console.log("Entró a la raíz");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint de login
app.post("/login", (req, res) => {
  const { nombre_usuario, password } = req.body;

  if (!nombre_usuario || !password) {
    return res.status(400).json({ success: false, message: "Faltan datos" });
  }

  connection.query(
    "SELECT * FROM usuarios WHERE nombre_usuario = ? AND password = ?",
    [nombre_usuario, password],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, message: "Error en la consulta" });
      }

      if (results.length > 0) {
        res.json({ success: true, user: results[0] });
      } else {
        res.status(401).json({ success: false, message: "Usuario o contraseña incorrecta" });
      }
    }
  );
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});