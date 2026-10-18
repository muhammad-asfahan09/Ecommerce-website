import express from "express";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { urlencoded } from "express";
import fileUpload from "express-fileupload";
import { createTable } from "./utils/createTable.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authRouter from "./routes/authRoutes.js";

const app = express();

config({ path: "./config/config.env" });

app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
// chech database all table create 
createTable();

// middlewares
app.use(express.json());
app.use(cookieParser());
app.use(errorMiddleware);
app.use(urlencoded({ extended: true }));
app.use(
  fileUpload({
    tempFileDir: "./uploads",
    useTempFiles: true,
  }),
);
// route fix
app.use("/api/v1/auth", authRouter);

export default app;
