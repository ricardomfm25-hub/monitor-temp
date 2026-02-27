const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const API_TOKEN = process.env.API_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.get("/", (req, res) => res.send("Servidor ativo!"));

app.post("/api/temperature", async (req, res) => {
  const token = req.headers["authorization"];
  if (!API_TOKEN || token !== API_TOKEN) return res.status(401).json({ error: "Não autorizado" });

  const { device_id, temperature, humidity } = req.body;
  if (!device_id || temperature === undefined || humidity === undefined)
    return res.status(400).json({ error: "Dados inválidos" });

  const { error } = await supabase.from("readings").insert([{ device_id, temperature, humidity }]);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: "OK" });
});

app.listen(PORT, "0.0.0.0", () => console.log("Servidor ativo na porta " + PORT));