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

controller.hears('^.*(申請中|未承認).*一覧.*',['direct_message','direct_mention'],function(bot,message) {
  ZangyoBot.replyPendingList(bot, message);
});

controller.hears('^.*(残業|申請).*一覧.*',['direct_message','direct_mention'],function(bot,message) {
  var range, applicant, filter, is_detailed;

  if (message.text.match(/(今日|本日|今夜|今晩)/)) {
    range = ZangyoBot.ranges.today;
  } else if (message.text.match(/一昨日/)) {
    range = ZangyoBot.ranges.day_before_yesterday;
  } else if (message.text.match(/(昨日|昨夜|昨晩)/)) {
    range = ZangyoBot.ranges.yesterday;
  } else if (message.text.match(/今週/)) {
    range = ZangyoBot.ranges.this_week;
  } else if (message.text.match(/先週/)) {
    range = ZangyoBot.ranges.last_week;
  } else if (message.text.match(/(過去一週間|ここ一週間)/)) {
    range = ZangyoBot.ranges.past_one_week;
  } else if (message.text.match(/今月/)) {
    range = ZangyoBot.ranges.this_month;
  } else if (message.text.match(/先月/)) {
    range = ZangyoBot.ranges.last_month;
  } else if (message.text.match(/(先々月|先先月)/)) {
    range = ZangyoBot.ranges.month_before_last;
  } else if (message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)[0];
  } else if (message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)[0];
  } else if (message.text.match(/(明日|明後日|明々後日|来週|再来週|来月|再来月|来年|再来年)/)) {
    bot.reply(message, "未来のことなどわかるかい！");
    return;
  } else {
    range = ZangyoBot.ranges.today;
  }

  if (message.text.match(/\<\@[a-zA-Z0-9]+\>/g)) {
    applicant = message.text.match(/\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
  }

  if (message.text.match(/(全て|全部|申請一覧)/)) {
    filter = ZangyoBot.filters.all;
  } else if (message.text.match(/(最後|最終)/)) {
    filter = ZangyoBot.filters.last;
  } else {
    filter = ZangyoBot.filters.approved;
  }

  is_detailed = message.text.match(/(詳細|詳しく)/) != null;

  ZangyoBot.replyList(bot, message, range, applicant, filter, is_detailed);
});

controller.hears('^.*残業.*申請.*',['direct_message','direct_mention'],function(bot,message) {
  bot.startConversation(message, ZangyoBot.createApplication);
});

controller.hears('test', ['direct_message'],function(bot,message) {
  var reply = {
    "text": "ボタンのテストです。",
    "attachments": [{
      "text": "どれか押してください。",
      "author_name": "<@" + message.user + ">",
      "fallback": "失敗しました。",
      "callback_id": "test_button",
      "color": "#808080",
      "mrkdwn_in": ["fields"],
      "fields": [
        {
          "title": "<@" + message.user + "> まで、以下の理由により",
          "value": "*<@" + message.user+ "> ヴァリュー* ですよー",
          "short": false
        }
      ],
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
  var ids = message.callback_id.split(/\-/);
  var action = ids[0];
  var item_id = ids[1];
  var ans = message.actions[0].name;

  if (action == 'apply') {
    if (ans == 'apply') {
      ZangyoBot.apply(item_id, bot, message);
    } else if (ans == 'redo') {
      ZangyoBot.redoApply(item_id, bot, message);
    } else if (ans == 'cancel') {
      ZangyoBot.cancelApply(item_id, bot, message);
    }
  } else if (action == 'approve') {
    if (ans == 'approve') {
      ZangyoBot.approve(item_id, bot, message);
    } else if (ans == 'reject') {
      ZangyoBot.rejectApprove(item_id, bot, message);
    } else if (ans == 'reject-comment') {
      ZangyoBot.rejectCommentApprove(item_id, bot, message);
    }
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
