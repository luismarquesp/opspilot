import path from "node:path";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import type { IOpsStore } from "../models/store.js";

const dbPath = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db");

export const store: IOpsStore = new SqliteOpsStore(dbPath);
