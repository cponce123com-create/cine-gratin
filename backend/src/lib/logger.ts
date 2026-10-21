import pino from "pino";
import { getConfig } from "./config";

const isProduction = getConfig().isProduction;

export const logger = pino({
  level: getConfig().logLevel,
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
