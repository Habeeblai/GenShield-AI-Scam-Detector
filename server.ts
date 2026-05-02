import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import cors from "cors";

// Extend Request type to include multer's file property
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Set up multer for memory storage of images
const upload = multer({ storage: multer.memoryStorage() });

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", aiConfigured: !!apiKey });
});

// AI Analysis API
app.post("/api/analyze", upload.single('image'), async (req: MulterRequest, res: Response) => {
  try {
    if (!genAI) {
      return res.status(500).json({ error: "Gemini API key is not configured on the server." });
    }

    const { prompt, type } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let result;

    if (type === 'image' && req.file) {
      // Handle Image + Text
      result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: req.file.buffer.toString("base64"),
            mimeType: req.file.mimetype
          }
        }
      ]);
    } else {
      // Handle Text only
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();
    res.json({ text });
  } catch (error: any) {
    console.error("AI analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze content" });
  }
});

// RPC Ping Proxy (to bypass CORS during connectivity checks)
app.post("/api/ping-rpc", async (req, res) => {
  try {
    const { rpcUrl } = req.body;
    if (!rpcUrl) return res.status(400).json({ error: "Missing RPC URL" });

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: AbortSignal.timeout(5000)
    } as any);

    if (response.ok) {
      const data = await response.json();
      res.json({ ok: true, data });
    } else {
      res.json({ ok: false, status: response.status });
    }
  } catch (error: any) {
    res.json({ ok: false, error: error.message });
  }
});

// Vite integration
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
}

// Start server if run directly (local development)
if (process.env.NODE_ENV !== "production") {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
