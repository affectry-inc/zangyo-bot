/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# SETUP THE APP on HEROKU:
  Create a Slack app. Make sure to configure the bot user!
    -> https://api.slack.com/applications/new
    -> Add the Redirect URI: https://${APP_NAME}.herokuapp.com/oauth
  Deply and run your app on Heroku.
    -> Add Config Vars on the Heroku app setting page: clientId, clientSecret
    -> Deploy and run on Heroku.
  Set RequestURL on Slack.
    -> Add the RequesteURL of Interactive Message: https://${APP_NAME}.herokuapp.com/slack/receive
# USE THE APP
  Add the app to your Slack by visiting the login page:
    -> https://${APP_NAME}.herokuapp.com/login
  After you've added the app, try talking to your bot!
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

var Botkit = require('botkit');
var MongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/zangyo-bot';

if (!process.env.clientId || !process.env.clientSecret || !process.env.port) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

var controller = Botkit.slackbot({
  // interactive_replies: true, // tells botkit to send button clicks into conversations
  storage: require('botkit-storage-mongo')({mongoUri: MongoUrl})
}).configureSlackApp(
  {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    scopes: ['bot'],
  }
);

controller.setupWebserver(process.env.port,function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
    if (err) {
      res.status(500).send('ERROR: ' + err);
    } else {
      res.send('Success!');
    }
  });
});

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}


controller.on('create_bot',function(bot,config) {

  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {

      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('I am a bot that has just joined your team');
          convo.say('You must now /invite me to a channel so that I can be of use!');
        }
      });

    });
  }

});


// Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});

controller.hears('button', ['direct_message'],function(bot,message) {
  var reply = {
    "text": "ボタンのテストです。",
    "attachments": [{
      "text": "どれか押してください。",
      "fallback": "失敗しました。",
      "callback_id": "test_button",
      "color": "#808080",
      "actions": [
        {
          "type": "button",
          "name": "test_button1",
          "text": "テストボタン1"
        },
        {
          "type": "button",
          "name": "test_button2",
          "text": "テストボタン2"
        }
      ]
    }]
  };
  bot.reply(message, reply);
});

controller.hears('^.*残業.*申請.*',['direct_message'],function(bot,message) {
  bot.startConversation(message, askApprover);
});

askApprover = function(response, convo) {
  convo.ask("プロマネは誰？ [@xxx]", function(response, convo) {
    if (!response.text.match(/^<@[a-zA-Z0-9]*>$/)) {
      convo.say('@xxx の形式でユーザーを１人指定してね。');
      askApprover(response, convo);
      convo.next();
    } else {
      var zangyo = {}
      zangyo.id = uuid();
      zangyo.applicant = response.user;
      zangyo.approver = response.text;
      askEndTime(response, convo, zangyo);
      convo.next();
    }
  });
}
askEndTime = function(response, convo, zangyo) {
  convo.ask("何時に終わる？ [HH:MM]", function(response, convo) {
    if (!response.text.match(/^([0-2]?[0-9]):([0-5]?[0-9])$/)) {
      convo.say('HH:MM の形式で時間を指定してね。29:59まで指定できるよ。');
      askEndTime(response, convo, zangyo);
      convo.next();
    } else {
      zangyo.endTime = response.text;
      askReason(response, convo, zangyo);
      convo.next();
    }
  });
}
askReason = function(response, convo, zangyo) {
  convo.ask("残業する理由は？", function(response, convo) {
    zangyo.reason = response.text;
    var summary = {
      "text": "この内容で残業申請しますか？",
      "attachments": [
        {
          "text": "申請内容まとめ",
          "fallback": "申請内容のまとめ",
          "callback_id": "apply-" + response.user + '-' + zangyo.id,
          "color": "#36a64f",
          "fields": [
            {
              "title": "申請者",
              "value": "<@" + zangyo.applicant + ">",
              "short": false
            },
            {
              "title": "承認者",
              "value": zangyo.approver,
              "short": false
            },
            {
              "title": "終了時間",
              "value": zangyo.endTime,
              "short": false
            },
            {
              "title": "残業する理由",
              "value": zangyo.reason,
              "short": false
            }
          ],
          "actions": [
            {
              "type": "button",
              "name": "apply",
              "text": "申請"
            },
            {
              "type": "button",
              "name": "redo",
              "text": "やり直し"
            },
            {
              "type": "button",
              "name": "cancel",
              "text": "キャンセル"
            }
          ]
        }
      ]
    }
    controller.storage.users.get(response.user, function(err, user) {
        if (!user) {
          user = {
            id: response.user,
            zangyos: []
          }
        } else if (!user.zangyos) {
          user.zangyos = [];
        }

        user.zangyos.push(zangyo);
        controller.storage.users.save(user);
    });
    convo.say(summary);
    convo.next();
  });
}

controller.on('interactive_message_callback', function(bot, message) {
  var ids = message.callback_id.split(/\-/);
  var action = ids[0];
  var user_id = ids[1];
  var item_id = ids[2];

  if (action == 'apply') {
    var ans = message.actions[0].name;
    controller.storage.users.get(user_id, function(err, user) {
      for (var x = 0; x < user.zangyos.length; x++) {
        if (user.zangyos[x].id == item_id) {
          if (ans == 'apply') {
            var zangyo = user.zangyos[x];
            var summary = {
              "attachments": [
                {
                  "text": "申請内容まとめ",
                  "fallback": "申請内容のまとめ",
                  "color": "#36a64f",
                  "fields": [
                    {
                      "title": "申請者",
                      "value": "<@" + zangyo.applicant + ">",
                      "short": false
                    },
                    {
                      "title": "承認者",
                      "value": zangyo.approver,
                      "short": false
                    },
                    {
                      "title": "終了時間",
                      "value": zangyo.endTime,
                      "short": false
                    },
                    {
                      "title": "残業する理由",
                      "value": zangyo.reason,
                      "short": false
                    }
                  ]
                }
              ]
            }
            bot.replyInteractive(message, summary);
            bot.reply(message, "この内容で残業申請したよ。");
          } else if (ans == 'redo') {
            user.zangyos.splice(x, 1);
            bot.replyInteractive(message, "最初からやり直し！");
            bot.startConversation(message, askApprover);
          } else {
            user.zangyos.splice(x, 1);
            bot.replyInteractive(message, "キャンセルしたよ。さっさと帰ろう！");
          }
          controller.storage.users.save(user);
          break;
        }
      }
    });
  } else if (message.callback_id == "test_button") {
    var users_answer = message.actions[0].name;
    bot.replyInteractive(message, "あなたは「" + users_answer + "」を押しました");
  }
});

controller.storage.teams.all(function(err,teams) {

  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t  in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM(function(err, bot) {
        if (err) {
          console.log('Error connecting bot to Slack:',err);
        } else {
          trackBot(bot);
        }
      });
    }
  }
});

function uuid() {
  var uuid = "", i, random;
  for (i = 0; i < 32; i++) {
    random = Math.random() * 16 | 0;
    uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
  }
  return uuid;
};
