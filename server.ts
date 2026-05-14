import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getVertexAI } from "./src/lib/vertex.js"; // Using .js extension for ESM compatibility in some environments, but tsx handles it

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env if needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vertex AI Chat Route
  app.post("/api/chat", async (req, res) => {
    const { prompt, history, systemInstruction, model = "gemini-2.5-flash-lite", stream = false } = req.body;

    try {
      const ai = getVertexAI();

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const genStream = await ai.models.generateContentStream({
          model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction ? [systemInstruction] : undefined,
            temperature: 0.1,
            tools: [{ googleSearch: {} }],
          },
        });

        for await (const chunk of genStream) {
          const chunkText = chunk.text;
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
      } else {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction ? [systemInstruction] : undefined,
            temperature: 0.1,
            tools: [{ googleSearch: {} }],
          },
        });

        const grounding = response.candidates?.[0]?.groundingMetadata;
        const webSources = grounding?.groundingChunks
          ?.filter(c => c.web)
          .map(c => ({
            title: c.web?.title,
            url: c.web?.uri,
          })) || [];

        res.json({
          text: response.text,
          sources: webSources,
          groundingMetadata: grounding
        });
      }
    } catch (error: any) {
      console.error("Vertex AI Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
