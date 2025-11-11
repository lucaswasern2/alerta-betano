const fetch = require("node-fetch");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

const TELEGRAM_TOKEN = process.env.ALERTA_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_KEY = process.env.API_FOOTBALL_KEY;

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const SEQUENCE_LENGTH = 6;
const HOURS_BETWEEN_ALERTS = 6;
const LAST_ALERTS_FILE = "./lastAlerts.json";

const COMPETITIONS_TO_MONITOR = [
  "Brasileirao Serie A",
  "Serie A",
  "Euro Championship",
  "Copa America",
  "Copa Libertadores",
  "Leagues Cup"
];

function loadLastAlerts() {
  try {
    if (!fs.existsSync(LAST_ALERTS_FILE)) return {};
    const data = fs.readFileSync(LAST_ALERTS_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Erro ao ler arquivo de alertas:", err);
    return {};
  }
}

function saveLastAlerts(data) {
  try {
    fs.writeFileSync(LAST_ALERTS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Erro ao salvar arquivo de alertas:", err);
  }
}

async function fetchMatchData() {
  const today = new Date();
  const past = new Date();
  past.setMonth(past.getMonth() - 2);
  const from = past.toISOString().split("T")[0];
  const to = today.toISOString().split("T")[0];

  const url = `https://v3.football.api-sports.io/fixtures?from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
    const data = await res.json();
    if (!data.response) return [];

    return data.response
      .map((m) => ({
        competition: m.league.name,
        date: m.fixture.date,
        scoreA: m.goals.home,
        scoreB: m.goals.away
      }))
      .filter((m) =>
        COMPETITIONS_TO_MONITOR.some((c) =>
          m.competition.toLowerCase().includes(c.toLowerCase())
        )
      );
  } catch (err) {
    console.error("Erro ao buscar dados da API:", err);
    return [];
  }
}

function checkSequenceInCompetition(matches, sequenceLength) {
  let count = 0;
  for (const m of matches) {
    const totalGoals = (m.scoreA ?? 0) + (m.scoreB ?? 0);
    if (totalGoals < 2) {
      count++;
      if (count >= sequenceLength) return true;
    } else {
      count = 0;
    }
  }
  return false;
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = { chat_id: TELEGRAM_CHAT_ID, text };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem para o Telegram:", err);
  }
}

async function checkAllCompetitions() {
  console.log("Checando partidas...");
  const allMatches = await fetchMatchData();
  const lastAlerts = loadLastAlerts();

  for (const comp of COMPETITIONS_TO_MONITOR) {
    const matches = allMatches
      .filter((m) => m.competition.toLowerCase().includes(comp.toLowerCase()))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (matches.length === 0) continue;

    const hasSeq = checkSequenceInCompetition(matches, SEQUENCE_LENGTH);
    if (!hasSeq) continue;

    const lastAlertTime = lastAlerts[comp];
    const now = Date.now();

    if (
      lastAlertTime &&
      now - lastAlertTime < HOURS_BETWEEN_ALERTS * 3600 * 1000
    ) {
      console.log(`Já alertado recentemente (${comp}), ignorando...`);
      continue;
    }

    const msg = `🚨 Alerta: ${SEQUENCE_LENGTH} jogos seguidos com menos de 2 gols em ${comp}!`;
    console.log(msg);
    await sendTelegramMessage(msg);

    lastAlerts[comp] = now;
    saveLastAlerts(lastAlerts);
  }
}

(async () => {
  await checkAllCompetitions();
  setInterval(checkAllCompetitions, CHECK_INTERVAL_MS);
})();
// --- Mantém o bot ativo no Render ---
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot ativo e rodando ✅");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor web ativo na porta ${PORT}`));
