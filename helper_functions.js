const fs = require("fs");
const client = require("./database");
const { getTalkAction } = require("./ncco_actions");

function initializeUserInfo(userInfo, to, uuid) {
  userInfo[to] = {};
  userInfo[to]["uuid"] = uuid;
  userInfo[to]["mainMenuOptions"] = [
    "To increment speech Rate, press star. To decrement speech Rate, press ash. ",
    "To start reading a new Article, press 1. ",
    "For new Articles, press 2. For Article Categories, press 3. \
     For requesting a Category, press 4. For repeating Current Menu, press 8. \
     To exit from the call, press 9. ",
  ];
  userInfo[to]["articleOptionsText"] = "";
  userInfo[to]["categoryOptionsText"] = "";
  userInfo[to]["articleOptions"] = {};
  userInfo[to]["categoryOptions"] = {};
  userInfo[to]["currentArticle"] = undefined;
  userInfo[to]["currentCategory"] = undefined;
  userInfo[to]["previousArticleNumber"] = undefined;
  userInfo[to]["previousCategoryNumber"] = undefined;
  userInfo[to]["speechRate"] = "medium";
}

function sendResponse(
  userInfo,
  to,
  res,
  inputAction,
  mainText,
  frontText = undefined,
  flag = true
) {
  let ncco = [];
  if (frontText) {
    ncco.push(getTalkAction(userInfo, frontText, to, false));
  }
  ncco.push(getTalkAction(userInfo, mainText, to, flag));
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

async function getNewsArticleOptions(news, userInfo, to, category = undefined) {
  let result = "";
  let articles = [];
  if (category) {
    articles = news["06-February-2022"]["categories"][category][
      "articleList"
    ].slice(
      userInfo[to]["previousArticleNumber"],
      userInfo[to]["previousArticleNumber"] + 5
    );
  } else {
    articles = news["06-February-2022"]["articleList"].slice(
      userInfo[to]["previousArticleNumber"],
      userInfo[to]["previousArticleNumber"] + 5
    );
  }
  userInfo[to]["previousArticleNumber"] += 4;
  userInfo[to]["articleOptionsText"] = "";
  userInfo[to]["articleOptions"] = {};

  let requiredLength = articles.length > 4 ? 4 : articles.length;

  for (let i = 0; i < requiredLength; i++) {
    let articleName = articles[i];
    userInfo[to]["articleOptionsText"] +=
      "For " + articleName + ", press " + (i + 1) + ". ";
    userInfo[to]["articleOptions"][(i + 1).toString()] = articleName;
  }
  if (articles.length > 4) {
    userInfo[to]["articleOptionsText"] += "For next top 4 Articles, press 5. ";
  }
  userInfo[to]["articleOptionsText"] +=
    "For repeating current menu, press 8. For previous menu, press 9.";
  return "succesfully fetched the articles.";
}

async function getNewsCategoryOptions(news, userInfo, to) {
  let categories = news["06-February-2022"]["categoryList"].slice(
    userInfo[to]["previousCategoryNumber"],
    userInfo[to]["previousCategoryNumber"] + 5
  );
  userInfo[to]["previousCategoryNumber"] += 4;
  userInfo[to]["categoryOptionsText"] = "";
  userInfo[to]["categoryOptions"] = {};
  let requiredLength = categories.length > 4 ? 4 : categories.length;
  for (let i = 0; i < requiredLength; i++) {
    let categoryName = categories[i];
    userInfo[to]["categoryOptionsText"] +=
      "For " + categoryName + ", press " + (i + 1) + ". ";
    userInfo[to]["categoryOptions"][(i + 1).toString()] = categoryName;
  }
  if (categories.length > 4) {
    userInfo[to]["categoryOptionsText"] +=
      "For next top 4 Categories, press 5. ";
  }
  userInfo[to]["categoryOptionsText"] +=
    "For repeating current menu, press 8. For previous menu, press 9.";
  return "successfully fetched the categories.";
}

function startTalk(news, vonage, userInfo, to, category = undefined) {
  let filePath = "";
  if (category) {
    filePath =
      news["06-February-2022"]["categories"][category]["articleFilePath"][
        userInfo[to]["currentArticle"]
      ];
  } else {
    filePath =
      news["06-February-2022"]["articleFilePath"][
        userInfo[to]["currentArticle"]
      ];
  }
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.log(err);
    }
    // removing new lines and replacing them with white space. Also retrieving only first 1450 characters.
    let TEXT = data.replace(/\r?\n|\r/g, " ").slice(0, 1300);
    let initialText = `reading ${userInfo[to]["currentArticle"]} Article.<break time='2s' />`;
    let articleContent =
      "<speak><prosody rate='" +
      `${userInfo[to]["speechRate"]}` +
      "'>" +
      `${initialText} ${TEXT}</prosody></speak>`;
    console.log(articleContent);
    vonage.calls.talk.start(
      userInfo[to]["uuid"],
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

function stopTalk(vonage, userInfo, to) {
  vonage.calls.talk.stop(userInfo[to]["uuid"], (err, res) => {
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
  if (categoryName in news["06-February-2022"]["categories"]) {
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
