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
    scopes: ['bot','incoming-webhook'],
  }
);

var ZangyoBot = require('./lib/zangyo_bot')(controller);

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

controller.hears('^.*残業.*申請.*',['direct_message','direct_mention'],function(bot,message) {
  bot.startConversation(message, ZangyoBot.createApplication);
});

controller.on('interactive_message_callback', function(bot, message) {
  var ids = message.callback_id.split(/\-/);
  var action = ids[0];
  var user_id = ids[1];
  var item_id = ids[2];

  if (action == 'apply') {
    var ans = message.actions[0].name;

    if (ans == 'apply') {
      ZangyoBot.apply(user_id, item_id, bot, message);
    } else if (ans == 'redo') {
      ZangyoBot.redo_apply(user_id, item_id, bot, message);
    } else if (ans == 'cancel') {
      ZangyoBot.cancel_apply(user_id, item_id, bot, message);
    }

    // controller.storage.users.get(user_id, function(err, user) {
    //   for (var x = 0; x < user.zangyos.length; x++) {
    //     if (user.zangyos[x].id == item_id) {
    //       if (ans == 'apply') {
    //         var zangyo = user.zangyos[x];
    //         var summary = {
    //           "attachments": [
    //             {
    //               "text": "申請内容まとめ(" + zangyo.date + ")",
    //               "fallback": "申請内容のまとめ",
    //               "color": "#36a64f",
    //               "fields": [
    //                 {
    //                   "title": "申請者",
    //                   "value": "<@" + zangyo.applicant + ">",
    //                   "short": false
    //                 },
    //                 {
    //                   "title": "承認者",
    //                   "value": "<@" + zangyo.approver + ">",
    //                   "short": false
    //                 },
    //                 {
    //                   "title": "終了時間",
    //                   "value": zangyo.endTime,
    //                   "short": false
    //                 },
    //                 {
    //                   "title": "残業する理由",
    //                   "value": zangyo.reason,
    //                   "short": false
    //                 }
    //               ]
    //             }
    //           ]
    //         }
    //         bot.replyInteractive(message, summary);
    //         bot.reply(message, "この内容で残業申請したよ。");
    //         bot.startPrivateConversation({user: zangyo.approver}, function(err,convo) {
    //           if (err) {
    //             console.log(err);
    //           } else {
    //             var application = {
    //               "text": "残業申請があります。承認しますか？",
    //               "attachments": [
    //                 {
    //                   "text": "申請内容まとめ(" + zangyo.date + ")",
    //                   "fallback": "申請内容のまとめ",
    //                   "callback_id": "approve-" + zangyo.applicant + '-' + zangyo.id,
    //                   "color": "#36a64f",
    //                   "fields": [
    //                     {
    //                       "title": "申請者",
    //                       "value": "<@" + zangyo.applicant + ">",
    //                       "short": false
    //                     },
    //                     {
    //                       "title": "承認者",
    //                       "value": "<@" + zangyo.approver + ">",
    //                       "short": false
    //                     },
    //                     {
    //                       "title": "終了時間",
    //                       "value": zangyo.endTime,
    //                       "short": false
    //                     },
    //                     {
    //                       "title": "残業する理由",
    //                       "value": zangyo.reason,
    //                       "short": false
    //                     }
    //                   ],
    //                   "actions": [
    //                     {
    //                       "type": "button",
    //                       "name": "approve",
    //                       "text": "承認"
    //                     },
    //                     {
    //                       "type": "button",
    //                       "name": "reject",
    //                       "text": "却下"
    //                     }
    //                   ]
    //                 }
    //               ]
    //             }
    //             convo.say(application);
    //             convo.next();
    //           }
    //         });
    //       } else if (ans == 'redo') {
    //         user.zangyos.splice(x, 1);
    //         bot.replyInteractive(message, "最初からやり直し！");
    //         bot.startConversation(message, askApprover);
    //       } else {
    //         user.zangyos.splice(x, 1);
    //         bot.replyInteractive(message, "キャンセルしたよ。さっさと帰ろう！");
    //       }
    //       controller.storage.users.save(user);
    //       break;
    //     }
    //   }
    // });
  } else if (action == 'approve') {
    var ans = message.actions[0].name;
    controller.storage.users.get(user_id, function(err, user) {
      for (var x = 0; x < user.zangyos.length; x++) {
        if (user.zangyos[x].id == item_id) {
          var zangyo = user.zangyos[x];
          var summary = {
            "attachments": [
              {
                "text": "申請内容まとめ(" + zangyo.date + ")",
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
                    "value": "<@" + zangyo.approver + ">",
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
          if (ans == 'approve') {
            user.zangyos[x].approved = true;
            bot.reply(message, "この申請を承認したよ。");

            controller.storage.users.get(zangyo.applicant, function(err, user) {
              controller.storage.teams.get(user.team_id, function(err, team) {
                summary.text = "この申請が承認されました。";
                bot.configureIncomingWebhook(team.incoming_webhook);
                bot.sendWebhook(summary, function(err,res) {
                  if (err) console.log(err);
                });
              });
            });
          } else if (ans == 'reject') {
            user.zangyos[x].approved = false;
            bot.reply(message, "この申請を却下したよ。");

            controller.storage.users.get(zangyo.applicant, function(err, user) {
              controller.storage.teams.get(user.team_id, function(err, team) {
                summary.text = "この申請が却下されました。";
                bot.configureIncomingWebhook(team.incoming_webhook);
                bot.sendWebhook(summary, function(err,res) {
                  if (err) console.log(err);
                });
              });
            });
          }
          controller.storage.users.save(user);
          break;
        }
      }
    });
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
