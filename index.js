const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');

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

// Trạng thái hoạt động của bot (Phục vụ cho lệnh !bot on / !bot off)
let isBotActive = true; 

// 3. Quản lý lưu trữ dữ liệu JSON (data.json)
const DATA_FILE = './data.json';
let db = {};

if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        db = { users: {}, admins: [] };
    }
} else {
    db = { users: {}, admins: [] };
}

function saveDb() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { 
            coins: 100, 
            lastDaily: 0, 
            lastFish: 0 
        };
        saveDb();
    }
    if (db.users[userId].lastDaily === undefined) db.users[userId].lastDaily = 0;
    if (db.users[userId].lastFish === undefined) db.users[userId].lastFish = 0;
    return db.users[userId];
}

// Kiểm tra quyền Admin
function isAdmin(userId, member) {
    const OWNER_ID = "950579308051697725"; // ID của bạn
    
    if (userId === OWNER_ID) return true;
    if (db.admins && db.admins.includes(userId)) return true;
    if (member && member.permissions.has('Administrator')) return true;
    
    return false;
}

client.once('ready', () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);
});

// Chào mừng thành viên mới
client.on('guildMemberAdd', member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('✨ Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **100 xu** khởi nghiệp khi vào server nhé!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    const userData = getUser(member.id);
    userData.coins += 100;
    saveDb();

    channel.send({ embeds: [welcomeEmbed] });
});

// Tạm biệt khi có thành viên rời server
client.on('guildMemberRemove', member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const byeEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('👋 Thành viên rời server')
        .setDescription(`Thành viên **${member.user.username}** đã rời khỏi server. Hẹn gặp lại!`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    channel.send({ embeds: [byeEmbed] });
});

let secretNumber = null;

// 4. Xử lý các lệnh tin nhắn
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;
    const OWNER_ID = "950579308051697725";

    // --- LỆNH CHỦ BOT TỐI CAO: BẬT / TẮT BOT ---
    if (message.content === '!bot off') {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        }
        isBotActive = false;
        await message.reply('💤 Bot đã chuyển sang trạng thái **TẮT** (Ngưng nhận lệnh). Gõ `!bot on` để bật lại!');
        console.log('Bot đã bị vô hiệu hóa tạm thời bởi Owner.');
        return;
    }

    if (message.content === '!bot on') {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        }
        isBotActive = true;
        await message.reply('🟢 Bot đã được **BẬT** trở lại và hoạt động bình thường!');
        console.log('Bot đã được kích hoạt lại bởi Owner.');
        return;
    }

    if (!isBotActive) return;

    const user = getUser(userId);

    // --- LỆNH !info ---
    if (message.content === '!info') {
        const infoEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🤖 THÔNG TIN HỆ THỐNG BOT')
            .setDescription(`Bot được phát triển để phục vụ server.\n👑 **Chủ Bot Tối Cao:** <@${OWNER_ID}>\n🌐 **Website Profile:** [Nhấn vào đây để truy cập](https://hina-long-pfbot.netlify.app/)\n\nGõ \`!menu\` để xem toàn bộ danh sách lệnh giải trí và quản trị!`)
            .setTimestamp();

        return message.reply({ embeds: [infoEmbed] });
    }

    // --- BẢNG MENU HƯỚNG DẪN ---
    if (message.content === '!help' || message.content === '!menu') {
        const menuEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📖 BẢNG HƯỚNG DẪN LỆNH - BOT BÉO FAT ASS')
            .setDescription('Dưới đây là toàn bộ danh sách các lệnh giải trí, kinh tế và quản lý có sẵn trong server:')
            .addFields(
                { name: 'ℹ️ Thông Tin & Hệ Thống', value: '`!info` - Xem thông tin bot, tag Chủ Bot và link web profile\n`!hello` - Kiểm tra trạng thái hoạt động của bot', inline: false },
                { name: '💰 Hệ Thống Tiền Tệ', value: '`!coins [@user]` - Xem số dư ví xu của bản thân hoặc người khác\n`!daily` - Điểm danh hằng ngày nhận 50 xu (Cooldown: 24h)\n`!top` - Xem bảng xếp hạng top 10 người giàu nhất server', inline: false },
                { name: '🎮 Mini-Game & Giải Trí', value: '`!gai` - Quay Gacha nhận ảnh anime siêu nét (Phí: 20 xu)\n`!cauca` - Quăng mồi câu cá nhận thưởng (Phí: 30 xu | Không giới hạn thời gian)\n`!caucalist` - Xem bảng giá trị cá và tỉ lệ câu\n`!roll <số xu> <tai/xiu>` - Chơi Tài Xỉu (Thắng x2 tiền cược)\n`!game` & `!doan <số>` - Chơi đoán số từ 1-10 nhận 30 xu', inline: false },
                { name: '🛠 Quản Trị (Admin)', value: '`!xu add <số lượng> @user` - Bơm xu cho người chơi\n`!xu sub <số lượng> @user` - Trừ xu của người chơi\n`!clear <số lượng>` - Xóa nhanh tin nhắn (1-100)\n`!ban @user` - Ban thành viên\n`!unban <ID>` - Gỡ ban bằng ID\n`!mute @user` - Mute thành viên 24h\n`!unmute @user` - Gỡ mute thành viên', inline: false },
                { name: '👑 Chủ Bot Tối Cao', value: '`!bot off` / `!bot on` - Tắt / Bật bot tạm thời\n`!xu reset @user` - Reset xu về 0\n`!admin add/remove @user` - Cấp/tước quyền Admin', inline: false }
            )
            .setFooter({ text: 'Chúc bạn chơi game vui vẻ tại server!' })
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    // --- Xem số dư (Bản thân hoặc người khác) ---
    if (message.content === '!coins' || message.content === '!balance' || message.content.startsWith('!coins ')) {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = getUser(targetUser.id);
        const formattedCoins = Number(targetData.coins).toLocaleString('vi-VN');
        
        return message.reply(`💰 Người dùng **${targetUser.username}** đang có **${formattedCoins} xu** trong ví.`);
    }

    // --- Điểm danh hằng ngày ---
    if (message.content === '!daily') {
        const cooldownTime = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const timeLeft = cooldownTime - (now - user.lastDaily);

        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ Bạn đã điểm danh rồi! Vui lòng quay lại sau **${hours} giờ ${minutes} phút** nữa nhé.`);
        }

        user.lastDaily = now;
        user.coins += 50;
        saveDb();
        return message.reply(`🎁 Bạn đã điểm danh thành công và nhận được **50 xu**! Tổng số dư: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Bảng xếp hạng ---
    if (message.content === '!top') {
        const sorted = Object.entries(db.users)
            .sort((a, b) => b[1].coins - a[1].coins)
            .slice(0, 10);
        
        let text = "🏆 **TOP 10 NGƯỜI GIÀU NHẤT SERVER:**\n";
        for (let i = 0; i < sorted.length; i++) {
            const memberObj = await client.users.fetch(sorted[i][0]).catch(() => ({ username: "Người dùng ẩn danh" }));
            const userCoins = Number(sorted[i][1].coins).toLocaleString('vi-VN');
            text += `**${i + 1}.** ${memberObj.username} - **${userCoins} xu**\n`;
        }
        return message.reply(text);
    }

    // --- QUẢN LÝ ADMIN ---
    if (message.content.startsWith('!admin ')) {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Chỉ có Chủ Bot tối cao mới có quyền quản lý danh sách Admin!');
        }

        const args = message.content.split(' ');
        const action = args[1];
        const targetUser = message.mentions.users.first();

        if (!targetUser || (action !== 'add' && action !== 'remove')) {
            return message.reply('Cách dùng: `!admin add @user` hoặc `!admin remove @user`');
        }

        if (!db.admins) db.admins = [];

        if (action === 'add') {
            if (db.admins.includes(targetUser.id)) {
                return message.reply(`⚠️ **${targetUser.username}** đã là Admin từ trước rồi!`);
            }
            db.admins.push(targetUser.id);
            saveDb();
            return message.reply(`✅ Đã cấp quyền Admin thành công cho **${targetUser.username}**!`);
        } else if (action === 'remove') {
            const index = db.admins.indexOf(targetUser.id);
            if (index === -1) {
                return message.reply(`⚠️ **${targetUser.username}** không có trong danh sách Admin!`);
            }
            db.admins.splice(index, 1);
            saveDb();
            return message.reply(`✅ Đã tước quyền Admin của **${targetUser.username}**!`);
        }
    }

    // --- Lệnh Admin bơm xu (!xu add) ---
    if (message.content.startsWith('!xu add ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const args = message.content.split(' ');
        const amount = parseInt(args[2]);
        const target = message.mentions.users.first() || message.author;

        if (isNaN(amount)) {
            return message.reply('Cách dùng: `!xu add <số lượng> @người_dùng`');
        }

        const targetUser = getUser(target.id);
        targetUser.coins += amount;
        saveDb();

        return message.reply(`✅ Admin đã cộng **${amount.toLocaleString('vi-VN')} xu** cho **${target.username}**. Tổng ví: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Lệnh Admin trừ xu (!xu sub) ---
    if (message.content.startsWith('!xu sub ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const args = message.content.split(' ');
        const amount = parseInt(args[2]);
        const target = message.mentions.users.first() || message.author;

        if (isNaN(amount) || amount <= 0) {
            return message.reply('Cách dùng: `!xu sub <số lượng> @người_dùng`');
        }

        const targetUser = getUser(target.id);
        targetUser.coins = Math.max(0, targetUser.coins - amount);
        saveDb();

        return message.reply(`✅ Admin đã trừ **${amount.toLocaleString('vi-VN')} xu** của **${target.username}**. Tổng ví còn lại: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Lệnh Reset xu (Chỉ Chủ Bot Tối Cao) ---
    if (message.content.startsWith('!xu reset ')) {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        }

        const target = message.mentions.users.first();
        if (!target) {
            return message.reply('Cách dùng: `!xu reset @người_dùng`');
        }

        const targetUser = getUser(target.id);
        targetUser.coins = 0;
        saveDb();

        return message.reply(`🔄 Đã reset số dư của **${target.username}** về **0 xu** thành công!`);
    }

    // --- Lệnh Ban thành viên ---
    if (message.content.startsWith('!ban ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh ban thành viên!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply('Cách dùng: `!ban @người_dùng`');
        }

        if (!targetMember.bannable) {
            return message.reply('❌ Bot không đủ quyền hạn để ban người này.');
        }

        try {
            await targetMember.ban({ reason: `Bị ban bởi Admin ${message.author.tag}` });
            return message.reply(`🔨 Đã ban thành công **${targetMember.user.username}** khỏi server!`);
        } catch (err) {
            return message.reply('❌ Có lỗi xảy ra khi thực hiện lệnh ban.');
        }
    }

    // --- Lệnh Unban thành viên bằng ID ---
    if (message.content.startsWith('!unban ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const args = message.content.split(' ');
        const targetId = args[1];

        if (!targetId) {
            return message.reply('Cách dùng: `!unban <ID_Discord>`');
        }

        try {
            await message.guild.members.unban(targetId);
            return message.reply(`✅ Đã gỡ ban thành công cho tài khoản có ID: **${targetId}**! Họ có thể vào lại server.`);
        } catch (err) {
            return message.reply('❌ Không tìm thấy ID này trong danh sách bị ban hoặc ID không hợp lệ.');
        }
    }

    // --- Lệnh Mute thành viên ---
    if (message.content.startsWith('!mute ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('Cách dùng: `!mute @người_dùng`');

        try {
            await targetMember.timeout(24 * 60 * 60 * 1000, 'Bị Mute bởi Admin');
            return message.reply(`🤐 Đã mute **${targetMember.user.username}** trong 24 giờ.`);
        } catch (err) {
            return message.reply('❌ Không thể mute người này.');
        }
    }

    // --- Lệnh Unmute thành viên ---
    if (message.content.startsWith('!unmute ')) {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply('Cách dùng: `!unmute @người_dùng`');

        try {
            await targetMember.timeout(null, 'Gỡ Mute');
            return message.reply(`✅ Đã gỡ mute cho **${targetMember.user.username}**. Họ đã có thể chat lại bình thường.`);
        } catch (err) {
            return message.reply('❌ Có lỗi xảy ra khi gỡ mute.');
        }
    }

    // --- BẢNG GIÁ CÁ ---
    if (message.content === '!caucalist' || message.content === '!listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ TRỊ CÁ & TỈ LỆ CÂU')
            .setDescription('Phí mỗi lần quăng mồi câu (`!cauca`) là **30 xu** (Không giới hạn thời gian chờ). Dưới đây là danh sách các loài cá và số xu khi bán:')
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

    // --- Mini-game Câu cá (Không giới hạn thời gian) ---
    if (message.content === '!cauca') {
        const cost = 30;
        if (user.coins < cost) {
            return message.reply(`🎣 Bạn không đủ **${cost} xu** để mua mồi câu! Hãy dùng \`!daily\` để nhận xu nhé.`);
        }

        user.coins -= cost;
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

        user.coins += caughtFish.price;
        saveDb();

        return message.reply(`🎣 Bạn quăng mồi và câu được: **${caughtFish.name}**!\n💰 Bán được **${caughtFish.price} xu**. Số dư hiện tại: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Gacha ảnh anime ---
    if (message.content === '!gai') {
        const cost = 20;
        if (user.coins < cost) {
            return message.reply(`Bạn không đủ xu để quay! Cần **${cost} xu** để dùng lệnh \`!gai\`.`);
        }

        user.coins -= cost;
        saveDb();

        const animeImages = [
            "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800",
            "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800",
            "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800",
            "https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=800",
            "https://images.unsplash.com/photo-1563089145-599997674d42?w=800",
            "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800"
        ];

        const randomImg = animeImages[Math.floor(Math.random() * animeImages.length)];

        const gachaEmbed = new EmbedBuilder()
            .setColor(0xFF00FF)
            .setTitle(`✨ Kết quả Gacha của ${message.author.username}`)
            .setDescription(`Bạn đã quay trúng một bức ảnh anime xinh xắn!\n💰 Số dư còn lại: **${Number(user.coins).toLocaleString('vi-VN')} xu**`)
            .setImage(randomImg)
            .setFooter({ text: `Phí quay: ${cost} xu` });

        return message.reply({ embeds: [gachaEmbed] });
    }

    // --- Tài xỉu ---
    if (message.content.startsWith('!roll')) {
        const args = message.content.split(' ');
        const bet = parseInt(args[1]);
        const choice = args[2] ? args[2].toLowerCase() : '';

        if (isNaN(bet) || bet <= 0) {
            return message.reply('Cách chơi: `!roll <số xu cược> <tai/xiu>`');
        }

        if (user.coins < bet) {
            return message.reply(`Bạn không đủ xu! Bạn chỉ đang có **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
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
            user.coins += bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Thắng lớn! Nhận được **${bet.toLocaleString('vi-VN')} xu**! Số dư mới: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        } else {
            user.coins -= bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n😢 Thua mất **${bet.toLocaleString('vi-VN')} xu**. Số dư còn lại: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        }
    }

    // --- Đoán số ---
    if (message.content === '!game') {
        secretNumber = Math.floor(Math.random() * 10) + 1;
        return message.reply('🎮 Đã tạo xong số bí mật từ **1 đến 10**. Gõ `!doan <số>` để đoán nhé!');
    }

    if (message.content.startsWith('!doan ')) {
        if (!secretNumber) return message.reply('Chưa có game nào đang chạy, gõ `!game` để bắt đầu.');
        const guess = parseInt(message.content.split(' ')[1]);
        
        if (isNaN(guess)) return message.reply('Vui lòng nhập số hợp lệ! Ví dụ: `!doan 5`');

        if (guess === secretNumber) {
            user.coins += 30;
            saveDb();
            message.reply(`🏆 Chính xác! Số bí mật là **${secretNumber}**. Nhận thưởng **30 xu**!`);
            secretNumber = null;
        } else if (guess < secretNumber) {
            return message.reply('📈 Số bí mật **lớn hơn** (cao hơn)!');
        } else {
            return message.reply('📉 Số bí mật **nhỏ hơn** (thấp hơn)!');
        }
    }

    // --- Xóa chat ---
    if (message.content.startsWith('!clear ')) {
        if (!isAdmin(userId, message.member)) return message.reply('Bạn không có quyền!');
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

// 5. Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);