const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// Khởi tạo Express cho web server (giúp UptimeRobot ping chống ngủ đông)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Web server đang chạy trên cổng 10000');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// Khởi tạo Discord Bot với đầy đủ các Intents cần thiết
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Bắt buộc phải bật cái này trong Developer Portal
        GatewayIntentBits.GuildMembers,
    ]
});

// Sự kiện khi bot đã đăng nhập thành công
client.once('ready', () => {
    console.log(`Đã đăng nhập thành công với tên: ${client.user.tag}`);
});

// Sự kiện lắng nghe tin nhắn từ người dùng
client.on('messageCreate', message => {
    // Không cho bot tự trả lời tin nhắn của chính nó
    if (message.author.bot) return;

    // Khi có người gõ !hello
    if (message.content === '!hello') {
        message.reply('Xin chào! Bot Béo Fat Ass của tôi đang chạy 24/7 miễn phí.');
    }
});

// Đăng nhập bot bằng Token bảo mật lấy từ biến môi trường trên Render
client.login(process.env.DISCORD_TOKEN);