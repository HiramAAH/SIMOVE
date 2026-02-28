const express = require("express");
const path = require("path");
const app = express();

app.get("/", (req, res) => {
  console.log("Entró a la raíz");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(3000, () => {
  console.log("Servidor en puerto 3000");
});