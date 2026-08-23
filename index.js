const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');

// Điền ID kênh chat của bạn vào đây nếu muốn bot thông báo mỗi khi khởi động/update
const NOTIFICATION_CHANNEL_ID = "ĐIỀN_ID_KENH_VAO_ĐÂY"; 

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

// Trạng thái hoạt động của bot
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
            lastFish: 0,
            lastRob: 0,
            streak: 0,
            pet: null 
        };
        saveDb();
    }
    const u = db.users[userId];
    if (u.lastDaily === undefined) u.lastDaily = 0;
    if (u.lastFish === undefined) u.lastFish = 0;
    if (u.lastRob === undefined) u.lastRob = 0;
    if (u.streak === undefined) u.streak = 0;
    if (u.pet === undefined) u.pet = null;
    return u;
}

// Kiểm tra quyền Admin
function isAdmin(userId, member) {
    const OWNER_ID = "950579308051697725"; 
    
    if (userId === OWNER_ID) return true;
    if (db.admins && db.admins.includes(userId)) return true;
    if (member && member.permissions.has('Administrator')) return true;
    
    return false;
}

client.once('ready', async () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);

    // Gửi tin nhắn thông báo update lên kênh đã chọn
    if (NOTIFICATION_CHANNEL_ID && NOTIFICATION_CHANNEL_ID !== "ĐIỀN_ID_KENH_VAO_ĐÂY") {
        try {
            const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
                const updateEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🚀 BOT ĐÃ CẬP NHẬT PHIÊN BẢN MỚI!')
                    .setDescription(`Bot vừa được khởi động lại / cập nhật phiên bản thành công!\nGõ \`${PREFIX}menu\` để xem toàn bộ danh sách lệnh!`)
                    .setTimestamp();

                await channel.send({ embeds: [updateEmbed] });
            }
        } catch (err) {
            console.error('Không thể gửi tin nhắn thông báo update:', err);
        }
    }
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

// Dùng Map để lưu số bí mật riêng cho từng kênh
const secretNumbers = new Map();
const PREFIX = '.'; 

// 4. Xử lý các lệnh tin nhắn
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;
    const OWNER_ID = "950579308051697725";

    // --- LỆNH CHỦ BOT TỐI CAO: BẬT / TẮT BOT ---
    if (message.content === PREFIX + 'bot off') {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        }
        isBotActive = false;
        await message.reply(`💤 Bot đã chuyển sang trạng thái **TẮT**. Gõ \`${PREFIX}bot on\` để bật lại!`);
        return;
    }

    if (message.content === PREFIX + 'bot on') {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        }
        isBotActive = true;
        await message.reply('🟢 Bot đã được **BẬT** trở lại và hoạt động bình thường!');
        return;
    }

    if (!isBotActive) return;

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const user = getUser(userId);

    // --- LỆNH .info ---
    if (command === 'info') {
        const infoEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🤖 THÔNG TIN HỆ THỐNG BOT')
            .setDescription(`Bot được phát triển để phục vụ server.\n👑 **Chủ Bot Tối Cao:** <@${OWNER_ID}>\n🌐 **Website Profile:** [Nhấn vào đây để truy cập](https://hina-long-pfbot.netlify.app/)\n\nGõ \`${PREFIX}menu\` để xem toàn bộ danh sách lệnh giải trí và quản trị!`)
            .setTimestamp();

        return message.reply({ embeds: [infoEmbed] });
    }

    // --- BẢNG MENU HƯỚNG DẪN ---
    if (command === 'help' || command === 'menu') {
        const menuEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📖 BẢNG HƯỚNG DẪN LỆNH - BOT BÉO FAT ASS')
            .setDescription(`Dưới đây là danh sách lệnh đầy đủ (sử dụng tiền tố \`${PREFIX}\`):`)
            .addFields(
                { name: 'ℹ️ Thông Tin & Hệ Thống', value: `\`${PREFIX}info\` - Xem thông tin bot\n\`${PREFIX}hello\` - Kiểm tra trạng thái`, inline: false },
                { name: '💰 Kinh Tế & Điểm Danh', value: `\`${PREFIX}coins [@user]\` - Xem số dư xu\n\`${PREFIX}daily\` - Điểm danh chuỗi Streak nhận quà tăng dần\n\`${PREFIX}top\` - Xem bảng xếp hạng top 10`, inline: false },
                { name: '🎮 Mini-Game & Cờ Bạc', value: `\`${PREFIX}gai\` - Quay Gacha ảnh anime (20 xu)\n\`${PREFIX}cauca\` - Quăng mồi câu cá (30 xu)\n\`${PREFIX}caucalist\` - Xem bảng giá trị cá\n\`${PREFIX}xx <số xu / all> <tai/xiu>\` - Tài Xỉu (Thắng x2 / Tất tay)\n\`${PREFIX}rob @user\` - Cướp xu người khác\n\`${PREFIX}lode <số 00-99> <số xu>\` - Xổ số lô đề (Ăn x70)\n\`${PREFIX}game\` & \`${PREFIX}doan <số>\` - Đoán số nhận thưởng`, inline: false },
                { name: '🐾 Hệ Thống Thú Cưng (Pet)', value: `\`${PREFIX}pet buy <tên>\` - Nhận nuôi pet\n\`${PREFIX}pet\` - Xem thông tin pet\n\`${PREFIX}pet feed\` - Cho pet ăn\n\`${PREFIX}pet work\` - Sai pet đi kiếm xu`, inline: false },
                { name: '🛠 Quản Trị (Admin)', value: `\`${PREFIX}xu add <số> @user\` - Bơm xu\n\`${PREFIX}xu sub <số> @user\` - Trừ xu\n\`${PREFIX}clear <số>\` - Xóa tin nhắn\n\`${PREFIX}ban @user\` / \`${PREFIX}unban <ID>\` - Ban/Unban\n\`${PREFIX}mute @user\` / \`${PREFIX}unmute @user\` - Mute/Unmute`, inline: false },
                { name: '👑 Chủ Bot Tối Cao', value: `\`${PREFIX}bot off\` / \`${PREFIX}bot on\` - Tắt/Bật bot\n\`${PREFIX}xu reset @user\` - Reset xu\n\`${PREFIX}admin add/remove @user\` - Quản lý Admin`, inline: false }
            )
            .setFooter({ text: 'Chúc bạn chơi game vui vẻ tại server!' })
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    // --- Xem số dư ---
    if (command === 'coins' || command === 'balance') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = getUser(targetUser.id);
        const formattedCoins = Number(targetData.coins).toLocaleString('vi-VN');
        
        return message.reply(`💰 Người dùng **${targetUser.username}** đang có **${formattedCoins} xu** trong ví.`);
    }

    // --- Điểm danh hằng ngày kết hợp STREAK ---
    if (command === 'daily') {
        const cooldownTime = 24 * 60 * 60 * 1000;
        const streakTimeout = 48 * 60 * 60 * 1000; 
        const now = Date.now();
        const diff = now - user.lastDaily;

        if (diff < cooldownTime) {
            const timeLeft = cooldownTime - diff;
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ Bạn đã điểm danh rồi! Vui lòng quay lại sau **${hours} giờ ${minutes} phút** nữa nhé.`);
        }

        if (user.lastDaily !== 0 && diff > streakTimeout) {
            user.streak = 1; 
        } else {
            user.streak += 1;
        }

        user.lastDaily = now;
        
        const baseReward = 50;
        const streakBonus = Math.min((user.streak - 1) * 15, 150);
        const totalReward = baseReward + streakBonus;

        user.coins += totalReward;
        saveDb();

        return message.reply(`🔥 Điểm danh thành công! Chuỗi Streak: **${user.streak} ngày liên tiếp**.\n🎁 Nhận được **${totalReward} xu** (Đã cộng bonus streak). Tổng ví: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Bảng xếp hạng ---
    if (command === 'top') {
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
    if (command === 'admin') {
        if (userId !== OWNER_ID) {
            return message.reply('❌ Chỉ có Chủ Bot tối cao mới có quyền quản lý danh sách Admin!');
        }

        const action = args[0];
        const targetUser = message.mentions.users.first();

        if (!targetUser || (action !== 'add' && action !== 'remove')) {
            return message.reply(`Cách dùng: \`${PREFIX}admin add @user\` hoặc \`${PREFIX}admin remove @user\``);
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

    // --- Lệnh XU ---
    if (command === 'xu') {
        const subAction = args[0];
        
        if (subAction === 'reset') {
            if (userId !== OWNER_ID) {
                return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
            }
            const target = message.mentions.users.first();
            if (!target) return message.reply(`Cách dùng: \`${PREFIX}xu reset @người_dùng\``);

            const targetUser = getUser(target.id);
            targetUser.coins = 0;
            saveDb();
            return message.reply(`🔄 Đã reset số dư của **${target.username}** về **0 xu** thành công!`);
        }

        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const amount = parseInt(args[1]);
        const target = message.mentions.users.first() || message.author;

        if (subAction === 'add') {
            if (isNaN(amount)) return message.reply(`Cách dùng: \`${PREFIX}xu add <số lượng> @người_dùng\``);
            const targetUser = getUser(target.id);
            targetUser.coins += amount;
            saveDb();
            return message.reply(`✅ Đã cộng **${amount.toLocaleString('vi-VN')} xu** cho **${target.username}**. Tổng ví: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
        }

        if (subAction === 'sub') {
            if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}xu sub <số lượng> @người_dùng\``);
            const targetUser = getUser(target.id);
            targetUser.coins = Math.max(0, targetUser.coins - amount);
            saveDb();
            return message.reply(`✅ Đã trừ **${amount.toLocaleString('vi-VN')} xu** của **${target.username}**. Tổng ví còn lại: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
        }
    }

    // --- Lệnh Ban thành viên ---
    if (command === 'ban') {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}ban @người_dùng\``);

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
    if (command === 'unban') {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetId = args[0];
        if (!targetId) return message.reply(`Cách dùng: \`${PREFIX}unban <ID_Discord>\``);

        try {
            await message.guild.members.unban(targetId);
            return message.reply(`✅ Đã gỡ ban thành công cho tài khoản có ID: **${targetId}**!`);
        } catch (err) {
            return message.reply('❌ Không tìm thấy ID này trong danh sách bị ban hoặc ID không hợp lệ.');
        }
    }

    // --- Lệnh Mute thành viên ---
    if (command === 'mute') {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}mute @người_dùng\``);

        try {
            await targetMember.timeout(24 * 60 * 60 * 1000, 'Bị Mute bởi Admin');
            return message.reply(`🤐 Đã mute **${targetMember.user.username}** trong 24 giờ.`);
        } catch (err) {
            return message.reply('❌ Không thể mute người này.');
        }
    }

    // --- Lệnh Unmute thành viên ---
    if (command === 'unmute') {
        if (!isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin!');
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}unmute @người_dùng\``);

        try {
            await targetMember.timeout(null, 'Gỡ Mute');
            return message.reply(`✅ Đã gỡ mute cho **${targetMember.user.username}**.`);
        } catch (err) {
            return message.reply('❌ Có lỗi xảy ra khi gỡ mute.');
        }
    }

    // --- BẢNG GIÁ CÁ ---
    if (command === 'caucalist' || command === 'listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ TRỊ CÁ & TỈ LỆ CÂU')
            .setDescription(`Phí mỗi lần quăng mồi câu (\`${PREFIX}cauca\`) là **30 xu**.`)
            .addFields(
                { 
                    name: '🎣 Danh sách cá', 
                    value: '🗑️ **Chiếc giày rách** - 10 xu *(40%)\n' +
                           '🐟 **Cá rô phi** - 35 xu *(30%)\n' +
                           '🐠 **Cá hồi** - 60 xu *(20%)\n' +
                           '🦈 **Cá mập con** - 150 xu *(8%)\n' +
                           '🐳 **Cá voi thần thoại** - 400 xu *(2%)*', 
                    inline: false 
                }
            )
            .setTimestamp();

        return message.reply({ embeds: [listEmbed] });
    }

    // --- Mini-game Câu cá ---
    if (command === 'cauca') {
        const cost = 30;
        if (user.coins < cost) {
            return message.reply(`🎣 Bạn không đủ **${cost} xu** để mua mồi câu! Dùng \`${PREFIX}daily\` để nhận xu.`);
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

        return message.reply(`🎣 Bạn câu được: **${caughtFish.name}**!\n💰 Bán được **${caughtFish.price} xu**. Số dư: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Gacha ảnh anime ---
    if (command === 'gai') {
        const cost = 20;
        if (user.coins < cost) {
            return message.reply(`Bạn cần **${cost} xu** để dùng lệnh \`${PREFIX}gai\`.`);
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
            .setDescription(`Số dư còn lại: **${Number(user.coins).toLocaleString('vi-VN')} xu**`)
            .setImage(randomImg);

        return message.reply({ embeds: [gachaEmbed] });
    }

    // --- Tài xỉu (.xx) ---
    if (command === 'xx') {
        let bet;
        let choice;

        if (args[0] && args[0].toLowerCase() === 'all') {
            bet = user.coins;
            choice = args[1] ? args[1].toLowerCase() : '';
        } else {
            bet = parseInt(args[0]);
            choice = args[1] ? args[1].toLowerCase() : '';
        }

        if (isNaN(bet) || bet <= 0) {
            return message.reply(`Cách chơi: \`${PREFIX}xx <số xu cược / all> <tai/xiu>\`\nVí dụ tất tay: \`${PREFIX}xx all tai\``);
        }

        if (user.coins < bet) {
            return message.reply(`Bạn không đủ xu! Đang có **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        }

        if (choice !== 'tai' && choice !== 'xiu') {
            return message.reply('Vui lòng chọn đúng cửa cược là `tai` hoặc `xiu`!');
        }

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            user.coins += (bet * 2);
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Thắng x2! Nhận được **${(bet * 2).toLocaleString('vi-VN')} xu**!`);
        } else {
            user.coins -= bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n😢 Thua mất **${bet.toLocaleString('vi-VN')} xu**.`);
        }
    }

    // --- LỆNH CƯỚP XU (.rob @user) ---
    if (command === 'rob' || command === 'cuop') {
        const targetMember = message.mentions.users.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}rob @người_dùng\``);
        if (targetMember.id === userId) return message.reply('❌ Không thể tự cướp chính mình được!');

        const cooldown = 30 * 60 * 1000; 
        const now = Date.now();
        if (now - user.lastRob < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - user.lastRob)) / (60 * 1000));
            return message.reply(`⏳ Đợi **${timeLeft} phút** nữa mới được hành động.`);
        }

        if (user.coins < 50) {
            return message.reply('❌ Bạn cần ít nhất **50 xu** phí lót đường!');
        }

        const targetUser = getUser(targetMember.id);
        if (targetUser.coins < 50) {
            return message.reply(`❌ Mục tiêu quá nghèo, tha cho họ đi!`);
        }

        user.lastRob = now;
        const success = Math.random() < 0.45; 

        if (success) {
            const stolenAmount = Math.floor(Math.random() * (targetUser.coins * 0.3)) + 10; 
            targetUser.coins -= stolenAmount;
            user.coins += stolenAmount;
            saveDb();
            return message.reply(`🥷 Cướp thành công **${stolenAmount.toLocaleString('vi-VN')} xu** từ **${targetMember.username}**!`);
        } else {
            const fine = 40; 
            user.coins = Math.max(0, user.coins - fine);
            saveDb();
            return message.reply(`🚨 Bị công an tóm cổ! Phạt mất **${fine} xu**.`);
        }
    }

    // --- LỆNH XỔ SỐ LÔ ĐỀ ---
    if (command === 'lode' || command === 'xoaso') {
        const choiceNum = args[0];
        const bet = parseInt(args[1]);

        if (!choiceNum || isNaN(bet) || bet <= 0 || choiceNum.length !== 2 || isNaN(parseInt(choiceNum))) {
            return message.reply(`Cách chơi: \`${PREFIX}lode <số từ 00 đến 99> <số xu cược>\``);
        }

        if (user.coins < bet) {
            return message.reply(`Bạn không đủ xu!`);
        }

        user.coins -= bet;
        saveDb();

        const winningNum = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (choiceNum === winningNum) {
            const reward = bet * 70;
            user.coins += reward;
            saveDb();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Trúng lô húp **${reward.toLocaleString('vi-VN')} xu**!`);
        } else {
            saveDb();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Xịt lô, mất **${bet.toLocaleString('vi-VN')} xu**!`);
        }
    }

    // --- LỆNH THÚ CƯNG (.pet) ---
    if (command === 'pet') {
        const subAction = args[0];

        if (subAction === 'buy') {
            if (user.pet) return message.reply(`⚠️ Bạn đã có pet rồi!`);
            const petName = args.slice(1).join(' ');
            const cost = 200;
            if (!petName) return message.reply(`Cách dùng: \`${PREFIX}pet buy <tên_pet>\``);
            
            if (user.coins < cost) return message.reply(`❌ Cần **${cost} xu** để mua.`);

            user.coins -= cost;
            user.pet = { name: petName, level: 1, exp: 0, lastFed: 0, lastWork: 0 };
            saveDb();
            return message.reply(`🎉 Nhận nuôi thành công pet **${petName}**!`);
        }

        if (!user.pet) {
            return message.reply(`🐾 Bạn chưa có thú cưng! Dùng \`${PREFIX}pet buy <tên>\` (200 xu).`);
        }

        const p = user.pet;

        if (subAction === 'feed') {
            const feedCooldown = 4 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastFed < feedCooldown) {
                return message.reply(`🍖 Pet vẫn còn no!`);
            }
            p.lastFed = now;
            p.exp += 20;
            if (p.exp >= p.level * 50) {
                p.level += 1;
                p.exp = 0;
                saveDb();
                return message.reply(`🎉 Pet lên **Level ${p.level}**!`);
            }
            saveDb();
            return message.reply(`🍖 Đã cho pet ăn!`);
        }

        if (subAction === 'work') {
            const workCooldown = 1 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastWork < workCooldown) {
                return message.reply(`⏳ Pet đang mệt.`);
            }
            p.lastWork = now;
            const earned = p.level * 25 + Math.floor(Math.random() * 20);
            user.coins += earned;
            saveDb();
            return message.reply(`💼 Pet kiếm về **${earned} xu**!`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🐾 Thú Cưng: ${p.name}`)
            .setDescription(`⭐ **Level:** ${p.level}\n✨ **EXP:** ${p.exp} / ${p.level * 50}`);

        return message.reply({ embeds: [petEmbed] });
    }

    // --- Đoán số ---
    if (command === 'game') {
        const num = Math.floor(Math.random() * 10) + 1;
        secretNumbers.set(message.channel.id, num);
        return message.reply(`🎮 Đã tạo số bí mật từ 1-10. Gõ \`${PREFIX}doan <số>\`!`);
    }

    if (command === 'doan') {
        const currentSecret = secretNumbers.get(message.channel.id);
        if (!currentSecret) return message.reply(`Chưa có game, gõ \`${PREFIX}game\` trước.`);
        
        const guess = parseInt(args[0]);
        if (isNaN(guess)) return message.reply(`Nhập số hợp lệ!`);

        if (guess === currentSecret) {
            user.coins += 30;
            saveDb();
            message.reply(`🏆 Chính xác! Nhận **30 xu**!`);
            secretNumbers.delete(message.channel.id);
        } else if (guess < currentSecret) {
            return message.reply('📈 Số lớn hơn!');
        } else {
            return message.reply('📉 Số nhỏ hơn!');
        }
    }

    // --- Xóa chat ---
    if (command === 'clear') {
        if (!isAdmin(userId, message.member)) return message.reply('Không có quyền!');
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nhập từ 1 đến 100.');
        await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const notifyMsg = await message.channel.send(`Đã xóa ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }

    if (command === 'hello') {
        return message.reply('Chào bạn! Bot vẫn đang hoạt động mượt mà!');
    }
});

// 5. Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);