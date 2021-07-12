import { strict as assert } from "assert";
import { serializeError } from "serialize-error";
import * as fs from "fs";
import * as path from "path";
import { Db, MongoClient, MongoClientOptions } from "mongodb";
import { RelayClient, RelayConsumer } from "@signalwire/node";
import { IMessage } from "@signalwire/node/dist/common/src/util/interfaces";

const commands = new Map();

const baseCommandPath = "./commands";
const commandFolders = fs.readdirSync(baseCommandPath);
for (const folder of commandFolders) {
  const commandFiles = fs
    .readdirSync(path.join(__dirname, baseCommandPath, folder))
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const command = require(path.join(
      __dirname,
      baseCommandPath,
      folder,
      file
    ));
    commands.set(command.name, command);
  }
}

assert.notEqual(process.env.MONGO_URI, undefined);
const mongoOptions: MongoClientOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};
const mongoClient = new MongoClient(process.env.MONGO_URI!, mongoOptions);
let mongoDb: Db;

let client: RelayClient;

const handleIncomingMessage = async (message: IMessage): Promise<string> => {
  if (!message.body)
    return 'Please enter a valid command or send "help" to view all commands.';
  const args = message.body.trim().split(/ +/);
  if (args.length === 0)
    return 'Please enter a valid command or send "help" to view all commands.';

  const commandName = args.shift()!.toLowerCase();
  const command = commands.get(commandName);
  if (!command)
    return 'Please enter a valid command or send "help" to view all commands.';

  try {
    return await command.execute(message.from, args, mongoDb, client, commands);
  } catch (error) {
    const doc = { message: message.body, error: serializeError(error) };
    const errorResult = await mongoDb
      .collection("errors")
      .insertOne(doc)
      .catch((e) => {
        console.error(e);
      });
    let insertedId;
    if (errorResult) {
      insertedId = errorResult.insertedId;
    }
    return `An error occurred while processing your request. Please try again. ${
      insertedId ? `\n\n${insertedId}` : ""
    }`;
  }
};

assert.notEqual(process.env.RELAY_PROJECT, undefined);
assert.notEqual(process.env.RELAY_TOKEN, undefined);
const consumer = new RelayConsumer({
  project: process.env.RELAY_PROJECT!,
  token: process.env.RELAY_TOKEN!,
  contexts: ["notification"],
  ready: async (consumer: RelayConsumer) => {
    // @ts-ignore
    client = consumer.client;
  },
  onIncomingMessage: async (message: IMessage) => {
    const reply = await handleIncomingMessage(message);
    await client.messaging.send({
      context: "error",
      from: "+16617644377",
      to: message.from,
      // @ts-ignore
      body: `${reply}\n\nReply "STOP" to stop receiving all messages.`,
    });
  },
});

mongoClient.connect().then(async (mongoClient) => {
  mongoDb = mongoClient.db(process.env.MONGO_DB);
  await consumer.run();
});
