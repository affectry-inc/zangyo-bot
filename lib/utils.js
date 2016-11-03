"use strict";

var uuid = function() {
  var uuid = "", i, random;
  for (i = 0; i < 32; i++) {
    random = Math.random() * 16 | 0;
    uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
  }
  return uuid;
}

/*
 * local unique identifier
 */
var luid = function() {
  var c = randomChar();
  var s = new Date().getTime().toString(36).toUpperCase();

  return c + s;
}

var randomChar = function() {
  var c = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  return c[Math.floor(Math.random() * c.length)];
}

exports.uuid = uuid;
exports.luid = luid;
