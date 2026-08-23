const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

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

// 2. Kết nối MongoDB Atlas
const mongoURI = process.env.MONGO_URI;

if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Đã kết nối thành công với MongoDB Atlas!'))
        .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));
} else {
    console.log('⚠️ Không tìm thấy biến MONGO_URI trong môi trường!');
}

// Khởi tạo Mongoose Schema & Model lưu trữ dữ liệu (Đơn vị VNĐ)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    coins: { type: Number, default: 50000 }, // Khởi nghiệp 50k VNĐ
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

// Hàm lấy dữ liệu user từ MongoDB (Tính lãi suất ngân hàng 10%/1 giờ)
async function getUser(userId) {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId });
        await user.save();
    } else {
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
            user.lastBankInterest = now - ((now - user.lastBankInterest) % oneHour);
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

let isBotActive = true; 

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
                    .setTitle('🚀 BOT ĐÃ CẬP NHẬT HỆ THỐNG TIỀN TỆ VNĐ!')
                    .setDescription(`Toàn bộ mệnh giá và giá cả đã được quy đổi sang VNĐ thực tế!\nGõ \`${PREFIX}menu\` để xem chi tiết!`)
                    .setTimestamp();

                await channel.send({ embeds: [updateEmbed] });
            }
        } catch (err) {
            console.error('Không thể gửi tin nhắn thông báo update:', err);
        }
    }
});

// Chào mừng thành viên mới (Tặng 50k VNĐ)
client.on('guildMemberAdd', async member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('✨ Chào mừng thành viên mới!')
        .setDescription(`Chào ${member.user.username} đã đến với server! Bạn nhận được **50.000 VNĐ** tiền khởi nghiệp!`)
        .setThumbnail(member.user.displayAvatarURL());
    
    const userData = await getUser(member.id);
    userData.coins += 50000;
    await userData.save();

    channel.send({ embeds: [welcomeEmbed] });
});

client.on('guildMemberRemove', member => {
    if (!isBotActive) return;
    const channel = member.guild.systemChannel;
    if (!channel) return;

    const byeEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('👋 Thành viên rời server')
        .setDescription(`Thành viên **${member.user.username}** đã rời khỏi server.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    channel.send({ embeds: [byeEmbed] });
});

const secretNumbers = new Map();
const PREFIX = '.'; 

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const userId = message.author.id;
    const OWNER_ID = "950579308051697725";

    if (message.content === PREFIX + 'bot off') {
        if (userId !== OWNER_ID) return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        isBotActive = false;
        await message.reply(`💤 Bot đã chuyển sang trạng thái **TẮT**.`);
        return;
    }

    if (message.content === PREFIX + 'bot on') {
        if (userId !== OWNER_ID) return message.reply('❌ Lệnh này chỉ dành riêng cho Chủ Bot Tối Cao!');
        isBotActive = true;
        await message.reply('🟢 Bot đã được **BẬT** trở lại!');
        return;
    }

    if (!isBotActive) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const user = await getUser(userId);

    if (command === 'info') {
        const infoEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🤖 THÔNG TIN HỆ THỐNG BOT')
            .setDescription(`Hệ thống kinh tế chuẩn VNĐ thực tế.\n👑 **Chủ Bot Tối Cao:** <@${OWNER_ID}>\n🌐 **Website Profile:** [Nhấn vào đây](https://hina-long-pfbot.netlify.app/)`)
            .setTimestamp();
        return message.reply({ embeds: [infoEmbed] });
    }

    // --- BẢNG MENU HƯỚNG DẪN (VNĐ) ---
    if (command === 'help' || command === 'menu') {
        const menuEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('📖 BẢNG HƯỚNG DẪN LỆNH - KINH TẾ VNĐ')
            .setDescription(`Danh sách lệnh với đơn vị **VNĐ**:`)
            .addFields(
                { name: '💰 Tài Chính & Ngân Hàng', value: `\`${PREFIX}coins [@user]\` - Xem ví & ngân hàng\n\`${PREFIX}deposit <số tiền / all>\` - Gửi tiết kiệm (Lãi 10%/h)\n\`${PREFIX}withdraw <số tiền / all>\` - Rút tiền\n\`${PREFIX}daily\` - Nhận lương điểm danh\n\`${PREFIX}top\` - Bảng xếp hạng tài sản`, inline: false },
                { name: '🎮 Giải Trí & Kiếm Tiền', value: `\`${PREFIX}gai\` - Gacha ảnh waifu (5.000 VNĐ)\n\`${PREFIX}cauca\` - Mua mồi câu cá (50.000 VNĐ)\n\`${PREFIX}caucalist\` - Xem bảng giá hải sản thực tế\n\`${PREFIX}xx <số tiền / all> <tai/xiu>\` - Tài Xỉu\n\`${PREFIX}rob @user\` - Trấn tiền\n\`${PREFIX}lode <số 00-99> <số tiền>\` - Lô đề`, inline: false },
                { name: '🐾 Nuôi Thú Cưng', value: `\`${PREFIX}pet buy <tên>\` - Nhận nuôi (100.000 VNĐ)\n\`${PREFIX}pet\` - Xem pet\n\`${PREFIX}pet feed\` - Cho ăn\n\`${PREFIX}pet work\` - Sai pet đi làm\n\`${PREFIX}pet sell\` - Bán pet nhận ngẫu nhiên tới 500k VNĐ`, inline: false },
                { name: '🛠 Quản Trị (Admin)', value: `\`${PREFIX}vnd add/sub <số tiền> @user\`\n\`${PREFIX}clear <số>\` | \`${PREFIX}ban\` | \`${PREFIX}mute\``, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [menuEmbed] });
    }

    if (command === 'coins' || command === 'balance') {
        const targetUser = message.mentions.users.first() || message.author;
        const targetData = await getUser(targetUser.id);
        const formattedCoins = Number(targetData.coins).toLocaleString('vi-VN');
        const formattedBank = Number(targetData.bank).toLocaleString('vi-VN');
        
        return message.reply(`💰 Tài khoản của **${targetUser.username}**:\n👛 Tiền mặt trong ví: **${formattedCoins} VNĐ**\n🏦 Tiết kiệm ngân hàng: **${formattedBank} VNĐ**`);
    }

    if (command === 'deposit' || command === 'dep') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.coins;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}deposit <số tiền / all>\``);
        if (user.coins < amount) return message.reply(`❌ Ví không đủ **${amount.toLocaleString('vi-VN')} VNĐ** để gửi!`);

        user.coins -= amount;
        user.bank += amount;
        await user.save();

        return message.reply(`🏦 Gửi thành công **${amount.toLocaleString('vi-VN')} VNĐ** vào ngân hàng!`);
    }

    if (command === 'withdraw' || command === 'with') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            amount = user.bank;
        } else {
            amount = parseInt(args[0]);
        }

        if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}withdraw <số tiền / all>\``);
        if (user.bank < amount) return message.reply(`❌ Ngân hàng không có đủ số dư để rút!`);

        user.bank -= amount;
        user.coins += amount;
        await user.save();

        return message.reply(`🏧 Rút thành công **${amount.toLocaleString('vi-VN')} VNĐ** về ví!`);
    }

    if (command === 'daily') {
        const cooldownTime = 24 * 60 * 60 * 1000;
        const streakTimeout = 48 * 60 * 60 * 1000; 
        const now = Date.now();
        const diff = now - user.lastDaily;

        if (diff < cooldownTime) {
            const timeLeft = cooldownTime - diff;
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ Đã điểm danh rồi! Quay lại sau **${hours} giờ ${minutes} phút**.`);
        }

        if (user.lastDaily !== 0 && diff > streakTimeout) {
            user.streak = 1; 
        } else {
            user.streak += 1;
        }

        user.lastDaily = now;
        
        const baseReward = 20000; // Lương cơ bản 20k VNĐ
        const streakBonus = Math.min((user.streak - 1) * 10000, 150000); // Thưởng chuỗi max 150k
        const totalReward = baseReward + streakBonus;

        user.coins += totalReward;
        await user.save();

        return message.reply(`🔥 Điểm danh thành công! Chuỗi Streak: **${user.streak} ngày**.\n🎁 Nhận lương **${totalReward.toLocaleString('vi-VN')} VNĐ**.`);
    }

    if (command === 'top') {
        const topUsers = await User.find().sort({ coins: -1 }).limit(10);
        let text = "🏆 **TOP 10 ĐẠI GIA SERVER (VNĐ):**\n";
        for (let i = 0; i < topUsers.length; i++) {
            const memberObj = await client.users.fetch(topUsers[i].userId).catch(() => ({ username: "Ẩn danh" }));
            const totalWealth = topUsers[i].coins + topUsers[i].bank;
            text += `**${i + 1}.** ${memberObj.username} - Tổng tài sản: **${Number(totalWealth).toLocaleString('vi-VN')} VNĐ**\n`;
        }
        return message.reply(text);
    }

    if (command === 'admin') {
        if (userId !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot mới có quyền này!');
        const action = args[0];
        const targetUser = message.mentions.users.first();
        if (!targetUser || (action !== 'add' && action !== 'remove')) {
            return message.reply(`Cách dùng: \`${PREFIX}admin add @user\``);
        }

        let config = await Config.findOne({ key: 'global_config' });
        if (!config) config = new Config({ key: 'global_config', admins: [] });

        if (action === 'add') {
            if (config.admins.includes(targetUser.id)) return message.reply('Đã là admin từ trước!');
            config.admins.push(targetUser.id);
            await config.save();
            return message.reply(`✅ Đã cấp quyền Admin cho **${targetUser.username}**!`);
        } else if (action === 'remove') {
            const index = config.admins.indexOf(targetUser.id);
            if (index === -1) return message.reply('Không có trong danh sách admin!');
            config.admins.splice(index, 1);
            await config.save();
            return message.reply(`✅ Đã gỡ quyền Admin của **${targetUser.username}**!`);
        }
    }

    // --- Lệnh Quản Lý Tiền VNĐ ---
    if (command === 'vnd' || command === 'xu') {
        const subAction = args[0];
        
        if (subAction === 'reset') {
            if (userId !== OWNER_ID) return message.reply('❌ Chỉ Chủ Bot!');
            const target = message.mentions.users.first();
            if (!target) return message.reply(`Cách dùng: \`${PREFIX}vnd reset @user\``);
            const targetUser = await getUser(target.id);
            targetUser.coins = 0;
            targetUser.bank = 0;
            await targetUser.save();
            return message.reply(`🔄 Đã reset sạch tài sản của **${target.username}**!`);
        }

        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền Admin!');

        const amount = parseInt(args[1]);
        const target = message.mentions.users.first() || message.author;
        const targetUser = await getUser(target.id);

        if (subAction === 'add') {
            if (isNaN(amount)) return message.reply(`Cách dùng: \`${PREFIX}vnd add <số tiền> @user\``);
            targetUser.coins += amount;
            await targetUser.save();
            return message.reply(`✅ Đã cộng **${amount.toLocaleString('vi-VN')} VNĐ** cho **${target.username}**.`);
        }

        if (subAction === 'sub') {
            if (isNaN(amount) || amount <= 0) return message.reply(`Cách dùng: \`${PREFIX}vnd sub <số tiền> @user\``);
            targetUser.coins = Math.max(0, targetUser.coins - amount);
            await targetUser.save();
            return message.reply(`✅ Đã trừ **${amount.toLocaleString('vi-VN')} VNĐ** của **${target.username}**.`);
        }
    }

    if (command === 'ban') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}ban @user\``);
        try {
            await targetMember.ban({ reason: `Bởi Admin` });
            return message.reply(`🔨 Đã ban **${targetMember.user.username}**!`);
        } catch (err) {
            return message.reply('❌ Không đủ quyền ban người này.');
        }
    }

    if (command === 'unban') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetId = args[0];
        try {
            await message.guild.members.unban(targetId);
            return message.reply(`✅ Đã gỡ ban cho ID: **${targetId}**!`);
        } catch (err) {
            return message.reply('❌ Không tìm thấy ID.');
        }
    }

    if (command === 'mute') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}mute @user\``);
        try {
            await targetMember.timeout(24 * 60 * 60 * 1000, 'Mute');
            return message.reply(`🤐 Đã mute **${targetMember.user.username}**.`);
        } catch (err) {
            return message.reply('❌ Không thể mute.');
        }
    }

    if (command === 'unmute') {
        if (!await isAdmin(userId, message.member)) return message.reply('❌ Không có quyền!');
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}unmute @user\``);
        try {
            await targetMember.timeout(null, 'Unmute');
            return message.reply(`✅ Đã gỡ mute **${targetMember.user.username}**.`);
        } catch (err) {
            return message.reply('❌ Lỗi gỡ mute.');
        }
    }

    // --- BẢNG GIÁ CÁ (Giá thực tế VNĐ) ---
    if (command === 'caucalist' || command === 'listcau') {
        const listEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 BẢNG GIÁ HẢI SẢN THỰC TẾ')
            .setDescription(`Phí mua mồi câu mỗi lần (\`${PREFIX}cauca\`) là **50.000 VNĐ**.`)
            .addFields(
                { 
                    name: '🎣 Danh sách thu hoạch', 
                    value: '🗑️ **Chiếc giày rách** - 5.000 VNĐ *(40%)\n' +
                           '🐟 **Cá chép / Cá rô phi** - 50.000 VNĐ *(30%)\n' +
                           '🐠 **Cá hồi tươi** - 200.000 VNĐ *(20%)\n' +
                           '🦈 **Cá mập con** - 1.000.000 VNĐ *(8%)\n' +
                           '🐳 **Cá voi thần thoại** - 5.000.000 VNĐ *(2%)*', 
                    inline: false 
                }
            )
            .setTimestamp();
        return message.reply({ embeds: [listEmbed] });
    }

    // --- Câu cá thực tế (Phí 50k VNĐ) ---
    if (command === 'cauca') {
        const cost = 50000;
        if (user.coins < cost) return message.reply(`🎣 Cần ít nhất **${cost.toLocaleString('vi-VN')} VNĐ** để mua mồi câu!`);

        user.coins -= cost;

        const fishes = [
            { name: '🗑️ Chiếc giày rách', price: 5000, chance: 40 },
            { name: '🐟 Cá chép / Cá rô phi', price: 50000, chance: 30 },
            { name: '🐠 Cá hồi tươi', price: 200000, chance: 20 },
            { name: '🦈 Cá mập con', price: 1000000, chance: 8 },
            { name: '🐳 Cá voi thần thoại', price: 5000000, chance: 2 }
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

        return message.reply(`🎣 Bạn câu được: **${caughtFish.name}**! Bán thu về **${caughtFish.price.toLocaleString('vi-VN')} VNĐ**.`);
    }

    // --- Gacha ảnh GitHub (Phí 5k VNĐ) ---
    if (command === 'gai') {
        const cost = 5000;
        if (user.coins < cost) return message.reply(`Bạn cần **${cost.toLocaleString('vi-VN')} VNĐ** để xem ảnh.`);

        user.coins -= cost;
        await user.save();

        try {
            const loadingMsg = await message.reply('✨ Đang bốc thăm kho ảnh...');
            const githubOwner = 'kncript';
            const repoName = 'Discord-Mess';
            const apiUrl = `https://api.github.com/repos/${githubOwner}/${repoName}/contents`;
            
            const response = await axios.get(apiUrl);
            const imageFiles = response.data.filter(file => file.type === 'file' && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name));

            if (imageFiles.length === 0) {
                user.coins += cost;
                await user.save();
                return loadingMsg.edit('❌ Không tìm thấy ảnh trên GitHub!');
            }

            const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
            const imageUrl = randomImage.download_url;

            const gachaEmbed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setTitle(`✨ Waifu Gacha - ${message.author.username}`)
                .setDescription(`Ví còn lại: **${Number(user.coins).toLocaleString('vi-VN')} VNĐ**`)
                .setImage(imageUrl)
                .setTimestamp();

            return loadingMsg.edit({ content: null, embeds: [gachaEmbed] });
        } catch (error) {
            user.coins += cost;
            await user.save();
            return message.reply('❌ Lỗi kết nối GitHub, đã hoàn lại tiền!');
        }
    }

    // --- Tài Xỉu ---
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

        if (isNaN(bet) || bet <= 0) return message.reply(`Cách chơi: \`${PREFIX}xx <số tiền / all> <tai/xiu>\``);
        if (user.coins < bet) return message.reply(`Ví không đủ tiền!`);
        if (choice !== 'tai' && choice !== 'xiu') return message.reply('Vui lòng chọn `tai` hoặc `xiu`!');

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2 + d3;
        const result = total >= 11 ? 'tai' : 'xiu';

        if (choice === result) {
            user.coins += bet; // Thắng ăn x2 (lãi đúng số tiền cược)
            await user.save();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (${total} - **${result.toUpperCase()}**).\n🎉 Thắng! Nhận **${(bet * 2).toLocaleString('vi-VN')} VNĐ**!`);
        } else {
            user.coins -= bet;
            await user.save();
            return message.reply(`🎲 Kết quả: **[${d1}] [${d2}] [${d3}]** (${total} - **${result.toUpperCase()}**).\n😢 Thua mất **${bet.toLocaleString('vi-VN')} VNĐ**.`);
        }
    }

    // --- Cướp tiền (.rob) ---
    if (command === 'rob' || command === 'cuop') {
        const targetMember = message.mentions.users.first();
        if (!targetMember) return message.reply(`Cách dùng: \`${PREFIX}rob @user\``);
        if (targetMember.id === userId) return message.reply('❌ Không thể tự cướp chính mình!');

        const cooldown = 30 * 60 * 1000; 
        const now = Date.now();
        if (now - user.lastRob < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - user.lastRob)) / (60 * 1000));
            return message.reply(`⏳ Đợi **${timeLeft} phút** nữa.`);
        }

        if (user.coins < 20000) return message.reply('❌ Cần ít nhất **20.000 VNĐ** phí hành sự!');
        const targetUser = await getUser(targetMember.id);
        if (targetUser.coins < 20000) return message.reply(`❌ Mục tiêu quá nghèo!`);

        user.lastRob = now;
        const success = Math.random() < 0.45; 

        if (success) {
            const stolenAmount = Math.floor(Math.random() * (targetUser.coins * 0.3)) + 5000; 
            targetUser.coins -= stolenAmount;
            user.coins += stolenAmount;
            await targetUser.save();
            await user.save();
            return message.reply(`🥷 Cướp thành công **${stolenAmount.toLocaleString('vi-VN')} VNĐ** từ **${targetMember.username}**!`);
        } else {
            const fine = 15000; 
            user.coins = Math.max(0, user.coins - fine);
            await user.save();
            return message.reply(`🚨 Bị công an bắt phạt mất **${fine.toLocaleString('vi-VN')} VNĐ**.`);
        }
    }

    // --- Lô đề ---
    if (command === 'lode' || command === 'xoaso') {
        const choiceNum = args[0];
        const bet = parseInt(args[1]);

        if (!choiceNum || isNaN(bet) || bet <= 0 || choiceNum.length !== 2) {
            return message.reply(`Cách chơi: \`${PREFIX}lode <00-99> <số tiền cược>\``);
        }
        if (user.coins < bet) return message.reply(`Không đủ tiền cược!`);

        user.coins -= bet;
        const winningNum = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        if (choiceNum === winningNum) {
            const reward = bet * 70;
            user.coins += reward;
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Trúng lô húp **${reward.toLocaleString('vi-VN')} VNĐ**!`);
        } else {
            await user.save();
            return message.reply(`🎰 Kết quả: **[${winningNum}]**. Xịt lô, mất **${bet.toLocaleString('vi-VN')} VNĐ**!`);
        }
    }

    // --- Thú cưng (Pet buy 100k, sell random tới 500k) ---
    if (command === 'pet') {
        const subAction = args[0];

        if (subAction === 'buy') {
            if (user.pet) return message.reply(`⚠️ Bạn đã có pet rồi!`);
            const petName = args.slice(1).join(' ');
            const cost = 100000; // Giá mua pet 100k VNĐ
            if (!petName) return message.reply(`Cách dùng: \`${PREFIX}pet buy <tên>\``);
            if (user.coins < cost) return message.reply(`❌ Cần **${cost.toLocaleString('vi-VN')} VNĐ** để mua thú cưng.`);

            user.coins -= cost;
            user.pet = { name: petName, level: 1, exp: 0, lastFed: 0, lastWork: 0 };
            await user.save();
            return message.reply(`🎉 Nhận nuôi thành công pet **${petName}**!`);
        }

        if (!user.pet) return message.reply(`🐾 Bạn chưa có pet! Dùng \`${PREFIX}pet buy <tên>\` (100k VNĐ).`);

        let p = { ...user.pet };

        if (subAction === 'sell') {
            const sellPrice = Math.floor(Math.random() * 490000) + 10000; // Random từ 10k đến 500k VNĐ
            user.coins += sellPrice;
            const petName = p.name;
            user.pet = null;
            await user.save();
            return message.reply(`💸 Đã bán thú cưng **${petName}** thu về **${sellPrice.toLocaleString('vi-VN')} VNĐ**!`);
        }

        if (subAction === 'feed') {
            const feedCooldown = 4 * 60 * 60 * 1000; 
            const now = Date.now();
            if (now - p.lastFed < feedCooldown) return message.reply(`🍖 Pet vẫn còn no!`);
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
            if (now - p.lastWork < workCooldown) return message.reply(`⏳ Pet đang mệt.`);
            p.lastWork = now;
            const earned = p.level * 10000 + Math.floor(Math.random() * 10000); // Kiếm tiền VNĐ
            user.coins += earned;
            user.pet = p;
            await user.save();
            return message.reply(`💼 Pet đi làm kiếm về **${earned.toLocaleString('vi-VN')} VNĐ**!`);
        }

        const petEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🐾 Thú Cưng: ${p.name}`)
            .setDescription(`⭐ **Level:** ${p.level}\n✨ **EXP:** ${p.exp} / ${p.level * 50}\n💡 Gõ \`${PREFIX}pet sell\` để bán pet nhận tới 500.000 VNĐ.`);

        return message.reply({ embeds: [petEmbed] });
    }

    if (command === 'game') {
        const num = Math.floor(Math.random() * 10) + 1;
        secretNumbers.set(message.channel.id, num);
        return message.reply(`🎮 Đã tạo số bí mật từ 1-10. Gõ \`${PREFIX}doan <số>\`!`);
    }

    if (command === 'doan') {
        const currentSecret = secretNumbers.get(message.channel.id);
        if (!currentSecret) return message.reply(`Chưa có game.`);
        const guess = parseInt(args[0]);
        if (isNaN(guess)) return message.reply(`Nhập số hợp lệ!`);

        if (guess === currentSecret) {
            user.coins += 15000;
            await user.save();
            message.reply(`🏆 Chính xác! Nhận **15.000 VNĐ**!`);
            secretNumbers.delete(message.channel.id);
        } else if (guess < currentSecret) {
            return message.reply('📈 Số lớn hơn!');
        } else {
            return message.reply('📉 Số nhỏ hơn!');
        }
    }

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
        return message.reply('Chào bạn! Bot đang hoạt động mượt mà với hệ thống VNĐ chuẩn thực tế!');
    }
});

client.login(process.env.DISCORD_TOKEN);