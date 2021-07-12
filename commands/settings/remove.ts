import { Command } from "../../command";

const command: Command = {
  name: "remove",
  description: "Removes a specific class code from your subscriptions.",
  async execute(from, args, mongoDb) {
    if (!args.length) {
      return `Please provide a class code.`;
    }
    const filter = { number: from };
    const updateDoc = {
      $set: {
        active: true,
      },
      $pull: {
        classes: args[0],
      },
    };
    const updateOne = await mongoDb
      .collection("users")
      .updateOne(filter, updateDoc);
    if (updateOne.modifiedCount < 1) {
      return `You are either not subscribed to the class code you provided, ${args[0]}, or it doesn't exist.`;
    } else {
      return `You have unsubscribed from class ${args[0]}.`;
    }
  },
};

module.exports = command;
