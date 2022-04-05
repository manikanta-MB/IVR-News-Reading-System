require("dotenv").config();
const Vonage = require("@vonage/server-sdk");
const express = require("express");
const morgan = require("morgan");
const { getInputAction, getTalkAction } = require("./ncco_actions");
const { fetchNews } = require("./fetchNews");
const {
  initializeUserInfo,
  sendResponse,
  sendArticleReadingResponse,
  getNewsArticleOptions,
  getNewsCategoryOptions,
  startTalk,
  stopTalk,
  checkCategoryExistency,
} = require("./helper_functions");

const app = express();
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH,
});

app.use(morgan("tiny"));
app.use(express.json());

// Global Variables

let news = {};
let userInfo = {};
let conversationIdToMobileNumber = {};
let remoteUrl = "https://c0b9-160-238-73-53.ngrok.io/";
let mainMenuInputAction = getInputAction(remoteUrl, "main_menu_input");
let mainMenuOptions = [
  "To increment speech Rate, press star. To decrement speech Rate, press ash. ",
  "To start reading a new Article, press 1. ",
  "For new Articles, press 2. For Article Categories, press 3. \
   For requesting a Category, press 4. For repeating Current Menu, press 8. \
   To exit from the call, press 9. ",
];
let articleInput = getInputAction(remoteUrl, "article_input", false, 2);
let categoryInput = getInputAction(remoteUrl, "category_input", false, 2);
let requestCategoryInput = getInputAction(remoteUrl, "request_category", true);
let articleReadingInput = getInputAction(remoteUrl, "article_reading");
let speechRateIncrements = {
  "x-slow": "slow",
  slow: "medium",
  medium: "fast",
  fast: "x-fast",
  "x-fast": "x-fast",
};
let speechRateDecrements = {
  "x-fast": "fast",
  fast: "medium",
  medium: "slow",
  slow: "x-slow",
  "x-slow": "x-slow",
};

// Fetching Latest News
console.log("fetching news ...");
fetchNews(news, __dirname + "\\The Hindu paper.html");
console.log("successfully fetched the news");

/*      Answering to an Inbound Call         */

app.post("/answer", (req, res) => {
  console.log(req.body);
  const userPhoneNumber = req.body.from;
  let ncco = [];
  ncco.push(
    getTalkAction(
      userInfo,
      "This is a news reading system, currently reading 'the Hindu' newspaper.",
      userPhoneNumber,
      false
    )
  );
  if (userInfo.hasOwnProperty(userPhoneNumber)) {
    ncco.push(
      getTalkAction(
        userInfo,
        userInfo[userPhoneNumber]["mainMenuOptions"].join(""),
        userPhoneNumber
      )
    );
  } else {
    ncco.push(
      getTalkAction(userInfo, mainMenuOptions.join(""), userPhoneNumber)
    );
  }
  ncco.push(mainMenuInputAction);
  res.json(ncco);
});

app.post("/event", (req, res) => {
  let body = req.body;
  console.log(body);
  let userPhoneNumber = body.from;
  if (body.status == "answered") {
    conversationIdToMobileNumber[body.conversation_uuid] = userPhoneNumber;
    if (!userInfo.hasOwnProperty(userPhoneNumber)) {
      initializeUserInfo(userInfo, userPhoneNumber, body.uuid);
      console.log("initialized user Info");
    } else {
      userInfo[userPhoneNumber]["uuid"] = body.uuid;
    }
  }
  res.status(200).send("");
});

// Level 1

app.post("/main_menu_input", (req, res) => {
  let responseObject = req.body;
  console.log(responseObject);
  let entered_digit = responseObject.dtmf.digits;
  if (entered_digit == "") {
    let userPhoneNumber =
      conversationIdToMobileNumber[responseObject.conversation_uuid];
    sendResponse(
      userInfo,
      userPhoneNumber,
      res,
      mainMenuInputAction,
      userInfo[userPhoneNumber]["mainMenuOptions"].join(""),
      "Sorry, you have not chosen any option."
    );
  } else {
    let userPhoneNumber = responseObject.from;
    switch (entered_digit) {
      case "1":
        if (!userInfo[userPhoneNumber]["currentArticle"]) {
          userInfo[userPhoneNumber]["currentArticle"] =
            news["09-February-2022"]["articleList"][0];
        }
        userInfo[userPhoneNumber][
          "mainMenuOptions"
        ][1] = `To start reading the ${userInfo[userPhoneNumber]["currentArticle"]} Article again, press 1.`;
        startTalk(
          news,
          vonage,
          userInfo,
          userPhoneNumber,
          userInfo[userPhoneNumber]["currentCategory"]
        );
        sendArticleReadingResponse(res, articleReadingInput);
        break;
      case "2":
        userInfo[userPhoneNumber]["previousArticleNumber"] = 0;
        userInfo[userPhoneNumber]["currentCategory"] = undefined;
        getNewsArticleOptions(news, userInfo, userPhoneNumber).then(
          function (value) {
            sendResponse(
              userInfo,
              userPhoneNumber,
              res,
              articleInput,
              userInfo[userPhoneNumber]["articleOptionsText"]
            );
          },
          function (err) {
            console.log(err);
          }
        );
        break;
      case "3":
        userInfo[userPhoneNumber]["previousCategoryNumber"] = 0;
        getNewsCategoryOptions(news, userInfo, userPhoneNumber).then(
          function (value) {
            sendResponse(
              userInfo,
              userPhoneNumber,
              res,
              categoryInput,
              userInfo[userPhoneNumber]["categoryOptionsText"]
            );
          },
          function (err) {
            console.log(err);
          }
        );
        break;
      case "4":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          requestCategoryInput,
          "speak out the Category Name",
          undefined,
          (flag = false)
        );
        break;
      case "8":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join("")
        );
        break;
      case "9":
        res.json({
          action: "hangup",
        });
        break;
      case "*":
        userInfo[userPhoneNumber]["speechRate"] =
          speechRateIncrements[userInfo[userPhoneNumber]["speechRate"]];
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join(""),
          `Current SpeechRate was set to ${userInfo[userPhoneNumber]["speechRate"]}.`
        );
        break;
      case "#":
        userInfo[userPhoneNumber]["speechRate"] =
          speechRateDecrements[userInfo[userPhoneNumber]["speechRate"]];
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join(""),
          `Current SpeechRate was set to ${userInfo[userPhoneNumber]["speechRate"]}.`
        );
        break;
      default:
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join(""),
          "sorry, you have chosen an invalid option"
        );
        break;
    }
  }
});

// Level 2

app.post("/article_input", (req, res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;
  if (entered_digit == "") {
    let userPhoneNumber =
      conversationIdToMobileNumber[responseObject.conversation_uuid];
    sendResponse(
      userInfo,
      userPhoneNumber,
      res,
      articleInput,
      userInfo[userPhoneNumber]["articleOptionsText"],
      "Sorry, You have not chosen any option."
    );
  } else {
    let userPhoneNumber = responseObject.from;
    switch (entered_digit) {
      case "1":
      case "2":
      case "3":
      case "4":
        if (
          userInfo[userPhoneNumber]["articleOptions"][entered_digit] ==
          undefined
        ) {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            articleInput,
            userInfo[userPhoneNumber]["articleOptionsText"],
            "sorry, you have chosen invalid option."
          );
        } else {
          userInfo[userPhoneNumber]["currentArticle"] =
            userInfo[userPhoneNumber]["articleOptions"][entered_digit];
          userInfo[userPhoneNumber][
            "mainMenuOptions"
          ][1] = `To start reading the ${userInfo[userPhoneNumber]["currentArticle"]} Article again, press 1.`;
          startTalk(
            news,
            vonage,
            userInfo,
            userPhoneNumber,
            userInfo[userPhoneNumber]["currentCategory"]
          );
          sendArticleReadingResponse(res, articleReadingInput);
        }
        break;
      case "5":
        if (
          userInfo[userPhoneNumber]["articleOptionsText"].includes("press 5.")
        ) {
          let categoryName = userInfo[userPhoneNumber]["currentCategory"];
          getNewsArticleOptions(
            news,
            userInfo,
            userPhoneNumber,
            categoryName
          ).then(
            function (value) {
              sendResponse(
                userInfo,
                userPhoneNumber,
                res,
                articleInput,
                userInfo[userPhoneNumber]["articleOptionsText"]
              );
            },
            function (err) {
              console.log(err);
            }
          );
        } else {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            articleInput,
            userInfo[userPhoneNumber]["articleOptionsText"],
            "sorry, you have chosen invalid option."
          );
        }
        break;
      case "8":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          articleInput,
          userInfo[userPhoneNumber]["articleOptionsText"]
        );
        break;
      case "9":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join("")
        );
        break;
      default:
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          articleInput,
          userInfo[userPhoneNumber]["articleOptionsText"],
          "sorry, you have chosen invalid option."
        );
        break;
    }
  }
});

app.post("/article_reading", (req, res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if (entered_digit == "") {
    // let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    sendArticleReadingResponse(res, articleReadingInput);
  } else {
    let userPhoneNumber = responseObject.from;
    switch (entered_digit) {
      case "9":
        stopTalk(vonage, userInfo, userPhoneNumber);
        setTimeout(() => {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            mainMenuInputAction,
            userInfo[userPhoneNumber]["mainMenuOptions"].join("")
          );
        }, 2000);
        break;
      default:
        sendArticleReadingResponse(res, articleReadingInput);
    }
  }
});

app.post("/category_input", (req, res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if (entered_digit == "") {
    let userPhoneNumber =
      conversationIdToMobileNumber[responseObject.conversation_uuid];
    sendResponse(
      userInfo,
      userPhoneNumber,
      res,
      categoryInput,
      userInfo[userPhoneNumber]["categoryOptionsText"],
      "Sorry, you have not chosen any option."
    );
  } else {
    let userPhoneNumber = responseObject.from;
    let ncco = [];
    switch (entered_digit) {
      case "1":
      case "2":
      case "3":
      case "4":
        let categoryName =
          userInfo[userPhoneNumber]["categoryOptions"][entered_digit];
        if (categoryName == undefined) {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            categoryInput,
            userInfo[userPhoneNumber]["categoryOptionsText"],
            "sorry, you have chosen invalid option."
          );
        } else {
          userInfo[userPhoneNumber]["previousArticleNumber"] = 0;
          userInfo[userPhoneNumber]["currentCategory"] = categoryName;
          getNewsArticleOptions(
            news,
            userInfo,
            userPhoneNumber,
            categoryName
          ).then(
            function (value) {
              sendResponse(
                userInfo,
                userPhoneNumber,
                res,
                articleInput,
                userInfo[userPhoneNumber]["articleOptionsText"],
                `you are in ${categoryName} Category. `
              );
            },
            function (err) {
              console.log(err);
            }
          );
        }
        break;
      case "5":
        if (
          userInfo[userPhoneNumber]["categoryOptionsText"].includes("press 5.")
        ) {
          getNewsCategoryOptions(news, userInfo, userPhoneNumber).then(
            function (value) {
              sendResponse(
                userInfo,
                userPhoneNumber,
                res,
                categoryInput,
                userInfo[userPhoneNumber]["categoryOptionsText"]
              );
            },
            function (err) {
              console.log(err);
            }
          );
        } else {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            categoryInput,
            userInfo[userPhoneNumber]["categoryOptionsText"],
            "sorry, you have chosen invalid option."
          );
        }
        break;
      case "8":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          categoryInput,
          userInfo[userPhoneNumber]["categoryOptionsText"]
        );
        break;
      case "9":
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          mainMenuInputAction,
          userInfo[userPhoneNumber]["mainMenuOptions"].join("")
        );
        break;
      default:
        sendResponse(
          userInfo,
          userPhoneNumber,
          res,
          categoryInput,
          userInfo[userPhoneNumber]["categoryOptionsText"],
          "sorry, you have chosen invalid option."
        );
        break;
    }
  }
});

app.post("/request_category", (req, res) => {
  let requestObj = req.body;
  if (requestObj.speech.timeout_reason == "start_timeout") {
    let userPhoneNumber =
      conversationIdToMobileNumber[requestObj.conversation_uuid];
    sendResponse(
      userInfo,
      userPhoneNumber,
      res,
      requestCategoryInput,
      "Sorry, you have not spoken anything.Please Speak out the Category Name",
      undefined,
      (flag = false)
    );
  } else if (
    requestObj.speech.hasOwnProperty("error") ||
    !requestObj.speech.results ||
    requestObj.speech.results.length == 0
  ) {
    let userPhoneNumber =
      conversationIdToMobileNumber[requestObj.conversation_uuid];
    sendResponse(
      userInfo,
      userPhoneNumber,
      res,
      requestCategoryInput,
      "Sorry, we are not able to analyze your voice, please speak out again.",
      undefined,
      (flag = false)
    );
  } else {
    let spokenData = requestObj.speech.results[0].text;
    console.log("requested Category Name ", spokenData);
    let userPhoneNumber = requestObj.from;
    checkCategoryExistency(news, spokenData).then(
      function (categoryName) {
        if (categoryName) {
          userInfo[userPhoneNumber]["previousArticleNumber"] = 0;
          userInfo[userPhoneNumber]["currentCategory"] = categoryName;
          getNewsArticleOptions(
            news,
            userInfo,
            userPhoneNumber,
            categoryName
          ).then(
            function (value) {
              sendResponse(
                userInfo,
                userPhoneNumber,
                res,
                articleInput,
                userInfo[userPhoneNumber]["articleOptionsText"],
                `you are in ${categoryName} Category. `
              );
            },
            function (err) {
              console.log(err);
            }
          );
        } else {
          sendResponse(
            userInfo,
            userPhoneNumber,
            res,
            requestCategoryInput,
            "Sorry, you have requested an invalid category.Please request a valid Category.",
            undefined,
            (flag = false)
          );
        }
      },
      function (err) {
        console.log(err);
      }
    );
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Running on port ${process.env.PORT}`)
);
