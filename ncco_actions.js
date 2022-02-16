
function getTalkAction(userInfo,textToTalk,to,needBargeIn=true){
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
  
  function getInputAction(remoteUrl,eventEndpoint,speechInput = false,maxDigits=1){
    if(speechInput){
      let inputAction = {
        "action":"input",
        "eventUrl": [
          remoteUrl+eventEndpoint
        ],
        "type": ["speech"],
        "speech": {
          "language": "en-IN",
          "startTimeout":4
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

  module.exports = { getTalkAction,getInputAction }
