require('dotenv').config();
const Vonage = require('@vonage/server-sdk');
const express = require('express');
const morgan = require('morgan');
const { getInputAction,getTalkAction } = require('./ncco_actions')
const {
    initializeUserInfo,
    sendResponse,
    sendArticleReadingResponse,
    getNewsArticleOptions,
    getNewsCategoryOptions,
    startTalk,
    stopTalk,
    checkCategoryExistency
} = require('./helper_functions')

const app = express();
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY_PATH
});

app.use(morgan('tiny'));
app.use(express.json());


// Global Variables

let userInfo = {}
let conversationIdToMobileNumber = {}
let remoteUrl = "https://0b39-36-255-87-151.ngrok.io/"
let mainMenuInputAction = getInputAction(remoteUrl,"main_menu_input")
let mainMenuOptions = [
  "To increment speech Rate, press star. To decrement speech Rate, press ash. ",
  "To start reading a new Article, press 1. ",
  "For new Articles, press 2. For Article Categories, press 3. \
   For requesting a Category, press 4. For repeating Current Menu, press 8. \
   To exit from the call, press 9. "
  ]
let articleInput = getInputAction(remoteUrl,"article_input",false,2)
let categoryInput = getInputAction(remoteUrl,"category_input",false,2)
let requestCategoryInput = getInputAction(remoteUrl,"request_category",true)
let articleReadingInput = getInputAction(remoteUrl,"article_reading")
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
  ncco.push(getTalkAction(userInfo,"This is a news reading system, currently reading 'the Hindu' newspaper.",to,false));
  if(userInfo.hasOwnProperty(to)){
    ncco.push(getTalkAction(userInfo,userInfo[to]["mainMenuOptions"].join(''),to))
  }
  else{
    ncco.push(getTalkAction(userInfo,mainMenuOptions.join(''),to))
  }
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
      initializeUserInfo(userInfo,to,body.uuid);
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
    sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''),
    "Sorry, you have not chosen any option.")
  }
  else{
    let to = responseObject.to;
    switch (entered_digit){
      case "1":
        if(!userInfo[to]["currentArticle"]){
          userInfo[to]["currentArticle"] = "Haryana cabinet nod for anti-conversion bill"
        }
        userInfo[to]["mainMenuOptions"][1] = `To start reading the ${userInfo[to]["currentArticle"]} Article again, press 1.`;
        startTalk(vonage,userInfo,to);
        sendArticleReadingResponse(res,articleReadingInput);
        break;
      case "2":
        userInfo[to]["previousArticleNumber"] = 0
        userInfo[to]["currentCategory"] = undefined
        getNewsArticleOptions(userInfo,to).then(
          function(value){
            sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"])
          },
          function(err){
            console.log(err);
          }
        );
        break;
      case "3":
        userInfo[to]["previousCategoryNumber"] = 0
        getNewsCategoryOptions(userInfo,to).then(
          function(value){
            sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"])
          },
          function(err){
            console.log(err);
          }
        );
        break;
      case "4":
        sendResponse(userInfo,to,res,requestCategoryInput,"speak out the Category Name",undefined,flag=false)
        break;
      case "8":
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''))
        break;
      case "9":
        res.json({
          action:"hangup"
        });
        break;
      case "*":
        userInfo[to]["speechRate"] = speechRateIncrements[userInfo[to]["speechRate"]];
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''),
          `Current SpeechRate was set to ${userInfo[to]["speechRate"]}.`)
        break;
      case "#":
        userInfo[to]["speechRate"] = speechRateDecrements[userInfo[to]["speechRate"]];
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''),
          `Current SpeechRate was set to ${userInfo[to]["speechRate"]}.`)
        break;
      default:
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''),
          "sorry, you have chosen an invalid option")
        break;
    }
  }
});

// Level 2

app.post('/article_input',(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;
  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],
    "Sorry, You have not chosen any option.")
  }
  else{
    let to = responseObject.to;
    switch(entered_digit){
      case "1":
      case "2":
      case "3":
      case "4":
        if(userInfo[to]["articleOptions"][entered_digit] == undefined){
          sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],
            "sorry, you have chosen invalid option.")
        }
        else{
          userInfo[to]["currentArticle"] = userInfo[to]["articleOptions"][entered_digit];
          userInfo[to]["mainMenuOptions"][1] = `To start reading the ${userInfo[to]["currentArticle"]} Article again, press 1.`;
          startTalk(vonage,userInfo,to);
          sendArticleReadingResponse(res,articleReadingInput);
        }
        break;
      case "5":
        if(userInfo[to]["articleOptionsText"].includes("press 5.")){
          let categoryName = userInfo[to]["currentCategory"]
          getNewsArticleOptions(userInfo,to,categoryName).then(
            function(value){
              sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"])
            },
            function(err){
              console.log(err);
            }
          );
        }
        else{
          sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],
            "sorry, you have chosen invalid option.")
        }
        break;
      case "8":
        sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"])
        break;
      case "9":
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''))
        break;
      default:
        sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],
            "sorry, you have chosen invalid option.")
        break;
    }
  }
});

app.post("/article_reading",(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if(entered_digit == ''){
    // let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    sendArticleReadingResponse(res,articleReadingInput);
  }
  else{
    let to = responseObject.to;
    switch(entered_digit){
      case "9":
        stopTalk(vonage,userInfo,to);
        setTimeout(() => {
          sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''))
        },2000);
        break;
      default:
        sendArticleReadingResponse(res,articleReadingInput);
    }
  }
});

app.post('/category_input',(req,res) => {
  let responseObject = req.body;
  let entered_digit = responseObject.dtmf.digits;

  if(entered_digit == ''){
    let to = conversationIdToMobileNumber[responseObject.conversation_uuid]
    sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"],
      "Sorry, you have not chosen any option.")
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
          sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"],
            "sorry, you have chosen invalid option.")
        }
        else{
          userInfo[to]["previousArticleNumber"] = 0
          userInfo[to]["currentCategory"] = categoryName
          getNewsArticleOptions(userInfo,to,categoryName).then(
            function(value){
              sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],`you are in ${categoryName} Category. `)
            },
            function(err){
              console.log(err);
            }
          );
        }
        break;
      case "5":
        if(userInfo[to]["categoryOptionsText"].includes("press 5.")){
          getNewsCategoryOptions(userInfo,to).then(
            function(value){
              sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"])
            },
            function(err){
              console.log(err);
            }
          );
        }
        else{
          sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"],
            "sorry, you have chosen invalid option.")
        }
        break;
      case "8":
        sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"])
        break;
      case "9":
        sendResponse(userInfo,to,res,mainMenuInputAction,userInfo[to]["mainMenuOptions"].join(''))
        break;
      default:
        sendResponse(userInfo,to,res,categoryInput,userInfo[to]["categoryOptionsText"],
        "sorry, you have chosen invalid option.")
        break;
    }
  }
});

app.post("/request_category", (req,res) => {
  let requestObj = req.body;
  if(requestObj.speech.timeout_reason == 'start_timeout'){
    let to = conversationIdToMobileNumber[requestObj.conversation_uuid]
    sendResponse(userInfo,to,res,requestCategoryInput,"Sorry, you have not spoken anything.Please Speak out the Category Name",undefined,flag=false)
  }
  else if(requestObj.speech.hasOwnProperty("error") || !requestObj.speech.results || (requestObj.speech.results.length == 0)){
    let to = conversationIdToMobileNumber[requestObj.conversation_uuid]
    sendResponse(userInfo,to,res,requestCategoryInput,"Sorry, we are not able to analyze your voice, please speak out again.",undefined,flag=false)
  }
  else{
    let spokenData = requestObj.speech.results[0].text
    console.log("requested Category Name ",spokenData);
    let to = requestObj.to
    checkCategoryExistency(spokenData).then(function(categoryName){
      if(categoryName){
        userInfo[to]["previousArticleNumber"] = 0
        userInfo[to]["currentCategory"] = categoryName
        getNewsArticleOptions(userInfo,to,categoryName).then(
          function(value){
            sendResponse(userInfo,to,res,articleInput,userInfo[to]["articleOptionsText"],`you are in ${categoryName} Category. `)
          },
          function(err){
            console.log(err);
          }
        );
      }
      else{
        sendResponse(userInfo,to,res,requestCategoryInput,"Sorry, you have requested an invalid category.Please request a valid Category.",undefined,flag=false)
      }
    },
    function(err){
      console.log(err);
    });
  }
});

/*      Answering to an Inbound Call         */

// app.post('/answer', (req, res) => {
//   console.log(req.body);
//   const number = req.body.from.split('').join(' ');
//   const ncco = [
//     {
//       action: 'talk',
//       text: 'Thank you for calling from ' + number,
//       language: 'en-IN',
//       style: '4'
//     }
//   ];
//   res.json(ncco);
// });

app.listen(process.env.PORT, () => console.log(`Running on port ${process.env.PORT}`));
