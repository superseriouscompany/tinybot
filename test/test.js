var expect    = require('expect');
var slackTest = require('slack-rtm-test');
var secrets   = require('./secrets');
var Tinybot   = require('../index');
var debug     = require('debug')('tinybot:test');

var slackToken = secrets.token;

if( !slackToken ) { return console.error("Put your slack token into secrets.json in this folder, under the key 'token'") }

describe('live calls', function() {
  it('connects to slack as expected', function(cb) {
    var bot = new Tinybot(slackToken);
    bot.start(cb);
  })

  it('can send a message', function(cb) {
    var bot = new Tinybot(slackToken);

    bot.start(function(err) {
      if( err ) { return cb(err); }

      bot.on('message', function listener(message, channel) {
        if( !message.reply_to ) { return; }
        expect(message.ts).toExist(JSON.stringify(message) + ' is not ok.');
        bot.removeListener('message', listener);
        cb();
      })

      bot.say('Mocha live test', '#marvinandme');
    })
  })
})

describe('tinybot', function() {
  var bot;
  before(function(cb){
    slackTest.serve(6969, {
      channels: [{ name: 'general', id: 'CG0' }],
      self: { id: 'DISBOT' }
    }, function(err) {
      if( err ) { return cb(err); }
      bot = new Tinybot(slackToken, '#general', 'http://localhost:6969');
      bot.start(cb);
    });
  })

  afterEach(function() {
    bot.drop(/.*/);
  })

  describe('hearing', function() {
    it('matches exact', function(cb) {
      bot.hears({text: 'cool'}, function(message) {
        expect(message.type).toEqual('message', `Unexpected message: ${JSON.stringify(message)}`);
        cb();
      });
      slackTest.socket.send({ text: 'cool' })
    })

    it('matches a regexp', function(cb) {
      bot.hears({filename: /n(.*)e/}, function(message, matches) {
        expect(matches[1]).toEqual('op');
        cb();
      })
      slackTest.socket.send({ file: { name: 'foo nope bar'}});
    })

    it('translates usernames', function(cb) {
      bot.hears({user: 'neil'}, function(message) {
        cb();
      })
      slackTest.socket.send({ user: 'n0'}); // this is defined in slackTest as the ID for neil
    })

    it('allows hearing once', function(cb) {
      var counter = 0;
      var spy = expect.createSpy();

      bot.hearsOnce({text: 'great'}, spy);

      bot.hears({text: 'great'}, function() {
        if( ++counter == 2 ) {
          expect(spy.calls.length).toEqual(1);
          cb();
        }
      })

      slackTest.socket.send({ text: 'red herring'});
      slackTest.socket.send({ text: 'great' });
      slackTest.socket.send({ text: 'great' });
    })

    it('matches multiple filters', function(cb) {
      var counter = 0;
      var spy = expect.createSpy();

      bot.hears({text: 'sick', channel: '#general'}, spy);
      bot.hears({channel: '#general'}, function() {
        if( ++counter == 2 ) {
          expect(spy.calls.length).toEqual(1);
          cb();
        }
        debug(counter);
      })

      slackTest.socket.send({ text: 'nope', channel: 'CG0'})
      slackTest.socket.send({ text: 'sick', channel: 'CG0'})
      slackTest.socket.send({ text: 'sick', channel: 'NOPE'}, function(err) {
        expect(err).toBeTruthy();
      })
    })

    it('ignores messages from self', function(cb) {
      var spy = expect.createSpy();
      bot.hears({'text': /.+/}, spy);

      bot.hearsOnce({'text': /.+/, self: true}, function() {
        expect(spy).toNotHaveBeenCalled();
        cb();
      })

      slackTest.socket.send({ text: 'foo', user: 'DISBOT'});
    })

    it('allows sending messages to channel based on name', function(cb) {
      bot.hears({channel: '#general'}, function(message) {
        return cb();
      });

      slackTest.socket.send({ channel: '#general'});
    })

    it("expands nested fields", function (cb) {
      bot.hears({"file.name": 'Slack for iOS'}, function(message) {
        bot.say("ooooh, fancy");
      })

      var conversation = [
        {
          file: {
            name: 'Slack for iOS'
          }
        },
        {
          response: 'ooooh, fancy'
        }
      ]

      slackTest.expectConversation(conversation, cb);
    });

    it('matches booleans', function(cb) {
      bot.hears({"file": true}, function(message) {
        bot.say('wow, nice file.');
      })

      var conversation = [
        {
          file: {
            name: 'Anything'
          }
        },
        {
          response: 'wow, nice file.'
        }
      ]

      slackTest.expectConversation(conversation, cb);
    })

    describe('drop', function() {
      it('allows dropping by function name', function(cb) {
        // we can't use spies here bc we need the function name
        var counter = 0, coolCounter = 0;
        bot.hears({text: 'nice'}, function cool(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function (message) {
          if( ++counter == 2 ) {
            expect(coolCounter).toEqual(1);
            cb();
          }
        })

        slackTest.socket.send({text: 'nice'});
        setTimeout(function wait() {
          if( counter < 1 ) { return setTimeout(wait, 10); }
          bot.drop('cool');
          slackTest.socket.send({text: 'nice'});
        }, 10);
      })

      it('allows dropping multiple functions by wildcard', function(cb) {
        var counter = 0, coolCounter = 0;
        bot.hears({text: 'nice'}, function cool(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function cool_grand(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function (message) {
          if( ++counter == 2 ) {
            expect(coolCounter).toEqual(2);
            cb();
          }
        })

        slackTest.socket.send({text: 'nice'});
        setTimeout(function wait() {
          if( counter < 1 ) { return setTimeout(wait, 10); }
          bot.drop(/cool.*/);
          slackTest.socket.send({text: 'nice'});
        }, 10);
      })

      it('drops exact string matches properly', function(cb) {
        var counter = 0, coolCounter = 0;
        bot.hears({text: 'nice'}, function cool(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function yepcoolgreat(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function (message) {
          if( ++counter == 2 ) {
            expect(coolCounter).toEqual(3);
            cb();
          }
        })

        slackTest.socket.send({text: 'nice'});
        setTimeout(function wait() {
          if( counter < 1 ) { return setTimeout(wait, 10); }
          bot.drop('cool');
          slackTest.socket.send({text: 'nice'});
        }, 10);
      })
    })
  })
})
