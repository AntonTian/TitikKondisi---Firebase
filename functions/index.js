const express = require("express");
const cors = require("cors");
const axios = require("axios");
const SunCalc = require("suncalc");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json()); 

// --- Weather data function ---
app.get("/weather/:lat/:lon", async (req, res) => {
  const { lat, lon } = req.params;
  try {
    const result = await getConsolidatedData(lat, lon);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/weather", async (req, res) => {
  const { lat, lon } = req.body;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon" });
  }
  try {
    const result = await getConsolidatedData(lat, lon);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Main logic ---
async function getConsolidatedData(lat, lon) {
  const [weather, sun] = await Promise.all([
    fetchWeatherData(lat, lon),
    fetchSunData(lat, lon),
  ]);
  const moon = calculateMoonPhase();
  const indices = calculateIndices(weather);

  return { weather, sun, moon, indices };
}

async function fetchWeatherData(lat, lon) {
  const weatherURL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,cloud_cover,uv_index&timezone=auto`;
  const aqiURL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=european_aqi&timezone=auto`;

  const [weatherResp, aqiResp] = await Promise.all([
    axios.get(weatherURL),
    axios.get(aqiURL),
  ]);

  const w = weatherResp.data.current;
  const aqiData = aqiResp.data.hourly?.european_aqi || [];
  const aqi = aqiData.length > 0 ? aqiData.findLast((val) => val !== null && val !== undefined) : "Data tidak tersedia";

  return {
    temperature: w.temperature_2m,
    precipitation: w.precipitation,
    cloud_cover: w.cloud_cover,
    uv_index: w.uv_index,
    aqi,
  };
}

async function fetchSunData(lat, lon) {
  const now = new Date();
  const times = SunCalc.getTimes(now, parseFloat(lat), parseFloat(lon));
  const fmt = (date) =>
    date.toLocaleTimeString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    });
  return {
    sunrise: fmt(times.sunrise),
    sunset: fmt(times.sunset),
    golden_hour: fmt(times.goldenHourEnd),
  };
}

function calculateMoonPhase() {
  const now = new Date();
  const moonIllum = SunCalc.getMoonIllumination(now);
  const phase = moonIllum.phase;
  let phaseName = "Unknown";
  if (phase < 0.03 || phase > 0.97) phaseName = "Bulan Baru";
  else if (phase < 0.25) phaseName = "Sabit Awal";
  else if (phase < 0.27) phaseName = "Kuartal Pertama";
  else if (phase < 0.50) phaseName = "Cembung Awal";
  else if (phase < 0.53) phaseName = "Bulan Purnama";
  else if (phase < 0.75) phaseName = "Cembung Akhir";
  else if (phase < 0.77) phaseName = "Kuartal Akhir";
  else phaseName = "Sabit Akhir";
  return {
    phase_name: phaseName,
    illumination: Math.round(moonIllum.fraction * 100) / 100,
  };
}

function calculateIndices(weather) {
  let score = 10;
  if (weather.temperature > 33) score -= 3;
  else if (weather.temperature < 18) score -= 2;
  if (weather.precipitation > 1) score -= 4;
  if (weather.uv_index > 8) score -= 2;
  if (weather.aqi > 100) score -= 3;
  if (weather.cloud_cover > 80) score -= 1;
  if (score < 0) score = 0;
  else if (score > 10) score = 10;

  let recommendation = "Tidak disarankan untuk mendaki hari ini.";
  if (score >= 8) recommendation = "Sangat baik untuk mendaki!";
  else if (score >= 5) recommendation = "Cukup baik, tetapi perhatikan cuaca.";
  else if (score >= 3) recommendation = "Kurang disarankan, kondisi tidak ideal.";

  return {
    hiking_index: Math.round(score * 10) / 10,
    hiking_recommendation: recommendation,
  };
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));