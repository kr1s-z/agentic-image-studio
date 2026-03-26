const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/generate", (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  // TODO: integrate with image generation service
  res.json({ message: "Generation started", prompt });
});

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
