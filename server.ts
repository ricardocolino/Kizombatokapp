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

app.use(cors());
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
app.post("/api/upload", upload.single("file"), async (req, res) => {
  console.log("Upload request received:", {
    file: req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'no file',
    body: req.body
  });

  try {
    if (!req.file) {
      console.error("No file in request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!process.env.R2_BUCKET_NAME) {
      console.error("R2_BUCKET_NAME is not defined");
      return res.status(500).json({ error: "Server configuration error: R2_BUCKET_NAME missing" });
    }

    const file = req.file;
    const folder = req.body.folder || "posts";
    const fileName = req.body.fileName || `${Date.now()}-${file.originalname}`;
    const filePath = `${folder}/${fileName}`;

    console.log(`Uploading to R2: ${filePath} in bucket ${process.env.R2_BUCKET_NAME}`);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filePath,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await r2Client.send(command);
    console.log("R2 Upload successful");

    const publicUrl = process.env.R2_PUBLIC_URL 
      ? `${process.env.R2_PUBLIC_URL}/${filePath}`
      : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${filePath}`;

    res.json({ url: publicUrl });
  } catch (error) {
    console.error("R2 Upload Error:", error);
    res.status(500).json({ 
      error: (error as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    code: err.code
  });
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok",
    r2Configured: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT)
  });
});

async function startServer() {
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
