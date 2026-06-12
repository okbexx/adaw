import { runCommand } from "citty";

export async function runJsonCommand(command, rawArgs) {
  const { result } = await runCommand(command, { rawArgs });
  return result;
}
