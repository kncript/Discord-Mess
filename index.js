const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// Khởi tạo Express web server cho UptimeRobot
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// Khởi tạo Client với đầy đủ các Intents cốt lõi
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);
});

// Lắng nghe tin nhắn
client.on('messageCreate', message => {
    // Bỏ qua tin nhắn do chính bot gửi để tránh lặp vô tận
    if (message.author.bot) return;

    if (message.content === '!hello') {
        message.reply('Chào bạn! Bot Béo Fat Ass đã nghe thấy bạn gọi rồi đây!');
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);