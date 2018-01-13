'use strict';
const Adapter = require('hubot/src/adapter');
const Msgs = require('hubot/src/message');
const TextMessage = Msgs.TextMessage;
const url = require('url');
const urlRegex = require('url-regex');
const exactUrl = urlRegex({exact: true});

const Hipchatter = require('../lib/hipchatter');

function isUrlToImage (txt) {
  if (!exactUrl.test(txt)) {
    return false;
  }
  let path = url.parse(txt.toLowerCase()).pathname;
  return (
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.png') ||
    path.endsWith('.gif')
  );
}

class HipChatApi extends Adapter {
  constructor (robot) {
    super(robot);
    this.robot.logger.info('constructor');
    this.lastMessageId = {};
    this.sendDelay = 5;

    let token = process.env.HUBOT_HIPCHAT_API_TOKEN;
    let endpoint = process.env.HUBOT_HIPCHAT_API_ENDPOINT;
    let proxy = process.env.HUBOT_HIPCHAT_API_PROXY;
    let roomlist = process.env.HUBOT_HIPCHAT_API_ROOMS;
    let readyMsg = process.env.HUBOT_HIPCHAT_API_CONNECT_MSG || 'Ready!';

    this.client = new Hipchatter(token, endpoint, proxy);

    // fetch the oauth session info
    this.client.request('get', `oauth/token/${token}`, (err, response, body) => {
      if (err) throw err;
      if (response.statusCode !== 200) {
        throw new Error('Expected status code to be 200, got ' + response.statusCode);
      }

      this.session = body;
      this.robot.logger.debug('%s is alive!', this.session.owner.name);

      roomlist.split(',').forEach((r) => {
        this.lastMessageId[r.trim()] = null;
        this.initializeRoom(r, (err, resp) => {
          if (err) throw err;
          this.send({room: r}, readyMsg);
          setTimeout(() => {
            this.monitorRoom(r);
          }, 1000);
        });
      });
    });
  }

  monitorRoom (room) {
    this.fetchLatestMessages(room, (err, items, headers) => {
      if (err) throw err;
      items.forEach((i) => this.emit('message', i, room));

      // Under default HipChat settings, if we use 100% of our calls for fetching messages
      // then we can make 1 call every 3 seconds (https://www.hipchat.com/docs/apiv2/rate_limiting)
      // We try to listen more frequently when the room is chatty, and less when its quiet, to
      // conserve our requests.
      let callRemaining = parseInt(headers['x-ratelimit-remaining'], 10);
      let callLimit = parseInt(headers['x-ratelimit-limit'], 10);
      let callReset = parseInt(headers['x-ratelimit-reset'], 10);
      let currentTime = Math.round((new Date()).getTime() / 1000);
      let idealDelay = (callReset - currentTime) / (callRemaining * .75); // seconds-per-call, reserving 25% of our calls for sends

      if (items.length === 0) {
        this.sendDelay = Math.min(this.sendDelay * 1.5, 10);
      } else {
        this.sendDelay = 1;
      }

      // If we're too far from the ideal, give it a nudge
      if (idealDelay * 3 < this.sendDelay) {
        this.robot.logger.debug('Nudging room delay. Ideal is %d, delay was %d, now is %d', idealDelay, this.sendDelay, this.sendDelay * 2);
        this.sendDelay = this.sendDelay * 2;
      }

      setTimeout(() => {
        this.monitorRoom(room);
      }, this.sendDelay * 1000);
    });
  }

  initializeRoom (room, cb) {
    this.robot.logger.debug('initializing room %s', room);
    let path = `room/${room}/history/latest`;
    let opts = {'max-results': 1};

    this.client.request('get', path, opts, (err, response, history) => {
      if (err) return cb(err);
      if (response.statusCode >= 400) {
        this.robot.logger.debug('Got status code %d for initializeRoom, sleeping 1s then trying again', response.statusCode);
        setTimeout(() => {
          this.initializeRoom(room, cb);
        }, 1000);
        return;
      }

      if (history.items.length < 1) return cb(null, []);

      this.robot.logger.debug('setting last mesage id to %s', history.items[0].id);
      this.lastMessageId[room] = history.items[0].id;
      return cb(null, []);
    });
  }

  fetchLatestMessages (room, cb) {
    this.robot.logger.debug('fetching latest messages for room %s', room);
    if (!this.lastMessageId[room]) return this.initializeRoom(room, cb);

    let path = `room/${room}/history/latest`;
    let opts = {'not-before': this.lastMessageId[room]};
    this.client.request('get', path, opts, (err, response, history) => {
      if (err) return cb(err);
      if (response.statusCode >= 400) {
        this.robot.logger.debug('Got status code %d for fetchLatestMessages, sleeping 1s then trying again', response.statusCode);
        setTimeout(() => {
          this.fetchLatestMessages(room, cb);
        }, 1000);
        return;
      }

      let items = history.items.slice(1); // slice off first message

      this.robot.logger.debug('fetched latest messages for room %s: %s', room, items.length);
      if (items.length > 0) this.lastMessageId[room] = items[0].id;

      return cb(null, items, response.headers);
    });
  }

  send (envelope, message) {
    if (isUrlToImage(message)) return this.sendImage(envelope, message);

    let splitPoint = 1000;
    let msg = message.substring(0, splitPoint);
    if (msg.length === 1000) {
      let idealSplit = msg.lastIndexOf('\n');
      if (idealSplit > 900) {
        splitPoint = idealSplit;
        msg = msg.substring(0, splitPoint);
      }
    }

    let path = `room/${envelope.room}/message`;
    let opts = {
      message: msg
    };
    this.client.request('post', path, opts, (err, response, body) => {
      if (err) return this.robot.logger.error(`Error sending message: ${err.message}`);
      if (response.statusCode >= 400) {
        this.robot.logger.debug('Got status code %d for send, sleeping 1s then trying again', response.statusCode);
        setTimeout(() => {
          this.send(envelope, message);
        }, 1000);
        return;
      }

      this.robot.logger.debug('messsage sent!');

      let remainingMsg = message.slice(splitPoint);
      if (remainingMsg.length > 0) this.send(envelope, remainingMsg);
    });
  }

  sendImage (envelope, message) {
    // send images as a notification to make them the best
    this.client.notify(envelope.room, {
      message: `<img src="${message}" style="height:200px"/>`, // I wish we could use max-height...
      color: 'gray',
      token: this.session.access_token
    }, (err, response) => {
      if (err) return this.robot.logger.error(`Error sending message: ${err.message}`);
      if (response.statusCode >= 400) {
        this.robot.logger.debug('Got status code %d for sendImage, sleeping 1s then trying again', response.statusCode);
        setTimeout(() => {
          this.sendImage(envelope, message);
        }, 1000);
        return;
      }
      this.robot.logger.info('image sent successfully');
    });
  }

  reply (envelope, strings) {
    return this.robot.logger.info('reply');
  }

  emote (envelope, txt) {
    this.send(envelope, `/me ${txt}`);
  }

  run () {
    this.robot.logger.info('run');
    this.emit('connected');

    this.on('message', (msg, room) => {
      if (msg.from.id === this.session.owner.id) return; // don't process own msg
      if (msg.type === 'notification') return;

      this.robot.logger.debug('Processing message: %j', msg);
      let message = msg.message;
      let user = this.robot.brain.userForId(msg.from.id, {name: msg.from.name, room: room});
      let text = new TextMessage(user, message, msg.id);
      this.robot.logger.debug('received message: %j', text);
      this.robot.receive(text);
    });
  }
}

module.exports.use = (robot) => {
  return new HipChatApi(robot);
};
