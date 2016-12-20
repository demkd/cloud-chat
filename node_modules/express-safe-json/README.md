express-safe-json
-----------------

Prevent HTML tags from rendering in JSON responses.

### Why?

Even when the response is sent with `Content-Type: application/json`, some
browsers attempts to do MIME-type sniffing - meaning that even if the response
is specified as `application/json`, the browser might still render it as HTML
if it appears like valid HTML - leading to an XSS vulnerability.

Adding the `X-Content-Type-Options: nosniff` header disables this behaviour and
can help mitigate this - but its not supported by all browsers.

This library modifies express's `res.send()` method to replace the `<` character
in JSON reponses with `\u003c`.
The modified JSON should still be parsed the same on all JSON parsers, but will
prevent browsers from thinking that it might be an HTML response.

### Install

    npm install express-safe-json

### Use

    var express = require('express')
    require('express-safe-json')(express)

    // or, to have express-safe-json require() express on its own, simply:
    require('express-safe-json')()

    // Then, you can just use res.send(<object>) and res.json(<object>)
    // as you normally do.

### License

MIT
