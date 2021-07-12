import { Command } from "../../command";

const command: Command = {
  name: "stop",
  description: "Stops all messages for your number.",
  async execute(from, args, mongoDb) {
    const filter = { number: from };
    const updateDoc = {
      $set: {
        active: false,
      },
    };
    await mongoDb.collection("users").updateOne(filter, updateDoc);
    return "You have disabled all messages for this number. Please disregard the following message.";
  },
};

module.exports = command;
