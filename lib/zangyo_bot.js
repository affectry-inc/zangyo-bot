'use strict';

var moment = require('moment-timezone');
var luid = require('./utils').luid;

function ZangyoBot(controller) {
  var zangyo_bot = {};

  zangyo_bot.ranges = {
    today: 'today',
    yesterday: 'yesterday',
    day_before_yesterday: 'the day before yesterday',
    this_week: 'this week',
    last_week: 'last week',
    past_one_week: 'the past one week',
    this_month: 'this month',
    last_month: 'last month',
    month_before_last: 'the month before last'
  };

  zangyo_bot.filters = {
    applied: 'applied',
    approved: 'approved',
    latest: 'latest'
  };

  zangyo_bot.applicationWizard = function(err, convo) {
    askApprover(convo);
  };

  function askApprover(convo) {
    convo.ask('Who is your boss? [@xxx]', function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
        convo.next();
      } else if (!response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)) {
        convo.say('Select your boss in the form of @xxx.');
        convo.repeat();
        convo.next();
      } else {
        var zangyo = {}
        zangyo.id = 'Z' + response.user + luid();
        zangyo.team = response.team;
        zangyo.date = moment().tz('Asia\/Tokyo').format('YYYY-MM-DD');
        zangyo.applicant = response.user;
        zangyo.approver = response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
        askEndTime(convo, zangyo);
        convo.next();
      }
    });
  };

  function askEndTime(convo, zangyo) {
    convo.ask('What time will it be done? [HH:MM]', function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
        convo.next();
      } else if (!response.text.match(/^([0-2]?[0-9]):([0-5]?[0-9])$/)) {
        convo.say('Set the time in the form of \'HH:MM\'. Maximum available time is 29:59.');
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
    convo.ask('What are things to do?', function(response, convo) {
      zangyo.reason = response.text;
      controller.storage.zangyos.save(zangyo);
      var summary = getApplicationSummary(zangyo, true);
      convo.say(summary);
      convo.next();
    });
  };

  zangyo_bot.createApplication = function(bot, message, approver, end_time, reason) {
    findUserId(message.team_id, approver, function(approver_id) {
      var zangyo = {}
      zangyo.id = 'Z' + message.user_id + luid();
      zangyo.team = message.team_id;
      zangyo.date = moment().tz('Asia\/Tokyo').format('YYYY-MM-DD');
      zangyo.applicant = message.user_id;
      zangyo.approver = approver_id;
      zangyo.end_time = end_time;
      zangyo.reason = reason;
      controller.storage.zangyos.save(zangyo);
      var summary = getApplicationSummary(zangyo, false);
      bot.replyPrivate(message, summary);
    }, function(){
      bot.replyPrivate(message, '`Approver` is invalid!!');
    });
    // controller.storage.teams.get(message.team_id, function(err, team) {
    //   var api_data = {'token': team.token};
    //   bot.api.callAPI('users.list', api_data, function(err, data){
    //     if (data.members) {
    //       for (var i = 0; i < data.members.length; i++) {
    //         var member = data.members[i];

    //         if (!member.deleted && member.name == approver) {
    //           var zangyo = {}
    //           zangyo.id = 'Z' + message.user_id + luid();
    //           zangyo.team = message.team_id;
    //           zangyo.date = moment().tz('Asia\/Tokyo').format('YYYY-MM-DD');
    //           zangyo.applicant = message.user_id;
    //           zangyo.approver = member.id;
    //           zangyo.end_time = end_time;
    //           zangyo.reason = reason;
    //           controller.storage.zangyos.save(zangyo);
    //           var summary = getApplicationSummary(zangyo, false);
    //           bot.replyPrivate(message, summary);
    //           break;
    //         }
    //         if (i == data.members.length-1) {
    //           bot.replyPrivate(message, '`Approver` is invalid!!');
    //         }
    //       }
    //     } else {
    //       bot.replyPrivate(message, '`Approver` is invalid!!');
    //     }
    //   });
    // });
  };

  function findUserId(team_id, username, cb, onNotFound) {
    controller.storage.teams.get(team_id, function(err, team) {
      if (team && team.token) {
        var api_data = {'token': team.token};
        bot.api.callAPI('users.list', api_data, function(err, data){
          if (data.members) {
            for (var i = 0; i < data.members.length; i++) {
              var member = data.members[i];

              if (!member.deleted && member.name == username) {
                cb(member.id);
                break;
              }
              if (i == data.members.length-1) {
                onNotFound;
              }
            }
          } else {
            onNotFound;
          }
        });
      } else {
        onNotFound;
      }
    });
  };

  function getApplicationSummary(zangyo, can_redo) {
    var actions = [
      {
        'type': 'button',
        'name': 'apply',
        'text': 'Submit',
        'style': 'primary'
      },
      {
        'type': 'button',
        'name': 'cancel',
        'text': 'Cancel'
      }
    ];
    if (can_redo) {
      actions.push(
        {
          'type': 'button',
          'name': 'redo',
          'text': 'Redo'
        }
      );
    }
    var summary = {
      'text': 'Ready to submit?',
      'attachments': [
        {
          'callback_id': 'apply-' + zangyo.id,
          'fallback': 'Zangyo application to <@' + zangyo.approver + '>.',
          'color': '#aaa',
          'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
          'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
          'fields': [
            {
              'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
              'value': zangyo.reason,
              'short': false
            }
          ],
          'actions': actions
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
        'text': 'Your application was submitted.',
        'attachments': [
          {
            'fallback': 'Zangyo application to <@' + zangyo.approver + '>.',
            'color': '#aaa',
            'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
            'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
            'fields': [
              {
                'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
                'value': zangyo.reason,
                'short': false
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
            'text': 'Zangyo application received!! Reply ASAP!!',
            'attachments': [
              {
                'callback_id': 'approve-' + zangyo.id,
                'fallback': 'Zangyo application from <@' + zangyo.applicant + '>.',
                'color': '#aaa',
                'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
                'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
                'fields': [
                  {
                    'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
                    'value': zangyo.reason,
                    'short': false
                  }
                ],
                'actions': [
                  {
                    'type': 'button',
                    'name': 'approve',
                    'text': 'Approve',
                    'style': 'primary'
                  },
                  {
                    'type': 'button',
                    'name': 'reject',
                    'text': 'Reject',
                    'style': 'danger'
                  },
                  {
                    'type': 'button',
                    'name': 'reject-comment',
                    'text': 'Reject with comments',
                    'style': 'danger'
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
    bot.replyInteractive(message, 'Redo from the beginning!!');
    bot.startConversation(message, zangyo_bot.applicationWizard);
  };

  zangyo_bot.cancelApply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.remove(zangyo_id);
    bot.replyInteractive(message, 'It\'s canceled!! Go back home now!!');
  };

  zangyo_bot.approve = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, 'It\'s processed already.');
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = true;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.startPrivateConversation({user: zangyo.applicant}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say(getSummary(zangyo, false, true));
          convo.next();
        }
      });
    });
  };

  zangyo_bot.rejectApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, 'It\'s processed already.');
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = false;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.startPrivateConversation({user: zangyo.applicant}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say(getSummary(zangyo, false, true));
          convo.next();
        }
      });
    });
  };

  zangyo_bot.rejectCommentApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      bot.replyInteractive(message, getSummary(zangyo, true, false));
    });

    bot.startConversation(message, function(err, convo){
      convo.ask('Give me your comments!!', function(response, convo) {
        controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
          zangyo.approver_comment = response.text;
          controller.storage.zangyos.save(zangyo);
          var application = {
            'text': 'Ready to reject?',
            'attachments': [
              {
                'callback_id': 'approve-' + zangyo.id,
                'fallback': 'Zangyo application from <@' + zangyo.applicant + '>.',
                'color': '#aaa',
                'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
                'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
                'fields': [
                  {
                    'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
                    'value': zangyo.reason,
                    'short': false
                  },
                  {
                    'title': 'Approver comments.',
                    'value': zangyo.approver_comment,
                    'short': false
                  },
                ],
                'actions': [
                  {
                    'type': 'button',
                    'name': 'reject',
                    'text': 'Reject',
                    'style': 'danger'
                  },
                  {
                    'type': 'button',
                    'name': 'reject-comment',
                    'text': 'Edit comments',
                    'style': 'default'
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
    var result_word, result_word_cap, color, text, fields, fallback, footer, ts;

    fields = [
      {
        'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
        'value': zangyo.reason,
        'short': false
      }
    ]

    if (is_done) {
      if (zangyo.approved) {
        result_word = 'approved';
        result_word_cap = 'Approved';
        color = 'good';
      } else {
        result_word = 'rejected';
        result_word_cap = 'Rejected';
        color = 'danger';
      }

      if (is_reply) {
        text = 'Zangyo application was ' + result_word + '.';
      } else {
        text = '<@' + zangyo.applicant + '> Zangyo application was ' + result_word + '.';
      }

      if (zangyo.approver_comment) {
        var comment_field = {
          'title': 'Approver comments.',
          'value': zangyo.approver_comment,
          'short': false
        }
        fields.push(comment_field);
      }

      fallback = 'Application from <@' + zangyo.applicant + '> was ' + result_word + '.';
      footer = result_word_cap + ' by <@' + zangyo.approver + '>';
      ts = zangyo.approved_at;
    } else {
      result_word = 'rejected';
      color = '#aaa';

      if (is_reply) {
        text = 'Zangyo application will be ' + result_word + '.';
      }

      fallback = 'Application from <@' + zangyo.applicant + '> will be ' + result_word + '.';
    }

    var summary = {
      'text': text,
      'attachments': [
        {
          'fallback': fallback,
          'color': color,
          'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
          'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
          'fields': fields,
          'footer': footer,
          'ts': ts
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
        icon = ':speech_balloon:';
      } else if (zangyo.approved) {
        icon = ':white_check_mark:';
      } else {
        icon = ':x:';
      }

      field.value = icon + moment(zangyo.date).format('MM/DD ') + zangyo.end_time + ' - <@' + zangyo.applicant + '>' ;
      field.short = false

      return field;
    }, function(fields, applicant, filter){
      var reply;
      var applicant_text = applicant ? 'of <@' + applicant + '> ' : '';
      if (fields.length == 0) {
        reply = 'There is no ' + filter + ' zangyos ' + applicant_text + 'of ' + range + '.';
      } else if (fields.length < 100) {
        reply = {
          'text': 'The ' + filter + ' zangyo list ' + applicant_text + 'of ' + range + '.',
          'attachments': [
            {
              'color': '#aaa',
              'fields': fields
            }
          ]
        }
      } else {
        reply = {
          'text': 'The ' + filter + ' zangyo list ' + applicant_text + 'of ' + range + ' has more than 100 zangyos. Please adjust search conditions... :face_with_rolling_eyes:',
          'attachments': [
            {
              'color': '#aaa',
              'fields': fields
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
        attachment.color = '#aaa';
        attachment.footer = 'Waiting for <@' + zangyo.approver + '>\'s reply.';
      } else if (zangyo.approved) {
        attachment.color = 'good';
        attachment.footer = 'Approved by <@' + zangyo.approver + '>.';
      } else {
        attachment.color = 'danger';
        attachment.footer = 'Rejected by <@' + zangyo.approver + '>.';
      }
      attachment.title = moment(zangyo.date).format('MM/DD ') + zangyo.end_time + ' - <@' + zangyo.applicant + '>';
      attachment.text = zangyo.reason;
      if (zangyo.approver_comment) {
        attachment.fields = [
          {
            'title': 'Approver comments.',
            'value': zangyo.approver_comment,
            'short': false
          }
        ];
      }
      attachment.ts = zangyo.approved_at;

      return attachment;
    }, function(attachments, applicant, filter){
      var reply;
      var applicant_text = applicant ? 'of <@' + applicant + '> ' : '';
      if (attachments.length == 0) {
        reply = 'There is no ' + filter + ' zangyos ' + applicant_text + 'of ' + range + '.';
      } else if (attachments.length < 100) {
        reply = {
          'text': 'The detailed ' + filter + ' zangyo list ' + applicant_text + 'of ' + range + '.',
          'attachments': attachments
        }
      } else {
        reply = {
          'text': 'The ' + filter + ' zangyo list ' + applicant_text + 'of ' + range + ' has more than 100 zangyos. Please adjust search conditions... :face_with_rolling_eyes:',
          'attachments': attachments
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
        var today = moment().tz('Asia\/Tokyo').format('YYYY-MM-DD');
        begin_date = today;
        end_date = today
        break;
      case zangyo_bot.ranges.yesterday:
        var yesterday = moment().tz('Asia\/Tokyo').subtract(1, 'days').format('YYYY-MM-DD');
        begin_date = yesterday;
        end_date = yesterday;
        break;
      case zangyo_bot.ranges.day_before_yesterday:
        var day_before_yesterday = moment().tz('Asia\/Tokyo').subtract(2, 'days').format('YYYY-MM-DD');
        begin_date = day_before_yesterday;
        end_date = day_before_yesterday;
        break;
      case zangyo_bot.ranges.this_week:
        begin_date = moment().tz('Asia\/Tokyo').startOf('isoweek').format('YYYY-MM-DD');
        end_date = moment().tz('Asia\/Tokyo').endOf('isoweek').format('YYYY-MM-DD');
        break;
      case zangyo_bot.ranges.last_week:
        var lastweek = moment().tz('Asia\/Tokyo').subtract(1, 'weeks');
        begin_date = lastweek.startOf('isoweek').format('YYYY-MM-DD');
        end_date = lastweek.endOf('isoweek').format('YYYY-MM-DD');
        break;
      case zangyo_bot.ranges.past_one_week:
        begin_date = moment().tz('Asia\/Tokyo').subtract(7, 'days').format('YYYY-MM-DD');
        end_date = moment().tz('Asia\/Tokyo').subtract(1, 'days').format('YYYY-MM-DD');
        break;
      case zangyo_bot.ranges.this_month:
        begin_date = moment().tz('Asia\/Tokyo').startOf('month').format('YYYY-MM-DD');
        end_date = moment().tz('Asia\/Tokyo').endOf('month').format('YYYY-MM-DD');
        break;
      case zangyo_bot.ranges.last_month:
        var lastmonth = moment().tz('Asia\/Tokyo').subtract(1, 'months');
        begin_date = lastmonth.startOf('month').format('YYYY-MM-DD');
        end_date = lastmonth.endOf('month').format('YYYY-MM-DD');
        break;
      case zangyo_bot.ranges.month_before_last:
        var lastmonth = moment().tz('Asia\/Tokyo').subtract(2, 'months');
        begin_date = lastmonth.startOf('month').format('YYYY-MM-DD');
        end_date = lastmonth.endOf('month').format('YYYY-MM-DD');
        break;
      default:
        if (range.match(/\d{1,2}/g)) {
          var target = range.match(/\d{1,2}/g);
          begin_date = moment().tz('Asia\/Tokyo').format('YYYY-') + ('0' + target[0]).slice(-2) + '-' + ('0' + target[1]).slice(-2);
          end_date = moment().tz('Asia\/Tokyo').format('YYYY-') + ('0' + target[0]).slice(-2) + '-' + ('0' + target[1]).slice(-2);
        } else {
          var today = moment().tz('Asia\/Tokyo').format('YYYY-MM-DD');
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
          case zangyo_bot.filters.latest:
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
    var selector = {team: message.team, date: moment().tz('Asia\/Tokyo').format('YYYY-MM-DD'), applied_at: {$exists: true}, approved: {$exists: false}};
    var sort = {applicant: 1, start_time: -1, end_time: -1};
    controller.storage.zangyos.select(selector, sort, function(err, zangyos) {
      var attachments = [];

      for (var i = 0; i < zangyos.length; i++) {
        var zangyo = zangyos[i];
        if (zangyo.approver == message.user) {
          var attachment = {
            'callback_id': 'approve-' + zangyo.id,
            'fallback': 'Zangyo application from <@' + zangyo.applicant + '>.',
            'color': '#aaa',
            'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
            'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
            'fields': [
              {
                'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
                'value': zangyo.reason,
                'short': false
              }
            ],
            'actions': [
              {
                'type': 'button',
                'name': 'approve',
                'text': 'Approve',
                'style': 'primary'
              },
              {
                'type': 'button',
                'name': 'reject',
                'text': 'Reject',
                'style': 'danger'
              },
              {
                'type': 'button',
                'name': 'reject-comment',
                'text': 'Reject with comments',
                'style': 'danger'
              }
            ]
          }
          attachments.push(attachment);
        } else if (zangyo.applicant == message.user) {
          var attachment = {
            'callback_id': 'apply-' + zangyo.id,
            'fallback': 'Zangyo application to <@' + zangyo.approver + '>.',
            'color': '#aaa',
            'title': 'Zangyo Application - ' + moment(zangyo.date).format('MM/DD(ddd)'),
            'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
            'fields': [
              {
                'title': 'Until ' + zangyo.end_time + ', the following things will be done.',
                'value': zangyo.reason,
                'short': false
              }
            ],
            'actions': [
              {
                'type': 'button',
                'name': 'apply',
                'text': 'Reapply',
                'style': 'primary'
              }
            ]
          }
          attachments.push(attachment);
        }
      }

      var reply;
      if (attachments.length > 0) {
        reply = {
          'text': 'The waiting zangyo list from/to you.',
          'attachments': attachments
        }
      } else {
        reply = 'There is no waiting zangyos from/to you.';
      }

      bot.reply(message, reply);
    });
  };

  return zangyo_bot;
}

module.exports = ZangyoBot;
