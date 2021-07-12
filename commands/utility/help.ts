import { Command } from "../../command";

const command: Command = {
  name: "help",
  description: "Lists all commands or info about a specific command.",
  async execute(from, args, mongoDb, client, commands) {
    const data = [];

    if (!args.length) {
      data.push("Here's a list of all my commands:");
      data.push(
        Array.from(commands.values())
          .map((command) => command.name)
          .join(", ")
      );
      data.push(
        `\nYou can send "help [command name]" to get info on a specific command.`
      );

      return data.join("\n");
    }

    const name = args[0].toLowerCase();
    const command = commands.get(name);

    if (!command) {
      return "The command you entered is not valid.";
    }

    data.push(`Name: ${command.name}`);

    if (command.description) data.push(`Description: ${command.description}`);
    // if (command.usage)
    //   data.push(`Usage: ${command.name} ${command.usage}`);

    return data.join("\n");
  },
};

module.exports = command;
