const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

// Điền ID kênh chat của bạn vào đây nếu muốn bot thông báo mỗi khi khởi động/update
const NOTIFICATION_CHANNEL_ID = "1540977738951819335"; 

// 1. Khởi tạo Express server (giữ bot online 24/7 trên Render)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot đang hoạt động!');
});

app.listen(PORT, () => {
    console.log(`Web server đang chạy trên cổng ${PORT}`);
});

// 2. Kết nối MongoDB Atlas
const mongoURI = process.env.MONGO_URI;

if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Đã kết nối thành công với MongoDB Atlas!'))
        .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));
} else {
    console.log('⚠️ Không tìm thấy biến MONGO_URI trong môi trường!');
}

// Khởi tạo Mongoose Schema & Model lưu trữ dữ liệu (Thêm trường bank và lastBankInterest)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    coins: { type: Number, default: 100 },
    bank: { type: Number, default: 0 },
    lastBankInterest: { type: Number, default: Date.now() },
    lastDaily: { type: Number, default: 0 },
    lastFish: { type: Number, default: 0 },
    lastRob: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    pet: {
        type: Object,
        default: null
    }
});

const User = mongoose.model('User', userSchema);

// Schema lưu trữ cấu hình chung (admins)
const configSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    admins: { type: Array, default: [] }
});
const Config = mongoose.model('Config', configSchema);

// Hàm lấy dữ liệu user từ MongoDB (Tự động tính lãi suất ngân hàng 10%/1 giờ)
async function getUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId });
        await user.save();
    } else {
        // Tính lãi suất ngân hàng: 10% mỗi 1 giờ trôi qua
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const hoursPassed = Math.floor((now - user.lastBankInterest) / oneHour);
        
        if (hoursPassed > 0 && user.bank > 0) {
            let interestEarned = 0;
            let currentBank = user.bank;
            for (let i = 0; i < hoursPassed; i++) {
                interestEarned += Math.floor(currentBank * 0.1);
                currentBank += Math.floor(currentBank * 0.1);
            }
            user.bank = currentBank;
            user.lastBankInterest = now - ((now - user.lastBankInterest) % oneHour); // Giữ lại phần dư thời gian
            await user.save();
        }
    }
    return user;
}

// Hàm lấy danh sách admin từ MongoDB
async function getAdmins() {
    let config = await Config.findOne({ key: 'global_config' });
    if (!config) {
        config = new Config({ key: 'global_config', admins: [] });
        await config.save();
    }
    return config.admins;
}

// 3. Khởi tạo Discord Client
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

// Kiểm tra quyền Admin
async function isAdmin(userId, member) {
    const OWNER_ID = "950579308051697725"; 
    
    if (userId === OWNER_ID) return true;
    const admins = await getAdmins();
    if (admins.includes(userId)) return true;
    if (member && member.permissions.has('Administrator')) return true;
    
    return false;
}

client.once('ready', async () => {
    console.log(`Bot đã sẵn sàng! Đăng nhập với tên: ${client.user.tag}`);

    if (NOTIFICATION_CHANNEL_ID && NOTIFICATION_CHANNEL_ID !== "ĐIỀN_ID_KENH_VAO_ĐÂY") {
        try {
            const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
                const updateEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🚀 BOT ĐÃ CẬP NHẬT PHIÊN BẢN MỚI!')
                    .setDescription(`Bot vừa được khởi động lại / cập nhật phiên bản thành công trên MongoDB!\nGõ \`${PREFIX}menu\` để xem toàn bộ danh sách lệnh!`)
                    .setTimestamp();

                await channel.send({ embeds: [updateEmbed] });
            }
        } catch (err) {
            console.error('Không thể gửi tin nhắn thông báo update:', err);
        }
    }
});

// Chào mừng thành viên mới
client.on('guildMemberAdd', async member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('✨ Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **100 xu** khởi nghiệp khi vào server nhé!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    const userData = await getUser(member.id);
    userData.coins += 100;
    await userData.save();

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

    const user = await getUser(userId);

    // --- LỆNH .info ---
    if (command === 'info') {
        const infoEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🤖 THÔNG TIN HỆ THỐNG BOT')
            .setDescription(`Bot được phát triển để phục vụ server (Đã tích hợp MongoDB Cloud).\n👑 **Chủ Bot Tối Cao:** <@${OWNER_ID}>\n🌐 **Website Profile:** [Nhấn vào đây để truy cập](https://hina-long-pfbot.netlify.app/)\n\nGõ \`${PREFIX}menu\` để xem toàn bộ danh sách lệnh giải trí và quản trị!`)
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
                { name: '💰 Kinh Tế, Ngân Hàng & Điểm Danh', value: `\`${PREFIX}coins [@user]\` - Xem ví và ngân hàng\n\`${PREFIX}deposit <số xu / all>\` - Gửi tiền vào ngân hàng (Lãi 10%/h)\n\`${PREFIX}withdraw <số xu / all>\` - Rút tiền từ ngân hàng\n\`${PREFIX}daily\` - Điểm danh chuỗi Streak nhận quà\n\`${PREFIX}top\` - Xem bảng xếp hạng`, inline: false },
                { name: '🎮 Mini-Game & Cờ Bạc', value: `\`${PREFIX}gai\` - Gacha ảnh waifu ngẫu nhiên từ kho GitHub (20 xu)\n\`${PREFIX}cauca\` - Quăng mồi câu cá (300k xu)\n\`${PREFIX}caucalist\` - Xem bảng giá trị cá\n\`${PREFIX}xx <số xu / all> <tai/xiu>\` - Tài Xỉu\n\`${PREFIX}rob @user\` - Cướp xu\n\`${PREFIX}lode <số 00-99> <số xu>\` - Xổ số lô đề`, inline: false },
                { name: '🐾 Hệ Thống Thú Cưng (Pet)', value: `\`${PREFIX}pet buy <tên>\` - Nhận nuôi pet (200 xu)\n\`${PREFIX}pet\` - Xem thông tin pet\n\`${PREFIX}pet feed\` - Cho pet ăn\n\`${PREFIX}pet work\` - Sai pet kiếm xu\n\`${PREFIX}pet sell\` - Bán pet nhận ngẫu nhiên tới 20k xu`, inline: false },
                { name: '🛠 Quản Trị (Admin)', value: `\`${PREFIX}xu add <số> @user\` - Bơm xu\n\`${PREFIX}xu sub <số> @user\` - Trừ xu\n\`${PREFIX}clear <số>\` - Xóa tin nhắn\n\`${PREFIX}ban @user\` / \`${PREFIX}unban <ID>\`\n\`${PREFIX}mute @user\` / \`${PREFIX}unmute @user\``, inline: false },
                { name: '👑 Chủ Bot Tối Cao', value: `\`${PREFIX}bot off\` / \`${PREFIX}bot on\`\n\`${PREFIX}xu reset @user\`\n\`${PREFIX}admin add/remove @user\``, inline: false }
            )
            .setFooter({ text: 'Chúc bạn chơi game vui vẻ tại server!' })
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    // --- Xem số dư ví và ngân hàng ---
    if (command === 'coins' || command === 'balance') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUser(targetUser.id);
        const formattedCoins = Number(targetData.coins).toLocaleString('vi-VN');
        const formattedBank = Number(targetData.bank).toLocaleString('vi-VN');
        
        return message.reply(`💰 Tài khoản của **${targetUser.username}**:\n👛 Ví tiền: **${formattedCoins} xu**\n🏦 Ngân hàng (Lãi 10%/h): **${formattedBank} xu**`);
    }

    // --- Lệnh Gửi tiền vào Ngân hàng (.deposit) ---
    if (command === 'deposit' || command === 'dep') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.coins;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply(`Cách dùng: \`${PREFIX}deposit <số xu cần gửi / all>\``);
        }

        if (user.coins < amount) {
            return message.reply(`❌ Bạn không có đủ **${amount.toLocaleString('vi-VN')} xu** trong ví để gửi!`);
        }

        user.coins -= amount;
        user.bank += amount;
        await user.save();

        return message.reply(`🏦 Gửi thành công **${amount.toLocaleString('vi-VN')} xu** vào ngân hàng!\n👛 Ví: ${Number(user.coins).toLocaleString('vi-VN')} xu | 🏦 Ngân hàng: ${Number(user.bank).toLocaleString('vi-VN')} xu`);
    }

    // --- Lệnh Rút tiền từ Ngân hàng (.withdraw) ---
    if (command === 'withdraw' || command === 'with') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.bank;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply(`Cách dùng: \`${PREFIX}withdraw <số xu cần rút / all>\``);
        }

        if (user.bank < amount) {
            return message.reply(`❌ Ngân hàng của bạn không có đủ **${amount.toLocaleString('vi-VN')} xu** để rút!`);
        }

        user.bank -= amount;
        user.coins += amount;
        await user.save();

        return message.reply(`🏧 Rút thành công **${amount.toLocaleString('vi-VN')} xu** về ví!\n👛 Ví: ${Number(user.coins).toLocaleString('vi-VN')} xu | 🏦 Ngân hàng: ${Number(user.bank).toLocaleString('vi-VN')} xu`);
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
        await user.save();

        return message.reply(`🔥 Điểm danh thành công! Chuỗi Streak: **${user.streak} ngày liên tiếp**.\n🎁 Nhận được **${totalReward} xu** (Đã cộng bonus streak). Tổng ví: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Bảng xếp hạng ---
    if (command === 'top') {
        const topUsers = await User.find().sort({ coins: -1 }).limit(10);
        
        let text = "🏆 **TOP 10 NGƯỜI GIÀU NHẤT SERVER:**\n";
        for (let i = 0; i < topUsers.length; i++) {
            const memberObj = await client.users.fetch(topUsers[i].userId).catch(() => ({ username: "Người dùng ẩn danh" }));
            const userCoins = Number(topUsers[i].coins).toLocaleString('vi-VN');
            const userBank = Number(topUsers[i].bank).toLocaleString('vi-VN');
            text += `**${i + 1}.** ${memberObj.username} - Ví: **${userCoins} xu** | Ngân hàng: **${userBank} xu**\n`;
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

        let config = await Config.findOne({ key: 'global_config' });
        if (!config) {
            config = new Config({ key: 'global_config', admins: [] });
        }

        if (action === 'add') {
            if (config.admins.includes(targetUser.id)) {
                return message.reply(`⚠️ **${targetUser.username}** đã là Admin từ trước rồi!`);
            }
            config.admins.push(targetUser.id);
            await config.save();
            return message.reply(`✅ Đã cấp quyền Admin thành công cho **${targetUser.username}**!`);
        } else if (action === 'remove') {
            const index = config.admins.indexOf(targetUser.id);
            if (index === -1) {
                return message.reply(`⚠️ **${targetUser.username}** không có trong danh sách Admin!`);
            }
            config.admins.splice(index, 1);
            await config.save();
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

            const targetUser = await getUser(target.id);
            targetUser.coins = 0;
            targetUser.bank = 0;
            await targetUser.save();
            return message.reply(`🔄 Đã reset số dư ví và ngân hàng của **${target.username}** về **0 xu** thành công!`);
        }

        if (!await isAdmin(userId, message.member)) {
            return message.reply('❌ Bạn không có quyền Admin để sử dụng lệnh này!');
        }

        const amount = parseInt(args[1]);
        const target = message.mentions.users.first() || message.author;
        const targetUser = await getUser(target.id);

        if (subAction === 'add') {
            if (isNaN(amount)) return message.reply(`Cách dùng: \`${PREFIX}xu add <số lượng> @người_dùng\``);
            targetUser.coins += amount;
            await targetUser.save();
            return message.reply(`✅ Đã cộng **${amount.toLocaleString('vi-VN')} xu** vào ví cho **${target.username}**. Tổng ví: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
        }

        if (subAction === 'sub') {
            if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}xu sub <số lượng> @người_dùng\``);
            targetUser.coins = Math.max(0, targetUser.coins - amount);
            await targetUser.save();
            return message.reply(`✅ Đã trừ **${amount.toLocaleString('vi-VN')} xu** ví của **${target.username}**. Tổng ví còn lại: **${Number(targetUser.coins).toLocaleString('vi-VN')} xu**.`);
        }
    }

    // --- Lệnh Ban thành viên ---
    if (command === 'ban') {
        if (!await isAdmin(userId, message.member)) {
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
        if (!await isAdmin(userId, message.member)) {
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
        if (!await isAdmin(userId, message.member)) {
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
        if (!await isAdmin(userId, message.member)) {
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

    // --- BẢNG GIÁ CÁ (Cập nhật phí 300k, giá trị giày 30k, cá chép/rô phi 150k) ---
    if (command === 'caucalist' || command === 'listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ TRỊ CÁ & TỈ LỆ CÂU')
            .setDescription(`Phí mỗi lần quăng mồi câu (\`${PREFIX}cauca\`) là **300.000 xu**.`)
            .addFields(
                { 
                    name: '🎣 Danh sách vật phẩm & cá', 
                    value: '🗑️ **Chiếc giày rách** - 30.000 xu *(40%)\n' +
                           '🐟 **Cá chép / Cá rô phi** - 150.000 xu *(30%)\n' +
                           '🐠 **Cá hồi** - 350.000 xu *(20%)\n' +
                           '🦈 **Cá mập con** - 1.000.000 xu *(8%)\n' +
                           '🐳 **Cá voi thần thoại** - 3.000.000 xu *(2%)*', 
                    inline: false 
                }
            )
            .setTimestamp();

        return message.reply({ embeds: [listEmbed] });
    }

    // --- Mini-game Câu cá (Cập nhật phí 300k và giá trị thưởng mới) ---
    if (command === 'cauca') {
        const cost = 300000;
        if (user.coins < cost) {
            return message.reply(`🎣 Bạn không đủ **${Number(cost).toLocaleString('vi-VN')} xu** trong ví để mua mồi câu!`);
        }

        user.coins -= cost;

        const fishes = [
            { name: '🗑️ Chiếc giày rách', price: 30000, chance: 40 },
            { name: '🐟 Cá chép / Cá rô phi', price: 150000, chance: 30 },
            { name: '🐠 Cá hồi', price: 350000, chance: 20 },
            { name: '🦈 Cá mập con', price: 1000000, chance: 8 },
            { name: '🐳 Cá voi thần thoại', price: 3000000, chance: 2 }
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
        await user.save();

        return message.reply(`🎣 Bạn câu được: **${caughtFish.name}**!\n💰 Bán được **${Number(caughtFish.price).toLocaleString('vi-VN')} xu**. Ví hiện tại: **${Number(user.coins).toLocaleString('vi-VN')} xu**.`);
    }

    // --- Gacha ảnh ngẫu nhiên tự động quét thư mục gốc GitHub (.gai) ---
    if (command === 'gai') {
        const cost = 20;
        if (user.coins < cost) {
            return message.reply(`Bạn cần **${cost} xu** để dùng lệnh \`${PREFIX}gai\`.`);
        }

        user.coins -= cost;
        await user.save();

        try {
            const loadingMsg = await message.reply('✨ Đang bốc thăm kho ảnh ngẫu nhiên từ GitHub cho bạn...');

            const githubOwner = 'kncript';
            const repoName = 'Discord-Mess';
            const apiUrl = `https://api.github.com/repos/${githubOwner}/${repoName}/contents`;
            
            const response = await axios.get(apiUrl);

            // Tự động lọc ra các file ảnh nằm ở thư mục gốc
            const imageFiles = response.data.filter(file => file.type === 'file' && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name));

            if (imageFiles.length === 0) {
                user.coins += cost;
                await user.save();
                return loadingMsg.edit('❌ Không tìm thấy file ảnh nào trên GitHub!');
            }

            // Chọn ngẫu nhiên 1 ảnh
            const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            const imageUrl = randomImage.download_url;

            const gachaEmbed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setTitle(`✨ Kết quả Gacha của ${message.author.username}`)
                .setDescription(`Số dư còn lại: **${Number(user.coins).toLocaleString('vi-VN')} xu**`)
                .setImage(imageUrl)
                .setTimestamp();

            return loadingMsg.edit({
                content: null,
                embeds: [gachaEmbed]
            });
        } catch (error) {
            console.error('Lỗi khi quét kho ảnh GitHub:', error);
            user.coins += cost;
            await user.save();
            return loadingMsg.edit('❌ Đã xảy ra lỗi khi kết nối kho ảnh GitHub, xu của bạn đã được hoàn lại!');
        }
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
            await user.save();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (Tổng: **${total}** - **${result.toUpperCase()}**).\n🎉 Thắng x2! Nhận được **${(bet * 2).toLocaleString('vi-VN')} xu**!`);
        } else {
            user.coins -= bet;
            await user.save();
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

        const targetUser = await getUser(targetMember.id);
        if (targetUser.coins < 50) {
            return message.reply(`❌ Mục tiêu quá nghèo, tha cho họ đi!`);
        }

        user.lastRob = now;
        const success = Math.random() < 0.45; 

        if (success) {
            const stolenAmount = Math.floor(Math.random() * (targetUser.coins * 0.3)) + 10; 
            targetUser.coins -= stolenAmount;
            user.coins += stolenAmount;
            await targetUser.save();
            await user.save();
            return message.reply(`🥷 Cướp thành công **${stolenAmount.toLocaleString('vi-VN')} xu** từ **${targetMember.username}**!`);
        } else {
            const fine = 40; 
            user.coins = Math.max(0, user.coins - fine);
            await user.save();
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
        const winningNum = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (choiceNum === winningNum) {
            const reward = bet * 70;
            user.coins += reward;
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Trúng lô húp **${reward.toLocaleString('vi-VN')} xu**!`);
        } else {
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Xịt lô, mất **${bet.toLocaleString('vi-VN')} xu**!`);
        }
    }

    // --- LỆNH THÚ CƯNG (.pet) (Thêm tính năng sell random tới 20k xu) ---
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
            await user.save();
            return message.reply(`🎉 Nhận nuôi thành công pet **${petName}**!`);
        }

        if (!user.pet) {
            return message.reply(`🐾 Bạn chưa có thú cưng! Dùng \`${PREFIX}pet buy <tên>\` (200 xu).`);
        }

        let p = { ...user.pet };

        if (subAction === 'sell') {
            // Random tiền bán pet từ 1 đến 20.000 xu
            const sellPrice = Math.floor(Math.random() * 20000) + 1;
            user.coins += sellPrice;
            const petName = p.name;
            user.pet = null; // Xóa pet
            await user.save();
            return message.reply(`💸 Bạn đã bán thú cưng **${petName}** và thu về **${sellPrice.toLocaleString('vi-VN')} xu** vào ví!`);
        }

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
                user.pet = p;
                await user.save();
                return message.reply(`🎉 Pet lên **Level ${p.level}**!`);
            }
            user.pet = p;
            await user.save();
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
            user.pet = p;
            await user.save();
            return message.reply(`💼 Pet kiếm về **${earned} xu**!`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🐾 Thú Cưng: ${p.name}`)
            .setDescription(`⭐ **Level:** ${p.level}\n✨ **EXP:** ${p.exp} / ${p.level * 50}\n💡 Gõ \`${PREFIX}pet sell\` nếu bạn muốn bán pet này.`);

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
            await user.save();
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
        if (!await isAdmin(userId, message.member)) return message.reply('Không có quyền!');
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nhập từ 1 đến 100.');
        await message.channel.bulkDelete(amount + 1, true).catch(() => {});
        const notifyMsg = await message.channel.send(`Đã xóa ${amount} tin nhắn!`);
        setTimeout(() => notifyMsg.delete().catch(() => {}), 3000);
        return;
    }

    if (command === 'hello') {
        return message.reply('Chào bạn! Bot vẫn đang hoạt động mượt mà với MongoDB!');
    }
});

// 5. Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);