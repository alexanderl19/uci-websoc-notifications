import { strict as assert } from "assert";
import { serializeError } from "serialize-error";
import * as fs from "fs";
import * as path from "path";
import { Db, MongoClient, MongoClientOptions } from "mongodb";
import { RelayClient, RelayConsumer } from "@signalwire/node";
import { IMessage } from "@signalwire/node/dist/common/src/util/interfaces";
import FormData from "form-data";
import axios from "axios";
import { parseStringPromise } from "xml2js";

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
      context: "notification",
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

  setInterval(async () => {
    const allClassesArray = await mongoDb
      .collection("classes")
      .aggregate([
        {
          $project: {
            _id: 0,
            code: 1,
            status: 1,
          },
        },
      ])
      .toArray();
    const statuses = allClassesArray.reduce((accumulator, currentValue) => {
      accumulator[currentValue.code] = currentValue.status;
      return accumulator;
    }, {});
    const codes = allClassesArray.map((classCode) => classCode.code).join(",");

    let form = new FormData();
    await form.append("YearTerm", "2021-92");
    await form.append("CourseCodes", codes);
    await form.append("Submit", "Display XML Results");

    const res = await axios({
      method: "post",
      url: "https://www.reg.uci.edu/perl/WebSoc",
      headers: {
        ...form.getHeaders(),
        "Content-Length": form.getLengthSync(),
      },
      data: form,
    });
    if (res.status === 200) {
      const course_list = (await parseStringPromise(res.data)).websoc_results
        .course_list;
      for (const course of course_list) {
        for (const school of course.school) {
          for (const department of school.department) {
            for (const course of department.course) {
              for (const section of course.section) {
                let courseCode = section.course_code[0];
                let secStatus = section.sec_status[0];
                await mongoDb.collection("classes").updateOne(
                  { code: courseCode },
                  {
                    $set: {
                      code: courseCode,
                      status: secStatus,
                    },
                  },
                  { upsert: true }
                );
                if (statuses[courseCode] !== secStatus) {
                  const allNumbersArray = await mongoDb
                    .collection("users")
                    .aggregate([
                      {
                        $match: {
                          classes: { $in: [courseCode] },
                        },
                      },
                      {
                        $project: {
                          _id: 0,
                          number: 1,
                        },
                      },
                    ])
                    .toArray();

                  const date = new Date();
                  allNumbersArray.forEach((number) => {
                    client.messaging.send({
                      context: "notification",
                      from: "+16617644377",
                      to: number.number,
                      body: `${courseCode} changed from "${
                        statuses[courseCode]
                      }" to "${secStatus}" at ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}\n\nReply "STOP" to stop receiving all messages.`,
                    });
                  });
                }
              }
            }
          }
        }
      }
    }
  }, 20000);
});
