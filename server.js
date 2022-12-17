import TelegramBot from 'node-telegram-bot-api';
import io from 'socket.io-client';

const socket = io(process.env.API_URL, { reconnect: true });

const invokeAi = {
  currentModel: null,
  modelsList: null,
}

socket.on('systemConfig', data => {
  const { model_weights, model_list } = data;
  invokeAi.currentModel = model_weights;
  invokeAi.modelsList = model_list;
  console.log(new Date(), `InvokeAI config loaded: ${model_weights}`);
});
socket.emit('requestSystemConfig');

socket.on('modelChanged', data => {
  const { model_name, model_list } = data;
  invokeAi.currentModel = model_name;
  invokeAi.modelsList = model_list;
  console.log(new Date(), `InvokeAI model changed: ${model_name}`);
});

let queue = [];
socket.on('generationResult', async data => {
  const prompt = queue.find(item => data.dreamPrompt.includes(item.match[1]));
  queue = queue.filter(item => item != prompt);
  console.log(new Date(), `InvokeAI got a result for '${prompt.match[1]}' at ${data.url}`);
  await bot.sendPhoto(prompt.msg.chat.id, `${process.env.INVOKEAI_ROOT}${data.url}`, {
    reply_to_message_id: prompt.msg.message_id,
    caption: prompt.job.dreamPrompt,
  });
  clearInterval(prompt.typingInterval);
});

socket.on('error', data => {
  console.error('error', data);
});

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
bot.onText(/\/invokeai (.+)/, async (msg, match) => {
  const job = {
    prompt: match[1],
    iterations: 1,
    steps: 50,
    cfg_scale: 7.5,
    threshold: 0,
    perlin: 0,
    height: 512,
    width: 512,
    sampler_name: 'k_lms',
    seed: Math.floor(Math.random()*4294967295),
    progress_images: false,
    progress_latents: true,
    save_intermediates: 5,
    generation_mode: 'txt2img',
    init_mask: '',
    seamless: false,
    hires_fix: false,
    variation_amount: 0,
  };
  await bot.sendChatAction(msg.chat.id, 'typing');
  const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
  socket.emit('generateImage', job, false, false); // upscale, facefix
  queue.push({
    msg,
    match,
    job,
    typingInterval
  });
});
const { first_name: botName } = await bot.getMe();
console.log(new Date(), `Telegram bot ${botName} is ready ✨`);
