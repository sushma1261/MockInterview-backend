import { Pool } from "pg";

// const pool = new Pool({
//   host: process.env.POSTGRES_HOST || "localhost",
//   port: Number(process.env.POSTGRES_PORT) || 5432,
//   user: process.env.POSTGRES_USER || "system",
//   password: process.env.POSTGRES_PASSWORD || "password",
//   database: process.env.POSTGRES_DB || "mockinterview",
//   ssl: false,
// });

const getLocalDBPool = () => {
  return new Pool({
    host: "localhost",
    port: 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
};

const getProductionDBPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Render requires SSL
    },
  });
};

export const getDBPool = () => {
  if (process.env.NODE_ENV === "production") {
    return getProductionDBPool();
  }
  return getLocalDBPool();
};

export default getDBPool();
