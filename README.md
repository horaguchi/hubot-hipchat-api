# Hubot adapter for HipChat using their API

If you need a Hubot adapter and can connect to the HipChat using XMPP, use [HipChat's adapter](https://github.com/hipchat/hubot-hipchat). If not and you can integrate with HipChat's WebHooks, you should create a new adapter that uses those (they're faster and less chatty). But if find yourself needing to run Hubot on a server where you can hit HipChat's API, can't handle webhooks, and can't talk to XMPP - then this is for you.

## Setup

These environment variables must be set:

```bash

# API token generated from hipchat profile
HUBOT_HIPCHAT_API_TOKEN="somestringoflettersandnumbers";

# API endpoint
HUBOT_HIPCHAT_API_ENDPOINT="http://my-private-hipchat.com/v2/";

# API proxy (optional)
HUBOT_HIPCHAT_API_PROXY="http://localhost:1234";

# comma separated list of one or many rooms (just do one for now)
HUBOT_HIPCHAT_API_ROOMS="someroom";

# Message to send to the room at startup. Defaults to "Ready!"
HUBOT_HIPCHAT_API_CONNECT_MSG="Awaiting Orders!"
```

## Developing

Hubot leverages peerDependencies, but due to npm bugs `npm link` does not work well.

To develop locally:
- set up a hubot using `yo hubot`
- read this and pick an alternative way to develop:
https://github.com/npm/npm/issues/5875
(I ended up doing this https://github.com/npm/npm/issues/5875#issuecomment-146505338)

### Relevant resources

* https://confluence.atlassian.com/hipchatkb/using-bots-in-hipchat-753404057.html
* https://github.com/hipchat/hubot-hipchat
* https://github.com/hipchat/hubot-hipchat/issues/271
* https://www.hipchat.com/docs/apiv2
* https://github.com/charltoons/hipchatter
