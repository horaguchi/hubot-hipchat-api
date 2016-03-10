'use strict';
const Adapter = require('hubot/src/adapter');
const Msgs = require('hubot/src/message');
const TextMessage = Msgs.TextMessage;
const url = require('url');
const urlRegex = require('url-regex');
const exactUrl = urlRegex({exact: true});

const Hipchatter = require('hipchatter');

function isUrlToImage (txt) {
  if (!exactUrl.test(txt)) {
    return false;
  }
  let path = url.parse(txt.toLowerCase()).pathname;
  return (
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.gif')
  );
}

class HipChatApi extends Adapter {
  constructor (robot) {
    super(robot);
    this.robot.logger.info('constructor');
    this.lastMessageId = {};

    let token = process.env.HUBOT_HIPCHAT_API_TOKEN;
    let endpoint = process.env.HUBOT_HIPCHAT_API_ENDPOINT;
    let roomlist = process.env.HUBOT_HIPCHAT_API_ROOMS;
    let readyMsg = process.env.HUBOT_HIPCHAT_API_CONNECT_MSG || 'Ready!';
    let minScanDelay = process.env.HUBOT_HIPCHAT_API_MIN_SCAN || .5;
    let maxScanDelay = process.env.HUBOT_HIPCHAT_API_MAX_SCAN || 10;
    let currentScanDelay = process.env.HUBOT_HIPCHAT_API_DELAY_SCAN || 5;

    this.client = new Hipchatter(token, endpoint);

    // fetch the oauth session info
    this.client.request('get', `oauth/token/${token}`, (err, resp) => {
      if (err) throw err;

      this.session = resp;
      this.robot.logger.debug('%s is alive!', this.session.owner.name);

      roomlist.split(',').forEach((r) => {
        this.lastMessageId[r.trim()] = null;
        this.initializeRoom(r, (err, resp) => {
          if (err) throw err;
          this.monitorRoom(r);
          this.send({room: r}, readyMsg);
        });
      });
    });
  }

  monitorRoom (room) {
    setTimeout(() => {
      this.fetchLatestMessages(room, (err, items) => {
        if (err) throw err;
        items.forEach((i) => this.emit('message', i, room));
        this.monitorRoom(room);
      });
    }, 4000);
  }

  initializeRoom (room, cb) {
    this.robot.logger.debug('initializing room %s', room);
    let path = `room/${room}/history/latest`;
    let opts = {'max-results': 1};

    this.client.request('get', path, opts, (err, history) => {
      if (err) return cb(err);
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
    this.client.request('get', path, opts, (err, history) => {
      if (err) return cb(err);
      let items = history.items.slice(1); // slice off first message

      this.robot.logger.debug('fetched latest messages for room %s: %s', room, items.length);
      if (items.length > 0) this.lastMessageId[room] = items[0].id;

      return cb(null, items);
    });
  }

  send (envelope, message) {
    if (isUrlToImage(message)) return this.sendImage(envelope, message);
    let msg = message.substring(0, 1000);

    let path = `room/${envelope.room}/message`;

    let opts = {
      message: msg
    };
    this.client.request('post', path, opts, (err, resp) => {
      if (err) return this.robot.logger.error(`Error sending message: ${err.message}`);
      this.robot.logger.debug('messsage sent!');

      let remainingMsg = message.slice(1000);
      if (remainingMsg.length > 0) this.send(envelope, remainingMsg);
    });
  }

  sendImage (envelope, message) {
    // send images as a notification to make them the best
    this.client.notify(envelope.room, {
      message: `<img src="${message}"/>`,
      color: 'gray',
      token: this.session.access_token
    }, (err) => {
      if (err == null) this.robot.logger.info('image sent successfully');
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
      this.robot.logger.debug('msg.from', msg.from);
      this.robot.logger.debug('session owner', this.session.owner);
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
