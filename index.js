/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# SETUP THE APP on HEROKU:
  Create a Slack app. Make sure to configure the bot user!
    -> https://api.slack.com/applications/new
    -> Add the Redirect URI: https://${APP_NAME}.herokuapp.com/oauth
  Deply and run your app on Heroku.
    -> Add Config Vars on the Heroku app setting page: clientId, clientSecret
  Set RequestURL on Slack.
    -> Add the RequesteURL of Interactive Message: https://${APP_NAME}.herokuapp.com/slack/receive
# USE THE APP
  Add the app to your Slack by visiting the login page:
    -> https://${APP_NAME}.herokuapp.com/login
  After you've added the app, try talking to your bot!
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

var Botkit = require('botkit');

if (!process.env.clientId || !process.env.clientSecret || !process.env.port) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

var controller = Botkit.slackbot({
  // interactive_replies: true, // tells botkit to send button clicks into conversations
  json_file_store: './db/db_slackbutton_bot/',
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


controller.on('interactive_message_callback', function(bot, message) {
  var users_answer = message.actions[0].name;
  if (message.callback_id == "test_button") {
    bot.replyInteractive(message, "あなたは「" + users_answer + "」を押しました");
  }
});
