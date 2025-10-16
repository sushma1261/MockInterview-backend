import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import multer from "multer";
import newChat from "./routes/chat.route";
import health from "./routes/health";
import newResume from "./routes/newResume";
dotenv.config();

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

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.send("Mock Interview Backend Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on ${process.env.BASE_URL}:${PORT}`);
});
