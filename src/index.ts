import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import multer from "multer";
import chat from "./routes/chat2";
import health from "./routes/health";
import newResume from "./routes/newResume";
import newSearch from "./routes/newSearch";
import resume from "./routes/resume";
import voiceRoutes from "./routes/voiceRoutes";
dotenv.config();

const upload = multer({ dest: "uploads/" });

const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.urlencoded({ extended: true })); // keep for form submissions

// File upload route
app.use("/resume", resume);
app.use("/new/resume", newResume);

// Body parser middleware not for urlencoded forms
app.use(bodyParser.json());

// express.json() for parsing application/json for all the rest of the APIs
app.use(express.json());

// Testing Routes
// app.use("/api", interviewRoutes);
// app.use("/interview", interview);

// Actual Routes
// app.use("/search", search);
app.use("/new/search", newSearch);
app.use("/health", health);

app.use("/voice", voiceRoutes);
app.use("/api", chat);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.send("Mock Interview Backend Running 🚀");
});

// app.post(
//   "/api/interview-video",
//   upload.single("file"),
//   (req: Request, res: Response) => {
//     if (!req.file) return res.status(400).json({ error: "No file uploaded" });

//     console.log("Video saved at:", req.file.path);
//     // You can now pass file to AI for processing (speech-to-text, analysis, etc.)
//     res.json({
//       message: "Video uploaded successfully",
//       file: req.file,
//       path: path.resolve(req.file.path),
//     });
//   }
// );

app.listen(PORT, () => {
  console.log(`Server running on ${process.env.BASE_URL}:${PORT}`);
});
