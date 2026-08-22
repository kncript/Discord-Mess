const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');

// Khởi tạo Express server để giữ bot luôn chạy 24/7 (phục vụ Render & UptimeRobot)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// Khởi tạo Discord Client với các Intents cần thiết
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Bắt buộc bật để bot nhận diện thành viên mới
    ]
});

// Kho lưu trữ tiền tệ tạm thời cho thành viên (Key: userId, Value: số xu)
const economy = new Map();

// Hàm lấy số dư của người dùng (mặc định chưa có thì khởi tạo 100 xu)
function getBalance(userId) {
    if (!economy.has(userId)) {
        economy.set(userId, 100);
    }
    return economy.get(userId);
}

client.once('ready', () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);
});

// 1. TỰ ĐỘNG CHÀO MỪNG THÀNH VIÊN MỚI
client.on('guildMemberAdd', member => {
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **100 xu** khởi nghiệp khi vào server nhé!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    // Tặng 100 xu vào ví khi họ gia nhập
    economy.set(member.id, 100);
    channel.send({ embeds: [welcomeEmbed] });
});

let secretNumber = null;

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;

    // --- HỆ THỐNG TIỀN TỆ ---

    // Xem số dư: !coins hoặc !balance
    if (message.content === '!coins' || message.content === '!balance') {
        const bal = getBalance(userId);
        return message.reply(`💰 Bạn đang có **${bal} xu** trong ví.`);
    }

    // Điểm danh hằng ngày: !daily
    if (message.content === '!daily') {
        let bal = getBalance(userId);
        bal += 50;
        economy.set(userId, bal);
        return message.reply(`🎁 Bạn đã điểm danh thành công và nhận được **50 xu**! Tổng số dư: **${bal} xu**.`);
    }

    // --- TRÒ CHƠI XÚC XẮC (TÀI XỈU) ---
    // Cú pháp: !roll <số xu> <tai/xiu>
    if (message.content.startsWith('!roll')) {
        const args = message.content.split(' ');
        const bet = parseInt(args[1]);
        const choice = args[2] ? args[2].toLowerCase() : '';

        if (isNaN(bet) || bet <= 0) {
            return message.reply('Cách chơi: `!roll <số xu cược> <tai/xiu>`. Ví dụ: `!roll 20 tai`');
        }

        const bal = getBalance(userId);
        if (bal < bet) {
            return message.reply(`Bạn không đủ xu! Bạn chỉ đang có **${bal} xu** thôi.`);
        }

        if (choice !== 'tai' && choice !== 'xiu') {
            return message.reply('Vui lòng chọn đúng cửa cược là `tai` hoặc `xiu` nhé!');
        }

        // Tung 3 con xúc xắc (1-6)
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            economy.set(userId, bal + bet);
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Chúc mừng bạn đã thắng và nhận về **${bet} xu**! Số dư mới: **${getBalance(userId)} xu**.`);
        } else {
            economy.set(userId, bal - bet);
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n😢 Rất tiếc, bạn đã thua **${bet} xu**. Số dư còn lại: **${getBalance(userId)} xu**.`);
        }
    }

    // --- MINI-GAME ĐOÁN SỐ (CÓ GỢI Ý CAO/THẤP) ---
    if (message.content === '!game') {
        secretNumber = Math.floor(Math.random() * 10) + 1;
        return message.reply('🎮 Đã tạo xong số bí mật từ **1 đến 10**. Gõ `!doan <số>` để bắt đầu thử vận may nhé!');
    }

    if (message.content.startsWith('!doan ')) {
        if (!secretNumber) return message.reply('Chưa có game nào đang chạy, gõ `!game` để bắt đầu.');
        const guess = parseInt(message.content.split(' ')[1]);
        
        if (isNaN(guess)) {
            return message.reply('Vui lòng nhập một con số hợp lệ nhé! Ví dụ: `!doan 5`');
        }

        if (guess === secretNumber) {
            let bal = getBalance(userId);
            economy.set(userId, bal + 30);
            message.reply(`🏆 Chính xác! Số bí mật đúng là **${secretNumber}**. Bạn nhận được thưởng **30 xu**! Tổng xu hiện tại: **${getBalance(userId)} xu**`);
            secretNumber = null; // Reset game
        } else if (guess < secretNumber) {
            return message.reply('📈 Số bí mật **lớn hơn** (cao hơn) số bạn vừa đoán! Thử lại xem.');
        } else {
            return message.reply('📉 Số bí mật **nhỏ hơn** (thấp hơn) số bạn vừa đoán! Thử lại xem.');
        }
    }

    // --- LỆNH QUẢN LÝ TIN NHẮN (XÓA CHAT) ---
    if (message.content.startsWith('!clear ')) {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('Bạn không có quyền sử dụng lệnh xóa tin nhắn!');
        }
        const amount = parseInt(message.content.split(' ')[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('Hãy nhập một số lượng từ 1 đến 100.');
        }
        
        await message.channel.bulkDelete(amount + 1, true).catch(() => {
            return message.reply('Lỗi khi xóa tin nhắn (có thể tin nhắn quá 14 ngày tuổi).');
        });
        
        const notifyMsg = await message.channel.send(`Đã dọn dẹp ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }

    // Lệnh kiểm tra cơ bản
    if (message.content === '!hello') {
        return message.reply('Chào bạn! Bot Béo Fat Ass vẫn đang hoạt động siêu mượt đây!');
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);