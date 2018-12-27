/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser')
var url = require('url');
var Promise = require("bluebird");

var secrets = require('./secret.js');

var client_id = secrets.CLIENT_ID; // Your client id
var client_secret = secrets.CLIENT_SECRET; // Your secret
var redirect_uri = secrets.REDIRECT_URI; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser())
   .use(bodyParser.urlencoded({ extended: false }))
   .use(bodyParser.json())


app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-modify-public';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    return request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        console.log('xxxxxx', options)

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        res.cookie('access_token', access_token)

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/add', function(req, res) {

  var uri = url.format({
    protocol: 'https',
    hostname: 'api.spotify.com',
    pathname: '/v1/playlists/5sn3spUYxULaAPdyxTLubR/tracks',
    query: {
      uris: [req.query.track]
    }
  });

  var headers = {
    'content-type': 'application/x-www-form-urlencoded',
    'Authorization': 'Bearer ' + req.cookies.access_token
  };

  request.post({
    url: uri,
    headers: headers
  }, function(error, response, body) {
    if (!error) {
      res.send('yay!!');
    } else {
      res.send(error)
    }
  });
});

app.get('/single-search', function(req, res) {

  console.log(req)
  var uri = url.format({
    protocol: 'https',
    hostname: 'api.spotify.com',
    pathname: '/v1/search',
    query: {
      q: req.query.track,
      type: 'track',
      limit: 1
    }
  });

  var headers = {
    'content-type': 'application/x-www-form-urlencoded',
    'Authorization': 'Bearer ' + req.cookies.access_token
  };

  request.get({
    url: uri,
    headers: headers
  }, function(error, response, body) {
    console.log(response.body)
    if (!error && response.body && JSON.parse(response.body).tracks.items[0]) {
      res.send(JSON.parse(response.body).tracks.items[0])
      // var trackUri = JSON.parse(response.body).tracks.items[0].uri;
      // res.redirect('/add?track=' + trackUri)
    } else {
      res.send('no luck')
    }
  });
});

// search for multiple songs at the same time
app.get('/search', function(req, res) {

  var tracks = req.query.tracks.split(',');

  var uri = url.format({
    protocol: 'https',
    hostname: 'api.spotify.com',
    pathname: '/v1/search',
    query: {
      type: 'track',
      limit: 1
    }
  });

  var headers = {
    'content-type': 'application/x-www-form-urlencoded',
    'Authorization': 'Bearer ' + req.cookies.access_token
  };

  var promises = tracks.map( function(track) {
    return new Promise (function(resolve, reject) {
      request.get({
        url: uri + '&q=' + track,
        headers: headers
      }, function(error, response, body) {
        if (!error && response.body && JSON.parse(response.body).tracks.items[0]) {
          resolve(JSON.parse(response.body).tracks.items[0].uri);
        } else {
          reject(error)
        }
      });
    })
  })

  Promise.all(promises)
  .then(function(result){
    var tracks = result.join(',');
    var uri = url.format({
      protocol: 'https',
      hostname: 'api.spotify.com',
      pathname: '/v1/playlists/5sn3spUYxULaAPdyxTLubR/tracks',
      query: {
        uris: tracks
      }
    });

    request.post({
      url: uri,
      headers: headers
    }, function(error, response, body) {
      if (!error) {
        res.send('yay!!');
      } else {
        res.send(error)
      }
    });
  })

  .catch(function(err){
      console.log("error message:" + err);
  });

});

console.log('Listening on 8888');
app.listen(8888);
