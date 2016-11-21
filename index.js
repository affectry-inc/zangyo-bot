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
  storage: require('./lib/botkit-custom-mongo')({mongoUri: MongoUrl, collections: ['zangyos']})
}).configureSlackApp(
  {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    scopes: ['bot','incoming-webhook','commands'],
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

controller.hears('((?=.*waiting)(?=.*list)|.*(申請中|未承認).*一覧.*)',['direct_message','direct_mention','mention','ambient'],function(bot,message) {
  ZangyoBot.replyPendingList(bot, message);
});

controller.hears('((?=.*(zangyo|application|applied))(?=.*list)|.*(残業|申請).*一覧.*)',['direct_message','direct_mention','mention','ambient'],function(bot,message) {
  var range, applicant, filter, is_detailed;

  if (message.text.match(/today|tonight|今日|本日|今夜|今晩/)) {
    range = ZangyoBot.ranges.today;
  } else if (message.text.match(/day before yesterday|一昨日/)) {
    range = ZangyoBot.ranges.day_before_yesterday;
  } else if (message.text.match(/yesterday|last night|昨日|昨夜|昨晩/)) {
    range = ZangyoBot.ranges.yesterday;
  } else if (message.text.match(/this week|今週/)) {
    range = ZangyoBot.ranges.this_week;
  } else if (message.text.match(/last week|先週/)) {
    range = ZangyoBot.ranges.last_week;
  } else if (message.text.match(/past (one|1) week|過去(一|１|1)週間|ここ(一|１|1)週間/)) {
    range = ZangyoBot.ranges.past_one_week;
  } else if (message.text.match(/this month|今月/)) {
    range = ZangyoBot.ranges.this_month;
  } else if (message.text.match(/month before last|先々月|先先月/)) {
    range = ZangyoBot.ranges.month_before_last;
  } else if (message.text.match(/last month|先月/)) {
    range = ZangyoBot.ranges.last_month;
  } else if (message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)[0];
  } else if (message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)[0];
  } else if (message.text.match(/tomorrow|next week|next month|next year|明日|明後日|明々後日|来週|再来週|来月|再来月|来年|再来年/)) {
    bot.reply(message, 'God only knows... :hankey:');
    return;
  } else {
    range = ZangyoBot.ranges.today;
  }

  if (message.text.match(/\<\@[a-zA-Z0-9]+\>/g)) {
    applicant = message.text.match(/\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
  }

  if (message.text.match(/all|applied|application|全て|全部|申請一覧/)) {
    filter = ZangyoBot.filters.applied;
  } else if (message.text.match(/latest|最後|最終/)) {
    filter = ZangyoBot.filters.latest;
  } else {
    filter = ZangyoBot.filters.approved;
  }

  is_detailed = message.text.match(/detail|details|詳細|詳しく/) != null;

  ZangyoBot.replyList(bot, message, range, applicant, filter, is_detailed);
});

controller.hears('(.*apply.*(overtime|zangyo).*|.*残業.*申請.*)',['direct_message','direct_mention'],function(bot,message) {
  bot.startConversation(message, ZangyoBot.applicationWizard);
});

controller.hears('test', ['direct_message'],function(bot,message) {
  var reply = {
    "text": "ボタンのテストです。",
    "attachments": [{
      "text": "どれか押してください。\n 改行したかい？",
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

controller.on('slash_command', function(bot, message) {
  var list_help = '`/zangyo list [today/yesterday/this week] [@xxxxx] [applied] [detail]`';
  var apply_help = '`/zangyo apply @approver HH:MM \'reason\'`';
  var help_message = 'Use `/zangyo` to apply and browse zangyos for your team.\n Available commands are:\n • ' + apply_help + '\n • ' + list_help;

  switch (message.text.split(' ')[0]) {
    case 'list':
      var range, applicant, filter, is_detailed;

      if (message.text.match(/help/g)) {
        bot.replyPrivate(message, list_help);
        return;
      }

      if (message.text.match(/today/)) {
        range = ZangyoBot.ranges.today;
      } else if (message.text.match(/day before yesterday/)) {
        range = ZangyoBot.ranges.day_before_yesterday;
      } else if (message.text.match(/(yesterday|last night)/)) {
        range = ZangyoBot.ranges.yesterday;
      } else if (message.text.match(/this week/)) {
        range = ZangyoBot.ranges.this_week;
      } else if (message.text.match(/last week/)) {
        range = ZangyoBot.ranges.last_week;
      } else if (message.text.match(/past (one|1) week/)) {
        range = ZangyoBot.ranges.past_one_week;
      } else if (message.text.match(/this month/)) {
        range = ZangyoBot.ranges.this_month;
      } else if (message.text.match(/month before last/)) {
        range = ZangyoBot.ranges.month_before_last;
      } else if (message.text.match(/last month/)) {
        range = ZangyoBot.ranges.last_month;
      } else if (message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)) {
        range = message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)[0];
      } else if (message.text.match(/(tomorrow|next week|next month|next year)/)) {
        bot.replyPrivate(message, 'God only knows... :hankey:');
        return;
      } else {
        range = ZangyoBot.ranges.today;
      }

      if (message.text.match(/\<\@[a-zA-Z0-9]+\>/g)) {
        applicant = message.text.match(/\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
      }

      if (message.text.match(/(all|applied|application)/)) {
        filter = ZangyoBot.filters.applied;
      } else if (message.text.match(/latest/)) {
        filter = ZangyoBot.filters.latest;
      } else {
        filter = ZangyoBot.filters.approved;
      }

      is_detailed = message.text.match(/(detail|details)/) != null;

      message.team = message.team_id;

      ZangyoBot.replyList(bot, message, range, applicant, filter, is_detailed);
      break;
    case 'apply':
      var approver, end_time, reason;

      if (message.text.match(/help/g)) {
        bot.replyPrivate(message, apply_help);
        return;
      }

      if (message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)) {
        approver = message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)[0].slice(1);
      } else {
        bot.replyPrivate(message, '`Approver` is missing!!');
        return;
      }

      if (message.text.match(/([0-2]?[0-9]):([0-5]?[0-9])/g)) {
        end_time = message.text.match(/([0-2]?[0-9]):([0-5]?[0-9])/g)[0];
      } else {
        bot.replyPrivate(message, '`End time` is missing!!');
        return;
      }

      if (message.text.match(/\'.+\'/g)) {
        reason = message.text.match(/\'.+\'/g)[0].slice(1,-1);
      } else if (message.text.match(/\".+\"/g)) {
        reason = message.text.match(/\".+\"/g)[0].slice(1,-1);
      } else if (message.text.match(/\「.+\」/g)) {
        reason = message.text.match(/\「.+\」/g)[0].slice(1,-1);
      } else {
        bot.replyPrivate(message, '`Reason` is missing!!');
        return;
      }

      ZangyoBot.createApplication(bot, message, approver, end_time, reason);
      break;
    case 'help':
      bot.replyPrivate(message, help_message);
      break;
    default:
      bot.replyPrivate(message, 'Illegal command!! :ghost:\n' + help_message);
      break;
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
