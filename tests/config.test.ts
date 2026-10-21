import { describe, expect, it } from "vitest";
import { loadConfig, resolveCorsOrigins, setConfig } from "../backend/src/lib/config";

/**
 * Production must refuse to start with a missing or insecure configuration.
 * These tests manipulate `process.env` and restore it afterwards.
 */
function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    process.env = { ...previous };
  }
}

describe("configuración de arranque", () => {
  it("exige DATABASE_URL y PORT", () => {
    withEnv({ DATABASE_URL: undefined, PORT: undefined, NODE_ENV: "production" }, () => {
      expect(() => loadConfig()).toThrow(/DATABASE_URL/);
    });

    withEnv({ DATABASE_URL: "postgresql://x/y", PORT: undefined, NODE_ENV: "production" }, () => {
      expect(() => loadConfig()).toThrow(/PORT/);
    });
  });

  it("no arranca en producción sin JWT_SECRET", () => {
    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "production",
        JWT_SECRET: undefined,
      },
      () => {
        expect(() => loadConfig()).toThrow(/JWT_SECRET/);
      },
    );
  });

  it("rechaza secretos predeterminados o demasiado cortos en producción", () => {
    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "production",
        JWT_SECRET: "dev-jwt-secret-do-not-use-in-production",
      },
      () => {
        expect(() => loadConfig()).toThrow(/JWT_SECRET/);
      },
    );

    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "production",
        JWT_SECRET: "corto",
      },
      () => {
        expect(() => loadConfig()).toThrow(/32/);
      },
    );
  });

  it("genera un secreto aleatorio en desarrollo cuando falta JWT_SECRET", () => {
    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "development",
        JWT_SECRET: undefined,
      },
      () => {
        const first = loadConfig();
        const second = loadConfig();
        expect(first.jwtSecret).not.toBe("dev-jwt-secret-do-not-use-in-production");
        expect(first.jwtSecret).toHaveLength(64);
        expect(second.jwtSecret).toHaveLength(64);
      },
    );
  });

  it("nunca acepta tokens arbitrarios en producción", () => {
    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "production",
        JWT_SECRET: "a-very-long-and-random-secret-value-for-tests",
        ALLOW_INSECURE_DEV_AUTH: "true",
      },
      () => {
        const config = loadConfig();
        expect(config.allowInsecureDevAuth).toBe(false);
      },
    );
  });

  it("acepta el modo inseguro sólo en desarrollo y de forma explícita", () => {
    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "development",
        JWT_SECRET: "a-very-long-and-random-secret-value-for-tests",
        ALLOW_INSECURE_DEV_AUTH: "true",
      },
      () => {
        expect(loadConfig().allowInsecureDevAuth).toBe(true);
      },
    );

    withEnv(
      {
        DATABASE_URL: "postgresql://x/y",
        PORT: "3000",
        NODE_ENV: "development",
        JWT_SECRET: "a-very-long-and-random-secret-value-for-tests",
        ALLOW_INSECURE_DEV_AUTH: undefined,
      },
      () => {
        expect(loadConfig().allowInsecureDevAuth).toBe(false);
      },
    );
  });

  it("rechaza el comodín CORS en producción", () => {
    withEnv({ CORS_ORIGINS: "*", NODE_ENV: "production" }, () => {
      expect(() => resolveCorsOrigins("production")).toThrow(/CORS_ORIGINS/);
      expect(() => resolveCorsOrigins("production")).toThrow(/comodín/i);
    });
  });

  it("acepta CORS_ORIGIN y CORS_ORIGINS con la misma semántica", () => {
    withEnv({ CORS_ORIGINS: undefined, CORS_ORIGIN: "https://a.example" }, () => {
      expect(resolveCorsOrigins("production")).toEqual(["https://a.example"]);
    });
    withEnv({ CORS_ORIGINS: "https://a.example, https://b.example", CORS_ORIGIN: undefined }, () => {
      expect(resolveCorsOrigins("production")).toEqual(["https://a.example", "https://b.example"]);
    });
  });

  it("restablece la configuración cacheada", () => {
    setConfig(null);
    expect(loadConfig().port).toBeGreaterThan(0);
  });
});
