import { Pool } from "pg";

export const pool = new Pool({
    connectionString: "postgres://localhost:5432/learning",
})