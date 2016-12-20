var safe_json = require('./index')
  , express   = require('express')
  , assert    = require('assert')
  , request   = require('supertest')

describe('express-safe-json', function() {
  var app = express()
  app.set('json spaces', false)
  safe_json(app)

  it('escapes HTML in JSON responses', function(done) {
    app.get('/json', function(req, res) { res.json({'<foo>':'<bar>'}) })

    request(app)
      .get('/json')
      .expect('Content-Type', /json/)
      .expect('{"\\u003cfoo>":"\\u003cbar>"}')
      .expect({'<foo>':'<bar>'}, done)
  })

  it('should not modify non-JSON responses', function(done) {
    app.get('/text', function(req, res) { res.send('<foo><bar>') })

    request(app)
      .get('/text')
      .expect('<foo><bar>', done)
  })
})
