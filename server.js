const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const API_TOKEN = process.env.API_TOKEN || "0AnbKTm9WAf4KFsvU6qmKHHwYNa8ZY1y";

app.get("/", (req, res) => {
  res.send("Servidor ativo!");
});

app.post("/api/temperature", (req, res) => {
  const token = req.headers["authorization"];

  if (token !== API_TOKEN) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { device_id, temperature, humidity } = req.body;

  if (device_id === undefined || temperature === undefined || humidity === undefined) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  console.log("Device:", device_id, "Temp:", temperature, "Hum:", humidity);
  return res.status(200).json({ message: "OK" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor ativo na porta " + PORT);
});




