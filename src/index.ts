import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import multer from "multer";
import path from "path";
import interview from "./routes/interview";
import interviewRoutes from "./routes/interviewRoutes";
dotenv.config();

const upload = multer({ dest: "uploads/" });

const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Routes
app.use("/api", interviewRoutes);
app.use("/interview", interview);

app.get("/", (req: Request, res: Response) => {
  res.send("Mock Interview Backend Running 🚀");
});

app.post(
  "/api/interview-video",
  upload.single("file"),
  (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    console.log("Video saved at:", req.file.path);
    // You can now pass file to AI for processing (speech-to-text, analysis, etc.)
    res.json({
      message: "Video uploaded successfully",
      file: req.file,
      path: path.resolve(req.file.path),
    });
  }
);

// // ---- Redis Client ----
// const redisClient = createClient({
//   url: process.env.REDIS_URL || "redis://localhost:6379",
// });

// redisClient.on("error", (err) => console.error("❌ Redis Client Error", err));

// redisClient.connect().catch(console.error);

// // ---- Redis Store ----
// const RedisStore = connectRedis(session);

// // ---- Session Middleware ----
// app.use(
//   session({
//     store: new RedisStore({ client: redisClient }),
//     secret: process.env.SESSION_SECRET || "supersecret", // 🔑 set in .env for production
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       secure: process.env.NODE_ENV === "production", // true if behind https
//       httpOnly: true,
//       maxAge: 1000 * 60 * 60, // 1 hour
//     },
//   })
// );

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
