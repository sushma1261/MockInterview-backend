import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import multer from "multer";
import {
    generalLimiter,
    publicLimiter,
    uploadLimiter,
} from "./middleware/rateLimiter";
import newChat from "./routes/chat.route";
import health from "./routes/health";
import historyRoutes from "./routes/history.route";
import newResume from "./routes/newResume";
import recruitmentRoutes from "./routes/recruitment.route";
import sessionsRoutes from "./routes/sessions.route";
import userProfileRoutes from "./routes/userProfile.route";

dotenv.config();

// Initialize Oracle Vault and load secrets before starting server
async function initializeApp() {
  try {
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

// Body parser middleware not for urlencoded forms
app.use(bodyParser.json());

// express.json() for parsing application/json for all the rest of the APIs
app.use(express.json());

// Rate limiters - apply before routes
// Public endpoints get lenient rate limiting
app.use("/health", publicLimiter, health);

// File upload routes get strict upload rate limiting
app.use("/new/resume", uploadLimiter, newResume);

// All /api routes get general rate limiting
app.use("/api", generalLimiter);

// Testing Routes
app.use("/api", newChat);

// User Profile Routes (protected)
app.use("/api/user", userProfileRoutes);

// Session Management Routes (protected)
app.use("/api/sessions", sessionsRoutes);

// Interview History Routes (protected)
app.use("/api/history", historyRoutes);

// Recruitment System Routes (protected - HR/Admin only)
app.use("/api/recruitment", recruitmentRoutes);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.send("Mock Interview Backend Running 🚀");
});

// Start server after initialization
initializeApp()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on ${process.env.BASE_URL}:${PORT}`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(() => {
        console.log("✅ HTTP server closed");
      });

      try {
        // Import cleanup functions
        const { closeDBPool } = await import("./db/pool");
        const { closeRedisConnection } = await import("./config/redis");

        // Close database connections
        await closeDBPool();
        await closeRedisConnection();

        console.log("✅ All connections closed. Exiting gracefully.");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    // Listen for termination signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
  });
