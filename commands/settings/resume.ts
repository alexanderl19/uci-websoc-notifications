import { Command } from "../../command";

const command: Command = {
  name: "resume",
  description: "Resumes all subscriptions for your number.",
  async execute(from, args, mongoDb) {
    const filter = { number: from };
    const updateDoc = {
      $set: {
        active: true,
      },
    };
    await mongoDb.collection("users").updateOne(filter, updateDoc);
    return "You have disabled all messages for this number. Please disregard the following message.";
  },
};

module.exports = command;
