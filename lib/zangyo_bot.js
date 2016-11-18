"use strict";

var moment = require('moment-timezone');
var luid = require('./utils').luid;

moment.tz.setDefault("Asia/Tokyo");
moment.locale('ja', {
    weekdays: ["日曜日","月曜日","火曜日","水曜日","木曜日","金曜日","土曜日"],
    weekdaysShort: ["日","月","火","水","木","金","土"]
});

function ZangyoBot(controller) {
  var zangyo_bot = {};

  zangyo_bot.ranges = {
    today: "今日",
    yesterday: "昨日",
    day_before_yesterday: "一昨日",
    this_week: "今週",
    last_week: "先週",
    past_one_week: "過去一週間",
    this_month: "今月",
    last_month: "先月",
    month_before_last: "先々月"
  };

  zangyo_bot.filters = {
    all: "全て",
    approved: "承認済み",
    last: "承認済みで最後の"
  };

  zangyo_bot.applicationWizard = function(err, convo) {
    askApprover(convo);
  };

  function askApprover(convo) {
    convo.ask("プロマネは誰？ [@xxx]", function(response, convo) {
      if (response.text.match(/(cancel|キャンセル|やめる)/)) {
        convo.say('キャンセルしたよ！');
        convo.next();
      } else if (!response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)) {
        convo.say('@xxx の形式でユーザーを１人指定してね。');
        convo.repeat();
        convo.next();
      } else {
        var zangyo = {}
        zangyo.id = "Z" + response.user + luid();
        zangyo.team = response.team;
        zangyo.date = moment().format("YYYY-MM-DD");
        zangyo.applicant = response.user;
        zangyo.approver = response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
        askEndTime(convo, zangyo);
        convo.next();
      }
    });
  };

  function askEndTime(convo, zangyo) {
    convo.ask("何時に終わる？ [HH:MM]", function(response, convo) {
      if (response.text.match(/(cancel|キャンセル|やめる)/)) {
        convo.say('キャンセルしたよ！');
        convo.next();
      } else if (!response.text.match(/^([0-2]?[0-9]):([0-5]?[0-9])$/)) {
        convo.say('HH:MM の形式で時間を指定してね。29:59まで指定できるよ。');
        convo.repeat();
        convo.next();
      } else {
        zangyo.end_time = response.text;
        askReason(convo, zangyo);
        convo.next();
      }
    });
  };

  function askReason(convo, zangyo) {
    convo.ask("残業する理由は？", function(response, convo) {
      zangyo.reason = response.text;
      controller.storage.zangyos.save(zangyo);
      var summary = getApplicationSummary(zangyo, true);
      convo.say(summary);
      convo.next();
    });
  };

  zangyo_bot.createApplication = function(bot, message, approver, end_time, reason) {
    controller.storage.teams.get(message.team_id, function(err, team) {
      var api_data = {"token": team.token};
      bot.api.callAPI('users.list', api_data, function(err, data){
        if (data.members) {
          for (var i = 0; i < data.members.length; i++) {
            var member = data.members[i];

            if (!member.deleted && member.name == approver) {
              var zangyo = {}
              zangyo.id = "Z" + message.user_id + luid();
              zangyo.team = message.team_id;
              zangyo.date = moment().format("YYYY-MM-DD");
              zangyo.applicant = message.user_id;
              zangyo.approver = member.id;
              zangyo.end_time = end_time;
              zangyo.reason = reason;
              controller.storage.zangyos.save(zangyo);
              var summary = getApplicationSummary(zangyo, false);
              bot.replyPrivate(message, summary);
              break;
            }
            if (i == data.members.length-1) {
              bot.replyPrivate(message, '`Approver` is invalid!!');
            }
          }
        } else {
          bot.replyPrivate(message, '`Approver` is invalid!!');
        }
      });
    });
  };

  function getApplicationSummary(zangyo, can_redo) {
    var actions = [
      {
        "type": "button",
        "name": "apply",
        "text": "申請",
        "style": "primary"
      },
      {
        "type": "button",
        "name": "cancel",
        "text": "キャンセル"
      }
    ];
    if (can_redo) {
      actions.push(
        {
          "type": "button",
          "name": "redo",
          "text": "やり直し"
        }
      );
    }
    var summary = {
      "text": "残業申請する？",
      "attachments": [
        {
          "callback_id": "apply-" + zangyo.id,
          "fallback": "<@" + zangyo.approver + "> さんへの残業申請",
          "color": "#aaa",
          "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
          "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
          "fields": [
            {
              "title": zangyo.end_time + "まで、以下の理由により残業します。",
              "value": zangyo.reason,
              "short": false
            }
          ],
          "actions": actions
        }
      ]
    }
    return summary;
  };

  zangyo_bot.apply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      zangyo.applied_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      var summary = {
        "text": "残業申請したよ。",
        "attachments": [
          {
            "fallback": "<@" + zangyo.approver + "> さんへの残業申請",
            "color": "#aaa",
            "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
            "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
            "fields": [
              {
                "title": zangyo.end_time + "まで、以下の理由により残業します。",
                "value": zangyo.reason,
                "short": false
              }
            ]
          }
        ]
      }
      bot.replyInteractive(message, summary);
      bot.startPrivateConversation({user: zangyo.approver}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          var application = {
            "text": "残業申請が来たよ。承認する？",
            "attachments": [
              {
                "callback_id": "approve-" + zangyo.id,
                "fallback": "<@" + zangyo.applicant + "> さんからの残業申請",
                "color": "#aaa",
                "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
                "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
                "fields": [
                  {
                    "title": zangyo.end_time + "まで、以下の理由により残業します。",
                    "value": zangyo.reason,
                    "short": false
                  }
                ],
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
                  },
                  {
                    "type": "button",
                    "name": "reject-comment",
                    "text": "却下(コメントつき)",
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
    });
  };

  zangyo_bot.redoApply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.remove(zangyo_id);
    bot.replyInteractive(message, "最初からやり直し！");
    bot.startConversation(message, zangyo_bot.applicationWizard);
  };

  zangyo_bot.cancelApply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.remove(zangyo_id);
    bot.replyInteractive(message, "キャンセルしたよ。さっさと帰ろう！");
  };

  zangyo_bot.approve = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, "処理済みだよ。");
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = true;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      controller.storage.teams.get(message.team.id, function(err, team) {
        bot.configureIncomingWebhook(team.incoming_webhook);
        bot.sendWebhook(getSummary(zangyo, false, true), function(err,res) {
          if (err) console.log(err);
        });
      });
    });
  };

  zangyo_bot.rejectApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, "処理済みだよ。");
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = false;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      controller.storage.teams.get(message.team.id, function(err, team) {
        bot.configureIncomingWebhook(team.incoming_webhook);
        bot.sendWebhook(getSummary(zangyo, false, true), function(err,res) {
          if (err) console.log(err);
        });
      });
    });
  };

  zangyo_bot.rejectCommentApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      bot.replyInteractive(message, getSummary(zangyo, true, false));
    });

    bot.startConversation(message, function(err, convo){
      convo.ask("コメントをちょーだい。", function(response, convo) {
        controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
          zangyo.approver_comment = response.text;
          controller.storage.zangyos.save(zangyo);
          var application = {
            "text": "以下の内容で却下する？",
            "attachments": [
              {
                "callback_id": "approve-" + zangyo.id,
                "fallback": "<@" + zangyo.applicant + "> さんからの残業申請",
                "color": "#aaa",
                "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
                "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
                "fields": [
                  {
                    "title": zangyo.end_time + "まで、以下の理由により残業します。",
                    "value": zangyo.reason,
                    "short": false
                  },
                  {
                    "title": "承認者のコメント",
                    "value": zangyo.approver_comment,
                    "short": false
                  },
                ],
                "actions": [
                  {
                    "type": "button",
                    "name": "reject",
                    "text": "申請を却下",
                    "style": "danger"
                  },
                  {
                    "type": "button",
                    "name": "reject-comment",
                    "text": "コメント編集",
                    "style": "default"
                  }
                ]
              }
            ]
          }
          convo.say(application);
          convo.next();
        });
      });
    });
  };

  function getSummary(zangyo, is_reply, is_done) {
    var result_word, color, text, fields, fallback, footer, ts;

    fields = [
      {
        "title": zangyo.end_time + "まで、以下の理由により残業します。",
        "value": zangyo.reason,
        "short": false
      }
    ]

    if (is_done) {
      if (zangyo.approved) {
        result_word = "承認";
        color = "good";
      } else {
        result_word = "却下";
        color = "danger";
      }

      if (is_reply) {
        text = "残業申請を" + result_word + "したよ。";
      } else {
        text = "<@" + zangyo.applicant + "> 残業申請が" + result_word + "されたよ。";
      }

      if (zangyo.approver_comment) {
        var comment_field = {
          "title": "承認者のコメント",
          "value": zangyo.approver_comment,
          "short": false
        }
        fields.push(comment_field);
      }

      fallback = "<@" + zangyo.applicant + "> さんの残業申請が" + result_word + "されました。";
      footer = "<@" + zangyo.approver + "> が" + result_word + "しました。";
      ts = zangyo.approved_at;
    } else {
      result_word = "却下";
      color = "#aaa";

      if (is_reply) {
        text = "残業申請を" + result_word + "するよ。";
      }

      fallback = "<@" + zangyo.applicant + "> さんの残業申請を" + result_word + "します。";
    }

    var summary = {
      "text": text,
      "attachments": [
        {
          "fallback": fallback,
          "color": color,
          "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
          "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
          "fields": fields,
          "footer": footer,
          "ts": ts
        }
      ]
    }
    return summary;
  };

  zangyo_bot.replyList = function(bot, message, range, applicant, filter, is_detailed) {
    if (is_detailed) {
      buildDetailedMessage(bot, message, range, applicant, filter);
    } else {
      buildSimplifiedMessage(bot, message, range, applicant, filter);
    }
  };

  function buildSimplifiedMessage(bot, message, range, applicant, filter) {
    findTargetZangyo(message.team, range, applicant, filter, function(zangyo){
      var field = {};
      var icon;
      if (zangyo.approved == null) {
        icon = ":speech_balloon:";
      } else if (zangyo.approved) {
        icon = ":white_check_mark:";
      } else {
        icon = ":x:";
      }

      field.value = icon + moment(zangyo.date).format("MM/DD ") + zangyo.end_time + "まで <@" + zangyo.applicant + ">" ;
      field.short = false

      return field;
    }, function(fields, applicant, filter){
      var reply;
      var applicant_text = applicant ? "<@" + applicant + ">の" : "";
      var filter_text = (filter == zangyo_bot.filters.all) ? "" : filter
      if (fields.length == 0) {
        reply = applicant_text + range + "の" + filter_text + "残業申請は１件もないっす。。。";
      } else if (fields.length < 100) {
        reply = {
          "text": applicant_text + range + "の" + filter_text + "残業申請一覧っす。",
          "attachments": [
            {
              "color": "#aaa",
              "fields": fields
            }
          ]
        }
      } else {
        reply = {
          "text": applicant_text + range + "の" + filter_text + "残業申請一覧は１００件を超えてるよ。もうちょっと条件を絞って欲しーなー。:face_with_rolling_eyes:",
          "attachments": [
            {
              "color": "#aaa",
              "fields": fields
            }
          ]
        }
      }

      if (message.command) {
        bot.replyPublic(message, reply);
      } else {
        bot.reply(message, reply);
      }
    });
  };

  function buildDetailedMessage(bot, message, range, applicant, filter) {
    findTargetZangyo(message.team, range, applicant, filter, function(zangyo){
      var attachment = {};
      if (zangyo.approved == null) {
        attachment.color = "#aaa";
        attachment.footer = "<@" + zangyo.approver + "> の承認待ちです。";
      } else if (zangyo.approved) {
        attachment.color = "good";
        attachment.footer = "<@" + zangyo.approver + "> が承認しました。";
      } else {
        attachment.color = "danger";
        attachment.footer = "<@" + zangyo.approver + "> が却下しました。";
      }
      attachment.title = moment(zangyo.date).format("MM/DD ") + zangyo.end_time + "まで <@" + zangyo.applicant + ">";
      attachment.text = zangyo.reason;
      if (zangyo.approver_comment) {
        attachment.fields = [
          {
            "title": "承認者のコメント",
            "value": zangyo.approver_comment,
            "short": false
          }
        ];
      }
      attachment.ts = zangyo.approved_at;

      return attachment;
    }, function(attachments, applicant, filter){
      var reply;
      var applicant_text = applicant ? "<@" + applicant + ">の" : "";
      var filter_text = (filter == zangyo_bot.filters.all) ? "" : filter
      if (attachments.length == 0) {
        reply = applicant_text + range + "の" + filter_text + "残業申請は１件もないっす。。。";
      } else if (attachments.length < 100) {
        reply = {
          "text": applicant_text + range + "の" + filter_text + "残業申請一覧を詳しくね。ほれっ！",
          "attachments": attachments
        }
      } else {
        reply = {
          "text": applicant_text + range + "の" + filter_text + "残業申請一覧は１００件を超えてるよ。もうちょっと条件を絞って欲しーなー。:face_with_rolling_eyes:",
          "attachments": attachments
        }
      }

      if (message.command) {
        bot.replyPublic(message, reply);
      } else {
        bot.reply(message, reply);
      }
    });
  };

  function findTargetZangyo(team_id, range, applicant, filter, getMessageItem, replyWholeMessage) {
    var begin_date, end_date;
    switch (range) {
      case zangyo_bot.ranges.today:
        var today = moment().format("YYYY-MM-DD");
        begin_date = today;
        end_date = today
        break;
      case zangyo_bot.ranges.yesterday:
        var yesterday = moment().subtract(1, 'days').format("YYYY-MM-DD");
        begin_date = yesterday;
        end_date = yesterday;
        break;
      case zangyo_bot.ranges.day_before_yesterday:
        var day_before_yesterday = moment().subtract(2, 'days').format("YYYY-MM-DD");
        begin_date = day_before_yesterday;
        end_date = day_before_yesterday;
        break;
      case zangyo_bot.ranges.this_week:
        begin_date = moment().startOf('isoweek').format("YYYY-MM-DD");
        end_date = moment().endOf('isoweek').format("YYYY-MM-DD");
        break;
      case zangyo_bot.ranges.last_week:
        var lastweek = moment().subtract(1, 'weeks');
        begin_date = lastweek.startOf('isoweek').format("YYYY-MM-DD");
        end_date = lastweek.endOf('isoweek').format("YYYY-MM-DD");
        break;
      case zangyo_bot.ranges.past_one_week:
        begin_date = moment().subtract(7, 'days').format("YYYY-MM-DD");
        end_date = moment().subtract(1, 'days').format("YYYY-MM-DD");
        break;
      case zangyo_bot.ranges.this_month:
        begin_date = moment().startOf('month').format("YYYY-MM-DD");
        end_date = moment().endOf('month').format("YYYY-MM-DD");
        break;
      case zangyo_bot.ranges.last_month:
        var lastmonth = moment().subtract(1, 'months');
        begin_date = lastmonth.startOf('month').format("YYYY-MM-DD");
        end_date = lastmonth.endOf('month').format("YYYY-MM-DD");
        break;
      case zangyo_bot.ranges.month_before_last:
        var lastmonth = moment().subtract(2, 'months');
        begin_date = lastmonth.startOf('month').format("YYYY-MM-DD");
        end_date = lastmonth.endOf('month').format("YYYY-MM-DD");
        break;
      default:
        if (range.match(/\d{1,2}/g)) {
          var target = range.match(/\d{1,2}/g);
          begin_date = moment().format("YYYY-") + ('0' + target[0]).slice(-2) + '-' + ('0' + target[1]).slice(-2);
          end_date = moment().format("YYYY-") + ('0' + target[0]).slice(-2) + '-' + ('0' + target[1]).slice(-2);
        } else {
          var today = moment().format("YYYY-MM-DD");
          begin_date = today;
          end_date = today
        }
        break;
    }

    var selector = {team: team_id, applied_at: {$exists: true}};
    var sort = {date: 1, applicant: 1, start_time: 1, end_time: 1};
    controller.storage.zangyos.select(selector, sort, function(err, zangyos) {
      var list = [];

      for (var i = 0; i < zangyos.length; i++) {
        var zangyo = zangyos[i];

        switch (filter) {
          case zangyo_bot.filters.approved:
            if (!zangyo.approved) continue;
            break;
          case zangyo_bot.filters.last:
            if (!zangyo.approved) continue;
            if (i < zangyos.length-1) {
              var next_zangyo = zangyos[i+1];
              if (zangyo.date == next_zangyo.date
                  && zangyo.applicant == next_zangyo.applicant) continue;
            }
            break;
          default:
            break;
        }

        if ((!applicant || zangyo.applicant == applicant)
            && zangyo.date >= begin_date
            && zangyo.date <= end_date) {
          list.push(getMessageItem(zangyo));
        }
        if (list.length >= 100) break;
      }

      replyWholeMessage(list, applicant, filter);
    });
  };

  zangyo_bot.replyPendingList = function(bot, message) {
    var selector = {team: message.team, date: moment().format("YYYY-MM-DD"), applied_at: {$exists: true}, approved: {$exists: false}};
    var sort = {applicant: 1, start_time: -1, end_time: -1};
    controller.storage.zangyos.select(selector, sort, function(err, zangyos) {
      var attachments = [];

      for (var i = 0; i < zangyos.length; i++) {
        var zangyo = zangyos[i];
        if (zangyo.approver == message.user) {
          var attachment = {
            "callback_id": "approve-" + zangyo.id,
            "fallback": "<@" + zangyo.applicant + "> さんからの残業申請",
            "color": "#aaa",
            "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
            "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
            "fields": [
              {
                "title": zangyo.end_time + "まで、以下の理由により残業します。",
                "value": zangyo.reason,
                "short": false
              }
            ],
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
              },
              {
                "type": "button",
                "name": "reject-comment",
                "text": "却下(コメントつき)",
                "style": "danger"
              }
            ]
          }
          attachments.push(attachment);
        } else if (zangyo.applicant == message.user) {
          var attachment = {
            "callback_id": "apply-" + zangyo.id,
            "fallback": "<@" + zangyo.approver + "> さんへの残業申請",
            "color": "#aaa",
            "title": "残業申請 - " + moment(zangyo.date).format("MM月DD日(ddd)"),
            "text": "<@" + zangyo.applicant + ">  >>>  <@" + zangyo.approver + ">",
            "fields": [
              {
                "title": zangyo.end_time + "まで、以下の理由により残業します。",
                "value": zangyo.reason,
                "short": false
              }
            ],
            "actions": [
              {
                "type": "button",
                "name": "apply",
                "text": "再申請",
                "style": "primary"
              }
            ]
          }
          attachments.push(attachment);
        }
      }

      var reply;
      if (attachments.length > 0) {
        reply = {
          "text": "あなたが申請者or承認者の未承認一覧だよ。",
          "attachments": attachments
        }
      } else {
        reply = "あなたが申請者or承認者の未承認一覧はないよ。";
      }

      bot.reply(message, reply);
    });
  };

  return zangyo_bot;
}

module.exports = ZangyoBot;
