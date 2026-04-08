import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";

export interface ClientConfig {
  serverUrl: string;
}

const CONFIG_PATH = path.join(os.homedir(), ".aihub-client.yaml");
const DEFAULT_CONFIG: ClientConfig = {
  serverUrl: "http://127.0.0.1:8642",
};

export function loadClientConfig(): ClientConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = yaml.load(raw) as Partial<ClientConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveClientConfig(config: ClientConfig): void {
  fs.writeFileSync(CONFIG_PATH, yaml.dump(config), "utf-8");
}
