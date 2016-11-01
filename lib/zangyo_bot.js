"use strict";

var moment = require('moment');
var uuid = require('./utils').uuid;

moment.locale('ja', {
    weekdays: ["日曜日","月曜日","火曜日","水曜日","木曜日","金曜日","土曜日"],
    weekdaysShort: ["日","月","火","水","木","金","土"]
});

function ZangyoBot(controller) {
  var zangyo_bot = {};

  zangyo_bot.createApplication = function(response, convo) {
    askApprover(response, convo);
  };

  function askApprover(response, convo) {
    convo.ask("プロマネは誰？ [@xxx]", function(response, convo) {
      if (!response.text.match(/^<@[a-zA-Z0-9]*>$/)) {
        convo.say('@xxx の形式でユーザーを１人指定してね。');
        askApprover(response, convo);
        convo.next();
      } else {
        var zangyo = {}
        zangyo.id = uuid();
        zangyo.date = moment().format("YYYY-MM-DD");
        zangyo.applicant = response.user;
        zangyo.approver = response.text.slice(2, -1);
        askEndTime(response, convo, zangyo);
        convo.next();
      }
    });
  };

  function askEndTime(response, convo, zangyo) {
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
  };

  function askReason(response, convo, zangyo) {
    convo.ask("残業する理由は？", function(response, convo) {
      zangyo.reason = response.text;
      var summary = {
        "text": "残業申請しますか？",
        "attachments": [
          {
            "fallback": "<@" + zangyo.approver + "> さんへの残業申請",
            "color": "good",
            "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
            "text": "<@" + zangyo.applicant + "> (承認者: <@" + zangyo.approver + ">)",
            "fields": [
              {
                "title": zangyo.endTime + "まで、以下の理由により",
                "value": zangyo.reason,
                "short": false
              }
            ],
            "actions": [
              {
                "type": "button",
                "name": "apply",
                "text": "申請",
                "style": "primary"
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
  };

  zangyo_bot.apply = function(user_id, zangyo_id, bot, message) {
    getUserZangyo(user_id, zangyo_id, function(user, idx) {
      var zangyo = user.zangyos[idx];
      var summary = {
        "text": "残業申請しました。",
        "attachments": [
          {
            "fallback": "<@" + zangyo.approver + "> さんへの残業申請",
            "color": "good",
            "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
            "text": "<@" + zangyo.applicant + "> (承認者: <@" + zangyo.approver + ">)",
            "fields": [
              {
                "title": zangyo.endTime + "まで、以下の理由により",
                "value": zangyo.reason,
                "short": false
              }
            ]
          }
        ]
        // "attachments": [
        //   {
        //     "text": "申請内容まとめ(" + zangyo.date + ")",
        //     "fallback": "申請内容のまとめ",
        //     "color": "#36a64f",
        //     "fields": [
        //       {
        //         "title": "申請者",
        //         "value": "<@" + zangyo.applicant + ">",
        //         "short": false
        //       },
        //       {
        //         "title": "承認者",
        //         "value": "<@" + zangyo.approver + ">",
        //         "short": false
        //       },
        //       {
        //         "title": "終了時間",
        //         "value": zangyo.endTime,
        //         "short": false
        //       },
        //       {
        //         "title": "残業する理由",
        //         "value": zangyo.reason,
        //         "short": false
        //       }
        //     ]
        //   }
        // ]
      }
      bot.replyInteractive(message, summary);
      bot.reply(message, "この内容で残業申請したよ。");
      bot.startPrivateConversation({user: zangyo.approver}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          var application = {
            "text": "残業申請があります。承認しますか？",
            "attachments": [
              {
                "fallback": "<@" + zangyo.applicant + "> さんからの残業申請",
                "color": "good",
                "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
                "text": "<@" + zangyo.applicant + "> (承認者: <@" + zangyo.approver + ">)",
                "fields": [
                  {
                    "title": zangyo.endTime + "まで、以下の理由により",
                    "value": zangyo.reason,
                    "short": false
                  }
                ],

            // "text": "残業申請があります。承認しますか？",
            // "attachments": [
            //   {
            //     "text": "申請内容まとめ(" + zangyo.date + ")",
            //     "fallback": "申請内容のまとめ",
            //     "callback_id": "approve-" + zangyo.applicant + '-' + zangyo.id,
            //     "color": "#36a64f",
            //     "fields": [
            //       {
            //         "title": "申請者",
            //         "value": "<@" + zangyo.applicant + ">",
            //         "short": false
            //       },
            //       {
            //         "title": "承認者",
            //         "value": "<@" + zangyo.approver + ">",
            //         "short": false
            //       },
            //       {
            //         "title": "終了時間",
            //         "value": zangyo.endTime,
            //         "short": false
            //       },
            //       {
            //         "title": "残業する理由",
            //         "value": zangyo.reason,
            //         "short": false
            //       }
            //     ],
                "actions": [
                  {
                    "type": "button",
                    "name": "approve",
                    "text": "承認",
                    "style": "primary"
                  },
                  {
                    "type": "button",
                    "name": "reject",
                    "text": "却下",
                    "style": "danger"
                  }
                ]
              }
            ]
          }
          convo.say(application);
          convo.next();
        }
      });
      controller.storage.users.save(user);
    });
  };

  zangyo_bot.redoApply = function(user_id, zangyo_id, bot, message) {
    getUserZangyo(user_id, zangyo_id, function(user, idx) {
      user.zangyos.splice(idx, 1);
      bot.replyInteractive(message, "最初からやり直し！");
      bot.startConversation(message, askApprover);
      controller.storage.users.save(user);
    });
  };

  zangyo_bot.cancelApply = function(user_id, zangyo_id, bot, message) {
    getUserZangyo(user_id, zangyo_id, function(user, idx) {
      user.zangyos.splice(idx, 1);
      bot.replyInteractive(message, "キャンセルしたよ。さっさと帰ろう！");
      controller.storage.users.save(user);
    });
  };

  zangyo_bot.approve = function(user_id, zangyo_id, bot, message) {
    getUserZangyo(user_id, zangyo_id, function(user, idx) {
      var zangyo = user.zangyos[idx];
      bot.replyInteractive(message, getSummary(zangyo, true, true));
      user.zangyos[idx].approved = true;
      controller.storage.users.save(user);

      controller.storage.teams.get(user.team_id, function(err, team) {
        bot.configureIncomingWebhook(team.incoming_webhook);
        bot.sendWebhook(getSummary(zangyo, true, false), function(err,res) {
          if (err) console.log(err);
        });
      });
    });
  };

  zangyo_bot.rejectApprove = function(user_id, zangyo_id, bot, message) {
    getUserZangyo(user_id, zangyo_id, function(user, idx) {
      var zangyo = user.zangyos[idx];
      bot.replyInteractive(message, getSummary(zangyo, false, true));
      user.zangyos[idx].approved = false;
      controller.storage.users.save(user);

      controller.storage.teams.get(user.team_id, function(err, team) {
        bot.configureIncomingWebhook(team.incoming_webhook);
        bot.sendWebhook(getSummary(zangyo, false, false), function(err,res) {
          if (err) console.log(err);
        });
      });
    });
  };

  function getSummary(zangyo, is_approved, is_reply) {
    var result_word, replace_message, color, text;

    if (is_approved) {
      result_word = "承認";
      replace_message = ":white_check_mark: <@" + zangyo.approver + "> が承認しました。"
      color = "#3AA3E3";
    } else {i
      result_word = "却下";
      replace_message = ":x: <@" + zangyo.approver + "> が却下しました。"
      color = "danger";
    }

    if (is_reply) {
      text = "残業申請を" + result_word + "したよ。"
    } else {
      text = "残業申請が" + result_word + "されました。"
    }

    var summary = {
      "text": text,
      "attachments": [
        {
          "fallback": "<@" + zangyo.applicant + "> さんの残業申請",
          "color": color,
          "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
          "text": "<@" + zangyo.applicant + "> (承認者: <@" + zangyo.approver + ">)",
          "fields": [
            {
              "title": zangyo.endTime + "まで、以下の理由により",
              "value": zangyo.reason,
              "short": false
            },
            {
              "title": replace_message,
              "short": false
            }
          ]
        }
      ]

      // "attachments": [
      //   {
      //     "text": "申請内容まとめ(" + zangyo.date + ")",
      //     "fallback": "申請内容のまとめ",
      //     "color": "#36a64f",
      //     "fields": [
      //       {
      //         "title": "申請者",
      //         "value": "<@" + zangyo.applicant + ">",
      //         "short": false
      //       },
      //       {
      //         "title": "承認者",
      //         "value": "<@" + zangyo.approver + ">",
      //         "short": false
      //       },
      //       {
      //         "title": "終了時間",
      //         "value": zangyo.endTime,
      //         "short": false
      //       },
      //       {
      //         "title": "残業する理由",
      //         "value": zangyo.reason,
      //         "short": false
      //       }
      //     ]
      //   }
      // ]
    }
    return summary;
  };

  function getUserZangyo(user_id, zangyo_id, cb) {
    controller.storage.users.get(user_id, function(err, user) {
      for (var x = 0; x < user.zangyos.length; x++) {
        if (user.zangyos[x].id == zangyo_id) {
          cb(user, x);
          break;
        }
      }
    });
  };

  return zangyo_bot;
}

module.exports = ZangyoBot;
