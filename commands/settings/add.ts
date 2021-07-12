import { Command } from "../../command";
import axios from "axios";
import FormData from "form-data";
import { parseStringPromise } from "xml2js";

const command: Command = {
  name: "add",
  description: "Adds a specific class code to your subscriptions.",
  async execute(from, args, mongoDb) {
    let form = new FormData();
    await form.append("YearTerm", "2021-92");
    await form.append("CourseCodes", "16406");
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
    let courseCode, secStatus;
    if (res.status === 200) {
      const course = (await parseStringPromise(res.data)).websoc_results
        .course_list[0].school[0].department[0].course[0].section[0];
      courseCode = course.course_code[0];
      secStatus = course.sec_status[0];
    } else {
      return "An error occurred while validating the class code. Please try again.";
    }

    await mongoDb.collection("classes").updateOne(
      { code: courseCode },
      {
        $set: {
          code: courseCode,
        },
      },
      { upsert: true }
    );

    const filter = { number: from };
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        number: from,
        active: true,
      },
      $addToSet: {
        classes: courseCode,
      },
    };
    await mongoDb.collection("users").updateOne(filter, updateDoc, options);
    return `You have subscribed to class ${courseCode}. The current status of the class is "${secStatus}".`;
  },
};

module.exports = command;
