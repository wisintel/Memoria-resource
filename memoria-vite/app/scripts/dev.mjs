import { spawn } from "node:child_process";

const commands = [
  ["server", "node", ["server/index.mjs"]],
  ["client", "vite", ["--host", "127.0.0.1"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    env: process.env,
    shell: true,
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      process.exitCode = code;
      shutdown();
    }
  });

  return child;
});

let shuttingDown = false;

function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
