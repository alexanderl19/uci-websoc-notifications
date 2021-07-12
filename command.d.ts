import { Db } from "mongodb";
import { RelayClient } from "@signalwire/node";

export class Command {
  name: string;
  description?: string;
  options?: string[];
  execute: (
    from: string,
    args: string[],
    mongoDb: Db,
    client: RelayClient,
    commands: Map<string, Command>
  ) => Promise<string>;
}
