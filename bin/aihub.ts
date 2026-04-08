#!/usr/bin/env node

import { Command } from "commander";
import { registerServerCommand } from "../src/commands/server.js";
import { registerInitCommand } from "../src/commands/init.js";
import { registerChatCommand } from "../src/commands/chat.js";
import { registerMemoryCommand } from "../src/commands/memory.js";
import { registerSessionsCommand } from "../src/commands/sessions.js";
import { registerStatusCommand } from "../src/commands/status.js";
import { registerExportCommand } from "../src/commands/export.js";

const program = new Command();
program
  .name("aihub")
  .description("AI Agent proxy layer — one data source, all agents, everywhere")
  .version("0.2.0");

registerServerCommand(program);
registerInitCommand(program);
registerChatCommand(program);
registerMemoryCommand(program);
registerSessionsCommand(program);
registerStatusCommand(program);
registerExportCommand(program);

program.parse();
