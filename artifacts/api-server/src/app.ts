import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Serve React frontend static files
// In production (Render), frontend/dist is copied to artifacts/api-server/public/
// __dirname is set to the dist/ directory by the esbuild banner
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));

// SPA catch-all: serve index.html for all non-API routes so React Router works
app.get("*", (_req, res) => {
  const indexFile = path.join(publicDir, "index.html");
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
    }
  });
});

export default app;
