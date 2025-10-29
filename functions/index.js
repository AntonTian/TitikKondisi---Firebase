const express = require("express");
const cors = require("cors");
const axios = require("axios");
const SunCalc = require("suncalc");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json()); 

app.get("/", (req, res) => {
  res.send("TitikKondisi API is running!");
});

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

app.get("/rain/:lat/:lon", async (req, res) => {
  const { lat, lon } = req.params;
  try {
    const data = await fetchRainPrediction(lat, lon);
    res.json(data);
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

// --- Rain Prediction (next 6 hours with hourly breakdown) ---
async function fetchRainPrediction(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation&forecast_hours=6&timezone=Asia/Jakarta`;

  const response = await axios.get(url);
  const hourly = response.data.hourly || {};

  const times = hourly.time || [];
  const probs = hourly.precipitation_probability || [];
  const rainAmounts = hourly.precipitation || [];

  if (probs.length === 0) {
    return {
      max_probability: null,
      avg_rain_mm: null,
      prediction: "Data hujan tidak tersedia untuk lokasi ini.",
      hourly_forecast: [],
    };
  }

  const next6Hours = times.slice(0, 6).map((time, i) => ({
    duration: `${i + 1} jam lagi`,
    probability: probs[i],
    precip_mm: rainAmounts[i],
  }));

  const maxProb = Math.max(...probs.slice(0, 6));
  const avgRain = rainAmounts.slice(0, 6).reduce((a, b) => a + b, 0) / 6;

  let prediction;
  if (maxProb < 20) prediction = "Kemungkinan kecil hujan dalam 6 jam ke depan.";
  else if (maxProb < 60) prediction = "Kemungkinan hujan ringan atau sedang.";
  else prediction = "Kemungkinan besar hujan lebat dalam 6 jam ke depan.";

  return {
    max_probability: maxProb,
    avg_rain_mm: Number(avgRain.toFixed(2)),
    prediction,
    hourly_forecast: next6Hours,
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