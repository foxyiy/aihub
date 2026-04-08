import { startServer } from "../server/index.js";

const port = parseInt(process.argv[2] ?? "8642");
startServer(port);
