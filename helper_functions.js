const fs = require('fs');
const client = require("./database");
const { getTalkAction } = require('./ncco_actions')

function initializeUserInfo(userInfo,to,uuid){
    userInfo[to] = {}
    userInfo[to]["uuid"] = uuid
    userInfo[to]["mainMenuOptions"] = [
    "To increment speech Rate, press star. To decrement speech Rate, press ash. ",
    "To start reading a new Article, press 1. ",
    "For new Articles, press 2. For Article Categories, press 3. \
     For requesting a Category, press 4. For repeating Current Menu, press 8. \
     To exit from the call, press 9. "
    ]
    userInfo[to]["articleOptionsText"] = ""
    userInfo[to]["categoryOptionsText"] = ""
    userInfo[to]["articleOptions"] = {}
    userInfo[to]["categoryOptions"] = {}
    userInfo[to]["currentArticle"] = undefined
    userInfo[to]["currentCategory"] = undefined
    userInfo[to]["previousArticleNumber"] = undefined
    userInfo[to]["previousCategoryNumber"] = undefined
    userInfo[to]["speechRate"] = "medium"
}

function sendResponse(userInfo,to,res,inputAction,mainText,frontText=undefined,flag=true){
    let ncco = []
    if(frontText){
        ncco.push(getTalkAction(userInfo,frontText,to,false))
    }
    ncco.push(getTalkAction(userInfo,mainText,to,flag));
    ncco.push(inputAction);
    res.json(ncco);
}

function sendArticleReadingResponse(res,articleReadingInput){
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

async function getNewsArticleOptions(userInfo,to,category=undefined){
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
      userInfo[to]["articleOptionsText"] += "For "+article.name+", press "+(i+1)+". ";
      userInfo[to]["articleOptions"][(i+1).toString()] = article.name;
    }
    if(result.rows.length > 4){
      userInfo[to]["articleOptionsText"] += "For next top 4 Articles, press 5. "
    }
    userInfo[to]["articleOptionsText"] += "For repeating current menu, press 8. For previous menu, press 9."
    return "succesfully fetched the articles.";
  }
  
  async function getNewsCategoryOptions(userInfo,to){
    const result = await client.query(`select * from newspaper_category OFFSET ${userInfo[to]["previousCategoryNumber"]} ROWS FETCH FIRST 5 ROWS ONLY`);
    userInfo[to]["previousCategoryNumber"] += 4
    userInfo[to]["categoryOptionsText"] = ""
    userInfo[to]["categoryOptions"] = {}
    let rows = result.rows.slice(0,4)
    for(let i=0; i < rows.length; i++){
      let category = rows[i];
      userInfo[to]["categoryOptionsText"] += "For " + category.name + ", press "+(i+1)+". ";
      userInfo[to]["categoryOptions"][(i+1).toString()] = category.name;
    }
    if(result.rows.length > 4){
      userInfo[to]["categoryOptionsText"] += "For next top 4 Categories, press 5. "
    }
    userInfo[to]["categoryOptionsText"] += "For repeating current menu, press 8. For previous menu, press 9."
    return "successfully fetched the categories.";
  }
  
  
  function startTalk(vonage,userInfo,to){
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
                let TEXT = data.replace(/\r?\n|\r/g," ").slice(0,1300);
                let initialText = `reading ${userInfo[to]["currentArticle"]} Article.<break time='2s' />`
                let articleContent = "<speak><prosody rate='"+`${userInfo[to]["speechRate"]}`+"'>"+`${initialText} ${TEXT}</prosody></speak>`
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
  
  function stopTalk(vonage,userInfo,to){
    vonage.calls.talk.stop(userInfo[to]["uuid"], (err, res) => {
      if(err) { console.log(err); }
      else {
          console.log(res);
      }
    });
  }
  
  async function checkCategoryExistency(requestedCategoryName){
    // const result = await client.query(`select name,similarity(name,$1) from newspaper_article order by similarity desc limit 1`,[requestedCategoryName]);
    const result = await client.query(`select name from newspaper_category where lower(name) = LOWER($1)`,[requestedCategoryName]);
    if(result.rows.length > 0){
      return result.rows[0].name
    }
    else{
      return false
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
    checkCategoryExistency
}
