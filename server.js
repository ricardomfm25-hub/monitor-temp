const express = require("express");

const app = express();
const PORT = 3000;

// Middleware para aceitar JSON
app.use(express.json());

console.log("A iniciar servidor...");

// Rota teste
app.get("/", (req, res) => {
    res.send("Servidor ativo!");
});

// 🔐 Token simples para segurança básica
const API_TOKEN = "0AnbKTm9WAf4KFsvU6qmKHHwYNa8ZY1y";

// 📡 Rota para receber temperatura do ESP32
app.post("/api/temperature", (req, res) => {

    const token = req.headers["authorization"];
   
        
    // Verificação simples de segurança
    if (token !== API_TOKEN) {
console.log("Token recebido:", token);
        return res.status(401).json({ error: "Não autorizado" });
    }

    const { temperature, humidity } = req.body;

    if (temperature === undefined || humidity === undefined) {
        return res.status(400).json({ error: "Dados inválidos" });
    }

    console.log("🌡 Temperatura:", temperature);
    console.log("💧 Humidade:", humidity);
    console.log("--------------------------");

    res.status(200).json({ message: "Dados recebidos com sucesso" });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor ativo na rede em http://localhost:" + PORT);
});