const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot đang hoạt động!'));
app.listen(process.env.PORT || 10000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Cần cái này để bắt sự kiện người mới
    ]
});

// 1. CHÀO MỪNG NGƯỜI MỚI
client.on('guildMemberAdd', member => {
    const channel = member.guild.systemChannel; // Kênh thông báo mặc định của server
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Nhớ đọc luật nhé!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    channel.send({ embeds: [welcomeEmbed] });
});

// 2. MINI-GAME ĐOÁN SỐ
let secretNumber = null;
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Bắt đầu game: !game
    if (message.content === '!game') {
        secretNumber = Math.floor(Math.random() * 10) + 1; // Số từ 1 đến 10
        message.reply('Đã tạo xong số bí mật (1-10). Gõ `!doan <số>` để đoán nhé!');
    }

    // Đoán số: !doan <số>
    if (message.content.startsWith('!doan ')) {
        if (!secretNumber) return message.reply('Chưa có game nào đang chạy, gõ `!game` để bắt đầu.');
        const guess = parseInt(message.content.split(' ')[1]);
        if (guess === secretNumber) {
            message.reply('Chúc mừng! Bạn đã đoán đúng!');
            secretNumber = null;
        } else {
            message.reply('Sai rồi! Thử lại đi.');
        }
    }

    // 3. LỆNH XÓA TIN NHẮN: !clear <số lượng>
    if (message.content.startsWith('!clear ')) {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('Bạn không có quyền xóa tin nhắn!');
        const amount = parseInt(message.content.split(' ')[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Hãy nhập số từ 1 đến 100.');
        
        await message.channel.bulkDelete(amount + 1, true).catch(err => message.reply('Lỗi xóa tin nhắn!'));
        message.channel.send(`Đã xóa ${amount} tin nhắn!`).then(msg => setTimeout(() => msg.delete(), 3000));
    }

    // Giữ lại lệnh hello cũ
    if (message.content === '!hello') {
        message.reply('Chào bạn! Bot Béo Fat Ass vẫn đang làm việc chăm chỉ đây!');
    }
});

client.login(process.env.DISCORD_TOKEN);