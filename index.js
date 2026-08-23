const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const Canvas = require('canvas');

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
            pet: null // { name, level, exp, lastFed, lastWork }
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

// Dùng Map để lưu số bí mật riêng cho từng kênh (Tránh xung đột nhiều người chơi cùng lúc)
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
                { name: '🎮 Mini-Game & Cờ Bạc', value: `\`${PREFIX}gai\` - Quay Gacha ảnh anime (20 xu)\n\`${PREFIX}cauca\` - Quăng mồi câu cá (30 xu)\n\`${PREFIX}caucalist\` - Xem bảng giá trị cá\n\`${PREFIX}xx <số xu / all> <tai/xiu>\` - Tài Xỉu (Thắng x2 / Tất tay)\n\`${PREFIX}rob @user\` - Cướp xu người khác\n\`${PREFIX}lode <số 00-99> <số xu>\` - Xổ số lô đề (Ăn x70)\n\`${PREFIX}game\` & \`${PREFIX}doan <số>\` - Đoán số nhận thưởng\n\`${PREFIX}bantho @user\` - Tạo ảnh bàn thờ troll bạn bè`, inline: false },
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
        const streakTimeout = 48 * 60 * 60 * 1000; // Quá 48 tiếng mất chuỗi
        const now = Date.now();
        const diff = now - user.lastDaily;

        if (diff < cooldownTime) {
            const timeLeft = cooldownTime - diff;
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ Bạn đã điểm danh rồi! Vui lòng quay lại sau **${hours} giờ ${minutes} phút** nữa nhé.`);
        }

        if (user.lastDaily !== 0 && diff > streakTimeout) {
            user.streak = 1; // Mất chuỗi, reset về 1
        } else {
            user.streak += 1;
        }

        user.lastDaily = now;
        
        // Thưởng tăng dần theo streak (Mỗi ngày +15 xu, tối đa mốc 200 xu)
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

    // --- Tài xỉu (.xx) THẮNG X2 & HỖ TRỢ .xx all ---
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
            return message.reply('Vui lòng chọn đúng cửa cược là `tai` hoặc `xiu`! (Ví dụ: `.xx all tai` hoặc `.xx 100 xiu`)');
        }

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            user.coins += (bet * 2);
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Thắng x2! Nhận được **${(bet * 2).toLocaleString('vi-VN')} xu**! Số dư mới: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        } else {
            user.coins -= bet;
            saveDb();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n😢 Thua mất **${bet.toLocaleString('vi-VN')} xu**. Số dư còn lại: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        }
    }

    // --- LỆNH CƯỚP XU (.rob @user) ---
    if (command === 'rob' || command === 'cuop') {
        const targetMember = message.mentions.users.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}rob @người_dùng\``);
        if (targetMember.id === userId) return message.reply('❌ Không thể tự cướp chính mình được!');

        const cooldown = 30 * 60 * 1000; // Cooldown 30 phút
        const now = Date.now();
        if (now - user.lastRob < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - user.lastRob)) / (60 * 1000));
            return message.reply(`⏳ Bạn vừa đi cướp về, cảnh sát đang canh gác! Hãy đợi **${timeLeft} phút** nữa mới được hành động.`);
        }

        if (user.coins < 50) {
            return message.reply('❌ Bạn cần ít nhất **50 xu** trong ví để làm phí lót đường đi cướp!');
        }

        const targetUser = getUser(targetMember.id);
        if (targetUser.coins < 50) {
            return message.reply(`❌ Mục tiêu **${targetMember.username}** quá nghèo (dưới 50 xu), tha cho họ đi!`);
        }

        user.lastRob = now;
        const success = Math.random() < 0.45; // 45% tỉ lệ thành công

        if (success) {
            const stolenAmount = Math.floor(Math.random() * (targetUser.coins * 0.3)) + 10; 
            targetUser.coins -= stolenAmount;
            user.coins += stolenAmount;
            saveDb();
            return message.reply(`🥷 Cướp thành công! Bạn đã trấn lột được **${stolenAmount.toLocaleString('vi-VN')} xu** từ **${targetMember.username}**!`);
        } else {
            const fine = 40; 
            user.coins = Math.max(0, user.coins - fine);
            saveDb();
            return message.reply(`🚨 Bị công an tóm cổ! Bạn thất bại và bị phạt mất **${fine} xu** tiền bảo lãnh.`);
        }
    }

    // --- LỆNH XỔ SỐ LÔ ĐỀ (.lode <số> <xu>) ---
    if (command === 'lode' || command === 'xoaso') {
        const choiceNum = args[0];
        const bet = parseInt(args[1]);

        if (!choiceNum || isNaN(bet) || bet <= 0 || choiceNum.length !== 2 || isNaN(parseInt(choiceNum))) {
            return message.reply(`Cách chơi: \`${PREFIX}lode <số từ 00 đến 99> <số xu cược>\`\nVí dụ: \`${PREFIX}lode 88 100\` (Trúng ăn x70 lần)`);
        }

        if (user.coins < bet) {
            return message.reply(`Bạn không đủ xu! Đang có **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
        }

        user.coins -= bet;
        saveDb();

        const winningNum = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (choiceNum === winningNum) {
            const reward = bet * 70;
            user.coins += reward;
            saveDb();
            return message.reply(`🎰 Kết quả xổ số hôm nay về: **[${winningNum}]**.\n👑 CHÚC MỪNG! Bạn đã trúng lô và húp trọn **${reward.toLocaleString('vi-VN')} xu** (x70 tiền cược)!`);
        } else {
            saveDb();
            return message.reply(`🎰 Kết quả xổ số về: **[${winningNum}]**. Tiếc quá, con số **${choiceNum}** của bạn không trúng. Mất **${bet.toLocaleString('vi-VN')} xu**!`);
        }
    }

    // --- LỆNH THÚ CƯNG (.pet) ---
    if (command === 'pet') {
        const subAction = args[0];

        if (subAction === 'buy') {
            if (user.pet) return message.reply(`⚠️ Bạn đã nuôi thú cưng tên **${user.pet.name}** rồi!`);
            const petName = args.slice(1).join(' ');
            const cost = 200;
            if (!petName) return message.reply(`Cách dùng: \`${PREFIX}pet buy <tên_pet>\` (Phí nhận nuôi: 200 xu)`);
            
            if (user.coins < cost) return message.reply(`❌ Bạn cần **${cost} xu** để nhận nuôi thú cưng.`);

            user.coins -= cost;
            user.pet = {
                name: petName,
                level: 1,
                exp: 0,
                lastFed: 0,
                lastWork: 0
            };
            saveDb();
            return message.reply(`🎉 Chúc mừng bạn đã nhận nuôi thành công thú cưng **${petName}**! Dùng \`${PREFIX}pet\` để xem trạng thái.`);
        }

        if (!user.pet) {
            return message.reply(`🐾 Bạn chưa có thú cưng nào! Dùng \`${PREFIX}pet buy <tên>\` với giá **200 xu** để nhận nuôi ngay.`);
        }

        const p = user.pet;

        if (subAction === 'feed') {
            const feedCooldown = 4 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastFed < feedCooldown) {
                const h = Math.ceil((feedCooldown - (now - p.lastFed)) / (60 * 60 * 1000));
                return message.reply(`🍖 Thú cưng **${p.name}** vẫn còn no! Hãy cho ăn lại sau **${h} tiếng** nữa.`);
            }

            p.lastFed = now;
            p.exp += 20;
            if (p.exp >= p.level * 50) {
                p.level += 1;
                p.exp = 0;
                saveDb();
                return message.reply(`🎉 Thú cưng **${p.name}** đã được cho ăn và thăng lên **Level ${p.level}**! 🚀`);
            }
            saveDb();
            return message.reply(`🍖 Bạn đã cho **${p.name}** ăn ngon lành! (EXP hiện tại: ${p.exp}/${p.level * 50})`);
        }

        if (subAction === 'work') {
            const workCooldown = 1 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastWork < workCooldown) {
                const m = Math.ceil((workCooldown - (now - p.lastWork)) / (60 * 1000));
                return message.reply(`⏳ Thú cưng đang mệt, hãy cho nghỉ ngơi thêm **${m} phút** nữa.`);
            }

            p.lastWork = now;
            const earned = p.level * 25 + Math.floor(Math.random() * 20);
            user.coins += earned;
            saveDb();
            return message.reply(`💼 Thú cưng **${p.name}** (Lv.${p.level}) đã đi làm kiếm về cho chủ nhân **${earned} xu**!`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🐾 Thông Tin Thú Cưng: ${p.name}`)
            .setDescription(`Chủ nhân: <@${userId}>\n⭐ **Level:** ${p.level}\n✨ **Kinh nghiệm (EXP):** ${p.exp} / ${p.level * 50}`)
            .addFields(
                { name: 'Lệnh tương tác', value: `\`${PREFIX}pet feed\` - Cho pet ăn tăng cấp\n\`${PREFIX}pet work\` - Sai pet đi kiếm xu`, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [petEmbed] });
    }

    // --- LỆNH TẠO ẢNH BÀN THỜ (.bantho @user) ---
    if (command === 'bantho' || command === 'rip') {
        const targetMember = message.mentions.users.first() || message.author;

        try {
            const canvas = Canvas.createCanvas(500, 600);
            const ctx = canvas.getContext('2d');

            // Ảnh nền bàn thờ mẫu (Bạn có thể thay link ảnh nền khác bằng cách đổi URL này)
            const backgroundUrl = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=500'; 
            const background = await Canvas.loadImage(backgroundUrl);
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

            // Tải và vẽ Avatar của người dùng lên khung
            const avatarURL = targetMember.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await Canvas.loadImage(avatarURL);

            // Tọa độ và kích thước khung ảnh chân dung (có thể tinh chỉnh x, y, width, height cho vừa khung ảnh nền)
            const x = 175; 
            const y = 150; 
            const width = 150; 
            const height = 150;

            ctx.drawImage(avatar, x, y, width, height);

            // Thêm tên người dùng lên ảnh
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(targetMember.username, canvas.width / 2, 350);

            // Xuất file và gửi lên Discord
            const buffer = canvas.toBuffer();
            const file = new AttachmentBuilder(buffer, { name: 'bantho.png' });

            return message.reply({ 
                content: `🕯️ Thành kính phân ưu cùng **${targetMember.username}**... Nam mô a di đà phật! 🙏`,
                files: [file] 
            });

        } catch (err) {
            console.error(err);
            return message.reply('❌ Đã xảy ra lỗi khi tạo ảnh bàn thờ. Vui lòng thử lại sau!');
        }
    }

    // --- Đoán số (Đã khắc phục lỗi toàn cục bằng Map theo channelId) ---
    if (command === 'game') {
        const num = Math.floor(Math.random() * 10) + 1;
        secretNumbers.set(message.channel.id, num);
        return message.reply(`🎮 Đã tạo số bí mật từ 1-10 cho kênh này. Gõ \`${PREFIX}doan <số>\` để đoán!`);
    }

    if (command === 'doan') {
        const currentSecret = secretNumbers.get(message.channel.id);
        if (!currentSecret) return message.reply(`Chưa có game nào đang chạy trong kênh này, gõ \`${PREFIX}game\` để bắt đầu.`);
        
        const guess = parseInt(args[0]);
        if (isNaN(guess)) return message.reply(`Vui lòng nhập số! Ví dụ: \`${PREFIX}doan 5\``);

        if (guess === currentSecret) {
            user.coins += 30;
            saveDb();
            message.reply(`🏆 Chính xác! Số bí mật là **${currentSecret}**. Nhận **30 xu**!`);
            secretNumbers.delete(message.channel.id);
        } else if (guess < currentSecret) {
            return message.reply('📈 Số bí mật **lớn hơn** (cao hơn)!');
        } else {
            return message.reply('📉 Số bí mật **nhỏ hơn** (thấp hơn)!');
        }
    }

    // --- Xóa chat (.clear <số>) ---
    if (command === 'clear') {
        if (!isAdmin(userId, message.member)) return message.reply('Bạn không có quyền!');
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nhập số lượng tin nhắn cần xóa từ 1 đến 100 (Ví dụ: `.clear 10`).');
        
        await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const notifyMsg = await message.channel.send(`Đã xóa ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }

    if (command === 'hello') {
        return message.reply('Chào bạn! Bot Béo Fat Ass vẫn đang chạy siêu mượt với toàn bộ hệ thống minigame cực đỉnh!');
    }
});

// 5. Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);