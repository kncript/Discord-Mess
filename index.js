const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// --- PHẦN WEB SERVER ĐỂ CHỐNG NGỦ ĐÔNG ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Discord đang hoạt động 24/7!');
});

app.listen(port, () => {
    console.log(`Web server đang chạy trên cổng ${port}`);
});
// ----------------------------------------

// Khởi tạo bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Đã đăng nhập thành công với tên: ${client.user.tag}`);
});

client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (message.content === '!hello') {
        message.reply('Xin chào! Bot của tôi đang chạy 24/7 miễn phí.');
    }
});

// Đăng nhập bot qua biến môi trường
client.login(process.env.DISCORD_TOKEN);