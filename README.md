## Setup

These environment variables must be set:

```bash

# API token generated from hipchat profile
HUBOT_HIPCHAT_API_TOKEN="somestringoflettersandnumbers";

# API endppint
HUBOT_HIPCHAT_API_ENDPOINT="http://my-private-hipchat.com/v2";

# comma separated list of one or many rooms (just do one for now)
HUBOT_HIPCHAT_API_ROOMS="someroom";
```

## Developing

Hubot leverages peerDependencies, but due to npm bugs `npm link` does not work well.

To develop locally:
- set up a hubot using `yo hubot`
- read this and pick an alternative way to develop:
https://github.com/npm/npm/issues/5875
(I ended up doing this https://github.com/npm/npm/issues/5875#issuecomment-146505338)

# Hubot adapter for HipChat using their API

https://confluence.atlassian.com/hipchatkb/using-bots-in-hipchat-753404057.html
https://github.com/hipchat/hubot-hipchat
https://github.com/hipchat/hubot-hipchat/issues/271
https://www.hipchat.com/docs/apiv2
https://github.com/charltoons/hipchatter
