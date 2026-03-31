import express from "express";
import cors from "cors";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Supabase Admin for webhook
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

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
    r2Configured: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT),
    realtimeConfigured: !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_REALTIME_APP_ID)
  });
});

// NOWPayments Integration
app.post("/api/payments/create", async (req, res) => {
  const { userId, amount, currency = 'usdttrc20' } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: "Missing userId or amount" });
  }

  try {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error("NOWPayments API Key not configured");
    }

    // Create payment in NOWPayments
    const response = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        pay_currency: currency,
        ipn_callback_url: `https://kizombatok.vercel.app/api/payments/webhook`,
        order_id: `${userId}_${Date.now()}`,
        order_description: `Deposit for user ${userId}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create payment");
    }

    // Save deposit record in Supabase
    const { error: dbError } = await supabaseAdmin
      .from('deposits')
      .insert({
        user_id: userId,
        amount: amount,
        currency: currency,
        payment_id: data.payment_id,
        status: 'waiting'
      });

    if (dbError) {
      console.error(">>> [API] Database Error saving deposit:", dbError);
    }

    res.json({ 
      payment_id: data.payment_id,
      invoice_url: data.invoice_url || `https://nowpayments.io/payment/?iid=${data.payment_id}`,
      pay_address: data.pay_address,
      pay_amount: data.pay_amount
    });
  } catch (error) {
    console.error(">>> [API] NOWPayments Error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// NOWPayments Webhook
app.post("/api/payments/webhook", async (req, res) => {
  const hmac = req.get("x-nowpayments-sig");
  const notificationsKey = process.env.NOWPAYMENTS_IPN_SECRET;

  if (!notificationsKey) {
    console.error(">>> [WEBHOOK] IPN Secret not configured");
    return res.status(500).send("Configuration error");
  }

  // Verify signature
  const sortedData = JSON.stringify(req.body, Object.keys(req.body).sort());
  const checkHmac = crypto
    .createHmac("sha512", notificationsKey)
    .update(sortedData)
    .digest("hex");

  if (hmac !== checkHmac) {
    console.error(">>> [WEBHOOK] Invalid signature");
    return res.status(400).send("Invalid signature");
  }

  const { payment_status, payment_id, price_amount, order_id } = req.body;
  const userId = order_id.split('_')[0];

  console.log(`>>> [WEBHOOK] Payment ${payment_id} status: ${payment_status}`);

  if (payment_status === 'finished') {
    try {
      // 1. Update deposit status
      const { error: updateError } = await supabaseAdmin
        .from('deposits')
        .update({ status: 'finished', updated_at: new Date().toISOString() })
        .eq('payment_id', payment_id);

      if (updateError) throw updateError;

      // 2. Add balance to user profile
      // 1 USD = 100 AngoCoins (based on ProfileView.tsx logic)
      const coinsToAdd = Math.floor(price_amount * 100);

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      const newBalance = (profile.balance || 0) + coinsToAdd;

      const { error: balanceError } = await supabaseAdmin
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (balanceError) throw balanceError;

      console.log(`>>> [WEBHOOK] Balance updated for user ${userId}: +${coinsToAdd} coins`);
    } catch (error) {
      console.error(">>> [WEBHOOK] Error processing finished payment:", error);
      return res.status(500).send("Error processing payment");
    }
  } else if (payment_status === 'failed' || payment_status === 'expired') {
    await supabaseAdmin
      .from('deposits')
      .update({ status: payment_status, updated_at: new Date().toISOString() })
      .eq('payment_id', payment_id);
  }

  res.status(200).send("OK");
});

// Cloudflare RealtimeKit Session Endpoint
app.post("/api/live/session", async (req, res) => {
  const { userId, role } = req.body;

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_REALTIME_APP_ID) {
    return res.status(500).json({ error: "Cloudflare RealtimeKit not configured on server" });
  }

  // IDs dos Presets atualizados
  const PRESET_HOST = "a233aa84-60da-4a2a-a65a-80600e57c0de"; // livestream_host
  const PRESET_VIEWER = "c3765f85-384d-4d57-b3ea-8638889ab9a2"; // livestream_viewer

  try {
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/realtime/apps/${process.env.CLOUDFLARE_REALTIME_APP_ID}/sessions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          external_id: userId,
          preset_id: role === 'host' ? PRESET_HOST : PRESET_VIEWER
        })
      }
    );

    if (!cfResponse.ok) {
      const errorData = await cfResponse.json();
      console.error(">>> [Cloudflare Error Details]:", JSON.stringify(errorData, null, 2));
      throw new Error(errorData.errors?.[0]?.message || "Failed to create Cloudflare session");
    }

    const data = await cfResponse.json();
    res.json(data.result);
  } catch (error) {
    console.error(">>> [API] Cloudflare Realtime Error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
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
  console.log(">>> [SERVER] VITE_API_URL:", process.env.VITE_API_URL || "NOT DEFINED");
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
