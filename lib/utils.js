"use strict";

/*
 * local unique identifier
 */
var luid = function() {
  return new Date().getTime().toString(36).toUpperCase();
}

exports.luid = luid;
