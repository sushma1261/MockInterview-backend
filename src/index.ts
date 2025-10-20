import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import multer from "multer";
import { vaultService } from "./config/OracleVaultService";
import newChat from "./routes/chat.route";
import health from "./routes/health";
import historyRoutes from "./routes/history.route";
import newResume from "./routes/newResume";
import sessionsRoutes from "./routes/sessions.route";
import userProfileRoutes from "./routes/userProfile.route";

dotenv.config();

// Initialize Oracle Vault and load secrets before starting server
async function initializeApp() {
  try {
    // Initialize vault service
    await vaultService.initialize();

    // Load secrets from vault (if configured)
    await vaultService.loadSecrets();

    console.log("✅ Application initialization complete");
  } catch (error) {
    console.error("⚠️  Application initialization had issues:", error);
    console.log("⚠️  Continuing with environment variables...");
  }
}

const upload = multer({ dest: "uploads/" });

const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.urlencoded({ extended: true })); // keep for form submissions

// File upload route
app.use("/new/resume", newResume);

// Body parser middleware not for urlencoded forms
app.use(bodyParser.json());

// express.json() for parsing application/json for all the rest of the APIs
app.use(express.json());

// Testing Routes
app.use("/health", health);
app.use("/api", newChat);

// User Profile Routes (protected)
app.use("/api/user", userProfileRoutes);

// Session Management Routes (protected)
app.use("/api/sessions", sessionsRoutes);

// Interview History Routes (protected)
app.use("/api/history", historyRoutes);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.send("Mock Interview Backend Running 🚀");
});

// Start server after initialization
initializeApp()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on ${process.env.BASE_URL}:${PORT}`);
      console.log(`Vault service ready: ${vaultService.isReady()}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
  });
