# InvokeAI-Telegram-Bot

A lightweight InvokeAI to Telegram bot that lets you generate images from text prompt.

# Installation

With Node:
```
export INVOKEAI_ROOT=/home/realies/invokeai/
export API_URL=http://localhost:9090/
export BOT_TOKEN=
node server.js
```

# Usage
```
/ia Type prompt here.
```

Or

```
/ia Type prompt here. [negative tokens], (upweight)++, (downweight)-- {-steps 50 -cfg_scale 7.5 -width 512 -height 512 -sampler_name ddim -seed 3950994677 -variation_amount 0.1 -hires_fix false -seamless false -facefix codeformer|1|0.8|0.75 -quiet false}
```

Other commands: /ia_models, /ia_model, /ia_samplers, /ia_queues, /ia_usage
