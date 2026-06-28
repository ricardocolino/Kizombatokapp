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

    // Prioritize R2_PUBLIC_URL (custom domain) or Worker URL
    let publicUrl = "";
    if (process.env.R2_PUBLIC_URL) {
      publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${filePath}`;
    } else if (process.env.R2_WORKER_URL) {
      publicUrl = `${process.env.R2_WORKER_URL.replace(/\/$/, '')}/${filePath}`;
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
  console.log(">>> [API] Payment Create Request received:", req.body);
  const { userId, amount, currency = 'usdttrc20' } = req.body;

  if (!userId || !amount) {
    console.error(">>> [API] Payment Error: Missing userId or amount");
    return res.status(400).json({ error: "Missing userId or amount" });
  }

  try {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      console.error(">>> [API] Payment Error: NOWPAYMENTS_API_KEY not configured");
      throw new Error("NOWPayments API Key not configured");
    }

    console.log(">>> [API] Calling NOWPayments API with amount:", amount);
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
        // Usando o URL do projeto atual para o webhook
        ipn_callback_url: `https://ais-pre-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app/api/payments/webhook`,
        order_id: `${userId}_${Date.now()}`,
        order_description: `Deposit for user ${userId}`,
      }),
    });

    const data = await response.json();
    console.log(">>> [API] NOWPayments Response Status:", response.status);
    console.log(">>> [API] NOWPayments Response Data:", data);

    if (!response.ok) {
      console.error(">>> [API] NOWPayments API Error:", data);
      return res.status(response.status).json({ 
        error: data.message || "A API de pagamentos recusou o pedido. Talvez o valor seja demasiado baixo.",
        details: data
      });
    }

    console.log(">>> [API] Saving deposit to Supabase for user:", userId);
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
      // Não falhamos o pedido se apenas o log falhar, mas avisamos
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

// Kursinha Webhook Integration
app.post("/api/payments/kursinha-webhook", async (req, res) => {
  console.log(">>> [KURSINHA WEBHOOK] Received POST request");
  console.log(">>> [KURSINHA WEBHOOK] Headers:", JSON.stringify(req.headers, null, 2));
  console.log(">>> [KURSINHA WEBHOOK] Body:", JSON.stringify(req.body, null, 2));
  console.log(">>> [KURSINHA WEBHOOK] Query:", JSON.stringify(req.query, null, 2));

  try {
    const rawBody = req.body || {};
    const rawQuery = req.query || {};

    // 1. Determine buyer's identifier (email or custom user_id)
    let email = rawBody.email || 
                rawBody.customer_email || 
                rawBody.client_email || 
                rawBody.buyer_email || 
                rawBody.email_cliente || 
                rawBody.cliente_email || 
                rawBody.customer?.email || 
                rawBody.client?.email || 
                rawBody.buyer?.email || 
                rawBody.payload?.email ||
                rawBody.payload?.customer?.email ||
                rawQuery.email;

    let userId = rawBody.user_id || 
                 rawBody.external_id || 
                 rawBody.client_id || 
                 rawBody.order_id || 
                 rawBody.reference || 
                 rawBody.external_reference || 
                 rawBody.customer?.external_id || 
                 rawQuery.user_id || 
                 rawQuery.external_id || 
                 rawQuery.ref;

    // 2. Identify transaction status
    const purchaseStatus = (rawBody.status || rawBody.payment_status || rawBody.event || rawQuery.status || "").toString().toLowerCase();
    
    console.log(`>>> [KURSINHA WEBHOOK] Parsed Info - email: ${email}, userId: ${userId}, status: ${purchaseStatus}`);

    const isPaid = !purchaseStatus || 
                   purchaseStatus.includes("aprov") || 
                   purchaseStatus.includes("pag") || 
                   purchaseStatus.includes("complet") || 
                   purchaseStatus.includes("finish") || 
                   purchaseStatus.includes("success") || 
                   purchaseStatus.includes("ativ") || 
                   purchaseStatus.includes("active") || 
                   purchaseStatus.includes("delivered") || 
                   purchaseStatus === "paid" || 
                   purchaseStatus === "pago" || 
                   purchaseStatus === "paga" || 
                   purchaseStatus === "ok";

    if (!isPaid) {
      console.log(">>> [KURSINHA WEBHOOK] Purchase status is not considered paid. Skipping credit update.");
      return res.status(200).json({ status: "ignored", message: `Status was '${purchaseStatus}', not marked as paid.` });
    }

    // 3. Resolve user ID if we don't have it explicitly (Strictly via e-mail match)
    if (!userId && email) {
      console.log(">>> [KURSINHA WEBHOOK] No explicit user ID, looking up via Supabase Auth Admin API (Email Only)...");
      
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      if (usersError) {
        console.error(">>> [KURSINHA WEBHOOK] Error listing users to match email:", usersError);
      } else {
        const users = usersData?.users || [];
        const cleanEmail = email.trim().toLowerCase();
        const matchedUser = users.find(u => u.email?.trim().toLowerCase() === cleanEmail);

        if (matchedUser) {
          userId = matchedUser.id;
          console.log(`>>> [KURSINHA WEBHOOK] Successfully matched user ID: ${userId} via email auth lookup`);
        } else {
          console.log(">>> [KURSINHA WEBHOOK] Could not match any user with this email");
        }
      }
    }

    if (!userId) {
      console.error(">>> [KURSINHA WEBHOOK] Error: User could not be identified.");
      return res.status(400).json({ 
        error: "User not found", 
        message: "Não foi possível encontrar o utilizador associado a este pagamento no Angochat. Certifica-te de que utilizaste o mesmo e-mail." 
      });
    }

    // 4. Calculate amount of coins to add
    let rawAmount = parseFloat(rawBody.price || rawBody.amount || rawBody.value || rawBody.valor || rawBody.price_cents || rawBody.payload?.price || "1000");
    if (rawBody.price_cents || rawBody.amount_cents) {
      rawAmount = rawAmount / 100;
    }
    
    const currency = (rawBody.currency || rawBody.moeda || rawBody.payload?.currency || 'AOA').toUpperCase();
    
    let coinsToAdd = 0;
    if (currency === 'USD') {
      coinsToAdd = Math.floor(rawAmount * 100);
    } else {
      // 10 AOA = 1 Coin (so 1000 AOA = 100 coins)
      coinsToAdd = Math.floor(rawAmount / 10);
    }

    if (coinsToAdd <= 0) {
      coinsToAdd = 100;
    }

    console.log(`>>> [KURSINHA WEBHOOK] Crediting ${coinsToAdd} coins (Raw: ${rawAmount} ${currency}) for user ${userId}`);

    // 5. Update user balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error(">>> [KURSINHA WEBHOOK] Error fetching profile balance:", profileError);
      throw profileError;
    }

    const currentBalance = profile.balance || 0;
    const newBalance = currentBalance + coinsToAdd;

    const { error: balanceError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (balanceError) {
      console.error(">>> [KURSINHA WEBHOOK] Error updating profile balance:", balanceError);
      throw balanceError;
    }

    // 6. Save deposit tracking record
    const paymentId = (rawBody.transaction_id || rawBody.id || rawBody.tx_id || rawBody.reference || `kurs_${Date.now()}`).toString();
    const { error: dbError } = await supabaseAdmin
      .from('deposits')
      .insert({
        user_id: userId,
        amount: rawAmount,
        currency: currency,
        payment_id: paymentId,
        status: 'finished'
      });

    if (dbError) {
      console.warn(">>> [KURSINHA WEBHOOK] Notice: Could not insert tracking:", dbError.message);
    }

    console.log(`>>> [KURSINHA WEBHOOK] SUCCESS! Added +${coinsToAdd} coins. New balance: ${newBalance}`);
    return res.status(200).json({ 
      status: "success", 
      message: `Sucesso! Foram creditadas ${coinsToAdd} moedas na conta do utilizador.`,
      user_id: userId,
      added_coins: coinsToAdd,
      new_balance: newBalance
    });

  } catch (error) {
    console.error(">>> [KURSINHA WEBHOOK] Internal error processing webhook:", error);
    return res.status(500).json({ error: "Internal server error", details: (error as Error).message });
  }
});

app.get("/api/payments/kursinha-webhook", (req, res) => {
  res.json({
    status: "active",
    message: "O endpoint do webhook Kursinha está ativo e pronto para receber POST requests da plataforma.",
    webhook_url: "https://ais-pre-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app/api/payments/kursinha-webhook"
  });
});

// Beautiful Success Page for Content Delivery after payments (Kursinha)
app.get("/payment-success", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carregamento com Sucesso — Angochat</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;800;900&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .font-display {
      font-family: 'Space Grotesk', sans-serif;
    }
    .glow-purple {
      box-shadow: 0 0 50px -10px rgba(147, 51, 234, 0.4);
    }
  </style>
</head>
<body class="bg-[#030303] text-zinc-100 min-h-screen flex flex-col justify-between items-center relative overflow-hidden px-6 py-12 selection:bg-purple-600/30">
  
  <!-- Subtle cosmic background blobs -->
  <div class="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none"></div>
  <div class="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none"></div>

  <!-- Header -->
  <header class="w-full max-w-md flex justify-center items-center gap-2 z-10">
    <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-black text-[13px] text-white shadow-lg shadow-purple-900/20">
      A
    </div>
    <span class="text-xs font-black uppercase tracking-widest text-zinc-400 font-display">Angochat</span>
  </header>

  <!-- Main Content Card -->
  <main id="main-card" class="w-full max-w-md bg-zinc-950/40 border border-white/5 p-8 rounded-3xl flex flex-col items-center text-center z-10 backdrop-blur-xl glow-purple transform transition-all duration-700 opacity-0 scale-95">
    
    <!-- Animated success icon container -->
    <div class="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mb-6 shadow-inner relative">
      <div class="absolute inset-0 bg-emerald-500/10 rounded-full animate-ping opacity-75 duration-1000"></div>
      <svg class="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>

    <!-- Title -->
    <h1 class="text-2xl font-black uppercase tracking-tight text-white mb-3 font-display">
      Carregamento Efetuado!
    </h1>

    <!-- Dynamic greeting loaded by query variables -->
    <p id="success-greeting" class="text-sm text-zinc-300 font-medium leading-relaxed px-2 mb-6">
      O teu carregamento de Angochat Coins foi efetuado com sucesso!
    </p>

    <!-- Details Box -->
    <div class="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-left space-y-3 mb-8">
      <div class="flex justify-between items-center text-xs">
        <span class="text-zinc-500 font-medium">Produto</span>
        <span class="text-zinc-200 font-semibold font-display">Coins Pack</span>
      </div>
      <div class="flex justify-between items-center text-xs border-t border-white/5 pt-3">
        <span class="text-zinc-500 font-medium font-display">Status do Pagamento</span>
        <span class="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide">Aprovado</span>
      </div>
      <div id="payment-id-container" class="hidden flex justify-between items-center text-xs border-t border-white/5 pt-3">
        <span class="text-zinc-500 font-medium">ID Transação</span>
        <span id="payment-id" class="text-zinc-400 font-mono text-[10px]"></span>
      </div>
    </div>

    <!-- Action Button -->
    <a href="/" class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 px-6 rounded-full text-xs uppercase tracking-widest transition-all shadow-lg shadow-purple-900/30 active:scale-95">
      Voltar para o Angochat
    </a>

  </main>

  <!-- Footer Info -->
  <footer class="w-full max-w-sm text-center z-10 mt-6 md:mt-0">
    <p class="text-[10px] text-zinc-600 font-medium">
      Se tiveres alguma dúvida, contacta o suporte do Angochat.
    </p>
  </footer>

  <script>
    // Reveal animation
    window.addEventListener('DOMContentLoaded', () => {
      const card = document.getElementById('main-card');
      setTimeout(() => {
        card.classList.remove('opacity-0', 'scale-95');
        card.classList.add('opacity-100', 'scale-100');
      }, 100);
    });

    // Extract content parameters
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || params.get('nome') || params.get('customer_name') || params.get('client_name') || '';
    const email = params.get('email') || params.get('customer_email') || params.get('client_email') || '';
    const reference = params.get('reference') || params.get('id') || params.get('transaction_id') || '';

    const greetingEl = document.getElementById('success-greeting');
    if (name) {
      greetingEl.innerHTML = "Olá <strong class='text-purple-400 font-black'>" + decodeURIComponent(name) + "</strong>, o teu carregamento do Angochat foi efetuado com sucesso!";
    } else if (email) {
      greetingEl.innerHTML = "Olá <strong class='text-purple-400 font-black'>" + decodeURIComponent(email) + "</strong>, o teu carregamento do Angochat foi efetuado com sucesso!";
    }

    if (reference) {
      document.getElementById('payment-id-container').classList.remove('hidden');
      document.getElementById('payment-id').innerText = reference;
    }
  </script>
</body>
</html>`);
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
app.all("/api/*all", (req, res) => {
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
    app.get("*all", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
