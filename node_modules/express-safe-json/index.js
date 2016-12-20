var is = require('type-is')

module.exports = function (express) {
  express || (express = require('express'))
  var send = express.response.send

  express.response.send = function(body) {
    return send.call(this, matchReq(this, body) ? escapeBody(body) : body)
  }
}

function matchReq(res, body) {
  return is.is(res.get('Content-Type'), 'json') && typeof body === 'string';
}

function escapeBody(body) {
  return body.replace(/</g, '\\u003c')
}
