import { runCommand } from "citty";

export async function runJsonCommand(command, rawArgs, data) {
  const { result } = await runCommand(command, { rawArgs, data });
  return result;
}
