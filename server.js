/* eslint-disable no-useless-return */
/* eslint-disable no-shadow */
/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-continue */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
/* eslint-disable no-plusplus */
import TelegramBot from 'node-telegram-bot-api';
import io from 'socket.io-client';
import { v4 as uuid } from 'uuid';

process.env.NTBA_FIX_350 = true;
function jsonToText(json) {
  let text = '';
  function formatJson(json, indentation = '') {
    for (const key in json) {
      if (typeof json[key] === 'undefined') continue;
      if (Array.isArray(json[key])) {
        text += `${indentation + key}: \n`;
        for (let i = 0; i < json[key].length; i++) {
          formatJson(json[key][i], `${indentation}  `);
        }
      } else if (typeof json[key] === 'object') {
        text += `${indentation + key}: \n`;
        formatJson(json[key], `${indentation}  `);
      } else {
        text += `${indentation + key}: ${json[key]}\n`;
      }
    }
  }
  formatJson(json);
  return text;
}
const state = {
  systemConfig: null,
  modelChanged: [],
  generationResult: [],
};
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const socket = io(process.env.API_URL, { reconnect: true });
socket.on('systemConfig', data => {
  state.systemConfig = data;
  console.log(new Date(), 'InvokeAI config loaded 🤖');
});
socket.emit('requestSystemConfig');
socket.on('modelChanged', async data => {
  state.systemConfig.model_list = data.model_list;
  let activeModel;
  Object.keys(data.model_list).forEach(model => {
    if (data.model_list[model].status === 'active') {
      activeModel = data.model_list[model];
      activeModel.name = model;
      return;
    }
  });
  const request = state.modelChanged.find(
    item => item.model === data.model_name
  );
  request &&
    (state.modelChanged = state.modelChanged.filter(item => item !== request));
  console.log(new Date(), `InvokeAI model set to ${activeModel.name}`);
  await bot.sendMessage(
    request.msg.chat.id,
    `Model set to ${activeModel.name}\n${activeModel.description}`,
    {
      reply_to_message_id: request.msg.message_id,
    }
  );
  clearInterval(request.typingInterval);
});
socket.on('generationResult', async data => {
  const id = data?.metadata?.image?.extra?.id;
  if (!id) return;
  const quiet = data?.metadata?.image?.extra?.quiet;
  const request = state.generationResult.find(item => item.job.extra.id === id);
  if (!request) return;
  state.generationResult = state.generationResult.filter(
    item => item !== request
  );
  console.log(
    new Date(),
    `InvokeAI got a result for ${data.dreamPrompt} at ${data.url}`
  );
  const caption = jsonToText({
    model_weights: data.metadata.model_weights,
    ...data.metadata.image,
    ...(data.metadata.image.variations.length === 0 && {
      variations: undefined,
    }),
    ...(!data.metadata.image.postprocessing && { postprocessing: undefined }),
    extra: undefined,
  });
  await bot.sendPhoto(
    request.msg.chat.id,
    `${process.env.INVOKEAI_ROOT}${data.url}`,
    {
      reply_to_message_id: request.msg.message_id,
      caption: quiet ? undefined : caption,
    }
  );
  clearInterval(request.typingInterval);
});
socket.on('error', data => {
  console.error(new Date(), data);
});
bot.onText(/\/ia_usage/, async msg => {
  await bot.sendMessage(
    msg.chat.id,
    '/ia Type prompt here.\n\nOr\n\n' +
      '/ia Type prompt here. [negative tokens], (upweight)++, (downweight)-- ' +
      '{-steps 50 -cfg_scale 7.5 -width 512 -height 512 -sampler_name ddim -seed 3950994677 -variation_amount 0.1 ' +
      '-hires_fix false -seamless false -facefix codeformer|1|0.8|0.75 -quiet false}\n\n' +
      'Other commands: /ia_models, /ia_model, /ia_samplers, /ia_queues, /ia_usage',
    {
      reply_to_message_id: msg.message_id,
    }
  );
});
bot.onText(/\/ia_queues/, async msg => {
  const queue = {
    generationResult: `${
      jsonToText(state.generationResult.map(item => item.job.extra.id)) ||
      'queue empty'
    }`,
    modelChanged: `${
      jsonToText(state.modelChanged.map(item => item.model)) || 'queue empty'
    }`,
  };
  await bot.sendMessage(
    msg.chat.id,
    `generationResult: ${queue.generationResult}\n\nmodelChanged: ${queue.modelChanged}`,
    {
      reply_to_message_id: msg.message_id,
    }
  );
});
const samplers = [
  'ddim',
  'plms',
  'k_lms',
  'k_dpm_2',
  'k_dpm_2_a',
  'k_dpmpp_2',
  'k_dpmpp_2_a',
  'k_euler',
  'k_euler_a',
  'k_heun',
];
bot.onText(/\/ia_samplers/, async msg => {
  await bot.sendMessage(msg.chat.id, samplers.join('\n'), {
    reply_to_message_id: msg.message_id,
  });
});
bot.onText(/\/ia_models/, async msg => {
  await bot.sendMessage(
    msg.chat.id,
    Object.keys(state.systemConfig.model_list)
      .map(model => `${model} (${state.systemConfig.model_list[model].status})`)
      .join('\n'),
    {
      reply_to_message_id: msg.message_id,
    }
  );
});
bot.onText(/\/ia_model (.*)/, async (msg, match) => {
  await bot.sendChatAction(msg.chat.id, 'typing');
  const typingInterval = setInterval(
    async () => bot.sendChatAction(msg.chat.id, 'typing'),
    5000
  );
  state.modelChanged.push({
    msg,
    model: match[1]?.trim(),
    typingInterval,
  });
  socket.emit('requestModelChange', match?.[1]?.trim());
});
bot.onText(/\/ia (.+)/, async (msg, match) => {
  match[1] = match[1].replace(/\s+/g, ' ');
  const params = match[1]
    .match(/{(.*?)}/)?.[1]
    ?.trim()
    ?.split(' ');
  const config = {};
  if (params) {
    for (let i = 0; i < params.length; i++) {
      if (params[i].startsWith('-')) {
        const key = params[i].substring(1);
        const value = params[i + 1];
        config[key] = value;
        i++;
      }
    }
  }
  let steps = Number(config.steps) || 50;
  steps < 1 && (steps = 1);
  let cfg_scale =
    config.cfg_scale === '0' ? 0 : Number(config.cfg_scale) || 7.5;
  cfg_scale < 1.01 && (cfg_scale = 1.01);
  let width = Number(config.width) || 512;
  width < 64 && (width = 64);
  width > 2048 && (width = 2048);
  let height = Number(config.height) || 512;
  height < 64 && (height = 64);
  height > 2048 && (height = 2048);
  let sampler_name =
    config.sampler_name ||
    samplers[Math.floor(Math.random() * samplers.length)];
  !samplers.includes(sampler_name) && ([sampler_name] = samplers);
  let seed = Number(config.seed) || Math.floor(Math.random() * 4294967295);
  seed < 0.1 && (seed = 0.1);
  let variation_amount = Number(config.variation_amount) || 0;
  variation_amount < 0 && (variation_amount = 0);
  variation_amount > 1 && (variation_amount = 1);
  let upscale;
  if (config.upscale) {
    const upscaleProps = config.upscale.split('|');
    upscale = {
      level: Number(upscaleProps[0]) || 2,
      strength: Number(upscaleProps[1]) || 0.5,
    };
  } else {
    upscale = false;
  }
  let facefix;
  if (config.facefix) {
    const facefixProps = config.facefix.split('|');
    facefix = {
      type: facefixProps[0] === 'codeformer' ? 'codeformer' : 'gfpgan',
      strength: Number(facefixProps[1]) || 0.8,
      ...(facefixProps[0] === 'codeformer' && {
        codeformer_fidelity: Number(facefixProps[2]) || 0.75,
      }),
    };
  } else {
    facefix = false;
  }
  const job = {
    prompt: match[1].replace(/{(.*?)}/g, '').trim(),
    iterations: 1,
    threshold: 0,
    perlin: 0,
    progress_images: false,
    progress_latents: false,
    save_intermediates: 0,
    generation_mode: 'txt2img',
    init_mask: '',
    extra: { id: uuid(), quiet: config.quiet === 'true' },
    steps,
    cfg_scale,
    width,
    height,
    sampler_name,
    seed,
    variation_amount,
    hires_fix: config.hires_fix === 'true',
    seamless: config.seamless === 'true',
  };
  await bot.sendChatAction(msg.chat.id, 'typing');
  const typingInterval = setInterval(
    async () => bot.sendChatAction(msg.chat.id, 'typing'),
    5000
  );
  socket.emit('generateImage', job, upscale, facefix);
  state.generationResult.push({
    msg,
    job,
    typingInterval,
  });
});
const { first_name: botName } = await bot.getMe();
console.log(new Date(), `Telegram bot ${botName} ready ✨`);
