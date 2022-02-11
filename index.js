require('dotenv').config();
const path = require('path')
const fs = require('fs');
const Vonage = require('@vonage/server-sdk');
const express = require('express');
const morgan = require('morgan');
const client = require("./database");

const app = express();
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH
});

app.use(morgan('tiny'));
app.use(express.json());


// Helper Functions


function getTalkAction(textToTalk,to,needBargeIn=true){
  let speechRate = 'medium'
  if(userInfo.hasOwnProperty(to)){
    speechRate = userInfo[to]["speechRate"]
  }
  let talkAction = {
    "action": "talk",
    "text": "<speak><prosody rate='"+`${speechRate}`+"'>"+`${textToTalk}</prosody></speak>`,
    "bargeIn":needBargeIn,
    "language":"en-IN",
    "style":4,
    "level":1
  }
  return talkAction
}

function getInputAction(eventEndpoint,speechInput = false,maxDigits=1){
  if(speechInput){
    let inputAction = {
      "action":"input",
      "eventUrl": [
        remoteUrl+eventEndpoint
      ],
      "type": ["speech"],
      "speech": {
        "language": "en-IN"
      }
    }
    return inputAction
  }
  else{
    let inputAction = {
      "action": "input",
      "eventUrl": [
        remoteUrl+eventEndpoint
      ],
      "type": ["dtmf"],   
      "dtmf": {
        "maxDigits": maxDigits
      }  
    }
    return inputAction
  }
}

async function getNewsArticleOptions(to,category=undefined){
  let result = ""
  if(category){
    result = await client.query(`select * from newspaper_article where category_id = 
    (select id from newspaper_category where name=$1) OFFSET ${userInfo[to]["previousArticleNumber"]} ROWS FETCH FIRST 5 ROWS ONLY`,
    [category]
    )
  }
  else{
    result = await client.query(`select * from newspaper_article OFFSET ${userInfo[to]["previousArticleNumber"]} ROWS FETCH FIRST 5 ROWS ONLY `);
  }
  userInfo[to]["previousArticleNumber"] += 4
  userInfo[to]["articleOptionsText"] = ""
  userInfo[to]["articleOptions"] = {}
  let rows = result.rows.slice(0,4)
  for(let i=0; i < rows.length; i++){
    let article = rows[i];
    userInfo[to]["articleOptionsText"] += "To select "+article.name+", press "+(i+1)+". ";
    userInfo[to]["articleOptions"][(i+1).toString()] = article.name;
  }
  if(result.rows.length > 4){
    userInfo[to]["articleOptionsText"] += "To list next top 4 Articles, press 5. "
  }
  userInfo[to]["articleOptionsText"] += "To repeat current menu, press 8. To go to previous menu, press 9."
  return "succesfully fetched the articles.";
}

async function getNewsCategoryOptions(to){
  const result = await client.query(`select * from newspaper_category OFFSET ${userInfo[to]["previousCategoryNumber"]} ROWS FETCH FIRST 5 ROWS ONLY`);
  userInfo[to]["previousCategoryNumber"] += 4
  userInfo[to]["categoryOptionsText"] = ""
  userInfo[to]["categoryOptions"] = {}
  let rows = result.rows.slice(0,4)
  for(let i=0; i < rows.length; i++){
    let category = rows[i];
    userInfo[to]["categoryOptionsText"] += "To select " + category.name + ", press "+(i+1)+". ";
    userInfo[to]["categoryOptions"][(i+1).toString()] = category.name;
  }
  if(result.rows.length > 4){
    userInfo[to]["categoryOptionsText"] += "To list next top 4 Categories, press 5. "
  }
  userInfo[to]["categoryOptionsText"] += "To repeat current menu, press 8. To go to previous menu, press 9."
  return "successfully fetched the categories.";
}


function startTalk(to){
  client.query(`select * from newspaper_article where name = $1 limit 1`,[userInfo[to]["currentArticle"]],(err,result) => {
      if(err){
        console.log(err);
      }
      else{
          let contentPath = result.rows[0].content_path;
          fs.readFile(__dirname + "/Articles/" + contentPath,'utf8',(err,data) => {
              if(err){
                  console.log(err);
              }
              // removing new lines and replacing them with white space. Also retrieving only first 1450 characters.
              let TEXT = data.replace(/\r?\n|\r/g," ").slice(0,1450);
              let articleContent = "<speak><prosody rate='"+`${userInfo[to]["speechRate"]}`+"'>"+`${TEXT}</prosody></speak>`
              console.log(articleContent);
              vonage.calls.talk.start(userInfo[to]["uuid"], { text: articleContent, language:"en-IN", level:1 }, (err, res) => {
                if(err) { console.error(err); }
                else {
                    console.log(res);
                }
              });

          });
      }
  });
}

function stopTalk(to){
  vonage.calls.talk.stop(userInfo[to]["uuid"], (err, res) => {
    if(err) { console.log(err); }
    else {
        console.log(res);
    }
  });
}

async function checkArticleExistency(to,requestedArticleName){
  const result = await client.query(`select name,similarity(name,$1) from newspaper_article order by similarity desc limit 1`,[requestedArticleName]);
  if((result.rows.length > 0) && (result.rows[0].similarity > 0.2)){
    userInfo[to]["currentArticle"] = result.rows[0].name
    return true
  }
  else{
    return false
  }
}

// Global Variables

let userInfo = {}
let conversationIdToMobileNumber = {}
let remoteUrl = "https://1d99-182-74-35-130.ngrok.io/"
let mainMenuInputAction = getInputAction("main_menu_input")
let mainMenuOptions = "To List new Articles, press 2. To List Article Categories, press 3.\
                      To Request a new Article, press 4. To Repeat Current Menu, press 8.\
                      To exit from this menu, press 9. To increment speech Rate, press star.\
                      To decrement speech Rate, press ash."
let articleInput = getInputAction("article_input",false,2)
let categoryInput = getInputAction("category_input",false,2)
let requestArticleInput = getInputAction("request_article",true)
let articleReadingInput = getInputAction("article_reading")
let confirmRequestedArticleInput = getInputAction("confirm_request_article")
let speechRateIncrements = {
  "x-slow":"slow",
  "slow":"medium",
  "medium":"fast",
  "fast":"x-fast",
  "x-fast":"x-fast"
}
let speechRateDecrements = {
  "x-fast":"fast",
  "fast":"medium",
  "medium":"slow",
  "slow":"x-slow",
  "x-slow":"x-slow"
}

app.get('/call', (req, res) => {
  let ncco = []
  let to = req.query.to || process.env.TO_NUMBER
  ncco.push(getTalkAction("Hello, Welcome to IVR News Reading System. ",to));
  if(userInfo.hasOwnProperty(to)){
    if(userInfo[to]["currentArticle"]){
      ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
    }
    else{
      ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
    }
  }
  else{
    ncco.push(getTalkAction("To start reading a new Article, press 1.",to))
  }
  ncco.push(getTalkAction(mainMenuOptions,to))
  ncco.push(mainMenuInputAction)
  vonage.calls.create({
    to: [{
      type: 'phone',
      number: req.query.to || process.env.TO_NUMBER
    }],
    from: {
      type: 'phone',
      number: process.env.VONAGE_NUMBER,
    },
    ncco: ncco
  }, (err, resp) => {
    if (err)
      console.error(err);
    if (resp)
      console.log(resp);
  });
  res.send('<h1>Call was made</h1>');
});

app.post('/event', (req, res) => {
  let body = req.body;
  console.log(body);
  let to = body.to;
  if(body.status == 'answered'){
    conversationIdToMobileNumber[body.conversation_uuid] = to;
    if(!userInfo.hasOwnProperty(to)){
      userInfo[to] = {}
      userInfo[to]["uuid"] = body.uuid
      userInfo[to]["articleOptionsText"] = ""
      userInfo[to]["categoryOptionsText"] = ""
      userInfo[to]["articleOptions"] = {}
      userInfo[to]["categoryOptions"] = {}
      userInfo[to]["currentArticle"] = undefined
      userInfo[to]["previousArticleNumber"] = undefined
      userInfo[to]["previousCategoryNumber"] = undefined
      userInfo[to]["speechRate"] = "medium"
    }
    else{
      userInfo[to]["uuid"] = body.uuid
    }
  }
  res.status(200).send('');
});

// Level 1

app.post('/main_menu_input',(req,res) => {
  let responseObject = req.body;
  console.log(responseObject);
  let entered_digit = responseObject.dtmf.digits;
  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    let ncco = []
    ncco.push(getTalkAction("Sorry, you have not chosen any option.",to))
    if(userInfo[to]["currentArticle"]){
      ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
    }
    else{
      ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
    }
    ncco.push(getTalkAction(mainMenuOptions,to));
    ncco.push(mainMenuInputAction);
    res.json(ncco);
  }
  else{
    let to = responseObject.to;
    let ncco = []
    switch (entered_digit){
      case "1":
        if(!userInfo[to]["currentArticle"]){
          userInfo[to]["currentArticle"] = "Haryana cabinet nod for anti-conversion bill"
        }
        startTalk(to);
        res.json([
          {
            "action":"stream",
            "streamUrl": ["https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true"],
            "loop":0,
            "bargeIn":true
          },
          articleReadingInput
        ]);
        break;
      case "2":
        userInfo[to]["previousArticleNumber"] = 0
        getNewsArticleOptions(to).then(
          function(value){
            ncco.push(getTalkAction(userInfo[to]["articleOptionsText"],to))
            ncco.push(articleInput)
            res.json(ncco);
          },
          function(err){
            console.log(err);
          }
        );
        break;
      case "3":
        userInfo[to]["previousCategoryNumber"] = 0
        getNewsCategoryOptions(to).then(
          function(value){
            ncco.push(getTalkAction(userInfo[to]["categoryOptionsText"],to))
            ncco.push(categoryInput)
            res.json(ncco);
          },
          function(err){
            console.log(err);
          }
        );
        break;
      case "4":
        res.json([
          getTalkAction("please speak out the article name",to,false),
          requestArticleInput
      ]);
        break;
      case "8":
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
        break;
      case "9":
        res.json({
          action:"hangup"
        });
        break;
      case "*":
        userInfo[to]["speechRate"] = speechRateIncrements[userInfo[to]["speechRate"]];
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
        break;
      case "#":
        userInfo[to]["speechRate"] = speechRateDecrements[userInfo[to]["speechRate"]];
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
        break;
      default:
        ncco.push(getTalkAction("sorry, you have chosen an invalid option",to))
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
    }
  }
});

// Level 2

app.post('/article_input',(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;
  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      getTalkAction("Sorry, You have not chosen any option.",to),
      getTalkAction(userInfo[to]["articleOptionsText"],to),
      articleInput
    ]);
  }
  else{
    let to = responseObject.to;
    let ncco = []
    switch(entered_digit){
      case "1":
      case "2":
      case "3":
      case "4":
        if(userInfo[to]["articleOptions"][entered_digit] == undefined){
          res.json([
            getTalkAction("sorry, you have chosen invalid option.",to),
            getTalkAction(userInfo[to]["articleOptionsText"],to),
            articleInput
          ]);
        }
        else{
          userInfo[to]["currentArticle"] = userInfo[to]["articleOptions"][entered_digit];
          startTalk(to);
          res.json([
            {
              "action":"stream",
              "streamUrl": ["https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true"],
              "loop":0,
              "bargeIn":true
            },
            articleReadingInput
          ]);
        }
        break;
      case "5":
        if(userInfo[to]["articleOptionsText"].includes("press 5.")){
          getNewsArticleOptions(to).then(
            function(value){
              ncco.push(getTalkAction(userInfo[to]["articleOptionsText"],to))
              ncco.push(articleInput)
              res.json(ncco);
            },
            function(err){
              console.log(err);
            }
          );
        }
        else{
          res.json([
            getTalkAction("sorry, you have chosen invalid option.",to),
            getTalkAction(userInfo[to]["articleOptionsText"],to),
            articleInput
          ]);
        }
        break;
      case "8":
        res.json([
          getTalkAction(userInfo[to]["articleOptionsText"],to),
          articleInput
        ]);
        break;
      case "9":
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
        break;
      default:
        res.json([
          getTalkAction("sorry, you have chosen invalid option.",to),
          getTalkAction(userInfo[to]["articleOptionsText"],to),
          articleInput
        ]);
        break;
    }
  }
});

app.post("/article_reading",(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      {
        "action":"stream",
        "streamUrl": ["https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true"],
        "loop":0,
        "bargeIn":true
      },
      articleReadingInput
    ]);
  }
  else{
    let to = responseObject.to;
    let ncco = []
    switch(entered_digit){
      case "9":
        stopTalk(to);
        setTimeout(() => {
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
          ncco.push(getTalkAction(mainMenuOptions,to));
          ncco.push(mainMenuInputAction);
          res.json(ncco);
        },2000);
        break;
      default:
        res.json([
          {
            "action":"stream",
            "streamUrl": ["https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true"],
            "loop":0,
            "bargeIn":true
          },
          articleReadingInput
        ]);
    }
  }
});

app.post('/category_input',(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      getTalkAction("Sorry, you have not chosen any option.",to),
      getTalkAction(userInfo[to]["categoryOptionsText"],to),
      categoryInput
    ]);
  }
  else{
    let to = responseObject.to;
    let ncco = []
    switch(entered_digit){
      case "1":
      case "2":
      case "3":
      case "4":
        let categoryName = userInfo[to]["categoryOptions"][entered_digit];
        if(categoryName == undefined){
          res.json([
            getTalkAction("sorry, you have chosen invalid option.",to),
            getTalkAction(userInfo[to]["categoryOptionsText"],to),
            categoryInput
          ]);
        }
        else{
          userInfo[to]["previousArticleNumber"] = 0
          getNewsArticleOptions(to,categoryName).then(
            function(value){
              ncco.push(getTalkAction(userInfo[to]["articleOptionsText"],to))
              ncco.push(articleInput)
              res.json(ncco);
            },
            function(err){
              console.log(err);
            }
          );
        }
        break;
      case "5":
        if(userInfo[to]["categoryOptionsText"].includes("press 5.")){
          getNewsCategoryOptions(to).then(
            function(value){
              ncco.push(getTalkAction(userInfo[to]["categoryOptionsText"],to))
              ncco.push(categoryInput)
              res.json(ncco);
            },
            function(err){
              console.log(err);
            }
          );
        }
        else{
          res.json([
            getTalkAction("sorry, you have chosen invalid option.",to),
            getTalkAction(userInfo[to]["categoryOptionsText"],to),
            categoryInput
          ]);
        }
        break;
      case "8":
        res.json([
          getTalkAction(userInfo[to]["categoryOptionsText"],to),
          categoryInput
        ]);
        break;
      case "9":
        if(userInfo[to]["currentArticle"]){
          ncco.push(getTalkAction("To start reading "+userInfo[to]["currentArticle"]+" Article again, press 1.",to));
        }
        else{
          ncco.push(getTalkAction("To start reading a new Article, press 1.",to));
        }
        ncco.push(getTalkAction(mainMenuOptions,to));
        ncco.push(mainMenuInputAction);
        res.json(ncco);
        break;
      default:
        res.json([
          getTalkAction("sorry, you have chosen invalid option.",to),
          getTalkAction(userInfo[to]["categoryOptionsText"],to),
          categoryInput
        ]);
        break;
    }
  }
});

app.post("/request_article", (req,res) => {
  let requestObj = req.body;
  if(requestObj.speech.timeout_reason == 'start_timeout'){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      getTalkAction("Sorry, you have not spoken anything.",to,false),
      getTalkAction("please speak out the article name",to,false),
      requestArticleInput
    ]);
  }
  else if(requestObj.speech.hasOwnProperty("error") || !requestObj.speech.results || (requestObj.speech.results.length == 0)){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      getTalkAction("Sorry, we are not able to analyze your voice, please speak out again.",to,false),
      requestArticleInput
    ]);
  }
  else{
    let spokenData = requestObj.speech.results[0].text
    console.log("requested Article Name ",spokenData);
    let to = requestObj.to
    checkArticleExistency(to,spokenData).then(function(isArticleExist){
      if(isArticleExist){
        startTalk(to);
        res.json([
          {
            "action":"stream",
            "streamUrl": ["https://github.com/manikanta-MB/IVR-Audio-Recordings/blob/main/silence.mp3?raw=true"],
            "loop":0,
            "bargeIn":true
          },
          articleReadingInput
        ]);
      }
      else{
        res.json([
          getTalkAction("Your requested Article was not available right now. we will make it available for you later. Please request any other Article.",to,false),
          requestArticleInput
        ]);
      }
    },
    function(err){
      console.log(err);
    });
  }
});

app.post("/confirm_request_article", (req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;
  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    res.json([
      getTalkAction("Sorry, you have not chosen any option.",to,false),
      getTalkAction("To save, press 1. To cancel, press 2",to),
      confirmRequestedArticleInput
    ]);
  }
  else{
    let to = responseObject.to;
    switch(entered_digit){
      case "1":
        res.json([
          getTalkAction("Thank you. your requested article was saved.",to,false)
        ]);
        break;
      case "2":
        res.json([
          getTalkAction("Thank you. your requested article was not saved.",to,false)
        ]);
        break;
      default:
        res.json([
          getTalkAction("Sorry, you have chosen an invalid option.",to,false),
          getTalkAction("To save, press 1. To cancel, press 2",to),
          confirmRequestedArticleInput
        ]);
        break;
    }
  }
});

app.listen(process.env.PORT, () => console.log(`Running on port ${process.env.PORT}`));
