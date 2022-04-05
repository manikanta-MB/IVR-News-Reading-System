const fs = require("fs");
// const client = require("./database");
const { getTalkAction } = require("./ncco_actions");

function initializeUserInfo(userInfo, userPhoneNumber, uuid) {
  userInfo[userPhoneNumber] = {};
  userInfo[userPhoneNumber]["uuid"] = uuid;
  userInfo[userPhoneNumber]["mainMenuOptions"] = [
    "To increment speech Rate, press star. To decrement speech Rate, press ash. ",
    "To start reading a new Article, press 1. ",
    "For new Articles, press 2. For Article Categories, press 3. \
     For requesting a Category, press 4. For repeating Current Menu, press 8. \
     To exit from the call, press 9. ",
  ];
  userInfo[userPhoneNumber]["articleOptionsText"] = "";
  userInfo[userPhoneNumber]["categoryOptionsText"] = "";
  userInfo[userPhoneNumber]["articleOptions"] = {};
  userInfo[userPhoneNumber]["categoryOptions"] = {};
  userInfo[userPhoneNumber]["currentArticle"] = undefined;
  userInfo[userPhoneNumber]["currentCategory"] = undefined;
  userInfo[userPhoneNumber]["previousArticleNumber"] = undefined;
  userInfo[userPhoneNumber]["previousCategoryNumber"] = undefined;
  userInfo[userPhoneNumber]["speechRate"] = "medium";
}

function sendResponse(
  userInfo,
  userPhoneNumber,
  res,
  inputAction,
  mainText,
  frontText = undefined,
  flag = true
) {
  let ncco = [];
  if (frontText) {
    ncco.push(getTalkAction(userInfo, frontText, userPhoneNumber, false));
  }
  ncco.push(getTalkAction(userInfo, mainText, userPhoneNumber, flag));
  ncco.push(inputAction);
  res.json(ncco);
}

function sendArticleReadingResponse(res, articleReadingInput) {
  res.json([
    {
      action: "stream",
      streamUrl: [
        "https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true",
      ],
      loop: 0,
      bargeIn: true,
    },
    articleReadingInput,
  ]);
}

async function getNewsArticleOptions(
  news,
  userInfo,
  userPhoneNumber,
  category = undefined
) {
  let articles = [];
  if (category) {
    articles = news["09-February-2022"]["categories"][category][
      "articleList"
    ].slice(
      userInfo[userPhoneNumber]["previousArticleNumber"],
      userInfo[userPhoneNumber]["previousArticleNumber"] + 5
    );
  } else {
    articles = news["09-February-2022"]["articleList"].slice(
      userInfo[userPhoneNumber]["previousArticleNumber"],
      userInfo[userPhoneNumber]["previousArticleNumber"] + 5
    );
  }
  userInfo[userPhoneNumber]["previousArticleNumber"] += 4;
  userInfo[userPhoneNumber]["articleOptionsText"] = "";
  userInfo[userPhoneNumber]["articleOptions"] = {};

  let requiredLength = articles.length > 4 ? 4 : articles.length;

  for (let i = 0; i < requiredLength; i++) {
    let articleName = articles[i];
    userInfo[userPhoneNumber]["articleOptionsText"] +=
      "For " + articleName + ", press " + (i + 1) + ". ";
    userInfo[userPhoneNumber]["articleOptions"][(i + 1).toString()] =
      articleName;
  }
  if (articles.length > 4) {
    userInfo[userPhoneNumber]["articleOptionsText"] +=
      "For next top 4 Articles, press 5. ";
  }
  userInfo[userPhoneNumber]["articleOptionsText"] +=
    "For repeating current menu, press 8. For previous menu, press 9.";
  return "succesfully fetched the articles.";
}

async function getNewsCategoryOptions(news, userInfo, userPhoneNumber) {
  let categories = news["09-February-2022"]["categoryList"].slice(
    userInfo[userPhoneNumber]["previousCategoryNumber"],
    userInfo[userPhoneNumber]["previousCategoryNumber"] + 5
  );
  userInfo[userPhoneNumber]["previousCategoryNumber"] += 4;
  userInfo[userPhoneNumber]["categoryOptionsText"] = "";
  userInfo[userPhoneNumber]["categoryOptions"] = {};
  let requiredLength = categories.length > 4 ? 4 : categories.length;
  for (let i = 0; i < requiredLength; i++) {
    let categoryName = categories[i];
    userInfo[userPhoneNumber]["categoryOptionsText"] +=
      "For " + categoryName + ", press " + (i + 1) + ". ";
    userInfo[userPhoneNumber]["categoryOptions"][(i + 1).toString()] =
      categoryName;
  }
  if (categories.length > 4) {
    userInfo[userPhoneNumber]["categoryOptionsText"] +=
      "For next top 4 Categories, press 5. ";
  }
  userInfo[userPhoneNumber]["categoryOptionsText"] +=
    "For repeating current menu, press 8. For previous menu, press 9.";
  return "successfully fetched the categories.";
}

function startTalk(
  news,
  vonage,
  userInfo,
  userPhoneNumber,
  category = undefined
) {
  let filePath = "";
  if (category) {
    filePath =
      news["09-February-2022"]["categories"][category]["articleFilePath"][
        userInfo[userPhoneNumber]["currentArticle"]
      ];
  } else {
    filePath =
      news["09-February-2022"]["articleFilePath"][
        userInfo[userPhoneNumber]["currentArticle"]
      ];
  }
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.log(err);
    }
    // removing new lines and replacing them with white space. Also retrieving only first 1450 characters.
    let TEXT = data.replace(/\r?\n|\r/g, " ").slice(0, 1300);
    let initialText = `reading ${userInfo[userPhoneNumber]["currentArticle"]} Article.<break time='2s' />`;
    let articleContent =
      "<speak><prosody rate='" +
      `${userInfo[userPhoneNumber]["speechRate"]}` +
      "'>" +
      `${initialText} ${TEXT}</prosody></speak>`;
    console.log(articleContent);
    console.log("UUID " + userInfo[userPhoneNumber]["uuid"]);
    vonage.calls.talk.start(
      userInfo[userPhoneNumber]["uuid"],
      { text: articleContent, language: "en-IN", level: 1 },
      (err, res) => {
        if (err) {
          console.error(err);
        } else {
          console.log(res);
        }
      }
    );
  });
}

function stopTalk(vonage, userInfo, userPhoneNumber) {
  vonage.calls.talk.stop(userInfo[userPhoneNumber]["uuid"], (err, res) => {
    if (err) {
      console.log(err);
    } else {
      console.log(res);
    }
  });
}

async function checkCategoryExistency(news, requestedCategoryName) {
  // const result = await client.query(`select name,similarity(name,$1) from newspaper_article order by similarity desc limit 1`,[requestedCategoryName]);

  let categoryName = requestedCategoryName.toLowerCase();
  if (categoryName in news["09-February-2022"]["categories"]) {
    return categoryName;
  } else {
    return false;
  }
}

module.exports = {
  initializeUserInfo,
  sendResponse,
  sendArticleReadingResponse,
  getNewsArticleOptions,
  getNewsCategoryOptions,
  startTalk,
  stopTalk,
  checkCategoryExistency,
};
