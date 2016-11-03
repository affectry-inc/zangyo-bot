"use strict";

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

exports.luid = luid;
