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

  zangyo_bot.createApplication = function(err, convo) {
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
        zangyo.id = "Z" + luid();
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
      controller.storage.teams.get(response.team, function(err, team) {
        if (!team.zangyos) {
          team.zangyos = [];
        }

        team.zangyos.push(zangyo);
        controller.storage.teams.save(team);
      });
      convo.say(summary);
      convo.next();
    });
  };

  zangyo_bot.apply = function(zangyo_id, bot, message) {
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      team.zangyos[idx].applied_at = moment().unix();
      controller.storage.teams.save(team);
      var zangyo = team.zangyos[idx];
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
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      team.zangyos.splice(idx, 1);
      controller.storage.teams.save(team);
      bot.replyInteractive(message, "最初からやり直し！");
      bot.startConversation(message, zangyo_bot.createApplication);
    });
  };

  zangyo_bot.cancelApply = function(zangyo_id, bot, message) {
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      team.zangyos.splice(idx, 1);
      controller.storage.teams.save(team);
      bot.replyInteractive(message, "キャンセルしたよ。さっさと帰ろう！");
    });
  };

  zangyo_bot.approve = function(zangyo_id, bot, message) {
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      if (team.zangyos[idx].approved_at) {
        bot.reply(message, "処理済みだよ。");
        bot.replyInteractive(message, getSummary(team.zangyos[idx], true, true));
        return;
      }

      team.zangyos[idx].approved = true;
      team.zangyos[idx].approved_at = moment().unix();
      controller.storage.teams.save(team);
      var zangyo = team.zangyos[idx];
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.configureIncomingWebhook(team.incoming_webhook);
      bot.sendWebhook(getSummary(zangyo, false, true), function(err,res) {
        if (err) console.log(err);
      });
    });
  };

  zangyo_bot.rejectApprove = function(zangyo_id, bot, message) {
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      if (team.zangyos[idx].approved_at) {
        bot.reply(message, "処理済みだよ。");
        bot.replyInteractive(message, getSummary(team.zangyos[idx], true, true));
        return;
      }

      team.zangyos[idx].approved = false;
      team.zangyos[idx].approved_at = moment().unix();
      controller.storage.teams.save(team);
      var zangyo = team.zangyos[idx];
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.configureIncomingWebhook(team.incoming_webhook);
      bot.sendWebhook(getSummary(zangyo, false, true), function(err,res) {
        if (err) console.log(err);
      });
    });
  };

  zangyo_bot.rejectCommentApprove = function(zangyo_id, bot, message) {
    getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
      if (team.zangyos[idx].approved_at) {
        bot.reply(message, "処理済みだよ。");
        bot.replyInteractive(message, getSummary(team.zangyos[idx], true, true));
        return;
      }

      // team.zangyos[idx].approved = false;
      // team.zangyos[idx].approved_at = moment().unix();
      // controller.storage.teams.save(team);

      var zangyo = team.zangyos[idx];
      bot.replyInteractive(message, getSummary(zangyo, true, false));
    });

    bot.startConversation(message, function(err, convo){
      convo.ask("コメントをちょーだい。", function(response, convo) {
        getTeamZangyo(message.team.id, zangyo_id, function(team, idx) {
          team.zangyos[idx].approver_comment = response.text;
          controller.storage.teams.save(team);

          var zangyo = team.zangyos[idx];
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
                    "text": "却下",
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
          // bot.configureIncomingWebhook(team.incoming_webhook);
          // bot.sendWebhook(getSummary(zangyo, false, true), function(err,res) {
          //   if (err) console.log(err);
          // });
        });
        convo.next();
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

  function getTeamZangyo(team_id, zangyo_id, cb) {
    controller.storage.teams.get(team_id, function(err, team) {
      for (var i = 0; i < team.zangyos.length; i++) {
        if (team.zangyos[i].id == zangyo_id) {
          cb(team, i);
          break;
        }
      }
    });
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
      var icon = zangyo.approved ? ":white_check_mark:" : ":x:";

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
      bot.reply(message, reply);
    });
  };

  function buildDetailedMessage(bot, message, range, applicant, filter) {
    findTargetZangyo(message.team, range, applicant, filter, function(zangyo){
      var attachment = {};
      if (zangyo.approved == true) {
        attachment.color = "good";
        attachment.footer = "<@" + zangyo.approver + "> が承認しました。";
      } else {
        attachment.color = "danger";
        attachment.footer = "<@" + zangyo.approver + "> が却下しました。";
      }
      attachment.title = moment(zangyo.date).format("MM/DD ") + zangyo.end_time + "まで <@" + zangyo.applicant + ">";
      attachment.text = zangyo.reason;
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
      bot.reply(message, reply);
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

    controller.storage.teams.get(team_id, function(err, team) {
      var list = [];
      var zangyos = team.zangyos.sort(function(a, b){
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.applicant < b.applicant) return -1;
        if (a.applicant > b.applicant) return 1;
        if (a.end_time < b.end_time) return -1;
        if (a.end_time > b.end_time) return 1;
        return 0;
      });

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
            if (zangyo.approved == null) continue;
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
    controller.storage.teams.get(message.team, function(err, team) {
      var attachments = [];

      for (var i = team.zangyos.length-1; i >= 0; i--) {
        var zangyo = team.zangyos[i];

        if (zangyo.approved == null && zangyo.date == moment().format("YYYY-MM-DD")) {
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
