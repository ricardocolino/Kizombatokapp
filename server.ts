import express from "express";
import cors from "cors";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Global request logger
app.use((req, _res, next) => {
  console.log(`>>> [GLOBAL LOG] ${req.method} ${req.url}`);
  next();
});

app.use(cors());

// Log all API requests
app.use("/api", (req, _res, next) => {
  console.log(`>>> [API LOG] ${req.method} ${req.url}`);
  next();
});

// Necessário para FFmpeg.wasm (SharedArrayBuffer)
app.use((_req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Cloudflare R2 Configuration
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  }
});

// API routes
app.post(["/api/upload", "/api/upload/"], (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error(">>> [API] Multer Error:", err);
      return res.status(400).json({ error: `Erro no processamento do arquivo: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  console.log(">>> [API] Upload request received after multer");
  console.log(">>> [API] File info:", req.file ? {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'NO FILE');
  console.log(">>> [API] Body info:", req.body);

  try {
    if (!req.file) {
      console.error(">>> [API] Error: No file in request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!process.env.R2_BUCKET_NAME) {
      console.error(">>> [API] Error: R2_BUCKET_NAME is not defined");
      return res.status(500).json({ error: "Server configuration error: R2_BUCKET_NAME missing" });
    }

    const file = req.file;
    const folder = req.body.folder || "posts";
    const fileName = req.body.fileName || `${Date.now()}-${file.originalname}`;
    const filePath = `${folder}/${fileName}`;

    console.log(`>>> [API] Uploading to R2: ${filePath} in bucket ${process.env.R2_BUCKET_NAME}`);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filePath,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await r2Client.send(command);
    console.log(">>> [API] R2 Upload successful:", filePath);

    // Prioritize Worker URL if available (usually for CORS/Proxy)
    let publicUrl = "";
    if (process.env.R2_WORKER_URL) {
      publicUrl = `${process.env.R2_WORKER_URL.replace(/\/$/, '')}/${filePath}`;
    } else if (process.env.R2_PUBLIC_URL) {
      publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${filePath}`;
    } else {
      publicUrl = `${process.env.R2_ENDPOINT?.replace(/\/$/, '')}/${process.env.R2_BUCKET_NAME}/${filePath}`;
    }

    console.log(">>> [API] Returning public URL:", publicUrl);
    res.json({ url: publicUrl });
  } catch (error) {
    console.error(">>> [API] R2 Upload Error:", error);
    res.status(500).json({ 
      error: (error as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok",
    storage: "cloudflare-r2",
    r2Configured: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT)
  });
});

// Fallback for non-existent API routes to avoid returning HTML
app.all("/api/*", (req, res) => {
  console.warn(`>>> [API FALLBACK] Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const error = err as any;
  console.error("Global Error:", error);
  res.status(error.status || 500).json({
    error: error.message || "Internal Server Error",
    code: error.code
  });
});

async function startServer() {
  console.log(">>> [SERVER] Starting server...");
  console.log(">>> [SERVER] NODE_ENV:", process.env.NODE_ENV);
  console.log(">>> [SERVER] R2 Config Check:", {
    endpoint: !!process.env.R2_ENDPOINT,
    bucket: !!process.env.R2_BUCKET_NAME,
    accessKey: !!process.env.R2_ACCESS_KEY_ID,
    secretKey: !!process.env.R2_SECRET_ACCESS_KEY,
    workerUrl: !!process.env.R2_WORKER_URL,
    publicUrl: !!process.env.R2_PUBLIC_URL
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
