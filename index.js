'use strict';

var request      = require('request');
var WebSocket    = require('ws');
var EventEmitter = require('events');
var debug        = require('debug')('tinybot');

var id = 0;

class Bot extends EventEmitter {
  constructor(token, defaultChannel, url) {
    super();
    this.slackApi = request.defaults({
      baseUrl: url || 'https://slack.com/api',
      json: true,
      qs: {
        token: token
      }
    })

    this.listeners = []
  }

  /**
   * start connects to the slack RTM api, populates users and channels, and
   * registers an event emitter for each message
   *
   * @param  {Function} cb Callback function for error handling
   * @callback {Error} Error returned in cb
   */
  start(cb) {
    var self = this;

    self.slackApi({
      method: 'GET',
      url: "/rtm.start"
    }, function(err, response, body) {
      if( err ) { return cb(err); }
      if( response.statusCode > 299 ) {
        var err = new Error("Couldn't connect to slack.");
        err.name = 'RequestFailed'
        err.statusCode = response.statusCode;
        err.responseBody = body;
        return cb(err);
      }
      if( !body.ok ) {
        var err = new Error("Couldn't connect to slack.");
        err.name = 'SlackError'
        err.statusCode = response.statusCode;
        err.responseBody = body;
        return cb(err);
      }

      var wsUrl     = body.url;
      self.users    = body.users;
      self.channels = body.channels;
      self.ws       = new WebSocket(wsUrl);

      self.ws.on('open', function open() {
        debug("Socket opened", wsUrl);
        cb();
      })
      self.ws.on('message', function(data, flags) {
        try {
          var message = JSON.parse(data);
        } catch(err) {
          console.warn("Bad JSON in slack message", data);
        }
        if( message.type != 'reconnect_url' ) { debug(message); }
        self.emit('message', message);
      })
    })
  }

  /**
   * hears is a convenience method that allows you to filter emitted messages
   * and deregister your listener easily. Type is presumed to be message if not specified.
   *
   * @example
   * bot.hears({ text: 'cool' }, ...)  // exact match on text key of any type 'message' in any channel
   * bot.hears({ text: /foo/ },  ...)  // regex match like above
   * bot.hears({ filename: 'great.jpg', channel: '#random' }, ...) // filename and channel match
   *
   * @param  {Object}   matcher  see examples above
   * @param  {Function} cb       cb(message, matches)
   * @return {Object}   message  the slack message object
   * @return {string}   channel  the channel posted in
   * @return {Array}    matches  capture groups if regexp is specified
   */
  hears(matcher, cb) {
    var self = this;

    var listener = function(message) {
      var matches = self.checkMessage(message, matcher);
      if( !matches ) { return; }
      cb(message, matches);
    }

    this.on('message', listener);
    this.listeners.push({
      listener: listener,
      name: cb.name
    })
  }

  /**
   * say posts a slack message from the bot to a given channel
   *
   * @param  {string} text text to send back
   * @param  {string} channelId|channelName channel id or name you want to post in. uses default if omitted.
   */
  say(text, channelId) {
    var self = this;
    channelId = channelId || defaultChannel;

    if( channelId[0] == '#' ) { channelId = channelIdForName(channelId); }
    // TODO: surface this error
    if( !channelId ) { return console.error("Invalid channelId"); }

    var message = {
      channel: channelId,
      text: text,
      type: 'message',
      id: ++id
    };
    self.ws.send(JSON.stringify(message), {mask: true});
  }

  /**
   * hearsOnce is a convenience method for hears that stops listening after
   * catching one message. See `hears` for method definition.
   */
  hearsOnce(matcher, cb) {
    var self = this;

    self.on('message', function listener(message) {
      var matches = self.checkMessage(message, matcher);
      if( !matches ) { return; }
      self.removeListener('message', listener);
      cb(message, matches);
    })
  }

  /**
   * drop removes all listeners with function names matching the given pattern
   * it is similar in functionality to jQuery.off but accepts wildcards
   *
   * @example
   * bot.hears('foo', function cool() {})
   * bot.hears('bar', function coolNice() {})
   * bot.hears('baz', function() {})
   * bot.drop('cool*') // drops 'foo' and 'bar' listener
   * bot.drop('*')     // drops all listeners
   *
   * @param  {(RegExp|string)} functionPattern Pattern of listener function names to remove
   */
  drop(functionPattern) {
    var self = this;

    if( !functionPattern ) { return console.warn("Pass * to remove all listeners"); }
    if( functionPattern == '*' ) { functionPattern = '.*' }
    self.listeners.filter(function(l) {
      return l.name.match(functionPattern);
    }).forEach(function(l) {
      self.removeListener('message', l.listener);
    })

    self.listeners = self.listeners.filter(function(l) { return !l.name.match(functionPattern); })
  }

  /**
   * addTrait adds a function providing a set of behaviors, usually by adding
   * listeners. it is useful for composition of multiple behaviors
   *
   * @example
   * var sad = require('./traits/sad');
   * var mad = require('./traits/sad');
   * bot.addTrait(sad);
   * bot.addTrait(mad);
   * bot.addTrait(function(bot) {
   *  bot.hearsOnce(/cool/, function foo(message) { bot.say("nice") })
   * })
   *
   * @param {function} traitFn a function that has an instance of this injected
   */
  addTrait(traitFn) {
    traitFn(this);
  }

  /**
   * channelIdForName returns the slack channel id for a given channel name
   *
   * @example
   * bot.channelIdForName('general')  // returns C123FOOBAR
   * bot.channelIdForName('#general') // returns C123FOOBAR
   *
   * @param  {string} name channel name
   * @return {string}      Slack channel ID
   */
  channelIdForName(name) {
    var self = this;

    name = name.replace(/^#/, '');
    var channel = self.channels.find(function(c) {
      return c.name == name;
    });
    return channel && channel.id;
  }

  /**
   * userIdForName returns the user id for a given username
   *
   * @example
   * bot.channelIdForName('thebigdog')  // returns U123FOOBAR
   * bot.channelIdForName('@thebigdog') // returns U123FOOBAR
   *
   * @param  {string} name user name
   * @return {string}      Slack user ID
   */
  userIdForName(name) {
    var self = this;

    name = name.replace(/^@/, '');
    var user = self.users.find(function(u) {
      return u.name == name;
    });
    return user && user.id;
  }

  // private functions
  checkMessage(message, matcher) {
    var self = this;
    var keys = Object.keys(matcher);
    var matches;
    for( var i = 0; i < keys.length; i++ ) {
      var field = keys[i];
      var value = matcher[field];
      var actual = message[field];
      if( field == 'filename' ) { actual = message.file && message.file.name; }
      if( field == 'user' && value[0] != 'U' )    { value = self.userIdForName(value); }
      if( field == 'channel' && value[0] != 'C' ) { value = self.channelIdForName(value); }
      if( !actual || !value ) { return false; }
      if( typeof value === 'string' && actual !== value ) { return false; }
      if( value instanceof RegExp && !(matches = actual.match(value)) ) { return false; }
    }
    return matches || true;
  }
}

module.exports = Bot;
