import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, getPackageDir, VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commands, createToolkit } from "../scripts/toolkit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default function toolkitExtension(pi: ExtensionAPI) {
  let busy = false;
  pi.registerCommand("toolkit", {
    description: "Gestionar el toolkit compartido: status, add, sync, publish, doctor",
    getArgumentCompletions: (prefix) => {
      const matches = commands.filter((name: string) => name.startsWith(prefix));
      return matches.length ? matches.map((name: string) => ({ value: name, label: name })) : null;
    },
    handler: async (args, ctx) => {
      if (busy) { ctx.ui.notify("Ya hay una operación del toolkit en curso.", "warning"); return; }
      const operation = args.trim().split(/\s+/)[0];
      if (["add", "sync", "publish"].includes(operation) && !ctx.hasUI) {
        ctx.ui.notify("Esta operación necesita una interfaz con confirmación interactiva.", "error");
        return;
      }
      busy = true;
      try {
        await ctx.waitForIdle();
        // Resolve the CLI from the host package, avoiding Windows .cmd shell execution.
        let piCommand;
        try {
          const directory = getPackageDir();
          const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
          const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.pi;
          if (bin) {
            const cli = path.resolve(directory, bin);
            await fs.access(cli);
            piCommand = { command: process.versions.bun ? "node" : process.execPath, args: [cli] };
          }
        } catch { /* Controller reports an actionable error if dependencies need the CLI. */ }
        const handle = createToolkit({
          root,
          agentDir: getAgentDir(),
          piVersion: VERSION,
          piCommand,
          run: (command: string, argv: string[], options: object) => pi.exec(command, argv, options),
          confirm: (title: string, message: string) => ctx.ui.confirm(title, message),
          input: (title: string, placeholder: string) => ctx.ui.input(title, placeholder),
          notify: (message: string) => ctx.ui.notify(message, "info"),
        });
        await handle(args);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "Operación fallida.", "error");
      } finally { busy = false; }
    },
  });
}
