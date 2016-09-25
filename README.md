# tinybot

A tiny wrapper around the slack RTM api.

## Requirements

A slack bot token and node 4.2+.

## What is included

* listen for any message in slack
* listen only for messages matching multiple fields
* deregister listeners matching a wildcard
* respond with text in a channel specified by name or ID

## What is not included

* DM functionality
* At mentions
* Incoming/outgoing webhook integration
* Explicit API for adding reactions
* Message storage backend
* Reconnect logic
* Pretty much everything else

## Usage

Hello World

    var Tinybot = require('tinybot');
    var bot     = new Tinybot('mySecretSlackToken');

    bot.say("Hello world"); // posts to #general by default

Basic listener

    var Tinybot = require('tinybot');
    var bot     = new Tinybot('mySecretSlackToken');

    bot.on('message', function(message) {
      bot.say(`Message received: ${JSON.stringify(message)}`);
    })

Filtered listeners

    var Tinybot = require('tinybot');
    var bot     = new Tinybot('mySecretSlackToken');

    // listen for only messages in a channel
    bot.hears({channel: '#general'}, function() {
      bot.say("I heard that!", '#general')
    })

    // rain on everyone's parade with regex matches
    bot.hears({channel: '#general', text: /I love (.*)/}, function foo(message, matches) {
      bot.say(`${matches[1]} sucks`);
    })

    // trolls anyone who posts in #random from an iPhone with nested matchers
    bot.hears({channel: '#random', file: { name: 'Slack for iOS'}, function fooBar(message) {
      bot.say("ooooh, fancy", '#random');
    }})

    // snooze one meeting with hearsOnce
    bot.hearsOnce({channel: '#sales', text: /meeting/}, function() {
      bot.say("let's circle back and put a pin in this. I'm gonna take a quick 5", '#sales');
    })

    bot.drop(/foo.*/); // deregister functions named foo and fooBar
    bot.drop(/.*/);    // deregister all listeners
