const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const axios = require('axios');

// 1. Khởi tạo Express server (giữ bot online 24/7 trên Render)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// 2. Khởi tạo Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 3. Quản lý lưu trữ dữ liệu JSON (data.json)
const DATA_FILE = './data.json';
let db = {};

if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        db = { users: {} };
    }
} else {
    db = { users: {} };
}

function saveDb() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getBal(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { coins: 100 };
        saveDb();
    }
    return db.users[userId].coins;
}

client.once('ready', () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);
});

// Chào mừng thành viên mới
client.on('guildMemberAdd', member => {
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **100 xu** khởi nghiệp khi vào server nhé!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    if (!db.users[member.id]) db.users[member.id] = { coins: 100 };
    else db.users[member.id].coins += 100;
    saveDb();

    channel.send({ embeds: [welcomeEmbed] });
});

let secretNumber = null;

// 4. Xử lý các lệnh tin nhắn
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;

    // --- BẢNG MENU HƯỚNG DẪN: !menu hoặc !help ---
    if (message.content === '!help' || message.content === '!menu') {
        const menuEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📖 BẢNG HƯỚNG DẪN LỆNH - BOT BÉO FAT ASS')
            .setDescription('Dưới đây là toàn bộ danh sách các lệnh giải trí, kinh tế và quản lý có sẵn trong server:')
            .addFields(
                { name: '💰 Hệ Thống Tiền Tệ', value: '`!coins` - Xem số dư ví của bạn\n`!daily` - Điểm danh hằng ngày nhận 50 xu\n`!top` - Xem bảng xếp hạng top 10 người giàu nhất', inline: false },
                { name: '🎮 Mini-Game & Giải Trí', value: '`!gai` - Quay Gacha nhận ảnh anime (Phí: 20 xu)\n`!cauca` - Quăng mồi câu cá (Phí: 30 xu)\n`!caucalist` - Xem bảng giá trị cá và tỉ lệ câu\n`!roll <số xu> <tai/xiu>` - Chơi Tài Xỉu (Thắng ăn x2, thua mất cược)\n`!game` & `!doan <số>` - Chơi đoán số từ 1-10 (Thưởng: 30 xu)', inline: false },
                { name: '👑 Lệnh Dành Cho Admin', value: '`!xu add <số lượng> @user` - Bơm xu cho người chơi\n`!clear <số lượng>` - Xóa nhanh tin nhắn (1-100)', inline: false }
            )
            .setFooter({ text: 'Chúc bạn chơi game vui vẻ tại server!' })
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    // Xem số dư
    if (message.content === '!coins' || message.content === '!balance') {
        const bal = getBal(userId);
        return message.reply(`💰 Bạn đang có **${bal} xu** trong ví.`);
    }

    // Điểm danh hằng ngày
    if (message.content === '!daily') {
        getBal(userId);
        db.users[userId].coins += 50;
        saveDb();
        return message.reply(`🎁 Bạn đã điểm danh thành công và nhận được **50 xu**! Tổng số dư: **${db.users[userId].coins} xu**.`);
    }

    // Bảng xếp hạng
    if (message.content === '!top') {
        const sorted = Object.entries(db.users)
            .sort((a, b) => b[1].coins - a[1].coins)
            .slice(0, 10);
        
        let text = "🏆 **TOP 10 NGƯỜI GIÀU NHẤT SERVER:**\n";
        for (let i = 0; i < sorted.length; i++) {
            const user = await client.users.fetch(sorted[i][0]).catch(() => ({ username: "Người dùng ẩn danh" }));
            text += `**${i + 1}.** ${user.username} - **${sorted[i][1].coins} xu**\n`;
        }
        return message.reply(text);
    }

    // Lệnh Admin bơm xu
    if (message.content.startsWith('!xu add ')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const args = message.content.split(' ');
        const amount = parseInt(args[2]);
        const target = message.mentions.users.first() || message.author;

        if (isNaN(amount)) {
            return message.reply('Cách dùng: `!xu add <số lượng> @người_dùng`');
        }

        getBal(target.id);
        db.users[target.id].coins += amount;
        saveDb();

        return message.reply(`✅ Admin đã cộng **${amount} xu** cho **${target.username}**. Tổng ví: **${db.users[target.id].coins} xu**.`);
    }

    // --- BẢNG GIÁ CÁ: !caucalist hoặc !listcau ---
    if (message.content === '!caucalist' || message.content === '!listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ TRỊ CÁ & TỈ LỆ CÂU')
            .setDescription('Phí mỗi lần quăng mồi câu (`!cauca`) là **30 xu**. Dưới đây là danh sách các loài cá và số xu bạn nhận được khi bán:')
            .addFields(
                { 
                    name: '🎣 Danh sách cá', 
                    value: '🗑️ **Chiếc giày rách** - 10 xu *(Tỉ lệ: 40%)\n' +
                           '🐟 **Cá rô phi** - 35 xu *(Tỉ lệ: 30%)\n' +
                           '🐠 **Cá hồi** - 60 xu *(Tỉ lệ: 20%)\n' +
                           '🦈 **Cá mập con** - 150 xu *(Tỉ lệ: 8%)\n' +
                           '🐳 **Cá voi thần thoại** - 400 xu *(Tỉ lệ: 2%)*', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Dùng lệnh !cauca để thử vận may ngay!' })
            .setTimestamp();

        return message.reply({ embeds: [listEmbed] });
    }

    // Mini-game Câu cá (Phí 30 xu)
    if (message.content === '!cauca') {
        const cost = 30;
        const bal = getBal(userId);

        if (bal < cost) {
            return message.reply(`🎣 Bạn không đủ **${cost} xu** để mua mồi câu! Hãy dùng \`!daily\` để nhận xu nhé.`);
        }

        db.users[userId].coins -= cost;
        saveDb();

        const fishes = [
            { name: '🗑️ Chiếc giày rách', price: 10, chance: 40 },
            { name: '🐟 Cá rô phi', price: 35, chance: 30 },
            { name: '🐠 Cá hồi', price: 60, chance: 20 },
            { name: '🦈 Cá mập con', price: 150, chance: 8 },
            { name: '🐳 Cá voi thần thoại', price: 400, chance: 2 }
        ];

        const randomNum = Math.random() * 100;
        let cumulative = 0;
        let caughtFish = fishes[0];

        for (const f of fishes) {
            cumulative += f.chance;
            if (randomNum <= cumulative) {
                caughtFish = f;
                break;
            }
        }

        db.users[userId].coins += caughtFish.price;
        saveDb();

        return message.reply(`🎣 Bạn quăng mồi và câu được: **${caughtFish.name}**!\n💰 Bán được **${caughtFish.price} xu**. Số dư hiện tại: **${getBal(userId)} xu**.`);
    }

    // Gacha ảnh qua API
    if (message.content === '!gai') {
        const cost = 20;
        const bal = getBal(userId);

        if (bal < cost) {
            return message.reply(`Bạn không đủ xu để quay! Cần **${cost} xu** để dùng lệnh \`!gai\`.`);
        }

        db.users[userId].coins -= cost;
        saveDb();

        try {
            const response = await axios.get('https://nekos.best/api/v2/neko');
            const imgUrl = response.data.results[0].url;

            const gachaEmbed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setTitle(`✨ Kết quả Gacha của ${message.author.username}`)
                .setDescription(`Bạn đã quay trúng một bức ảnh anime xinh xắn!\n💰 Số dư còn lại: **${getBal(userId)} xu**`)
                .setImage(imgUrl)
                .setFooter({ text: `Phí quay: ${cost} xu` });

            return message.reply({ embeds: [gachaEmbed] });
        } catch (error) {
            db.users[userId].coins += cost;
            saveDb();
            return message.reply('❌ Lỗi kết nối đến máy chủ ảnh, hệ thống đã hoàn lại xu!');
        }
    }

    // Tài xỉu (Thắng ăn x2 tiền cược, thua trừ tiền cược)
    if (message.content.startsWith('!roll')) {
        const args = message.content.split(' ');
        const bet = parseInt(args[1]);
        const choice = args[2] ? args[2].toLowerCase() : '';

        if (isNaN(bet) || bet <= 0) {
            return message.reply('Cách chơi: `!roll <số xu cược> <tai/xiu>`');
        }

        const bal = getBal(userId);
        if (bal < bet) {
            return message.reply(`Bạn không đủ xu! Bạn chỉ đang có **${bal} xu**.`);
        }

        if (choice !== 'tai' && choice !== 'xiu') {
            return message.reply('Vui lòng chọn đúng cửa cược là `tai` hoặc `xiu` nhé!');
        }

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            // Thắng: nhận thêm x2 tiền cược (cộng thêm đúng số tiền cược vào ví)
            db.users[userId].coins += bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Thắng lớn! Nhận được **${bet} xu**! Số dư mới: **${getBal(userId)} xu**.`);
        } else {
            // Thua: trừ đi số tiền cược
            db.users[userId].coins -= bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n😢 Thua mất **${bet} xu**. Số dư còn lại: **${getBal(userId)} xu**.`);
        }
    }

    // Đoán số
    if (message.content === '!game') {
        secretNumber = Math.floor(Math.random() * 10) + 1;
        return message.reply('🎮 Đã tạo xong số bí mật từ **1 đến 10**. Gõ `!doan <số>` để đoán nhé!');
    }

    if (message.content.startsWith('!doan ')) {
        if (!secretNumber) return message.reply('Chưa có game nào đang chạy, gõ `!game` để bắt đầu.');
        const guess = parseInt(message.content.split(' ')[1]);
        
        if (isNaN(guess)) return message.reply('Vui lòng nhập số hợp lệ! Ví dụ: `!doan 5`');

        if (guess === secretNumber) {
            getBal(userId);
            db.users[userId].coins += 30;
            saveDb();
            message.reply(`🏆 Chính xác! Số bí mật là **${secretNumber}**. Nhận thưởng **30 xu**!`);
            secretNumber = null;
        } else if (guess < secretNumber) {
            return message.reply('📈 Số bí mật **lớn hơn** (cao hơn)!');
        } else {
            return message.reply('📉 Số bí mật **nhỏ hơn** (thấp hơn)!');
        }
    }

    // Xóa chat
    if (message.content.startsWith('!clear ')) {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('Bạn không có quyền!');
        const amount = parseInt(message.content.split(' ')[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nhập số từ 1 đến 100.');
        
        await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const notifyMsg = await message.channel.send(`Đã xóa ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }

    if (message.content === '!hello') {
        return message.reply('Chào bạn! Bot Béo Fat Ass vẫn đang chạy siêu mượt!');
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);